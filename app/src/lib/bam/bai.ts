/**
 * BAI (BAM index) reader. Only the virtual offsets of the first and last
 * alignments of each reference are extracted (SAMv1 specification, section 5.2):
 *
 *   magic        char[4]  "BAI\1"
 *   n_ref        int32
 *   per reference:
 *     n_bin      int32
 *     per bin:   bin uint32, n_chunk int32, n_chunk × (beg uint64, end uint64)
 *     n_intv     int32, then n_intv × uint64 (linear index, skipped)
 */

/** "BAI\1" as a little-endian uint32. */
export const BAI_MAGIC = 0x01494142

/** Pseudo-bin holding metadata instead of chunks. */
export const PSEUDO_BIN = 37450

export type ReferenceRange = {
  /** Virtual offset of the first alignment. */
  startOffset: number
  /** Virtual offset just after the last alignment. */
  endOffset: number
}

export class BaiError extends Error {
  constructor(message = "Ce fichier n'est pas un BAI valide.") {
    super(message)
    this.name = "BaiError"
  }
}

/** One entry per BAM reference, in header order; `null` when it has no aligned reads. */
export function parseBai(buffer: ArrayBuffer): (ReferenceRange | null)[] {
  const view = new DataView(buffer)
  if (view.byteLength < 8 || view.getUint32(0, true) !== BAI_MAGIC) throw new BaiError()

  let offset = 4
  const int32 = () => {
    const value = view.getInt32(offset, true)
    offset += 4
    return value
  }
  const uint32 = () => {
    const value = view.getUint32(offset, true)
    offset += 4
    return value
  }
  const uint64 = () => {
    const low = view.getUint32(offset, true)
    const high = view.getUint32(offset + 4, true)
    offset += 8
    return high * 2 ** 32 + low
  }

  const referenceCount = int32()
  const ranges: (ReferenceRange | null)[] = []
  for (let ref = 0; ref < referenceCount; ref++) {
    let startOffset = Number.POSITIVE_INFINITY
    let endOffset = 0
    const binCount = int32()
    for (let b = 0; b < binCount; b++) {
      const bin = uint32()
      const chunkCount = int32()
      for (let c = 0; c < chunkCount; c++) {
        const chunkStart = uint64()
        const chunkEnd = uint64()
        if (bin === PSEUDO_BIN) continue
        if (chunkStart < startOffset) startOffset = chunkStart
        if (chunkEnd > endOffset) endOffset = chunkEnd
      }
    }
    const linearIndexSize = int32()
    offset += 8 * linearIndexSize
    ranges.push(startOffset < Number.POSITIVE_INFINITY ? { startOffset, endOffset } : null)
  }
  return ranges
}
