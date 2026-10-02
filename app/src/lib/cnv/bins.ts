import { HG38_CHROMOSOMES } from "@/lib/genome/hg38"
import type { Bins } from "@/lib/types"

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
