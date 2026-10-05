import { normalizeChrom, type ChromName } from "@/lib/genome/hg38"
import type { GeneRegion } from "@/lib/types"

function parseCoordToken(raw: string): number | null {
  const n = Number(raw.replace(/[\s,_]/g, ""))
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Pasteable region, same convention as {@link formatLocation}. */
export function formatRegionField(chrom: ChromName, start: number, end: number): string {
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 })
  return `${chrom}:${n(start + 1)}-${n(end)}`
}

/**
 * Parses `chr1:29,150,389.924-235,360,172.531` (commas, decimals, optional `chr`).
 * Start is 1-based in the string; end matches the displayed half-open end coordinate.
 */
export function parseRegionField(input: string): GeneRegion | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^((?:chr)?(?:[0-9]+|[XYxy]))\s*:\s*([\d,.\s]+)\s*-\s*([\d,.\s]+)$/i)
  if (!match) return null

  const chrom = normalizeChrom(match[1])
  const startDisplay = parseCoordToken(match[2])
  const endDisplay = parseCoordToken(match[3])
  if (!chrom || startDisplay === null || endDisplay === null) return null

  const start = Math.max(0, Math.round(startDisplay) - 1)
  const end = Math.round(endDisplay)
  if (end <= start) return null

  return { chrom, start, end }
}
