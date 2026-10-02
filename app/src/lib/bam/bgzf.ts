/**
 * BGZF (Blocked GNU Zip Format): a BAM is a concatenation of independent gzip
 * members of at most 64 KiB each (SAMv1 specification, section 4.1).
 *
 *   offset    size  field
 *   0         12    gzip header, XLEN = 6
 *   12        4     extra subfield "BC" (SI1 SI2 SLEN)
 *   16        2     BSIZE = total block size - 1 (uint16 LE)
 *   18        n     raw DEFLATE payload
 *   end - 8   4     CRC32
 *   end - 4   4     ISIZE
 *
 * Virtual offset = compressedBlockOffset * 2^16 + offsetInUncompressedBlock.
 */

/** Raw DEFLATE decompression, injected: node:zlib in Node, a bundled library in the browser. */
export type InflateRaw = (deflated: Uint8Array) => Uint8Array | Promise<Uint8Array>

export const HEADER_SIZE = 18
export const FOOTER_SIZE = 8
export const MAX_BLOCK_SIZE = 1 << 16

export function readBlockSize(bytes: Uint8Array, offset: number): number {
  return (bytes[offset + 16] | (bytes[offset + 17] << 8)) + 1
}

export type CompleteBlocks = {
  /** Block k is `bytes[boundaries[k] .. boundaries[k + 1]]`. */
  boundaries: number[]
  /** Number of bytes consumed. */
  end: number
  /** True when a block starting after `lastBlockOffset` was reached. */
  reachedLastBlock: boolean
}

/**
 * Lists the complete blocks of `bytes` (which starts on a block boundary at
 * file offset `bytesFileOffset`), up to the block starting at `lastBlockOffset`.
 */
export function findCompleteBlocks(
  bytes: Uint8Array,
  bytesFileOffset: number,
  lastBlockOffset = Number.POSITIVE_INFINITY
): CompleteBlocks {
  const boundaries = [0]
  let position = 0
  let reachedLastBlock = false
  while (position + HEADER_SIZE <= bytes.length) {
    const size = readBlockSize(bytes, position)
    if (position + size > bytes.length) break
    if (bytesFileOffset + position > lastBlockOffset) {
      reachedLastBlock = true
      break
    }
    position += size
    boundaries.push(position)
  }
  return { boundaries, end: position, reachedLastBlock }
}

/** Decompresses the listed blocks (concurrently if `inflateRaw` is async) and concatenates them. */
export async function inflateBlocks(
  bytes: Uint8Array,
  boundaries: number[],
  inflateRaw: InflateRaw
): Promise<Uint8Array> {
  const pieces = await Promise.all(
    boundaries
      .slice(0, -1)
      .map((start, k) => inflateRaw(bytes.subarray(start + HEADER_SIZE, boundaries[k + 1] - FOOTER_SIZE)))
  )
  return concatBytes(...pieces)
}

/** Exact for files smaller than 2^37 bytes (128 GiB). */
export function splitVirtualOffset(virtualOffset: number): {
  blockOffset: number
  offsetInBlock: number
} {
  const blockOffset = Math.floor(virtualOffset / MAX_BLOCK_SIZE)
  return { blockOffset, offsetInBlock: virtualOffset - blockOffset * MAX_BLOCK_SIZE }
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let length = 0
  for (const part of parts) length += part.length
  const result = new Uint8Array(length)
  let position = 0
  for (const part of parts) {
    result.set(part, position)
    position += part.length
  }
  return result
}
