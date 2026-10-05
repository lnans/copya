const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })

/** 0-based half-open interval displayed 1-based: `chr22:18,900,001-21,900,000`. */
export function formatLocation(chrom: string, start: number, end: number): string {
  const n = (v: number) => v.toLocaleString("en-US")
  return `${chrom}:${n(start + 1)}-${n(end)}`
}

export function formatSize(bp: number): string {
  if (bp >= 1_000_000) return `${(bp / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mb`
  if (bp >= 1_000) return `${(bp / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kb`
  return `${integer.format(bp)} pb`
}

export function formatLog2(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "—"
}
