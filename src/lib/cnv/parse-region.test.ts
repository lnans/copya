import { describe, expect, it } from "vitest"

import { formatRegionField, parseRegionField } from "./parse-region"

describe("parseRegionField", () => {
  it("parses UCSC-style pasted coordinates", () => {
    const region = parseRegionField("chr1:29,150,389.924-235,360,172.531")
    expect(region).toEqual({
      chrom: "chr1",
      start: 29_150_389,
      end: 235_360_173,
    })
  })

  it("accepts chromosomes without chr prefix", () => {
    expect(parseRegionField("X:1-1000")).toMatchObject({ chrom: "chrX", start: 0, end: 1000 })
  })

  it("rejects invalid strings", () => {
    expect(parseRegionField("not-a-region")).toBeNull()
    expect(parseRegionField("chr1:100-50")).toBeNull()
  })
})

describe("formatRegionField", () => {
  it("round-trips with parseRegionField", () => {
    const text = formatRegionField("chr22", 18_900_000, 21_900_000)
    expect(text).toBe("chr22:18,900,001-21,900,000")
    expect(parseRegionField(text)).toEqual({
      chrom: "chr22",
      start: 18_900_000,
      end: 21_900_000,
    })
  })
})
