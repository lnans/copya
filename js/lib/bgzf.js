/**
 * BGZF (Blocked GNU Zip Format) decompression.
 *
 * A BAM file is a concatenation of independent gzip members called BGZF blocks,
 * each holding at most 64 KiB of uncompressed data (SAMv1 specification, section 4.1).
 * Layout of one block, as written by htslib / samtools:
 *
 *   offset    size  field
 *   0         12    gzip header (ID1 ID2 CM FLG MTIME XFL OS XLEN), XLEN = 6
 *   12        4     extra subfield "BC" (SI1 SI2 SLEN)
 *   16        2     BSIZE = total block size - 1 (uint16, little-endian)
 *   18        n     raw DEFLATE payload
 *   end - 8   4     CRC32 of the uncompressed data
 *   end - 4   4     ISIZE, uncompressed size
 *
 * Positions inside a BGZF file are "virtual offsets" (see the BAI index):
 *   virtualOffset = compressedBlockOffset * 2^16 + offsetInsideUncompressedBlock
 *
 * Because blocks are independent, they can be decompressed in parallel. This module
 * provides a small Web Worker pool for that, falling back to the main thread when
 * workers are unavailable (e.g. in Node.js or if the worker script fails to load).
 *
 * Depends on the global `pako` (https://github.com/nodeca/pako).
 */
(function (global) {
  'use strict';

  const ns = global.ShallowCnv || (global.ShallowCnv = {});

  /** pako build loaded inside Web Workers (workers do not share the page's scripts). */
  const PAKO_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js';

  /** Size of the fixed BGZF header (gzip header + "BC" extra subfield). */
  const HEADER_SIZE = 18;

  /** Size of the BGZF footer (CRC32 + ISIZE). */
  const FOOTER_SIZE = 8;

  /** Maximum size of one BGZF block, compressed or not. */
  const MAX_BLOCK_SIZE = 1 << 16;

  /**
   * Returns the total size in bytes of the BGZF block starting at `offset`.
   * @param {Uint8Array} bytes
   * @param {number} offset start of the block; at least HEADER_SIZE bytes must be available
   */
  function readBlockSize(bytes, offset) {
    return (bytes[offset + 16] | (bytes[offset + 17] << 8)) + 1;
  }

  /**
   * Decompresses every complete BGZF block contained in `bytes` and concatenates the results.
   * A trailing incomplete block is silently ignored, so `bytes` can be an arbitrary
   * slice of a BAM file as long as it starts on a block boundary.
   *
   * This function must stay self-contained (its only free variable is `pako`):
   * its source code is serialised with Function#toString to build the Web Worker script.
   *
   * @param {Uint8Array} bytes compressed data starting on a block boundary
   * @returns {Uint8Array} uncompressed data
   */
  function inflateBgzfBlocks(bytes) {
    const headerSize = 18;
    const footerSize = 8;
    const parts = [];
    let offset = 0;
    let totalLength = 0;

    while (offset + headerSize <= bytes.length) {
      const blockSize = (bytes[offset + 16] | (bytes[offset + 17] << 8)) + 1;
      if (offset + blockSize > bytes.length) break;
      const inflated = pako.inflateRaw(bytes.subarray(offset + headerSize, offset + blockSize - footerSize));
      parts.push(inflated);
      totalLength += inflated.length;
      offset += blockSize;
    }

    const output = new Uint8Array(totalLength);
    let position = 0;
    for (const part of parts) {
      output.set(part, position);
      position += part.length;
    }
    return output;
  }

  /**
   * Lists the complete BGZF blocks in `bytes`, stopping after the block that starts at
   * `lastBlockOffset` (a file offset) or at the first incomplete block.
   *
   * @param {Uint8Array} bytes compressed data starting on a block boundary
   * @param {number} bytesFileOffset file offset of bytes[0]
   * @param {number} [lastBlockOffset=Infinity] file offset of the last block wanted
   * @returns {{boundaries: number[], end: number, reachedLastBlock: boolean}}
   *   `boundaries` are offsets in `bytes` of each block start plus the end of the last block
   *   (so block k is bytes[boundaries[k] .. boundaries[k+1]]); `end` is the number of bytes
   *   consumed; `reachedLastBlock` is true when a block beyond `lastBlockOffset` was seen.
   */
  function findCompleteBlocks(bytes, bytesFileOffset, lastBlockOffset = Infinity) {
    const boundaries = [0];
    let position = 0;
    let reachedLastBlock = false;

    while (position + HEADER_SIZE <= bytes.length) {
      const blockSize = readBlockSize(bytes, position);
      if (position + blockSize > bytes.length) break;
      if (bytesFileOffset + position > lastBlockOffset) {
        reachedLastBlock = true;
        break;
      }
      position += blockSize;
      boundaries.push(position);
    }
    return { boundaries, end: position, reachedLastBlock };
  }

  /**
   * Splits a BGZF virtual offset into its two components.
   * Virtual offsets are 64-bit values stored as JS numbers, so they are exact only for
   * BAM files smaller than 2^37 bytes (128 GiB).
   *
   * @param {number} virtualOffset
   * @returns {{blockOffset: number, offsetInBlock: number}}
   *   file offset of the compressed block, and offset inside its uncompressed data
   */
  function splitVirtualOffset(virtualOffset) {
    const blockOffset = Math.floor(virtualOffset / MAX_BLOCK_SIZE);
    return { blockOffset, offsetInBlock: virtualOffset - blockOffset * MAX_BLOCK_SIZE };
  }

  /**
   * Concatenates two byte arrays into a new one.
   * @param {Uint8Array} a
   * @param {Uint8Array} b
   * @returns {Uint8Array}
   */
  function concatBytes(a, b) {
    const result = new Uint8Array(a.length + b.length);
    result.set(a);
    result.set(b, a.length);
    return result;
  }

  /** Number of workers: one per logical core minus one for the UI thread, between 1 and 8. */
  function defaultPoolSize() {
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    return Math.max(1, Math.min(8, cores - 1));
  }

  /**
   * Pool of Web Workers decompressing BGZF blocks in parallel.
   * Workers are created lazily on first use. If they cannot be created, or if one of them
   * fails, the pool permanently switches to decompression on the calling thread.
   */
  class InflatePool {
    /** @param {number} [size] number of workers */
    constructor(size = defaultPoolSize()) {
      this.size = size;
      /** @type {Worker[] | null | undefined} undefined = not created yet, null = unavailable */
      this.workers = undefined;
    }

    /** @private */
    ensureWorkers() {
      if (this.workers !== undefined) return;
      try {
        if (typeof Worker === 'undefined') throw new Error('Web Workers are not available');
        const source =
          `importScripts('${PAKO_URL}');` +
          `const inflateBgzfBlocks=${inflateBgzfBlocks};` +
          'onmessage=e=>{const o=inflateBgzfBlocks(e.data);postMessage(o.buffer,[o.buffer])}';
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        this.workers = Array.from({ length: this.size }, () => new Worker(url));
      } catch (error) {
        this.workers = null;
      }
    }

    /**
     * Decompresses `bytes` (complete BGZF blocks) on worker number `workerIndex`.
     * Only one job may be in flight per worker at a time.
     *
     * @param {number} workerIndex 0 <= workerIndex < size
     * @param {Uint8Array} bytes
     * @returns {Promise<Uint8Array>}
     */
    inflate(workerIndex, bytes) {
      this.ensureWorkers();
      if (!this.workers) return Promise.resolve().then(() => inflateBgzfBlocks(bytes));

      return new Promise((resolve, reject) => {
        const worker = this.workers[workerIndex];
        worker.onmessage = (event) => resolve(new Uint8Array(event.data));
        worker.onerror = () => {
          this.workers = null;
          try {
            resolve(inflateBgzfBlocks(bytes));
          } catch (error) {
            reject(error);
          }
        };
        worker.postMessage(bytes);
      });
    }

    /**
     * Decompresses a run of consecutive BGZF blocks, spreading them evenly over the workers.
     *
     * @param {Uint8Array} bytes compressed data
     * @param {number[]} boundaries block boundaries, as returned by findCompleteBlocks
     * @returns {Promise<Uint8Array[]>} uncompressed pieces, in file order
     */
    inflateBlocks(bytes, boundaries) {
      const blockCount = boundaries.length - 1;
      const blocksPerWorker = Math.ceil(blockCount / this.size);
      const jobs = [];
      for (let i = 0; i < this.size && i * blocksPerWorker < blockCount; i++) {
        const start = boundaries[i * blocksPerWorker];
        const end = boundaries[Math.min(blockCount, (i + 1) * blocksPerWorker)];
        jobs.push(this.inflate(i, bytes.slice(start, end)));
      }
      return Promise.all(jobs);
    }
  }

  let defaultPool;

  /** @returns {InflatePool} pool shared by the whole page */
  function getDefaultPool() {
    return defaultPool || (defaultPool = new InflatePool());
  }

  ns.bgzf = {
    HEADER_SIZE,
    FOOTER_SIZE,
    MAX_BLOCK_SIZE,
    inflateBgzfBlocks,
    findCompleteBlocks,
    splitVirtualOffset,
    concatBytes,
    InflatePool,
    getDefaultPool,
  };
})(globalThis);
