import type { AnnotationFeature } from "@/lib/annotations/annotation-catalog"

export type PlacedAnnotationFeature = {
  feature: AnnotationFeature
  lane: number
}

export type LaneLayout = {
  placed: PlacedAnnotationFeature[]
  laneCount: number
  overflow: number
}

/** Greedy lane assignment for overlapping intervals (genome-browser style). */
export function assignAnnotationLanes(
  features: AnnotationFeature[],
  maxLanes = 12
): LaneLayout {
  const sorted = [...features].sort((a, b) => a.start - b.start || a.end - b.end)
  const laneEnds: number[] = []
  const placed: PlacedAnnotationFeature[] = []
  let overflow = 0

  for (const feature of sorted) {
    let lane = 0
    while (lane < laneEnds.length && laneEnds[lane] > feature.start) {
      lane++
    }
    if (lane >= maxLanes) {
      overflow++
      continue
    }
    if (lane === laneEnds.length) laneEnds.push(feature.end)
    else laneEnds[lane] = feature.end
    placed.push({ feature, lane })
  }

  return { placed, laneCount: Math.max(1, laneEnds.length), overflow }
}

export const ANNOTATION_LANE_HEIGHT = 14
export const ANNOTATION_TRACK_PAD = 3
export const ANNOTATION_MAX_LANES = 12

export function annotationTrackHeight(laneCount: number): number {
  return ANNOTATION_TRACK_PAD * 2 + Math.max(1, laneCount) * ANNOTATION_LANE_HEIGHT
}
