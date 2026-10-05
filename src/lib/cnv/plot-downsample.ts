export type PlotPoint = { x: number; y: number }
export type MaPlotPoint = PlotPoint & { v: number }

/**
 * Collapses many X samples into one point per pixel column (mean Y).
 * Fixes jagged moving-average lines when several bins map to the same pixel
 * (typical on the whole-genome view).
 */
export function downsamplePolylineByPixel(
  points: PlotPoint[],
  plotLeft: number,
  plotWidth: number
): PlotPoint[] {
  if (plotWidth <= 0 || points.length === 0) return points
  const sum = new Float64Array(plotWidth)
  const count = new Uint32Array(plotWidth)
  for (const { x, y } of points) {
    const col = Math.floor(x - plotLeft)
    if (col < 0 || col >= plotWidth) continue
    sum[col] += y
    count[col]++
  }
  const out: PlotPoint[] = []
  for (let col = 0; col < plotWidth; col++) {
    if (count[col] === 0) continue
    out.push({ x: plotLeft + col + 0.5, y: sum[col] / count[col] })
  }
  return out
}

/** Like `downsamplePolylineByPixel`, but averages log2 for the moving-average color. */
export function downsampleMaByPixel(
  points: MaPlotPoint[],
  plotLeft: number,
  plotWidth: number
): MaPlotPoint[] {
  if (plotWidth <= 0 || points.length === 0) return points
  const sumY = new Float64Array(plotWidth)
  const sumV = new Float64Array(plotWidth)
  const count = new Uint32Array(plotWidth)
  for (const { x, y, v } of points) {
    const col = Math.floor(x - plotLeft)
    if (col < 0 || col >= plotWidth) continue
    sumY[col] += y
    sumV[col] += v
    count[col]++
  }
  const out: MaPlotPoint[] = []
  for (let col = 0; col < plotWidth; col++) {
    if (count[col] === 0) continue
    const n = count[col]
    out.push({
      x: plotLeft + col + 0.5,
      y: sumY[col] / n,
      v: sumV[col] / n,
    })
  }
  return out
}

/** Buckets by vertical pixel row (karyotype / vertical chromosome views). */
export function downsampleMaByPixelY(
  points: MaPlotPoint[],
  plotTop: number,
  plotHeight: number
): MaPlotPoint[] {
  if (plotHeight <= 0 || points.length === 0) return points
  const sumX = new Float64Array(plotHeight)
  const sumV = new Float64Array(plotHeight)
  const count = new Uint32Array(plotHeight)
  for (const { x, y, v } of points) {
    const row = Math.floor(y - plotTop)
    if (row < 0 || row >= plotHeight) continue
    sumX[row] += x
    sumV[row] += v
    count[row]++
  }
  const out: MaPlotPoint[] = []
  for (let row = 0; row < plotHeight; row++) {
    if (count[row] === 0) continue
    const n = count[row]
    out.push({
      x: sumX[row] / n,
      y: plotTop + row + 0.5,
      v: sumV[row] / n,
    })
  }
  return out
}
