import { featuresInView, type AnnotationCatalog } from "@/lib/annotations/annotation-catalog"
import type { Segment } from "@/lib/types"

export type SegmentGeneEntry = {
  name: string
  clinGen: boolean
}

export function segmentRefSeqGenes(
  catalog: AnnotationCatalog,
  segment: Segment
): string[] {
  const features = featuresInView(
    catalog.byChrom.get(segment.chrom),
    segment.start,
    segment.end
  )
  const names = new Set<string>()
  for (const f of features) {
    const name = f.name.trim()
    if (name) names.add(name)
  }
  return [...names].sort((a, b) => a.localeCompare(b, "fr"))
}

/** HGNC symbols with a ClinGen Gene-Disease entry overlapping the segment. */
export function segmentClinGenGeneSet(
  catalog: AnnotationCatalog,
  segment: Segment
): Set<string> {
  const features = featuresInView(
    catalog.byChrom.get(segment.chrom),
    segment.start,
    segment.end
  )
  const symbols = new Set<string>()
  for (const f of features) {
    const symbol = f.clinGenGeneSymbol?.trim()
    if (symbol) symbols.add(symbol.toUpperCase())
  }
  return symbols
}

export function segmentGeneEntries(
  refSeq: AnnotationCatalog,
  clinGen: AnnotationCatalog,
  segment: Segment
): SegmentGeneEntry[] {
  const clinGenSet = segmentClinGenGeneSet(clinGen, segment)
  return segmentRefSeqGenes(refSeq, segment).map((name) => ({
    name,
    clinGen: clinGenSet.has(name.toUpperCase()),
  }))
}

/** Truncate comma-separated gene list; keeps whole symbols when possible. */
export function truncateGeneList(
  genes: SegmentGeneEntry[],
  maxChars: number
): { entries: SegmentGeneEntry[]; truncated: boolean; fullLabel: string } {
  const fullLabel = genes.map((g) => g.name).join(", ")
  if (fullLabel.length <= maxChars) {
    return { entries: genes, truncated: false, fullLabel }
  }
  const out: SegmentGeneEntry[] = []
  let len = 0
  for (const entry of genes) {
    const add = out.length === 0 ? entry.name.length : entry.name.length + 2
    if (len + add > maxChars - 1) break
    out.push(entry)
    len += add
  }
  return { entries: out, truncated: true, fullLabel }
}
