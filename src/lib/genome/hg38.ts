/** GRCh38 primary assembly lengths (UCSC hg38.chrom.sizes). */
export const HG38_CHROMOSOMES = [
  { name: "chr1", length: 248_956_422 },
  { name: "chr2", length: 242_193_529 },
  { name: "chr3", length: 198_295_559 },
  { name: "chr4", length: 190_214_555 },
  { name: "chr5", length: 181_538_259 },
  { name: "chr6", length: 170_805_979 },
  { name: "chr7", length: 159_345_973 },
  { name: "chr8", length: 145_138_636 },
  { name: "chr9", length: 138_394_717 },
  { name: "chr10", length: 133_797_422 },
  { name: "chr11", length: 135_086_622 },
  { name: "chr12", length: 133_275_309 },
  { name: "chr13", length: 114_364_328 },
  { name: "chr14", length: 107_043_718 },
  { name: "chr15", length: 101_991_189 },
  { name: "chr16", length: 90_338_345 },
  { name: "chr17", length: 83_257_441 },
  { name: "chr18", length: 80_373_285 },
  { name: "chr19", length: 58_617_616 },
  { name: "chr20", length: 64_444_167 },
  { name: "chr21", length: 46_709_983 },
  { name: "chr22", length: 50_818_468 },
  { name: "chrX", length: 156_040_895 },
  { name: "chrY", length: 57_227_415 },
] as const

export type ChromName = (typeof HG38_CHROMOSOMES)[number]["name"]

export const CHROM_INDEX: ReadonlyMap<string, number> = new Map(
  HG38_CHROMOSOMES.map((c, i) => [c.name, i])
)

/**
 * Normalises `1`, `chr1`, `CHR1`, `X`, `23`, `chrY`, `24`… to `chr1`…`chrY`.
 * Returns `null` for contigs outside the 24 primary chromosomes.
 */
export function normalizeChrom(raw: string): ChromName | null {
  let name = raw.trim()
  if (/^chr/i.test(name)) name = name.slice(3)
  name = name.toUpperCase()
  if (name === "23") name = "X"
  else if (name === "24") name = "Y"
  const normalized = `chr${name}`
  return CHROM_INDEX.has(normalized) ? (normalized as ChromName) : null
}

/** Cumulative start offset of each chromosome on the concatenated genome axis. */
export function genomeOffsets(
  chromosomes: readonly { length: number }[] = HG38_CHROMOSOMES
): { offsets: number[]; total: number } {
  const offsets: number[] = []
  let total = 0
  for (const c of chromosomes) {
    offsets.push(total)
    total += c.length
  }
  return { offsets, total }
}

export function shortChromLabel(name: string): string {
  return name.replace(/^chr/, "")
}
