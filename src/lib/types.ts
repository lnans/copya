import type { ChromName } from "@/lib/genome/hg38"

/** Bins in columnar typed arrays (sorted by chromosome then start). */
export type Bins = {
  length: number
  chromIndex: Uint8Array
  start: Uint32Array
  end: Uint32Array
  log2: Float32Array
}

export type CnvType = "gain" | "loss" | "unknown"

/** Clinician classification for a CNV segment (ACMG-style + PIEV). */
export type SegmentClassification =
  | "unset"
  | "benign"
  | "likely_benign"
  | "vus"
  | "likely_pathogenic"
  | "pathogenic"
  | "piev"

/** @deprecated Use SegmentClassification */
export type ReviewStatus = SegmentClassification

export type Segment = {
  id: string
  chrom: ChromName
  /** 0-based, half-open (BED convention). */
  start: number
  end: number
  log2: number
  type: CnvType
  bins?: number
  copyNumber?: number
  mosaicPercent?: number
}

export type Sex = "XX" | "XY" | "unknown"
export type SampleContext = "prenatal" | "postnatal"

export type SampleMeta = {
  id: string
  sex: Sex
  context: SampleContext
  binSize?: number
  pipelineVersion?: string
  sourceFileName?: string
}

export type Thresholds = {
  gain: number
  loss: number
}

/** Detail view window on one chromosome (0-based, half-open). */
export type GeneRegion = {
  chrom: ChromName
  start: number
  end: number
}
