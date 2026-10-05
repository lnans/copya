import type { ChromName } from "@/lib/genome/hg38"

export type KaryotypeChromLayout = {
  name: ChromName
  length: number
  columnLeft: number
  columnStride: number
  ideoLeft: number
  ideoWidth: number
  dataLeft: number
  dataWidth: number
  /** Vertical pixels for this chromosome (proportional to Mb vs longest chrom). */
  contentHeight: number
}

export type KaryotypeLayout = {
  columns: KaryotypeChromLayout[]
  plotTop: number
  plotHeight: number
  yMin: number
  yMax: number
  /** Fraction of each column data width used for log₂ (centered); below 1 narrows horizontal spread. */
  log2SpanFraction: number
}

function log2TrackSpan(col: KaryotypeChromLayout, fraction: number): number {
  return col.dataWidth * fraction
}

function log2TrackLeft(col: KaryotypeChromLayout, fraction: number): number {
  const span = log2TrackSpan(col, fraction)
  return col.dataLeft + (col.dataWidth - span) / 2
}

export function buildKaryotypeLayout(input: {
  chroms: { name: ChromName; length: number }[]
  marginLeft: number
  plotWidth: number
  plotTop: number
  plotHeight: number
  ideoWidth: number
  columnGap: number
  yMin: number
  yMax: number
  log2SpanFraction?: number
}): KaryotypeLayout {
  const {
    chroms,
    marginLeft,
    plotWidth,
    plotTop,
    plotHeight,
    ideoWidth,
    columnGap,
    yMin,
    yMax,
    log2SpanFraction = 0.4,
  } = input
  const n = chroms.length || 1
  const columnStride = plotWidth / n
  const columnInner = Math.max(4, columnStride - columnGap)
  const dataWidth = Math.max(2, columnInner - ideoWidth)
  const maxLength = Math.max(1, ...chroms.map((c) => c.length))

  const columns: KaryotypeChromLayout[] = chroms.map((c, i) => {
    const columnLeft = marginLeft + i * columnStride
    const contentHeight = plotHeight * (c.length / maxLength)
    return {
      name: c.name,
      length: c.length,
      columnLeft,
      columnStride,
      ideoLeft: columnLeft,
      ideoWidth,
      dataLeft: columnLeft + ideoWidth,
      dataWidth,
      contentHeight,
    }
  })

  return { columns, plotTop, plotHeight, yMin, yMax, log2SpanFraction }
}

/** Bin midpoint in chromosome-local bp (handles genome-wide coordinates in files). */
export function karyotypeLocalBinMid(
  chromLength: number,
  chromOffset: number,
  binStart: number,
  binEnd: number
): number {
  let mid = (binStart + binEnd) / 2
  if (mid > chromLength * 1.05) mid -= chromOffset
  return Math.min(chromLength, Math.max(0, mid))
}

export function karyotypeYForBp(layout: KaryotypeLayout, col: KaryotypeChromLayout, bp: number): number {
  const local = Math.min(col.length, Math.max(0, bp))
  const t = local / col.length
  return layout.plotTop + t * col.contentHeight
}

export function karyotypeXForLog2(layout: KaryotypeLayout, col: KaryotypeChromLayout, v: number): number {
  const { yMin, yMax, log2SpanFraction } = layout
  const clamped = Math.min(yMax, Math.max(yMin, v))
  const t = (clamped - yMin) / (yMax - yMin)
  const span = log2TrackSpan(col, log2SpanFraction)
  const left = log2TrackLeft(col, log2SpanFraction)
  return left + t * span
}

export function karyotypeHitTest(
  layout: KaryotypeLayout,
  x: number,
  y: number
): { col: KaryotypeChromLayout; bp: number; log2: number } | null {
  if (y < layout.plotTop || y > layout.plotTop + layout.plotHeight) return null
  for (const col of layout.columns) {
    if (x < col.columnLeft || x >= col.columnLeft + col.columnStride) continue
    if (y > layout.plotTop + col.contentHeight) continue
    const bp = ((y - layout.plotTop) / col.contentHeight) * col.length
    const span = log2TrackSpan(col, layout.log2SpanFraction)
    const left = log2TrackLeft(col, layout.log2SpanFraction)
    const log2 = layout.yMin + ((x - left) / span) * (layout.yMax - layout.yMin)
    return { col, bp, log2 }
  }
  return null
}
