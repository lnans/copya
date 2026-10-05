import { log2ToCopyNumber } from "@/lib/cnv/scale"
import type { Segment } from "@/lib/types"

export function segmentCopyNumber(segment: Segment): number {
  if (segment.copyNumber !== undefined && Number.isFinite(segment.copyNumber)) {
    return segment.copyNumber
  }
  return log2ToCopyNumber(segment.log2)
}
