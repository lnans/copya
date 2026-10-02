import { describe, expect, it } from "vitest"

import { downsamplePolylineByPixel } from "./plot-downsample"

describe("downsamplePolylineByPixel", () => {
  it("averages Y values that share a pixel column", () => {
    const out = downsamplePolylineByPixel(
      [
        { x: 10, y: 0 },
        { x: 10.2, y: 2 },
        { x: 11.8, y: 4 },
      ],
      10,
      4
    )
    expect(out).toEqual([
      { x: 10.5, y: 1 },
      { x: 11.5, y: 4 },
    ])
  })
})
