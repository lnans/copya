import { segmentCopyNumber } from "@/lib/cnv/segment-copy-number"
import type { Segment } from "@/lib/types"

export type SegmentCnvTypeKey =
  | "deletionHet"
  | "deletionHom"
  | "duplication"
  | "triplication"
  | "multiplication"
  | "unknown"

export function segmentCnvTypeKey(segment: Segment): SegmentCnvTypeKey {
  const cn = segmentCopyNumber(segment)
  const isLoss = segment.type === "loss" || cn < 1.85

  if (isLoss) {
    if (cn < 0.75) return "deletionHom"
    if (cn < 1.85) return "deletionHet"
  }

  if (cn >= 4.5) return "multiplication"
  if (cn >= 3.5) return "triplication"
  if (cn >= 2.5) return "duplication"

  if (segment.type === "gain") return "duplication"
  if (segment.type === "loss") return "deletionHet"

  return "unknown"
}
