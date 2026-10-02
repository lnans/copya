/**
 * BAI (BAM index) reader.
 *
 * Only the information needed to locate each chromosome inside the BAM is extracted:
 * the virtual offsets of the first and last alignment records of every reference sequence.
 *
 * File layout (SAMv1 specification, section 5.2), all integers little-endian:
 *
 *   magic            char[4]   "BAI\1"
 *   n_ref            int32
 *   for each reference:
 *     n_bin          int32
 *     for each bin:
 *       bin          uint32    bin number (37450 = pseudo-bin holding metadata)
 *       n_chunk      int32
 *       chunks       n_chunk x (chunk_beg uint64, chunk_end uint64)   virtual offsets
 *     n_intv         int32
 *     ioffset        n_intv x uint64   linear index (not used here)
 *   n_no_coor        uint64    optional, not used here
 */
(function (global) {
  'use strict';

  const ns = global.ShallowCnv || (global.ShallowCnv = {});

  /** "BAI\1" read as a little-endian uint32. */
  const BAI_MAGIC = 0x01494142;

  /**
   * Pseudo-bin storing per-reference metadata (start/end offsets and mapped/unmapped
   * read counts) instead of real chunks; it must be skipped.
   */
  const PSEUDO_BIN = 37450;

  /**
   * @typedef {object} ReferenceRange
   * @property {number} startOffset virtual offset of the first alignment of the reference
   * @property {number} endOffset virtual offset just after its last alignment
   */

  /**
   * Parses a BAI index.
   *
   * @param {ArrayBuffer} buffer content of the .bai file
   * @returns {(ReferenceRange | null)[]} one entry per reference sequence of the BAM,
   *   in header order; null when the reference has no aligned reads
   * @throws {Error} if the buffer is not a BAI file
   */
  function parseBai(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 8 || view.getUint32(0, true) !== BAI_MAGIC) {
      throw new Error("Ce fichier n'est pas un BAI valide.");
    }

    let offset = 4;
    const readInt32 = () => {
      const value = view.getInt32(offset, true);
      offset += 4;
      return value;
    };
    const readUint32 = () => {
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    };
    const readUint64 = () => {
      const low = view.getUint32(offset, true);
      const high = view.getUint32(offset + 4, true);
      offset += 8;
      return high * 2 ** 32 + low;
    };

    const referenceCount = readInt32();
    const ranges = [];

    for (let ref = 0; ref < referenceCount; ref++) {
      let startOffset = Infinity;
      let endOffset = 0;

      const binCount = readInt32();
      for (let b = 0; b < binCount; b++) {
        const bin = readUint32();
        const chunkCount = readInt32();
        for (let c = 0; c < chunkCount; c++) {
          const chunkStart = readUint64();
          const chunkEnd = readUint64();
          if (bin === PSEUDO_BIN) continue;
          if (chunkStart < startOffset) startOffset = chunkStart;
          if (chunkEnd > endOffset) endOffset = chunkEnd;
        }
      }

      const linearIndexSize = readInt32();
      offset += 8 * linearIndexSize;

      ranges.push(startOffset < Infinity ? { startOffset, endOffset } : null);
    }

    return ranges;
  }

  /**
   * Reads a BAI file.
   * @param {Blob} file the .bai file (File from an <input> or drag & drop)
   * @returns {Promise<(ReferenceRange | null)[]>} see parseBai
   */
  async function readBai(file) {
    return parseBai(await file.arrayBuffer());
  }

  ns.bai = { BAI_MAGIC, PSEUDO_BIN, parseBai, readBai };
})(globalThis);
