/** Centered label clipped to a pixel span (gene symbols on annotation tracks). */
export function drawFeatureLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  left: number,
  width: number,
  y: number,
  fillStyle: string,
  minWidth = 18,
  haloStyle = "oklch(1 0 0 / 0.9)"
) {
  if (width < minWidth || !name) return
  const maxChars = Math.max(2, Math.floor(width / 4.5))
  const label = name.length > maxChars ? `${name.slice(0, Math.max(1, maxChars - 1))}…` : name

  ctx.font = "9px 'Geist Variable', sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const x = left + width / 2

  ctx.lineWidth = 2.5
  ctx.strokeStyle = haloStyle
  ctx.lineJoin = "round"
  ctx.strokeText(label, x, y)
  ctx.fillStyle = fillStyle
  ctx.fillText(label, x, y)
}
