import { CHROM_INDEX, HG38_CHROMOSOMES } from "@/lib/genome/hg38"
import type { Bins, Segment } from "@/lib/types"

/** `[from, to)` bin index range of each chromosome, for bins sorted by chromosome. */
export function binRangesByChrom(bins: Bins): [number, number][] {
  const ranges: [number, number][] = HG38_CHROMOSOMES.map(() => [0, 0])
  let i = 0
  for (let c = 0; c < ranges.length; c++) {
    const from = i
    while (i < bins.length && bins.chromIndex[i] === c) i++
    ranges[c] = [from, i]
  }
  return ranges
}

/** Bins whose interval overlaps the segment (0-based, half-open). */
export function countBinsOverlappingSegment(
  bins: Bins,
  chromRanges: readonly [number, number][],
  segment: Pick<Segment, "chrom" | "start" | "end">
): number {
  const chromIdx = CHROM_INDEX.get(segment.chrom)
  if (chromIdx === undefined) return 0
  const [from, to] = chromRanges[chromIdx]
  let count = 0
  for (let i = from; i < to; i++) {
    if (bins.end[i] <= segment.start) continue
    if (bins.start[i] >= segment.end) break
    count++
  }
  return count
}
