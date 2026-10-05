import { describe, expect, it } from "vitest"

import type { Bins } from "@/lib/types"

import { binRangesByChrom, countBinsOverlappingSegment } from "./bins"

describe("binRangesByChrom", () => {
  it("returns empty ranges for missing chromosomes", () => {
    const bins: Bins = {
      length: 4,
      chromIndex: Uint8Array.from([0, 0, 2, 23]),
      start: Uint32Array.from([0, 10, 0, 0]),
      end: Uint32Array.from([10, 20, 10, 10]),
      log2: Float32Array.from([0, 0, 0, 0]),
    }
    const ranges = binRangesByChrom(bins)
    expect(ranges[0]).toEqual([0, 2])
    expect(ranges[1]).toEqual([2, 2])
    expect(ranges[2]).toEqual([2, 3])
    expect(ranges[23]).toEqual([3, 4])
  })
})

describe("countBinsOverlappingSegment", () => {
  it("counts overlapping bins on one chromosome", () => {
    const bins: Bins = {
      length: 5,
      chromIndex: Uint8Array.from([0, 0, 0, 0, 0]),
      start: Uint32Array.from([0, 10, 20, 30, 40]),
      end: Uint32Array.from([10, 20, 30, 40, 50]),
      log2: Float32Array.from([0, 0, 0, 0, 0]),
    }
    const ranges = binRangesByChrom(bins)
    expect(
      countBinsOverlappingSegment(bins, ranges, {
        chrom: "chr1",
        start: 15,
        end: 35,
      })
    ).toBe(2)
  })
})
