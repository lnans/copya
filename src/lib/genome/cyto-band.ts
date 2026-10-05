import cytoBandRaw from "@/data/cytoBand.hg38.txt?raw"

import { normalizeChrom, type ChromName } from "@/lib/genome/hg38"

export type CytoStain = "gneg" | "gpos25" | "gpos50" | "gpos75" | "gpos100" | "acen" | "stalk" | "gvar" | string

export type CytoBand = {
  chrom: ChromName
  start: number
  end: number
  name: string
  stain: CytoStain
}

export type CytoBandCatalog = {
  byChrom: ReadonlyMap<ChromName, readonly CytoBand[]>
}

export function parseCytoBand(text: string): CytoBandCatalog {
  const byChrom = new Map<ChromName, CytoBand[]>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const cols = line.split("\t")
    if (cols.length < 5) continue
    const chrom = normalizeChrom(cols[0])
    if (!chrom) continue
    const start = Number(cols[1])
    const end = Number(cols[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const band: CytoBand = {
      chrom,
      start,
      end,
      name: cols[3].trim(),
      stain: cols[4].trim(),
    }
    let list = byChrom.get(chrom)
    if (!list) {
      list = []
      byChrom.set(chrom, list)
    }
    list.push(band)
  }
  for (const list of byChrom.values()) {
    list.sort((a, b) => a.start - b.start)
  }
  return { byChrom }
}

/** UCSC hg38 cytoBand (GRCh38), bundled for offline use. */
export const HG38_CYTO_BANDS: CytoBandCatalog = parseCytoBand(cytoBandRaw)

export function cytoBandsInView(
  bands: readonly CytoBand[] | undefined,
  viewStart: number,
  viewEnd: number
): CytoBand[] {
  if (!bands?.length) return []
  const out: CytoBand[] = []
  for (const b of bands) {
    if (b.end > viewStart && b.start < viewEnd) out.push(b)
  }
  return out
}

export type CytoPalette = {
  gneg: string
  gpos25: string
  gpos50: string
  gpos75: string
  gpos100: string
  acen: string
  stalk: string
  gvar: string
  border: string
  text: string
}

export function cytoBandFill(stain: CytoStain, palette: CytoPalette): string {
  switch (stain) {
    case "gpos25":
      return palette.gpos25
    case "gpos50":
      return palette.gpos50
    case "gpos75":
      return palette.gpos75
    case "gpos100":
      return palette.gpos100
    case "acen":
      return palette.acen
    case "stalk":
      return palette.stalk
    case "gvar":
      return palette.gvar
    default:
      return palette.gneg
  }
}

export type IdeogramDrawScope = "genome" | "chromosome" | "gene"

type LayoutChrom = { name: ChromName; offset: number; length: number }

export type DrawIdeogramOptions = {
  scope: IdeogramDrawScope
  layoutChroms: LayoutChrom[]
  viewport: { start: number; end: number }
  genomeTotal: number
  catalog: CytoBandCatalog
  marginLeft: number
  plotWidth: number
  bandTop: number
  bandHeight: number
  labelBaseline: number
  palette: CytoPalette
  xWholeGenome: (genomePos: number) => number
  xOnChrom: (bp: number) => number
  shortChromLabel: (name: ChromName) => string
  mbTickStep: (viewSpanBp: number) => number
}

export function drawIdeogram(ctx: CanvasRenderingContext2D, options: DrawIdeogramOptions) {
  const {
    scope,
    layoutChroms,
    viewport,
    catalog,
    marginLeft,
    plotWidth,
    bandTop,
    bandHeight,
    labelBaseline,
    palette,
    xWholeGenome,
    xOnChrom,
    shortChromLabel,
    mbTickStep,
  } = options

  ctx.strokeStyle = palette.border
  ctx.lineWidth = 1
  ctx.strokeRect(marginLeft, bandTop, plotWidth, bandHeight)

  const drawBand = (x0: number, x1: number, band: CytoBand) => {
    if (x1 < marginLeft || x0 > marginLeft + plotWidth) return
    const left = Math.max(marginLeft, x0)
    const right = Math.min(marginLeft + plotWidth, x1)
    const w = Math.max(1, right - left)
    ctx.fillStyle = cytoBandFill(band.stain, palette)
    ctx.fillRect(left, bandTop + 1, w, bandHeight - 2)
    if (w >= 22 && band.stain !== "acen") {
      ctx.fillStyle = palette.text
      ctx.font = "9px 'Geist Variable', sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const label =
        band.name.length > Math.floor(w / 5)
          ? `${band.name.slice(0, Math.max(2, Math.floor(w / 5) - 1))}…`
          : band.name
      ctx.fillText(label, left + w / 2, bandTop + bandHeight / 2)
    }
  }

  if (scope === "genome") {
    for (const c of layoutChroms) {
      const bands = catalog.byChrom.get(c.name)
      if (!bands) continue
      for (const band of bands) {
        drawBand(xWholeGenome(c.offset + band.start), xWholeGenome(c.offset + band.end), band)
      }
    }
    ctx.fillStyle = palette.text
    ctx.font = "11px 'Geist Variable', sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    for (const c of layoutChroms) {
      ctx.fillText(shortChromLabel(c.name), xWholeGenome(c.offset + c.length / 2), labelBaseline)
    }
    return
  }

  const chrom = layoutChroms[0]
  if (!chrom) return
  const bands = catalog.byChrom.get(chrom.name)
  const visible = cytoBandsInView(bands, viewport.start, viewport.end)
  for (const band of visible) {
    drawBand(xOnChrom(band.start), xOnChrom(band.end), band)
  }

  const viewSpan = viewport.end - viewport.start
  ctx.fillStyle = palette.text
  ctx.font = "11px 'Geist Variable', sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  const stepMb = mbTickStep(viewSpan)
  const startMb = Math.ceil(viewport.start / 1e6 / stepMb) * stepMb
  for (let mb = startMb; mb * 1e6 <= viewport.end; mb += stepMb) {
    const label = stepMb < 1 ? `${mb.toFixed(1)} Mb` : `${mb} Mb`
    ctx.fillText(label, xOnChrom(mb * 1e6), labelBaseline)
  }
}

/** Vertical ideogram strip (p→q top to bottom) for whole-genome karyotype columns. */
export function drawVerticalChromIdeogram(
  ctx: CanvasRenderingContext2D,
  bands: readonly CytoBand[] | undefined,
  x: number,
  width: number,
  yTop: number,
  columnHeight: number,
  chromLength: number,
  palette: CytoPalette,
  chromLabel: string,
  labelBaselineY: number
) {
  ctx.strokeStyle = palette.border
  ctx.lineWidth = 1
  ctx.strokeRect(x, yTop, width, columnHeight)

  for (const band of bands ?? []) {
    const y0 = yTop + (band.start / chromLength) * columnHeight
    const y1 = yTop + (band.end / chromLength) * columnHeight
    const h = Math.max(1, y1 - y0)
    ctx.fillStyle = cytoBandFill(band.stain, palette)
    ctx.fillRect(x + 0.5, y0, Math.max(1, width - 1), h)
    if (h >= 14 && width >= 8 && band.stain !== "acen") {
      ctx.save()
      ctx.fillStyle = palette.text
      ctx.font = "8px 'Geist Variable', sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      const cx = x + width / 2
      const cy = y0 + h / 2
      ctx.translate(cx, cy)
      ctx.rotate(-Math.PI / 2)
      const label =
        band.name.length > Math.floor(h / 6)
          ? `${band.name.slice(0, Math.max(2, Math.floor(h / 6) - 1))}…`
          : band.name
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  }

  ctx.fillStyle = palette.text
  ctx.font = "10px 'Geist Variable', sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  ctx.fillText(chromLabel, x + width / 2, labelBaselineY)
}
