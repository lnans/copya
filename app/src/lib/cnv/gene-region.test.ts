import { describe, expect, it } from "vitest"

import type { Segment } from "@/lib/types"

import { expandInterval, geneRegionFromSegment } from "./gene-region"

describe("geneRegionFromSegment", () => {
  it("adds 20 % margin on each side", () => {
    const segment: Segment = {
      id: "1",
      chrom: "chr7",
      start: 1_000_000,
      end: 2_000_000,
      log2: -1,
      type: "loss",
    }
    const region = geneRegionFromSegment(segment, 160_000_000)
    expect(region.start).toBe(800_000)
    expect(region.end).toBe(2_200_000)
  })
})

describe("expandInterval", () => {
  it("clamps to chromosome length", () => {
    expect(expandInterval(0, 100_000, 50_000, 0.2)).toEqual({ start: 0, end: 50_000 })
  })
})
