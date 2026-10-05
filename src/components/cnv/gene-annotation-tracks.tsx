import { useEffect, useMemo, useRef } from "react"

import { useDocumentClass } from "@/hooks/use-document-class"
import { featuresInView } from "@/lib/annotations/annotation-catalog"
import {
  ANNOTATION_LANE_HEIGHT,
  ANNOTATION_MAX_LANES,
  ANNOTATION_TRACK_PAD,
  annotationTrackHeight,
  assignAnnotationLanes,
} from "@/lib/annotations/annotation-lanes"
import { drawFeatureLabel } from "@/lib/annotations/draw-feature-label"
import { dgvGoldFillCssVar } from "@/lib/annotations/dgv-gold-colors"
import { clinGenFillCssVar } from "@/lib/annotations/clingen-colors"
import { drawRefSeqSpliceFeature } from "@/lib/annotations/draw-refseq-splice"
import type { AnnotationFeature } from "@/lib/annotations/annotation-catalog"
import type { GeneAnnotationTrackConfig } from "@/lib/annotations/gene-tracks"
import { t } from "@/i18n/fr"
import { PLOT_MARGIN } from "@/lib/cnv/plot-margin"
import type { BpViewport } from "@/lib/cnv/viewport"

/** Minimum height (placeholder / empty / single lane). */
export const GENE_ANNOTATION_TRACK_HEIGHT = annotationTrackHeight(1)

type GeneAnnotationTracksProps = {
  marginLeft: number
  plotWidth: number
  viewport: BpViewport
  tracks: GeneAnnotationTrackConfig[]
  /** X in full-plot coordinates (includes marginLeft). */
  xAt: (bp: number) => number
}

function cssVar(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim()
}

function trackFeatureFill(
  element: Element,
  trackId: GeneAnnotationTrackConfig["id"],
  defaultFillVar: string,
  feature: AnnotationFeature
): string {
  if ((trackId === "dgvGold" || trackId === "dgvSupp") && feature.dgvColor) {
    return cssVar(element, dgvGoldFillCssVar(feature.dgvColor))
  }
  if (trackId === "clinGenGeneDisease" && feature.clinGenClassification) {
    return cssVar(element, clinGenFillCssVar(feature.clinGenClassification))
  }
  return cssVar(element, defaultFillVar)
}

function GeneAnnotationTrackRow({
  marginLeft,
  plotWidth,
  viewport,
  track,
  xAt,
}: Omit<GeneAnnotationTracksProps, "tracks"> & {
  track: GeneAnnotationTrackConfig
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const documentClass = useDocumentClass()
  const title = t.annotationTracks[track.titleKey]

  const layout = useMemo(() => {
    if (!track.features) {
      return { height: GENE_ANNOTATION_TRACK_HEIGHT, placed: [], overflow: 0, empty: "missing" as const }
    }
    const visible = featuresInView(track.features, viewport.start, viewport.end)
    if (visible.length === 0) {
      return { height: GENE_ANNOTATION_TRACK_HEIGHT, placed: [], overflow: 0, empty: "window" as const }
    }
    const { placed, laneCount, overflow } = assignAnnotationLanes(visible, ANNOTATION_MAX_LANES)
    return {
      height: annotationTrackHeight(laneCount),
      placed,
      overflow,
      empty: null as null,
    }
  }, [track.features, viewport.start, viewport.end])

  const displayTitle =
    layout.overflow > 0 ? `${title} (+${layout.overflow.toLocaleString("fr-FR")})` : title

  const xOnTrack = (bp: number) => xAt(bp) - marginLeft

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || plotWidth <= 0) return
    const height = layout.height
    const dpr = window.devicePixelRatio || 1
    canvas.width = plotWidth * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, plotWidth, height)

    const border = cssVar(canvas, "--border")
    const text = cssVar(canvas, "--muted-foreground")
    const labelFill = cssVar(canvas, "--foreground")
    const labelHalo = cssVar(canvas, "--card")

    const bodyTop = ANNOTATION_TRACK_PAD
    const bodyHeight = height - ANNOTATION_TRACK_PAD * 2
    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.strokeRect(0, bodyTop, plotWidth, bodyHeight)

    if (layout.empty === "missing") {
      ctx.fillStyle = text
      ctx.textAlign = "center"
      ctx.font = "11px 'Geist Variable', sans-serif"
      ctx.textBaseline = "middle"
      ctx.fillText(t.annotationTracks.missingFile, plotWidth / 2, bodyTop + bodyHeight / 2)
      return
    }
    if (layout.empty === "window") {
      ctx.fillStyle = text
      ctx.textAlign = "center"
      ctx.font = "11px 'Geist Variable', sans-serif"
      ctx.textBaseline = "middle"
      ctx.fillText(t.annotationTracks.emptyWindow, plotWidth / 2, bodyTop + bodyHeight / 2)
      return
    }

    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const plotRight = plotWidth
    const intronStroke = cssVar(canvas, "--cnv-track-refseq-intron")

    for (const { feature, lane } of layout.placed) {
      const laneTop = bodyTop + 1 + lane * ANNOTATION_LANE_HEIGHT
      const laneH = ANNOTATION_LANE_HEIGHT - 2
      const featureFill = trackFeatureFill(canvas, track.id, track.fillCssVar, feature)

      if (
        (track.id === "refseq" || track.id === "dgvGold") &&
        drawRefSeqSpliceFeature(
          ctx,
          feature,
          xOnTrack,
          0,
          plotRight,
          laneTop,
          laneH,
          {
            exonFill: featureFill,
            exonLabel: labelFill,
            intronStroke: track.id === "dgvGold" ? featureFill : intronStroke,
          },
          labelHalo
        )
      ) {
        continue
      }

      const x0 = xOnTrack(feature.start)
      const x1 = xOnTrack(feature.end)
      if (x1 < 0 || x0 > plotRight) continue
      const left = Math.max(0, x0)
      const right = Math.min(plotRight, x1)
      const w = Math.max(1, right - left)
      ctx.fillStyle = featureFill
      ctx.fillRect(left, laneTop, w, laneH)
      drawFeatureLabel(ctx, feature.name, left, w, laneTop + laneH / 2, labelFill, 18, labelHalo)
    }
  }, [plotWidth, marginLeft, layout, track, xAt, documentClass])

  return (
    <div
      className="w-full"
      style={{
        paddingLeft: marginLeft,
        paddingRight: PLOT_MARGIN.right,
      }}
      aria-label={displayTitle}
    >
      <p className="mb-0.5 text-[11px] leading-snug text-muted-foreground">{displayTitle}</p>
      <canvas
        ref={canvasRef}
        style={{ width: plotWidth, height: layout.height }}
        className="pointer-events-none block max-w-full"
      />
    </div>
  )
}

export function GeneAnnotationTracks({
  marginLeft,
  plotWidth,
  viewport,
  tracks,
  xAt,
}: GeneAnnotationTracksProps) {
  const loadedTracks = tracks.filter((track) => track.features !== null)
  if (loadedTracks.length === 0) return null

  return (
    <div className="mt-1 flex flex-col gap-2">
      {loadedTracks.map((track) => (
        <GeneAnnotationTrackRow
          key={track.id}
          marginLeft={marginLeft}
          plotWidth={plotWidth}
          viewport={viewport}
          track={track}
          xAt={xAt}
        />
      ))}
    </div>
  )
}
