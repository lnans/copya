import type { ParseErrorCode, ParseOptions } from "@/lib/parse/table"
import type { Bins, Segment } from "@/lib/types"

export type ParseKind = "bins" | "segments"

export type ParseRequest = {
  id: number
  kind: ParseKind
  file: File
  /** Omitted: auto-detected with `sniff`. */
  options?: ParseOptions
}

export type ParseFailure = {
  id: number
  ok: false
  code: ParseErrorCode | "unknown"
  line?: number
  column?: string
  message?: string
}

export type ParseResponse =
  | { id: number; ok: true; kind: "bins"; bins: Bins; skippedContigs: number }
  | { id: number; ok: true; kind: "segments"; segments: Segment[]; skippedContigs: number }
  | ParseFailure
