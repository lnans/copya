import type { ReferenceRange } from "./bai.ts"
import {
  concatBytes,
  findCompleteBlocks,
  inflateBlocks,
  splitVirtualOffset,
  type InflateRaw,
} from "./bgzf.ts"

/** Random access to a file without loading it: a browser `File` or Node's `fs.openAsBlob`. */
export type ByteSource = {
  readonly size: number
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> }
}

export type BamReference = {
  /** As written in the BAM, e.g. "7" or "chr7". */
  name: string
  length: number
}

export const DEFAULT_MIN_MAPPING_QUALITY = 10

/** Unmapped 0x4, secondary 0x100, QC fail 0x200, duplicate 0x400, supplementary 0x800. */
export const DEFAULT_EXCLUDED_FLAGS = 0x004 | 0x100 | 0x200 | 0x400 | 0x800

const BAM_MAGIC = [66, 65, 77, 1]
const INITIAL_HEADER_READ_SIZE = 1 << 20
const READ_CHUNK_SIZE = 32 << 20
/** Read past the last block of a chromosome so that block (≤ 64 KiB) is complete. */
const LAST_BLOCK_MARGIN = 1 << 17

export class BamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BamError"
  }
}

async function readBytes(file: ByteSource, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

/**
 * Reference dictionary of an uncompressed BAM header (SAMv1, section 4.2):
 * magic "BAM\1", l_text int32, text, n_ref int32, then per reference
 * l_name int32, name (NUL-terminated), l_ref int32.
 *
 * Returns `null` if `bytes` is too short to hold the whole dictionary.
 */
export function parseBamHeader(bytes: Uint8Array): BamReference[] | null {
  if (bytes.length < 4) return null
  if (BAM_MAGIC.some((byte, i) => bytes[i] !== byte)) {
    throw new BamError("Ce fichier n'est pas un BAM valide.")
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
  const fits = (offset: number, size: number) => offset + size <= bytes.length
  const decoder = new TextDecoder()

  let offset = 4
  if (!fits(offset, 4)) return null
  offset += 4 + view.getInt32(offset, true)
  if (!fits(offset, 4)) return null
  const referenceCount = view.getInt32(offset, true)
  offset += 4

  const references: BamReference[] = []
  for (let i = 0; i < referenceCount; i++) {
    if (!fits(offset, 4)) return null
    const nameLength = view.getInt32(offset, true)
    if (!fits(offset + 4, nameLength + 4)) return null
    const name = decoder.decode(bytes.subarray(offset + 4, offset + 3 + nameLength))
    const length = view.getInt32(offset + 4 + nameLength, true)
    references.push({ name, length })
    offset += 8 + nameLength
  }
  return references
}

export async function readBamHeader(file: ByteSource, inflateRaw: InflateRaw): Promise<BamReference[]> {
  for (let readSize = INITIAL_HEADER_READ_SIZE; ; readSize *= 4) {
    const compressed = await readBytes(file, 0, readSize)
    const { boundaries } = findCompleteBlocks(compressed, 0)
    const references = parseBamHeader(await inflateBlocks(compressed, boundaries, inflateRaw))
    if (references) return references
    if (readSize >= file.size) throw new BamError("En-tête BAM illisible.")
  }
}

export type CountOptions = {
  inflateRaw: InflateRaw
  minMappingQuality?: number
  excludedFlags?: number
  /** Called after each chunk with the fraction done (0..1). */
  onProgress?: (fraction: number) => void
}

/**
 * Counts the reads of one chromosome in fixed-size bins, by leftmost mapped
 * position. Only its byte range (from the BAI) is read. Requires a
 * coordinate-sorted BAM. Bin k covers [k × binSize, (k + 1) × binSize).
 *
 * Alignment record offsets: 0 block_size int32, 4 refID int32, 8 pos int32,
 * 13 mapq uint8, 18 flag uint16.
 */
export async function countReadsPerBin(
  file: ByteSource,
  reference: { length: number; range: ReferenceRange },
  referenceIndex: number,
  binSize: number,
  {
    inflateRaw,
    minMappingQuality = DEFAULT_MIN_MAPPING_QUALITY,
    excludedFlags = DEFAULT_EXCLUDED_FLAGS,
    onProgress,
  }: CountOptions
): Promise<Uint32Array> {
  const first = splitVirtualOffset(reference.range.startOffset)
  const lastBlockOffset = splitVirtualOffset(reference.range.endOffset).blockOffset
  const counts = new Uint32Array(Math.ceil(reference.length / binSize) + 1)

  // A record may straddle two decompressed chunks.
  let pending: Uint8Array = new Uint8Array(0)
  const countRecords = (uncompressed: Uint8Array) => {
    const bytes = concatBytes(pending, uncompressed)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    let position = 0
    while (position + 4 <= bytes.length) {
      const recordEnd = position + 4 + view.getInt32(position, true)
      if (recordEnd > bytes.length) break
      if (view.getInt32(position + 4, true) === referenceIndex) {
        const mappingQuality = bytes[position + 13]
        const flag = view.getUint16(position + 18, true)
        if (mappingQuality >= minMappingQuality && !(flag & excludedFlags)) {
          counts[Math.floor(view.getInt32(position + 8, true) / binSize)]++
        }
      }
      position = recordEnd
    }
    pending = bytes.slice(position)
  }

  let readPosition = first.blockOffset
  let carry: Uint8Array = new Uint8Array(0)
  let carryFileOffset = first.blockOffset
  let isFirstBatch = true
  let reachedLastBlock = false

  while (!reachedLastBlock && readPosition < file.size) {
    const readEnd = Math.min(readPosition + READ_CHUNK_SIZE, lastBlockOffset + LAST_BLOCK_MARGIN)
    const chunk = await readBytes(file, readPosition, readEnd)
    if (!chunk.length) break
    readPosition += chunk.length

    const compressed = concatBytes(carry, chunk)
    const blocks = findCompleteBlocks(compressed, carryFileOffset, lastBlockOffset)
    reachedLastBlock = blocks.reachedLastBlock

    let uncompressed = await inflateBlocks(compressed, blocks.boundaries, inflateRaw)
    if (isFirstBatch && blocks.boundaries.length > 1) {
      // The first block may start with records of the previous chromosome.
      uncompressed = uncompressed.subarray(first.offsetInBlock)
      isFirstBatch = false
    }
    countRecords(uncompressed)

    carry = compressed.slice(blocks.end)
    carryFileOffset += blocks.end
    onProgress?.(
      Math.min(1, (carryFileOffset - first.blockOffset) / (lastBlockOffset - first.blockOffset + 1))
    )
  }
  return counts
}
