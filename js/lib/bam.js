/**
 * BAM reader: header parsing and per-bin read counting.
 *
 * The BAM file is never loaded entirely: the header is read from the first megabytes,
 * and read counting only reads the byte range of one chromosome, located with the BAI
 * index (see bai.js). Decompression is delegated to bgzf.js.
 *
 * Depends on ShallowCnv.bgzf.
 */
(function (global) {
  'use strict';

  const ns = global.ShallowCnv || (global.ShallowCnv = {});

  /** Size of the first read attempt for the header; multiplied by 4 until the header fits. */
  const INITIAL_HEADER_READ_SIZE = 1 << 20;

  /** Amount of compressed data read from disk at once while counting. */
  const READ_CHUNK_SIZE = 32 << 20;

  /**
   * Extra bytes read after the last block of a chromosome so that this block
   * (at most 64 KiB) is always complete.
   */
  const LAST_BLOCK_MARGIN = 1 << 17;

  /** Reads with a mapping quality below this value are not counted. */
  const DEFAULT_MIN_MAPPING_QUALITY = 10;

  /**
   * SAM flags of reads that are not counted:
   *   0x004 unmapped, 0x100 secondary, 0x200 QC failure, 0x400 PCR/optical duplicate,
   *   0x800 supplementary.
   */
  const DEFAULT_EXCLUDED_FLAGS = 0x004 | 0x100 | 0x200 | 0x400 | 0x800;

  /** "BAM\1" */
  const BAM_MAGIC = [66, 65, 77, 1];

  const textDecoder = new TextDecoder();

  /**
   * @typedef {object} BamReference
   * @property {string} name reference sequence name as written in the BAM (e.g. "7" or "chr7")
   * @property {number} length reference sequence length in bp
   */

  /**
   * Parses the reference sequence dictionary of an uncompressed BAM header.
   *
   * Layout (SAMv1 specification, section 4.2), all integers little-endian:
   *
   *   magic       char[4]   "BAM\1"
   *   l_text      int32
   *   text        char[l_text]   SAM header text (not used here)
   *   n_ref       int32
   *   for each reference:
   *     l_name    int32     name length including the trailing NUL
   *     name      char[l_name]
   *     l_ref     int32     sequence length
   *
   * @param {Uint8Array} bytes beginning of the uncompressed BAM stream
   * @returns {BamReference[] | null} null if `bytes` is too short to contain the whole dictionary
   * @throws {Error} if the data does not start with the BAM magic
   */
  function parseBamHeader(bytes) {
    if (bytes.length < 4) return null;
    if (BAM_MAGIC.some((byte, i) => bytes[i] !== byte)) {
      throw new Error("Ce fichier n'est pas un BAM valide.");
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const fits = (offset, size) => offset + size <= bytes.length;

    let offset = 4;
    if (!fits(offset, 4)) return null;
    offset += 4 + view.getInt32(offset, true);

    if (!fits(offset, 4)) return null;
    const referenceCount = view.getInt32(offset, true);
    offset += 4;

    const references = [];
    for (let i = 0; i < referenceCount; i++) {
      if (!fits(offset, 4)) return null;
      const nameLength = view.getInt32(offset, true);
      if (!fits(offset + 4, nameLength + 4)) return null;
      const name = textDecoder.decode(bytes.subarray(offset + 4, offset + 3 + nameLength));
      const length = view.getInt32(offset + 4 + nameLength, true);
      references.push({ name, length });
      offset += 8 + nameLength;
    }
    return references;
  }

  /**
   * Reads the reference sequence dictionary (chromosome names and lengths) of a BAM file.
   *
   * @param {Blob} file the .bam file
   * @returns {Promise<BamReference[]>} references in BAM order (the index used by alignment records)
   * @throws {Error} if the file is not a BAM or its header cannot be decoded
   */
  async function readBamHeader(file) {
    for (let readSize = INITIAL_HEADER_READ_SIZE; ; readSize *= 4) {
      const compressed = new Uint8Array(await file.slice(0, readSize).arrayBuffer());
      const references = parseBamHeader(ns.bgzf.inflateBgzfBlocks(compressed));
      if (references) return references;
      if (readSize >= file.size) throw new Error('En-tête BAM illisible.');
    }
  }

  /**
   * Counts the reads of one chromosome in fixed-size bins.
   *
   * A read is counted in the bin containing its leftmost mapped position, if its mapping
   * quality is >= `minMappingQuality` and it has none of the `excludedFlags`.
   * Requires a coordinate-sorted BAM (all reads of a chromosome are contiguous).
   *
   * Alignment record layout (SAMv1 specification, section 4.2), offsets in bytes:
   *
   *   0   block_size   int32    size of the rest of the record
   *   4   refID        int32
   *   8   pos          int32    0-based leftmost position
   *   12  l_read_name  uint8
   *   13  mapq         uint8
   *   14  bin          uint16
   *   16  n_cigar_op   uint16
   *   18  flag         uint16
   *   ... (sequence, qualities, tags: not used here)
   *
   * @param {Blob} file the .bam file
   * @param {{length: number, range: import('./bai.js').ReferenceRange}} reference
   *   chromosome length and its virtual offset range from the BAI
   * @param {number} referenceIndex index of the chromosome in the BAM header
   * @param {number} binSize bin size in bp
   * @param {object} [options]
   * @param {(fraction: number) => void} [options.onProgress] called after each chunk, with 0..1
   * @param {number} [options.minMappingQuality=10]
   * @param {number} [options.excludedFlags=0xF04]
   * @param {InstanceType<typeof ShallowCnv.bgzf.InflatePool>} [options.pool] decompression pool
   * @returns {Promise<Uint32Array>} read count per bin; bin k covers [k*binSize, (k+1)*binSize)
   */
  async function countReadsPerBin(file, reference, referenceIndex, binSize, options = {}) {
    const {
      onProgress = () => {},
      minMappingQuality = DEFAULT_MIN_MAPPING_QUALITY,
      excludedFlags = DEFAULT_EXCLUDED_FLAGS,
      pool = ns.bgzf.getDefaultPool(),
    } = options;
    const { concatBytes, findCompleteBlocks, splitVirtualOffset } = ns.bgzf;

    const first = splitVirtualOffset(reference.range.startOffset);
    const lastBlockOffset = splitVirtualOffset(reference.range.endOffset).blockOffset;
    const counts = new Uint32Array(Math.ceil(reference.length / binSize) + 1);

    // Uncompressed bytes not yet parsed (a record may span several decompressed pieces).
    let pending = new Uint8Array(0);
    let pendingPosition = 0;

    const countRecords = (uncompressed) => {
      pending = concatBytes(pending.subarray(pendingPosition), uncompressed);
      pendingPosition = 0;
      const view = new DataView(pending.buffer, pending.byteOffset, pending.length);

      while (pendingPosition + 4 <= pending.length) {
        const recordEnd = pendingPosition + 4 + view.getInt32(pendingPosition, true);
        if (recordEnd > pending.length) break;
        if (view.getInt32(pendingPosition + 4, true) === referenceIndex) {
          const position = view.getInt32(pendingPosition + 8, true);
          const mappingQuality = pending[pendingPosition + 13];
          const flag = view.getUint16(pendingPosition + 18, true);
          if (mappingQuality >= minMappingQuality && !(flag & excludedFlags)) {
            counts[Math.floor(position / binSize)]++;
          }
        }
        pendingPosition = recordEnd;
      }
    };

    let readPosition = first.blockOffset;
    // Compressed bytes of an incomplete block left over from the previous chunk.
    let carry = new Uint8Array(0);
    let carryFileOffset = first.blockOffset;
    let isFirstBatch = true;
    let reachedLastBlock = false;

    while (!reachedLastBlock && readPosition < file.size) {
      const readEnd = Math.min(readPosition + READ_CHUNK_SIZE, lastBlockOffset + LAST_BLOCK_MARGIN);
      const chunk = new Uint8Array(await file.slice(readPosition, readEnd).arrayBuffer());
      if (!chunk.length) break;
      readPosition += chunk.length;

      const compressed = concatBytes(carry, chunk);
      const blocks = findCompleteBlocks(compressed, carryFileOffset, lastBlockOffset);
      reachedLastBlock = blocks.reachedLastBlock;

      const pieces = await pool.inflateBlocks(compressed, blocks.boundaries);
      if (isFirstBatch && pieces.length) {
        // The first block may start with records of the previous chromosome.
        pieces[0] = pieces[0].subarray(first.offsetInBlock);
        isFirstBatch = false;
      }
      for (const piece of pieces) countRecords(piece);

      carry = compressed.slice(blocks.end);
      carryFileOffset += blocks.end;
      onProgress(Math.min(1, (carryFileOffset - first.blockOffset) / (lastBlockOffset - first.blockOffset + 1)));
    }

    return counts;
  }

  ns.bam = {
    DEFAULT_MIN_MAPPING_QUALITY,
    DEFAULT_EXCLUDED_FLAGS,
    parseBamHeader,
    readBamHeader,
    countReadsPerBin,
  };
})(globalThis);
