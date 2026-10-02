import { CHROM_INDEX, normalizeChrom, type ChromName } from "../genome/hg38.ts"
import { BaiError, parseBai } from "./bai.ts"
import {
  BamError,
  countReadsPerBin,
  DEFAULT_EXCLUDED_FLAGS,
  DEFAULT_MIN_MAPPING_QUALITY,
  readBamHeader,
  type ByteSource,
} from "./bam.ts"
import type { InflateRaw } from "./bgzf.ts"

export type ChromCounts = {
  chrom: ChromName
  length: number
  counts: Uint32Array
}

export type BinRow = {
  chrom: ChromName
  /** 0-based. */
  start: number
  end: number
  reads: number
  log2: number
}

const AUTOSOME = /^chr([1-9]|1\d|2[0-2])$/

/**
 * Upper median of the non-empty autosome bins (assumed diploid), or of all
 * chromosomes if no autosome has reads. 1 when there is no read at all.
 */
export function medianBinCount(chromosomes: ChromCounts[]): number {
  const collect = (keep: (c: ChromCounts) => boolean) => {
    const values: number[] = []
    for (const c of chromosomes) {
      if (!keep(c)) continue
      for (const count of c.counts) if (count) values.push(count)
    }
    return values
  }
  let values = collect((c) => AUTOSOME.test(c.chrom))
  if (!values.length) values = collect(() => true)
  const sorted = Float64Array.from(values).sort()
  return sorted[sorted.length >> 1] || 1
}

/** log2(reads / median) per non-empty bin; the last bin is clipped to the chromosome length. */
export function* binRows(chromosomes: ChromCounts[], binSize: number, median: number): Generator<BinRow> {
  for (const { chrom, length, counts } of chromosomes) {
    for (let bin = 0; bin < counts.length; bin++) {
      const start = bin * binSize
      const reads = counts[bin]
      if (!reads || start >= length) continue
      yield { chrom, start, end: Math.min(start + binSize, length), reads, log2: Math.log2(reads / median) }
    }
  }
}

export type BinsFileMeta = {
  source: string
  binSize: number
  median: number
  minMappingQuality: number
  excludedFlags: number
  version: string
}

/**
 * BED-like bins file read by the viewer: `##` metadata lines, a `#chrom` header,
 * then `chrom start end log2 reads` (0-based starts, log2 with 3 decimals).
 */
export function formatBinsFile(rows: Iterable<BinRow>, meta: BinsFileMeta): string {
  const lines = [
    `##source=${meta.source}`,
    `##generator=bam-to-bins ${meta.version}`,
    "##genome=GRCh38",
    `##bin_size=${meta.binSize}`,
    `##median_reads_per_bin=${meta.median}`,
    `##min_mapping_quality=${meta.minMappingQuality}`,
    `##excluded_flags=0x${meta.excludedFlags.toString(16)}`,
    "#chrom\tstart\tend\tlog2\treads",
  ]
  for (const r of rows) lines.push(`${r.chrom}\t${r.start}\t${r.end}\t${r.log2.toFixed(3)}\t${r.reads}`)
  return `${lines.join("\n")}\n`
}

export type BamToBinsOptions = {
  binSize: number
  inflateRaw: InflateRaw
  minMappingQuality?: number
  excludedFlags?: number
  onChromosome?: (event: { chrom: ChromName; index: number; total: number; fraction: number }) => void
}

export type BamToBinsResult = {
  chromosomes: ChromCounts[]
  median: number
  minMappingQuality: number
  excludedFlags: number
}

/** Counts reads per bin on chr1-22, X, Y of a coordinate-sorted BAM, in chromosome order. */
export async function bamToBins(
  bam: ByteSource,
  bai: ArrayBuffer,
  {
    binSize,
    inflateRaw,
    minMappingQuality = DEFAULT_MIN_MAPPING_QUALITY,
    excludedFlags = DEFAULT_EXCLUDED_FLAGS,
    onChromosome,
  }: BamToBinsOptions
): Promise<BamToBinsResult> {
  const references = await readBamHeader(bam, inflateRaw)
  const ranges = parseBai(bai)
  if (ranges.length !== references.length) throw new BaiError("Le BAI ne correspond pas à ce BAM.")

  const todo = references
    .map((ref, index) => ({ ...ref, index, chrom: normalizeChrom(ref.name), range: ranges[index] }))
    .filter((r): r is typeof r & { chrom: ChromName; range: NonNullable<typeof r.range> } =>
      Boolean(r.chrom && r.range)
    )
    .sort((a, b) => CHROM_INDEX.get(a.chrom)! - CHROM_INDEX.get(b.chrom)!)
  if (!todo.length) {
    throw new BamError("Aucun read trouvé sur les chromosomes 1-22, X, Y (BAM non trié ?).")
  }

  const chromosomes: ChromCounts[] = []
  for (const [i, ref] of todo.entries()) {
    const counts = await countReadsPerBin(bam, ref, ref.index, binSize, {
      inflateRaw,
      minMappingQuality,
      excludedFlags,
      onProgress: (fraction) => onChromosome?.({ chrom: ref.chrom, index: i, total: todo.length, fraction }),
    })
    chromosomes.push({ chrom: ref.chrom, length: ref.length, counts })
  }
  return { chromosomes, median: medianBinCount(chromosomes), minMappingQuality, excludedFlags }
}
