import { ungzip } from "pako"

import { parseAnnotationFile, type AnnotationCatalog } from "@/lib/annotations/annotation-catalog"
import { parseAnnotationFileFromUrl } from "@/lib/annotations/parse-annotation-stream"

export type BundledAnnotationCatalogs = {
  clinGenCatalog: AnnotationCatalog
  refSeqCatalog: AnnotationCatalog
  dgvGoldCatalog: AnnotationCatalog
  dgvSuppCatalog: AnnotationCatalog
}

type BundledStep = {
  file: string
  label: string
  key: keyof BundledAnnotationCatalogs
  /** Full-file gzip (~1 GB+) — parse from stream without loading into one string. */
  stream?: boolean
}

const STEPS: BundledStep[] = [
  { file: "clingen-gene-disease.bed", label: "ClinGen Gene-Disease", key: "clinGenCatalog" },
  { file: "dgv-gold.bed", label: "DGV Gold", key: "dgvGoldCatalog" },
  { file: "dgv-supp.txt.gz", label: "DGV SuppVar", key: "dgvSuppCatalog", stream: true },
  { file: "refseq.txt.gz", label: "RefSeq", key: "refSeqCatalog" },
]

function isGzipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

function annotationUrl(file: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/")
  return `${base}annotations/${file}`
}

async function fetchAnnotationText(file: string): Promise<string> {
  const response = await fetch(annotationUrl(file))
  if (!response.ok) {
    throw new Error(`annotations/${file} (${response.status})`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (isGzipBytes(bytes)) {
    try {
      return new TextDecoder().decode(ungzip(bytes))
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`${file}: ${detail}`)
    }
  }
  return new TextDecoder().decode(bytes)
}

export async function loadBundledAnnotations(
  onProgress?: (index: number, total: number, label: string) => void
): Promise<BundledAnnotationCatalogs> {
  const catalogs = {} as BundledAnnotationCatalogs
  const total = STEPS.length
  const baseUrl = import.meta.env.BASE_URL

  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]
    onProgress?.(i, total, step.label)

    const result = step.stream
      ? await parseAnnotationFileFromUrl(baseUrl, step.file)
      : parseAnnotationFile(await fetchAnnotationText(step.file))

    if (!result.ok) {
      throw new Error(`${step.label}: ${result.code}`)
    }
    catalogs[step.key] = result.catalog
  }

  onProgress?.(total, total, "")
  return catalogs
}
