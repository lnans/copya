/** UCSC ClinGen Gene-Disease Validity classification labels. */
export type ClinGenClassification =
  | "Definitive"
  | "Strong"
  | "Moderate"
  | "Limited"
  | "Animal Model Only"
  | "No Known Disease Relationship"
  | "Disputed"
  | "Refuted"

const KNOWN = new Set<string>([
  "Definitive",
  "Strong",
  "Moderate",
  "Limited",
  "Animal Model Only",
  "No Known Disease Relationship",
  "Disputed",
  "Refuted",
])

/** Limited → Definitive: orange; other classes: blue. */
const ORANGE_EVIDENCE = new Set<ClinGenClassification>(["Limited", "Moderate", "Strong", "Definitive"])

export function normalizeClinGenClassification(raw: string): ClinGenClassification | null {
  const key = raw.trim()
  return KNOWN.has(key) ? (key as ClinGenClassification) : null
}

export function clinGenFillCssVar(classification: string): string {
  const norm = normalizeClinGenClassification(classification)
  if (norm && ORANGE_EVIDENCE.has(norm)) return "--cnv-clingen-orange"
  return "--cnv-clingen-blue"
}

/** Higher = stronger evidence (merging duplicate rows for the same gene–disease). */
export const CLINGEN_CLASS_RANK: Record<ClinGenClassification, number> = {
  Definitive: 8,
  Strong: 7,
  Moderate: 6,
  Limited: 5,
  "Animal Model Only": 4,
  Disputed: 3,
  Refuted: 2,
  "No Known Disease Relationship": 1,
}

export function strongerClinGenClass(a: string, b: string): string {
  const ra = normalizeClinGenClassification(a)
  const rb = normalizeClinGenClassification(b)
  if (!ra) return b
  if (!rb) return a
  return CLINGEN_CLASS_RANK[ra] >= CLINGEN_CLASS_RANK[rb] ? a : b
}
