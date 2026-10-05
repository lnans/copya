import { downsampleMaByPixelY } from "@/lib/cnv/plot-downsample"
import {
  buildKaryotypeLayout,
  karyotypeLocalBinMid,
  karyotypeXForLog2,
  karyotypeYForBp,
  type KaryotypeLayout,
} from "@/lib/cnv/genome-karyotype-layout"
import { drawVerticalChromIdeogram } from "@/lib/genome/cyto-band"
import type { CytoBandCatalog, CytoPalette } from "@/lib/genome/cyto-band"
import type { ChromName } from "@/lib/genome/hg38"
import type { Bins, Segment, Thresholds } from "@/lib/types"

type LayoutChrom = { index: number; name: ChromName; offset: number; length: number }

export const GENOME_KARYOTYPE = {
  ideoWidth: 11,
  columnGap: 2,
  /** Use 40% of column width for log₂ so bins/MA are less stretched horizontally. */
  log2SpanFraction: 0.4,
  margin: { top: 8, right: 16, bottom: 24, left: 36 },
} as const

type MaColors = { gain: string; loss: string; movingAverage: string }

type DrawGenomeKaryotypeArgs = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  layoutChroms: LayoutChrom[]
  bins: Bins | null
  ranges: readonly [number, number][] | null
  points: ArrayLike<number> | null
  movingAverage: ArrayLike<number> | null
  segments: Segment[]
  thresholds: Thresholds
  showBins: boolean
  focusChrom: ChromName | null
  selectedSegmentId: string | null
  yMin: number
  yMax: number
  cytoCatalog: CytoBandCatalog
  cytoPalette: CytoPalette
  shortChromLabel: (name: ChromName) => string
  colors: {
    gain: string
    loss: string
    neutral: string
    band: string
    border: string
    text: string
    foreground: string
    movingAverage: string
    chromSelected: string
  }
  strokeColoredPolyline: (
    ctx: CanvasRenderingContext2D,
    points: { x: number; y: number; v: number }[],
    thresholds: Thresholds,
    colors: MaColors,
    lineWidth: number
  ) => void
}

export function genomeKaryotypeCanvasHeight(width: number): number {
  const inner = Math.max(160, Math.min(280, Math.round(width * 0.28)))
  return inner + GENOME_KARYOTYPE.margin.top + GENOME_KARYOTYPE.margin.bottom
}

export function drawGenomeKaryotype(args: DrawGenomeKaryotypeArgs): KaryotypeLayout {
  const {
    ctx,
    width,
    height,
    layoutChroms,
    bins,
    ranges,
    points,
    movingAverage,
    segments,
    thresholds,
    showBins,
    focusChrom,
    selectedSegmentId,
    yMin,
    yMax,
    cytoCatalog,
    cytoPalette,
    shortChromLabel,
    colors,
    strokeColoredPolyline,
  } = args

  const margin = GENOME_KARYOTYPE.margin
  const plotWidth = Math.max(0, width - margin.left - margin.right)
  const plotHeight = height - margin.top - margin.bottom

  const layout = buildKaryotypeLayout({
    chroms: layoutChroms,
    marginLeft: margin.left,
    plotWidth,
    plotTop: margin.top,
    plotHeight,
    ideoWidth: GENOME_KARYOTYPE.ideoWidth,
    columnGap: GENOME_KARYOTYPE.columnGap,
    yMin,
    yMax,
    log2SpanFraction: GENOME_KARYOTYPE.log2SpanFraction,
  })

  const refCol = layout.columns[0]
  if (refCol) {
    ctx.font = "10px 'Geist Variable', sans-serif"
    ctx.fillStyle = colors.text
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (let v = Math.ceil(yMin); v <= yMax; v += 0.5) {
      const x = karyotypeXForLog2(layout, refCol, v)
      ctx.fillText(v.toFixed(1), x, margin.top + plotHeight + 2)
    }
  }

  const vline = (col: (typeof layout.columns)[0], v: number, color: string, dash: number[]) => {
    const x = karyotypeXForLog2(layout, col, v)
    const h = col.contentHeight
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(x, margin.top)
    ctx.lineTo(x, margin.top + h)
    ctx.stroke()
  }

  const maColors: MaColors = {
    gain: colors.gain,
    loss: colors.loss,
    movingAverage: colors.movingAverage,
  }
  const maWidth = showBins ? 2 : 2.5

  for (const col of layout.columns) {
    const bands = cytoCatalog.byChrom.get(col.name)
    const colH = col.contentHeight
    drawVerticalChromIdeogram(
      ctx,
      bands,
      col.ideoLeft,
      col.ideoWidth,
      margin.top,
      colH,
      col.length,
      cytoPalette,
      shortChromLabel(col.name),
      margin.top + colH + 4
    )

    if (focusChrom === col.name) {
      ctx.fillStyle = colors.chromSelected
      ctx.fillRect(col.dataLeft, margin.top, col.dataWidth, colH)
    } else {
      const idx = layoutChroms.findIndex((c) => c.name === col.name)
      if (idx % 2 === 1) {
        ctx.fillStyle = colors.band
        ctx.fillRect(col.dataLeft, margin.top, col.dataWidth, colH)
      }
    }

    ctx.strokeStyle = colors.border
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.strokeRect(col.dataLeft, margin.top, col.dataWidth, colH)

    vline(col, 0, colors.foreground, [])
    vline(col, thresholds.gain, colors.gain, [4, 3])
    vline(col, thresholds.loss, colors.loss, [4, 3])
    ctx.setLineDash([])

    const lc = layoutChroms.find((c) => c.name === col.name)
    if (!lc || !ranges || !bins) continue

    const [from, to] = ranges[lc.index]

    ctx.save()
    ctx.beginPath()
    ctx.rect(col.dataLeft, margin.top, col.dataWidth, colH)
    ctx.clip()

    if (showBins && points) {
      for (const [color, test] of [
        [colors.neutral, (v: number) => v <= thresholds.gain && v >= thresholds.loss],
        [colors.gain, (v: number) => v > thresholds.gain],
        [colors.loss, (v: number) => v < thresholds.loss],
      ] as const) {
        ctx.fillStyle = color
        for (let i = from; i < to; i++) {
          const v = points[i]
          if (!Number.isFinite(v) || !test(v)) continue
          const mid = karyotypeLocalBinMid(col.length, lc.offset, bins.start[i], bins.end[i])
          const x = karyotypeXForLog2(layout, col, v)
          const y = karyotypeYForBp(layout, col, mid)
          const size = 2.5
          ctx.fillRect(x - size / 2, y - size / 2, size, size)
        }
      }
    }

    if (movingAverage) {
      let line: { x: number; y: number; v: number }[] = []
      const binWidth = from < to ? bins.end[from] - bins.start[from] : 0
      const flush = () => {
        if (line.length === 0) return
        const sampled = downsampleMaByPixelY(line, margin.top, col.contentHeight)
        strokeColoredPolyline(ctx, sampled, thresholds, maColors, maWidth)
        line = []
      }
      for (let i = from; i < to; i++) {
        const v = movingAverage[i]
        if (!Number.isFinite(v)) continue
        if (line.length && bins.start[i] - bins.end[i - 1] >= binWidth) {
          flush()
        }
        const mid = karyotypeLocalBinMid(col.length, lc.offset, bins.start[i], bins.end[i])
        line.push({
          x: karyotypeXForLog2(layout, col, v),
          y: karyotypeYForBp(layout, col, mid),
          v,
        })
      }
      flush()
    }

    ctx.restore()
  }

  for (const segment of segments) {
    const col = layout.columns.find((c) => c.name === segment.chrom)
    if (!col || !Number.isFinite(segment.log2)) continue
    const selected = segment.id === selectedSegmentId
    const x = karyotypeXForLog2(layout, col, segment.log2)
    const y0 = karyotypeYForBp(layout, col, segment.start)
    const y1 = karyotypeYForBp(layout, col, segment.end)
    const top = Math.min(y0, y1)
    const h = Math.max(2, Math.abs(y1 - y0))

    ctx.strokeStyle = segment.type === "gain" || segment.log2 > 0 ? colors.gain : colors.loss
    ctx.lineWidth = selected ? 4 : 3
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.lineTo(x, top + h)
    ctx.stroke()

    if (selected) {
      ctx.strokeStyle = colors.foreground
      ctx.lineWidth = 1.5
      ctx.strokeRect(col.dataLeft - 1, top - 1, col.dataWidth + 2, h + 2)
    }
  }

  ctx.font = "11px 'Geist Variable', sans-serif"
  ctx.fillStyle = colors.text
  ctx.textAlign = "right"
  ctx.textBaseline = "middle"
  ctx.fillText("log₂", margin.left - 6, margin.top + plotHeight / 2)

  return layout
}
