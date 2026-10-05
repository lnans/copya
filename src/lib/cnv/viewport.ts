export type BpViewport = { start: number; end: number }

export const MIN_VIEWPORT_BP = 50_000

/** Keeps [start, end) inside [0, length] with span in [minSpan, length]. */
export function clampViewport(
  start: number,
  end: number,
  length: number,
  minSpan = MIN_VIEWPORT_BP
): BpViewport {
  let s = Math.max(0, Math.min(start, length))
  let e = Math.max(s, Math.min(end, length))
  let span = Math.max(minSpan, Math.min(e - s, length))
  s = Math.max(0, Math.min(s, length - span))
  return { start: s, end: s + span }
}

export function zoomViewportAt(
  viewport: BpViewport,
  length: number,
  cursorFraction: number,
  factor: number,
  minSpan = MIN_VIEWPORT_BP
): BpViewport {
  const span = viewport.end - viewport.start
  const anchor = viewport.start + cursorFraction * span
  const nextSpan = Math.max(minSpan, Math.min(span * factor, length))
  return clampViewport(anchor - cursorFraction * nextSpan, anchor + (1 - cursorFraction) * nextSpan, length, minSpan)
}

export function panViewport(viewport: BpViewport, length: number, deltaBp: number, minSpan = MIN_VIEWPORT_BP): BpViewport {
  return clampViewport(viewport.start + deltaBp, viewport.end + deltaBp, length, minSpan)
}

export function viewportFromPixelRange(
  x0: number,
  x1: number,
  plotWidth: number,
  viewport: BpViewport,
  length: number,
  minSpan = MIN_VIEWPORT_BP
): BpViewport {
  const span = viewport.end - viewport.start
  const left = Math.max(0, Math.min(x0, x1))
  const right = Math.min(plotWidth, Math.max(x0, x1))
  if (right - left < 4) return viewport
  const start = viewport.start + (left / plotWidth) * span
  const end = viewport.start + (right / plotWidth) * span
  return clampViewport(start, end, length, minSpan)
}
