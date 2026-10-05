import { HG38_CHROMOSOMES } from "@/lib/genome/hg38"
import type { Bins } from "@/lib/types"

export type ChromSummary = {
  chrom: string
  median: number
  bins: number
}

/** Median log2 per chromosome, ignoring empty (NaN) bins. */
export function summarizeByChromosome(bins: Bins): ChromSummary[] {
  const values: number[][] = HG38_CHROMOSOMES.map(() => [])
  for (let i = 0; i < bins.length; i++) {
    const v = bins.log2[i]
    if (Number.isFinite(v)) values[bins.chromIndex[i]].push(v)
  }
  return HG38_CHROMOSOMES.map((c, i) => {
    const sorted = values[i].sort((a, b) => a - b)
    const n = sorted.length
    const median =
      n === 0 ? Number.NaN : n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    return { chrom: c.name, median, bins: n }
  })
}
