import { describe, expect, it } from "vitest"

import { clampViewport, panViewport, viewportFromPixelRange, zoomViewportAt } from "./viewport"

const L = 1_000_000

describe("clampViewport", () => {
  it("clamps to chromosome bounds", () => {
    expect(clampViewport(-100, 200_000, L)).toEqual({ start: 0, end: 200_000 })
    expect(clampViewport(900_000, 1_100_000, L)).toEqual({ start: 900_000, end: 1_000_000 })
  })
})

describe("zoomViewportAt", () => {
  it("zooms in toward the cursor", () => {
    const v0 = { start: 0, end: L }
    const v1 = zoomViewportAt(v0, L, 0.5, 0.5)
    expect(v1.end - v1.start).toBeCloseTo(L / 2, -3)
    expect(v1.start + (v1.end - v1.start) / 2).toBeCloseTo(L / 2, -3)
  })
})

describe("panViewport", () => {
  it("shifts without changing span", () => {
    const v = panViewport({ start: 100_000, end: 300_000 }, L, 50_000)
    expect(v).toEqual({ start: 150_000, end: 350_000 })
  })
})

describe("viewportFromPixelRange", () => {
  it("maps a horizontal drag to base pairs", () => {
    const v = viewportFromPixelRange(100, 300, 1000, { start: 0, end: L }, L)
    expect(v.start).toBe(100_000)
    expect(v.end).toBe(300_000)
  })
})
