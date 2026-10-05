import type { AnnotationCatalog } from "@/lib/annotations/annotation-catalog"
import { expandInterval, chromLength } from "@/lib/cnv/gene-region"
import type { GeneRegion } from "@/lib/types"

export type RefSeqGeneLookupResult =
  | { ok: true; region: GeneRegion; symbol: string }
  | { ok: false; code: "empty" | "not_found" | "ambiguous"; chroms?: string[] }

function normalizeSymbol(query: string): string {
  return query.trim().toUpperCase()
}

/** Resolve a gene symbol against a loaded RefSeq catalog (genePred names). */
export function lookupRefSeqGeneSymbol(
  catalog: AnnotationCatalog,
  query: string,
  marginRatio = 0.2
): RefSeqGeneLookupResult {
  const key = normalizeSymbol(query)
  if (!key) return { ok: false, code: "empty" }

  const hits = catalog.features.filter((f) => f.name.toUpperCase() === key)
  if (hits.length === 0) return { ok: false, code: "not_found" }

  const chroms = [...new Set(hits.map((h) => h.chrom))]
  if (chroms.length > 1) {
    return { ok: false, code: "ambiguous", chroms }
  }

  const chrom = chroms[0]!
  let start = hits[0]!.start
  let end = hits[0]!.end
  let symbol = hits[0]!.name
  for (const h of hits) {
    start = Math.min(start, h.start)
    end = Math.max(end, h.end)
    if (h.name.length > symbol.length) symbol = h.name
  }

  const len = chromLength(chrom)
  const expanded = expandInterval(start, end, len, marginRatio)
  return { ok: true, region: { chrom, start: expanded.start, end: expanded.end }, symbol }
}
