import type { ChromName } from "@/lib/genome/hg38"
import type { Bins } from "@/lib/types"

export type BamConvertRequest = {
  id: number
  bam: File
  bai: ArrayBuffer
  binSize: number
}

export type BamConvertProgress = {
  id: number
  type: "progress"
  chrom: ChromName
  index: number
  total: number
  /** 0–1 within the current chromosome. */
  fraction: number
  phase?: "header"
}

export type BamConvertSuccess = {
  id: number
  type: "done"
  ok: true
  bins: Bins
  binSize: number
  median: number
}

export type BamConvertFailure = {
  id: number
  type: "done"
  ok: false
  message: string
}

export type BamWorkerMessage = BamConvertProgress | BamConvertSuccess | BamConvertFailure
