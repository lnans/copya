import { describe, expect, it } from "vitest"

import type { Bins } from "@/lib/types"

import { rollingMean, rollingMedian } from "./smoothing"

function makeBins(rows: [chromIndex: number, start: number, log2: number][], width = 10): Bins {
  return {
    length: rows.length,
    chromIndex: Uint8Array.from(rows.map((r) => r[0])),
    start: Uint32Array.from(rows.map((r) => r[1])),
    end: Uint32Array.from(rows.map((r) => r[1] + width)),
    log2: Float32Array.from(rows.map((r) => r[2])),
  }
}

describe("rollingMean", () => {
  it("averages a centred window truncated at chromosome ends", () => {
    const bins = makeBins([
      [0, 0, 1],
      [0, 10, 2],
      [0, 20, 3],
      [0, 30, 4],
      [1, 0, 100],
    ])
    expect(Array.from(rollingMean(bins, 3))).toEqual([1.5, 2, 3, 3.5, 100])
  })

  it("treats an even window like the next odd one and 1 as no smoothing", () => {
    const bins = makeBins([
      [0, 0, 1],
      [0, 10, 2],
      [0, 20, 6],
    ])
    expect(Array.from(rollingMean(bins, 2))).toEqual(Array.from(rollingMean(bins, 3)))
    expect(Array.from(rollingMean(bins, 1))).toEqual([1, 2, 6])
  })

  it("skips empty and missing bins, and stays empty on empty bins", () => {
    const bins = makeBins([
      [0, 0, 1],
      [0, 10, Number.NaN],
      [0, 20, 3],
      [0, 50, 10],
    ])
    const mean = Array.from(rollingMean(bins, 3))
    expect(mean[0]).toBe(1)
    expect(mean[1]).toBeNaN()
    expect(mean[2]).toBe(3)
    expect(mean[3]).toBe(10)
    expect(Array.from(rollingMean(bins, 5))).toEqual([2, Number.NaN, 2, 10])
  })
})

describe("rollingMedian", () => {
  const bins = makeBins([
    [0, 0, 5],
    [0, 10, 1],
    [0, 20, 9],
    [0, 30, Number.NaN],
    [0, 40, 2],
    [1, 0, 7],
  ])

  it("returns the values unchanged for a window of 1", () => {
    const smoothed = rollingMedian(bins, 1)
    expect(Array.from(smoothed)).toEqual(Array.from(bins.log2))
    expect(smoothed).not.toBe(bins.log2)
  })

  it("takes the upper median, skips empty bins and stops at chromosome ends", () => {
    // Windows: [5,1] → 5, [5,1,9] → 5, [1,9] → 9, empty, [2] → 2, other chromosome → 7.
    expect(Array.from(rollingMedian(bins, 3))).toEqual([5, 5, 9, Number.NaN, 2, 7])
  })
})
