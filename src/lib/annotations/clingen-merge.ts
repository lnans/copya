import { strongerClinGenClass } from "@/lib/annotations/clingen-colors"
import type { AnnotationFeature } from "@/lib/annotations/annotation-catalog"

function mergeKey(f: AnnotationFeature): string {
  const gene = f.clinGenGeneSymbol?.trim().toUpperCase() ?? ""
  const disease = f.name.trim()
  return `${f.chrom}\t${gene}\t${disease}`
}

/** Merge genomic spans for the same gene–disease assertion (keep strongest class). */
export function mergeClinGenByGeneDisease(features: AnnotationFeature[]): AnnotationFeature[] {
  const byKey = new Map<string, AnnotationFeature>()
  for (const f of features) {
    const key = mergeKey(f)
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { ...f })
      continue
    }
    prev.start = Math.min(prev.start, f.start)
    prev.end = Math.max(prev.end, f.end)
    if (prev.clinGenClassification && f.clinGenClassification) {
      prev.clinGenClassification = strongerClinGenClass(
        prev.clinGenClassification,
        f.clinGenClassification
      )
    } else {
      prev.clinGenClassification = prev.clinGenClassification ?? f.clinGenClassification
    }
  }
  return [...byKey.values()]
}
