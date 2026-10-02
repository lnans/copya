import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { useDocumentClass } from "@/hooks/use-document-class"
import { t } from "@/i18n/fr"
import { binRangesByChrom } from "@/lib/cnv/bins"
import { downsampleMaByPixel } from "@/lib/cnv/plot-downsample"
import { MOSAIC_FRACTIONS, mosaicExpectedLog2 } from "@/lib/cnv/scale"
import { rollingMean, rollingMedian } from "@/lib/cnv/smoothing"
import {
  panViewport,
  viewportFromPixelRange,
  zoomViewportAt,
  type BpViewport,
} from "@/lib/cnv/viewport"
import {
  CHROM_INDEX,
  HG38_CHROMOSOMES,
  shortChromLabel,
  type ChromName,
} from "@/lib/genome/hg38"
import type { Bins, GeneRegion, Segment, Thresholds } from "@/lib/types"

export type PlotScope = "genome" | "chromosome" | "gene"

type GenomePlotProps = {
  scope: PlotScope
  bins: Bins | null
  segments: Segment[]
  thresholds: Thresholds
  showMosaicLines: boolean
  /** When false, only the moving-average line is drawn (still colored by thresholds). */
  showBins: boolean
  movingAverageWindow: number
  medianWindow: number
  /** Chromosome shown (chromosome / gene) or highlighted (genome). */
  focusChrom: ChromName | null
  /** Initial window for the gene view; synced when this prop changes. */
  geneRegion?: GeneRegion | null
  selectedSegmentId: string | null
  onSelectChrom?: (chrom: ChromName) => void
  onOpenGeneRegion?: (region: GeneRegion) => void
  onSelectSegment?: (segment: Segment) => void
  /** Gene-panel viewport mirrored on the chromosome overview (vertical bars). */
  visibleGeneViewport?: BpViewport | null
  /** Reports the visible range when `scope === "gene"` (zoom / pan). */
  onVisibleViewportChange?: (viewport: BpViewport) => void
  yRange?: [number, number]
  height?: number
}

const MARGIN = { top: 8, right: 40, bottom: 22, left: 40 }
const MOSAIC_LABEL_MIN_GAP = 10
const DRAG_CLICK_THRESHOLD_PX = 4
/** Delay before mirroring gene zoom on the chromosome overview (avoids redrawing both plots per wheel tick). */
const VIEWPORT_INDICATOR_DEBOUNCE_MS = 150

type LayoutChrom = { index: number; name: ChromName; offset: number; length: number }

function cssVar(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim()
}

function mbTickStep(viewSpanBp: number): number {
  if (viewSpanBp <= 2e6) return 0.5
  if (viewSpanBp <= 10e6) return 1
  if (viewSpanBp <= 50e6) return 5
  return 10
}

function maStrokeColor(
  log2: number,
  thresholds: Thresholds,
  colors: { gain: string; loss: string; movingAverage: string }
): string {
  if (log2 > thresholds.gain) return colors.gain
  if (log2 < thresholds.loss) return colors.loss
  return colors.movingAverage
}

function strokeColoredPolyline(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number; v: number }[],
  thresholds: Thresholds,
  colors: { gain: string; loss: string; movingAverage: string },
  lineWidth: number
) {
  if (points.length === 0) return
  ctx.lineWidth = lineWidth
  ctx.lineJoin = "round"
  ctx.globalAlpha = 0.92
  let i = 0
  while (i < points.length) {
    const color = maStrokeColor(points[i].v, thresholds, colors)
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(points[i].x, points[i].y)
    let j = i + 1
    while (j < points.length && maStrokeColor(points[j].v, thresholds, colors) === color) {
      ctx.lineTo(points[j].x, points[j].y)
      j++
    }
    ctx.stroke()
    i = j
  }
  ctx.globalAlpha = 1
}

/** Canvas track: whole genome, one chromosome (fixed), or zoomable gene/locus view. */
export function GenomePlot({
  scope,
  bins,
  segments,
  thresholds,
  showMosaicLines,
  showBins,
  movingAverageWindow,
  medianWindow,
  focusChrom,
  geneRegion,
  selectedSegmentId,
  onSelectChrom,
  onOpenGeneRegion,
  onSelectSegment,
  visibleGeneViewport,
  onVisibleViewportChange,
  yRange = [-1.5, 1.5],
  height = 260,
}: GenomePlotProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const documentClass = useDocumentClass()
  const suppressClickRef = useRef(false)
  const dragRef = useRef<{ x0: number } | null>(null)
  const [selectPx, setSelectPx] = useState<{ x0: number; x1: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  const chromLength =
    focusChrom && scope !== "genome"
      ? HG38_CHROMOSOMES[CHROM_INDEX.get(focusChrom)!].length
      : HG38_CHROMOSOMES.reduce((n, c) => n + c.length, 0)

  const [geneViewport, setGeneViewport] = useState<BpViewport>(() => ({
    start: geneRegion?.start ?? 0,
    end: geneRegion?.end ?? chromLength,
  }))
  const geneViewportRef = useRef(geneViewport)
  geneViewportRef.current = geneViewport
  const isWheelZoomingRef = useRef(false)
  const wheelZoomIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewportSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const layoutChroms: LayoutChrom[] = useMemo(() => {
    if (scope === "genome") {
      let offset = 0
      return HG38_CHROMOSOMES.map((c, index) => {
        const entry = { index, name: c.name, offset, length: c.length }
        offset += c.length
        return entry
      })
    }
    if (!focusChrom) return []
    const index = CHROM_INDEX.get(focusChrom)!
    const c = HG38_CHROMOSOMES[index]
    return [{ index, name: c.name, offset: 0, length: c.length }]
  }, [scope, focusChrom])

  const genomeTotal = HG38_CHROMOSOMES.reduce((n, c) => n + c.length, 0)
  const viewport: BpViewport =
    scope === "gene"
      ? geneViewport
      : scope === "chromosome"
        ? { start: 0, end: chromLength }
        : { start: 0, end: genomeTotal }

  const ranges = useMemo(() => (bins ? binRangesByChrom(bins) : null), [bins])
  const movingAverage = useMemo(
    () => (bins && movingAverageWindow > 1 ? rollingMean(bins, movingAverageWindow) : null),
    [bins, movingAverageWindow]
  )
  const points = useMemo(
    () => (bins && medianWindow > 1 ? rollingMedian(bins, medianWindow) : (bins?.log2 ?? null)),
    [bins, medianWindow]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const [yMin, yMax] = yRange
  const viewSpan = viewport.end - viewport.start
  const isGeneZoomed = scope === "gene" && viewSpan < chromLength * 0.995

  const xWholeGenome = (genomePos: number) => MARGIN.left + (genomePos / genomeTotal) * plotWidth
  const xOnChrom = (bp: number) => MARGIN.left + ((bp - viewport.start) / viewSpan) * plotWidth
  const yOf = (v: number) =>
    MARGIN.top + ((yMax - Math.min(yMax, Math.max(yMin, v))) / (yMax - yMin)) * plotHeight

  const xAtBin = (c: LayoutChrom, mid: number) =>
    scope === "genome" ? xWholeGenome(c.offset + mid) : xOnChrom(mid)

  const segmentsToDraw = useMemo(() => {
    if (scope === "genome") return segments
    if (!focusChrom) return []
    return segments.filter((s) => s.chrom === focusChrom)
  }, [scope, segments, focusChrom])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0 || !bins) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const colors = {
      gain: cssVar(canvas, "--cnv-gain"),
      loss: cssVar(canvas, "--cnv-loss"),
      neutral: cssVar(canvas, "--cnv-neutral"),
      band: cssVar(canvas, "--cnv-chrom-band"),
      border: cssVar(canvas, "--border"),
      text: cssVar(canvas, "--muted-foreground"),
      foreground: cssVar(canvas, "--foreground"),
      mosaic: cssVar(canvas, "--cnv-mosaic-line"),
      movingAverage: cssVar(canvas, "--cnv-moving-average"),
      chromSelected: cssVar(canvas, "--cnv-chrom-selected"),
      geneViewportFill: cssVar(canvas, "--cnv-gene-viewport"),
      geneViewportLine: cssVar(canvas, "--cnv-gene-viewport-line"),
    }

    if (scope === "genome") {
      layoutChroms.forEach((c, i) => {
        const x0 = xWholeGenome(c.offset)
        const w = xWholeGenome(c.offset + c.length) - x0
        if (focusChrom === c.name) {
          ctx.fillStyle = colors.chromSelected
          ctx.fillRect(x0, MARGIN.top, w, plotHeight)
        } else if (i % 2 === 1) {
          ctx.fillStyle = colors.band
          ctx.fillRect(x0, MARGIN.top, w, plotHeight)
        }
      })
    }

    ctx.font = "11px 'Geist Variable', sans-serif"
    ctx.fillStyle = colors.text
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    for (let v = Math.ceil(yMin); v <= yMax; v += 0.5) {
      ctx.fillText(v.toFixed(1), MARGIN.left - 6, yOf(v))
    }

    const hline = (v: number, color: string, dash: number[], lineWidth = 1) => {
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.setLineDash(dash)
      ctx.beginPath()
      ctx.moveTo(MARGIN.left, yOf(v))
      ctx.lineTo(MARGIN.left + plotWidth, yOf(v))
      ctx.stroke()
    }
    hline(0, colors.foreground, [], 1)
    hline(thresholds.gain, colors.gain, [4, 3])
    hline(thresholds.loss, colors.loss, [4, 3])
    ctx.setLineDash([])

    const inView = (start: number, end: number) =>
      scope === "genome" || (end > viewport.start && start < viewport.end)

    const pointSize = (binStart: number, binEnd: number) => {
      if (scope === "genome") return 1.5
      const widthPx = ((binEnd - binStart) / viewSpan) * plotWidth
      return Math.min(14, Math.max(3, widthPx * 0.85))
    }

    if (showBins && ranges && points) {
      for (const [color, test] of [
        [colors.neutral, (v: number) => v <= thresholds.gain && v >= thresholds.loss],
        [colors.gain, (v: number) => v > thresholds.gain],
        [colors.loss, (v: number) => v < thresholds.loss],
      ] as const) {
        ctx.fillStyle = color
        for (const c of layoutChroms) {
          const [from, to] = ranges[c.index]
          for (let i = from; i < to; i++) {
            const v = points[i]
            if (!Number.isFinite(v) || !test(v)) continue
            if (!inView(bins.start[i], bins.end[i])) continue
            const x = xAtBin(c, (bins.start[i] + bins.end[i]) / 2)
            const size = pointSize(bins.start[i], bins.end[i])
            if (x < MARGIN.left - size || x > MARGIN.left + plotWidth + size) continue
            ctx.fillRect(x - size / 2, yOf(v) - size / 2, size, size)
          }
        }
      }
    }

    if (showMosaicLines && scope !== "genome") {
      ctx.font = "10px 'Geist Variable', sans-serif"
      ctx.fillStyle = colors.mosaic
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      for (const kind of ["gain", "loss"] as const) {
        let lastLabelY = Number.NaN
        for (const f of MOSAIC_FRACTIONS) {
          const v = mosaicExpectedLog2(f, kind)
          if (v < yMin || v > yMax) continue
          hline(v, colors.mosaic, [6, 4], 1.25)
          const y = yOf(v)
          if (!(Math.abs(y - lastLabelY) < MOSAIC_LABEL_MIN_GAP)) {
            ctx.fillText(`${f * 100} %`, MARGIN.left + plotWidth + 4, y)
            lastLabelY = y
          }
        }
      }
      ctx.setLineDash([])
    }

    if (ranges && movingAverage) {
      const maSegments: { x: number; y: number; v: number }[][] = []
      for (const c of layoutChroms) {
        const [from, to] = ranges[c.index]
        const binWidth = from < to ? bins.end[from] - bins.start[from] : 0
        let current: { x: number; y: number; v: number }[] = []
        for (let i = from; i < to; i++) {
          const v = movingAverage[i]
          const mid = (bins.start[i] + bins.end[i]) / 2
          if (!inView(bins.start[i], bins.end[i])) {
            if (current.length) maSegments.push(current)
            current = []
            continue
          }
          if (!Number.isFinite(v) || (current.length && bins.start[i] - bins.end[i - 1] >= binWidth)) {
            if (current.length) maSegments.push(current)
            current = []
            if (!Number.isFinite(v)) continue
          }
          current.push({ x: xAtBin(c, mid), y: yOf(v), v })
        }
        if (current.length) maSegments.push(current)
      }
      const baseWidth = scope === "genome" ? 2.5 : scope === "gene" ? 3.5 : 3
      const lineWidth = showBins ? baseWidth : baseWidth + 1
      for (const segment of maSegments) {
        const line =
          scope === "genome" || segment.length > plotWidth
            ? downsampleMaByPixel(segment, MARGIN.left, plotWidth)
            : segment
        if (line.length === 0) continue
        strokeColoredPolyline(ctx, line, thresholds, colors, lineWidth)
      }
    }

    if (scope === "chromosome" && visibleGeneViewport) {
      const v0 = Math.max(0, visibleGeneViewport.start)
      const v1 = Math.min(chromLength, visibleGeneViewport.end)
      if (v1 > v0) {
        const x0 = xOnChrom(v0)
        const x1 = xOnChrom(v1)
        const left = Math.max(MARGIN.left, Math.min(x0, x1))
        const right = Math.min(MARGIN.left + plotWidth, Math.max(x0, x1))
        if (right > left) {
          ctx.fillStyle = colors.geneViewportFill
          ctx.fillRect(left, MARGIN.top, right - left, plotHeight)
          ctx.strokeStyle = colors.geneViewportLine
          ctx.lineWidth = 2
          ctx.setLineDash([])
          for (const x of [x0, x1]) {
            if (x < MARGIN.left - 1 || x > MARGIN.left + plotWidth + 1) continue
            ctx.beginPath()
            ctx.moveTo(x, MARGIN.top)
            ctx.lineTo(x, MARGIN.top + plotHeight)
            ctx.stroke()
          }
        }
      }
    }

    for (const segment of segmentsToDraw) {
      const c = layoutChroms.find((entry) => entry.name === segment.chrom)
      if (!c || !Number.isFinite(segment.log2)) continue
      const selected = segment.id === selectedSegmentId
      const x0 = scope === "genome" ? xWholeGenome(c.offset + segment.start) : xOnChrom(segment.start)
      const x1 = scope === "genome" ? xWholeGenome(c.offset + segment.end) : xOnChrom(segment.end)
      if (x1 < MARGIN.left && x0 < MARGIN.left) continue
      if (x0 > MARGIN.left + plotWidth && x1 > MARGIN.left + plotWidth) continue

      ctx.strokeStyle = segment.type === "gain" || segment.log2 > 0 ? colors.gain : colors.loss
      ctx.globalAlpha = 1
      ctx.lineWidth = selected ? 7 : 5
      ctx.lineCap = "butt"
      ctx.beginPath()
      ctx.moveTo(x0, yOf(segment.log2))
      ctx.lineTo(Math.max(x0 + 2, x1), yOf(segment.log2))
      ctx.stroke()
      if (selected) {
        ctx.strokeStyle = colors.foreground
        ctx.lineWidth = 1.5
        const left = Math.min(x0, x1) - 2
        const w = Math.max(4, Math.abs(x1 - x0) + 4)
        ctx.strokeRect(left, MARGIN.top, w, plotHeight)
      }
    }

    ctx.strokeStyle = colors.border
    ctx.lineWidth = 1
    ctx.strokeRect(MARGIN.left, MARGIN.top, plotWidth, plotHeight)

    ctx.fillStyle = colors.text
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    if (scope === "genome") {
      for (const c of layoutChroms) {
        ctx.fillText(
          shortChromLabel(c.name),
          xWholeGenome(c.offset + c.length / 2),
          MARGIN.top + plotHeight + 6
        )
      }
    } else {
      const stepMb = mbTickStep(viewSpan)
      const startMb = Math.ceil(viewport.start / 1e6 / stepMb) * stepMb
      for (let mb = startMb; mb * 1e6 <= viewport.end; mb += stepMb) {
        const label = stepMb < 1 ? `${mb.toFixed(1)} Mb` : `${mb} Mb`
        ctx.fillText(label, xOnChrom(mb * 1e6), MARGIN.top + plotHeight + 6)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bins,
    ranges,
    points,
    movingAverage,
    segmentsToDraw,
    thresholds,
    showMosaicLines,
    showBins,
    scope,
    focusChrom,
    selectedSegmentId,
    layoutChroms,
    width,
    height,
    yMin,
    yMax,
    documentClass,
    viewport,
    viewSpan,
    genomeTotal,
    chromLength,
    visibleGeneViewport,
  ])

  useEffect(() => {
    return () => {
      if (viewportSyncTimerRef.current) clearTimeout(viewportSyncTimerRef.current)
      if (wheelZoomIdleRef.current) clearTimeout(wheelZoomIdleRef.current)
    }
  }, [])

  useEffect(() => {
    if (scope !== "gene" || !onVisibleViewportChange || isPanning) return
    if (viewportSyncTimerRef.current) clearTimeout(viewportSyncTimerRef.current)
    const push = () => onVisibleViewportChange(geneViewportRef.current)
    if (isWheelZoomingRef.current) {
      viewportSyncTimerRef.current = setTimeout(() => {
        viewportSyncTimerRef.current = null
        push()
      }, VIEWPORT_INDICATOR_DEBOUNCE_MS)
    } else {
      push()
    }
  }, [scope, geneViewport, onVisibleViewportChange, isPanning])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || scope !== "gene" || plotWidth <= 0) return
    const onWheel = (event: WheelEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      if (x < MARGIN.left || x > MARGIN.left + plotWidth) return
      event.preventDefault()
      isWheelZoomingRef.current = true
      if (wheelZoomIdleRef.current) clearTimeout(wheelZoomIdleRef.current)
      wheelZoomIdleRef.current = setTimeout(() => {
        isWheelZoomingRef.current = false
        wheelZoomIdleRef.current = null
      }, VIEWPORT_INDICATOR_DEBOUNCE_MS)
      const fraction = (x - MARGIN.left) / plotWidth
      const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12
      setGeneViewport((v) => zoomViewportAt(v, chromLength, fraction, factor))
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [scope, chromLength, plotWidth])

  const onMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (plotWidth <= 0 || event.button !== 0) return
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    if (x < MARGIN.left || x > MARGIN.left + plotWidth) return
    suppressClickRef.current = false

    if (scope === "gene") {
      dragRef.current = { x0: x }
      const view0 = geneViewport
      const onMove = (moveEvent: MouseEvent) => {
        const moveX = moveEvent.clientX - rect.left
        const dx = moveX - x
        if (Math.abs(dx) < DRAG_CLICK_THRESHOLD_PX) return
        suppressClickRef.current = true
        setIsPanning(true)
        const span = view0.end - view0.start
        setGeneViewport(panViewport(view0, chromLength, (-dx / plotWidth) * span))
      }
      const onUp = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        dragRef.current = null
        setIsPanning(false)
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
      return
    }

    if (scope === "chromosome" && focusChrom && onOpenGeneRegion) {
      dragRef.current = { x0: x }
      setSelectPx({ x0: x, x1: x })
      const onMove = (moveEvent: MouseEvent) => {
        setSelectPx({ x0: x, x1: moveEvent.clientX - rect.left })
      }
      const onUp = (upEvent: MouseEvent) => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
        dragRef.current = null
        setSelectPx(null)
        const upX = upEvent.clientX - rect.left
        if (Math.abs(upX - x) < DRAG_CLICK_THRESHOLD_PX) return
        suppressClickRef.current = true
        const full = { start: 0, end: chromLength }
        const next = viewportFromPixelRange(x - MARGIN.left, upX - MARGIN.left, plotWidth, full, chromLength)
        onOpenGeneRegion({ chrom: focusChrom, start: next.start, end: next.end })
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    }
  }

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (x < MARGIN.left || x > MARGIN.left + plotWidth) return

    if (scope === "genome") {
      const genomePos = ((x - MARGIN.left) / plotWidth) * genomeTotal
      const c = layoutChroms.find((entry) => genomePos >= entry.offset && genomePos < entry.offset + entry.length)
      if (!c) return
      const pos = genomePos - c.offset
      const hit = segments.find(
        (s) =>
          s.chrom === c.name &&
          pos >= s.start &&
          pos <= s.end &&
          Math.abs(yOf(s.log2) - y) <= 8
      )
      if (hit && onSelectSegment) onSelectSegment(hit)
      else onSelectChrom?.(c.name)
      return
    }

    if ((scope === "chromosome" || scope === "gene") && focusChrom && onSelectSegment) {
      const bp = viewport.start + ((x - MARGIN.left) / plotWidth) * viewSpan
      const tolerance = (6 / plotWidth) * viewSpan
      const hit = segments.find(
        (s) =>
          s.chrom === focusChrom &&
          bp >= s.start - tolerance &&
          bp <= s.end + tolerance &&
          Math.abs(yOf(s.log2) - y) <= 8
      )
      if (hit) onSelectSegment(hit)
    }
  }

  const resetGeneZoom = () => {
    if (geneRegion) setGeneViewport({ start: geneRegion.start, end: geneRegion.end })
    else setGeneViewport({ start: 0, end: chromLength })
  }

  const selectionStyle =
    selectPx && plotWidth > 0
      ? {
          left: MARGIN.left + Math.min(selectPx.x0, selectPx.x1),
          width: Math.abs(selectPx.x1 - selectPx.x0),
        }
      : null

  const cursor =
    scope === "gene"
      ? isPanning
        ? "cursor-grabbing"
        : "cursor-grab"
      : scope === "chromosome"
        ? "cursor-col-resize"
        : "cursor-crosshair"

  return (
    <div ref={containerRef} className="relative w-full">
      {scope === "gene" && isGeneZoomed && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute top-1 right-1 z-10 h-7 bg-background/90 text-xs shadow-sm"
          onClick={resetGeneZoom}
        >
          {t.genome.resetZoom}
        </Button>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height }}
        className={cursor}
        onMouseDown={onMouseDown}
        onClick={handleClick}
        onDoubleClick={() => scope === "gene" && resetGeneZoom()}
      />
      {selectionStyle && (
        <div
          className="pointer-events-none absolute border border-primary bg-primary/15"
          style={{ top: MARGIN.top, height: plotHeight, ...selectionStyle }}
        />
      )}
    </div>
  )
}
