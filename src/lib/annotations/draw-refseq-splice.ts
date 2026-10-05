import type { AnnotationFeature } from "@/lib/annotations/annotation-catalog"
import { drawFeatureLabel } from "@/lib/annotations/draw-feature-label"

type SpliceColors = {
  exonFill: string
  exonLabel: string
  intronStroke: string
}

/** UCSC-like exon blocks linked by thin intron lines. */
export function drawRefSeqSpliceFeature(
  ctx: CanvasRenderingContext2D,
  feature: AnnotationFeature,
  xAt: (bp: number) => number,
  marginLeft: number,
  plotRight: number,
  laneTop: number,
  laneHeight: number,
  colors: SpliceColors,
  labelHalo?: string
) {
  const exons = feature.exons
  if (!exons?.length) return false

  const midY = laneTop + laneHeight / 2
  const txLeft = Math.max(marginLeft, xAt(feature.start))
  const txRight = Math.min(plotRight, xAt(feature.end))
  const txWidth = txRight - txLeft
  if (txRight > txLeft) {
    ctx.strokeStyle = colors.intronStroke
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(txLeft, midY)
    ctx.lineTo(txRight, midY)
    ctx.stroke()
  }

  for (const exon of exons) {
    const x0 = xAt(exon.start)
    const x1 = xAt(exon.end)
    if (x1 < marginLeft || x0 > plotRight) continue
    const left = Math.max(marginLeft, x0)
    const right = Math.min(plotRight, x1)
    const w = Math.max(1, right - left)
    const exonTop = laneTop + 1
    const exonH = laneHeight - 2
    ctx.fillStyle = colors.exonFill
    ctx.fillRect(left, exonTop, w, exonH)
  }

  drawFeatureLabel(ctx, feature.name, txLeft, txWidth, midY, colors.exonLabel, 18, labelHalo)

  return true
}
