import type { ChromName } from "@/lib/genome/hg38"
import { cytoBandsInView, type CytoBand, type CytoBandCatalog } from "@/lib/genome/cyto-band"
import type { Segment } from "@/lib/types"

export function chromToIscnNumber(chrom: ChromName): string {
  if (chrom === "chrX") return "X"
  if (chrom === "chrY") return "Y"
  return chrom.replace(/^chr/, "")
}

/** Cytogenetic locus e.g. `7q11.23` or `7q11.22-q11.24` when spanning bands. */
export function formatCytoLocation(chrom: ChromName, bands: readonly CytoBand[]): string {
  if (bands.length === 0) return "—"
  const num = chromToIscnNumber(chrom)
  const first = bands[0].name
  const last = bands[bands.length - 1].name
  if (bands.length === 1 || first === last) return `${num}${first}`
  return `${num}${first}-${last}`
}

export function cytoBandsForSegment(
  catalog: CytoBandCatalog,
  segment: Pick<Segment, "chrom" | "start" | "end">
): CytoBand[] {
  const bands = catalog.byChrom.get(segment.chrom)
  return cytoBandsInView(bands, segment.start, segment.end)
}

/** ISCN seq[GRCh38] e.g. `seq[GRCh38] 7q11.23(72700000_74100000)x3`. */
export function formatIscnSeq(
  segment: Segment,
  cytoLocation: string,
  copyNumber: number
): string {
  if (cytoLocation === "—") return "—"
  const start = segment.start + 1
  const end = segment.end
  const cn = Math.max(0, Math.round(copyNumber))
  return `seq[GRCh38] ${cytoLocation}(${start}_${end})x${cn}`
}
