import { classifyDgvGoldColor, type DgvGoldColorKind } from "@/lib/annotations/dgv-gold-colors"
import { normalizeClinGenClassification } from "@/lib/annotations/clingen-colors"
import { mergeClinGenByGeneDisease } from "@/lib/annotations/clingen-merge"
import { CHROM_INDEX, normalizeChrom, type ChromName } from "@/lib/genome/hg38"

export type AnnotationExon = { start: number; end: number }

export type AnnotationFeature = {
  chrom: ChromName
  start: number
  end: number
  name: string
  /** RefSeq genePred / BED12 exon blocks (UCSC splice view). */
  exons?: AnnotationExon[]
  /** UCSC DGV Gold / dgvPlus color category. */
  dgvColor?: DgvGoldColorKind
  /** ClinGen Gene-Disease Validity classification. */
  clinGenClassification?: string
  /** HGNC gene symbol (ClinGen track). */
  clinGenGeneSymbol?: string
}

export const CLINGEN_GENE_DISEASE_BED_HEADER = "# clinGenGeneDisease"

export type AnnotationCatalog = {
  features: AnnotationFeature[]
  byChrom: ReadonlyMap<ChromName, readonly AnnotationFeature[]>
}

export type ParseAnnotationResult =
  | { ok: true; catalog: AnnotationCatalog }
  | { ok: false; code: "empty_file" | "no_rows" }

export function indexAnnotationFeatures(features: AnnotationFeature[]): AnnotationCatalog {
  features.sort((a, b) => {
    const ci = CHROM_INDEX.get(a.chrom)! - CHROM_INDEX.get(b.chrom)!
    if (ci !== 0) return ci
    return a.start - b.start
  })
  const byChrom = new Map<ChromName, AnnotationFeature[]>()
  for (const f of features) {
    let list = byChrom.get(f.chrom)
    if (!list) {
      list = []
      byChrom.set(f.chrom, list)
    }
    list.push(f)
  }
  return { features, byChrom }
}

export function featuresInView(
  features: readonly AnnotationFeature[] | undefined,
  viewStart: number,
  viewEnd: number
): AnnotationFeature[] {
  if (!features?.length) return []
  let lo = 0
  let hi = features.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (features[mid].end <= viewStart) lo = mid + 1
    else hi = mid
  }
  const out: AnnotationFeature[] = []
  for (let i = lo; i < features.length; i++) {
    const f = features[i]
    if (f.start >= viewEnd) break
    if (f.end > viewStart) out.push(f)
  }
  return out
}

function parseCommaCoords(raw: string): number[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

function parseExonLists(startsStr: string, endsStr: string): AnnotationExon[] {
  const starts = parseCommaCoords(startsStr)
  const ends = parseCommaCoords(endsStr)
  const exons: AnnotationExon[] = []
  const n = Math.min(starts.length, ends.length)
  for (let i = 0; i < n; i++) {
    if (ends[i] > starts[i]) exons.push({ start: starts[i], end: ends[i] })
  }
  return exons
}

function pushFeature(
  features: AnnotationFeature[],
  chrom: ChromName | null,
  start: number,
  end: number,
  name: string,
  exons?: AnnotationExon[],
  dgvColor?: DgvGoldColorKind,
  clinGenClassification?: string,
  clinGenGeneSymbol?: string
) {
  if (!chrom || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
  const entry: AnnotationFeature = { chrom, start, end, name: name.trim() || "—" }
  if (exons?.length) entry.exons = exons
  if (dgvColor) entry.dgvColor = dgvColor
  if (clinGenClassification) entry.clinGenClassification = clinGenClassification
  if (clinGenGeneSymbol) entry.clinGenGeneSymbol = clinGenGeneSymbol
  features.push(entry)
}

/** UCSC export: chrom, start, end, diseaseName, Classification, geneSymbol. */
function parseClinGenGeneDiseaseLine(cols: string[], features: AnnotationFeature[]) {
  if (cols.length < 5) return
  const chrom = normalizeChrom(cols[0])
  const start = Number(cols[1])
  const end = Number(cols[2])
  const classification = cols[4]?.trim() ?? ""
  if (!chrom || !normalizeClinGenClassification(classification)) return
  const disease = cols[3]?.trim() ?? ""
  const gene = cols.length >= 6 ? cols[5]?.trim() : undefined
  pushFeature(features, chrom, start, end, disease, undefined, undefined, classification, gene)
}

function parseBedLine(cols: string[], features: AnnotationFeature[]) {
  if (cols.length < 4) return
  const chrom = normalizeChrom(cols[0])
  if (!chrom) return
  const start = Number(cols[1])
  const end = Number(cols[2])
  const name = cols[3]
  const itemRgb = cols.length >= 9 ? cols[8] : undefined
  const variantType = cols.length >= 14 ? cols[12] : undefined
  const variantSubType = cols.length >= 15 ? cols[13] : undefined
  const dgvColor = classifyDgvGoldColor(itemRgb, variantType, variantSubType)
  if (cols.length >= 12) {
    const blockCount = Number(cols[9])
    const sizes = parseCommaCoords(cols[10])
    const relStarts = parseCommaCoords(cols[11])
    const exons: AnnotationExon[] = []
    for (let i = 0; i < blockCount && i < sizes.length && i < relStarts.length; i++) {
      const exonStart = start + relStarts[i]
      const exonEnd = exonStart + sizes[i]
      if (exonEnd > exonStart) exons.push({ start: exonStart, end: exonEnd })
    }
    if (exons.length) {
      pushFeature(features, chrom, start, end, name, exons, dgvColor)
      return
    }
  }
  pushFeature(features, chrom, start, end, name, undefined, dgvColor)
}

/** UCSC `dgvMerged` / `dgvSupporting` table dumps (not BED). */
function parseDgvLine(cols: string[], features: AnnotationFeature[]) {
  if (cols.length < 5) return
  const chrom = normalizeChrom(cols[1])
  if (!chrom) return
  const itemRgb = cols.length > 9 ? cols[9] : undefined
  const variantSubType = cols.length > 10 ? cols[10] : undefined
  const dgvColor = classifyDgvGoldColor(itemRgb, undefined, variantSubType, variantSubType)
  pushFeature(features, chrom, Number(cols[2]), Number(cols[3]), cols[4], undefined, dgvColor)
}

/** UCSC `ncbiRefSeq` genePred rows (optional leading bin column). */
function parseGenePredLine(cols: string[], features: AnnotationFeature[]) {
  const withBin = cols.length > 12 && normalizeChrom(cols[2]) && (cols[3] === "+" || cols[3] === "-")
  const withoutBin = !withBin && normalizeChrom(cols[1]) && (cols[2] === "+" || cols[2] === "-")
  if (!withBin && !withoutBin) return

  const chrom = normalizeChrom(withBin ? cols[2] : cols[1])!
  const start = Number(withBin ? cols[4] : cols[3])
  const end = Number(withBin ? cols[5] : cols[4])
  const nameIdx = withBin ? 12 : 11
  const name = cols.length > nameIdx ? cols[nameIdx] : withBin ? cols[1] : cols[0]
  const startsIdx = withBin ? 9 : 8
  const endsIdx = withBin ? 10 : 9
  const exons =
    cols.length > endsIdx ? parseExonLists(cols[startsIdx] ?? "", cols[endsIdx] ?? "") : []
  pushFeature(features, chrom, start, end, name, exons.length ? exons : undefined)
}

function detectAndParseLine(line: string, features: AnnotationFeature[]) {
  const cols = line.split("\t")
  if (cols.length < 4) return

  if (
    (normalizeChrom(cols[2]) && (cols[3] === "+" || cols[3] === "-")) ||
    (normalizeChrom(cols[1]) && (cols[2] === "+" || cols[2] === "-"))
  ) {
    parseGenePredLine(cols, features)
    return
  }

  if (
    cols.length >= 7 &&
    normalizeChrom(cols[1]) &&
    Number.isFinite(Number(cols[0])) &&
    (cols[6] === "+" || cols[6] === "-")
  ) {
    parseDgvLine(cols, features)
    return
  }

  if (normalizeChrom(cols[0])) {
    parseBedLine(cols, features)
    return
  }

  if (normalizeChrom(cols[1]) && Number.isFinite(Number(cols[0]))) {
    parseDgvLine(cols, features)
  }
}

/** Incremental parser (used for large gzip streams). */
export class AnnotationStreamParser {
  private features: AnnotationFeature[] = []
  private clinGenGeneDisease = false
  private sawLine = false

  pushLine(raw: string) {
    const line = raw.trim()
    if (!line) return
    this.sawLine = true
    if (line.startsWith("track ") || line.startsWith("browser ")) return
    if (line.startsWith(CLINGEN_GENE_DISEASE_BED_HEADER)) {
      this.clinGenGeneDisease = true
      return
    }
    if (line.startsWith("#")) return
    if (this.clinGenGeneDisease) {
      parseClinGenGeneDiseaseLine(line.split("\t"), this.features)
      return
    }
    detectAndParseLine(line, this.features)
  }

  finish(): ParseAnnotationResult {
    if (!this.sawLine) return { ok: false, code: "empty_file" }
    if (this.features.length === 0) return { ok: false, code: "no_rows" }
    const merged = this.clinGenGeneDisease
      ? mergeClinGenByGeneDisease(this.features)
      : this.features
    return { ok: true, catalog: indexAnnotationFeatures(merged) }
  }
}

/**
 * BED (Table Browser), UCSC DGV dumps, or RefSeq genePred (`ncbiRefSeq.txt.gz`).
 */
export function parseAnnotationFile(text: string): ParseAnnotationResult {
  if (text.trim() === "") return { ok: false, code: "empty_file" }
  const parser = new AnnotationStreamParser()
  for (const raw of text.split(/\r?\n/)) parser.pushLine(raw)
  return parser.finish()
}
