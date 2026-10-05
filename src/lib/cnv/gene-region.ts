import { CHROM_INDEX, HG38_CHROMOSOMES } from "@/lib/genome/hg38"
import type { GeneRegion, Segment } from "@/lib/types"

import { clampViewport, type BpViewport } from "./viewport"

/** Expands an interval by `marginRatio` on each side (e.g. 0.2 = 20 %). */
export function expandInterval(
  start: number,
  end: number,
  chromLength: number,
  marginRatio = 0.2
): BpViewport {
  const pad = Math.max(0, end - start) * marginRatio
  return clampViewport(start - pad, end + pad, chromLength)
}

export function chromLength(chrom: GeneRegion["chrom"]): number {
  return HG38_CHROMOSOMES[CHROM_INDEX.get(chrom)!].length
}

export function geneRegionFromSegment(segment: Segment, length = chromLength(segment.chrom)): GeneRegion {
  const { start, end } = expandInterval(segment.start, segment.end, length, 0.2)
  return { chrom: segment.chrom, start, end }
}
