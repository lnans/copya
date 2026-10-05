import { describe, expect, it } from "vitest"

import { omimFeaturesInView, parseOmimBed } from "./omim-bed"

describe("parseOmimBed", () => {
  it("parses UCSC-style BED4 rows on primary chromosomes", () => {
    const bed = [
      "track name=omimGene2",
      "chr1\t11106535\t11262551\tMTOR",
      "chr7\t117120000\t117310000\tCFTR",
      "chrM\t1\t100\tBAD",
    ].join("\n")
    const result = parseOmimBed(bed)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.features).toHaveLength(2)
    expect(result.catalog.features[0]).toMatchObject({ chrom: "chr1", name: "MTOR" })
    expect(result.catalog.byChrom.get("chr7")).toHaveLength(1)
  })

  it("rejects empty input", () => {
    expect(parseOmimBed("   \n")).toEqual({ ok: false, code: "empty_file" })
  })
})

describe("omimFeaturesInView", () => {
  const features = [
    { chrom: "chr1" as const, start: 100, end: 200, name: "A" },
    { chrom: "chr1" as const, start: 500, end: 600, name: "B" },
  ]

  it("returns overlapping genes only", () => {
    expect(omimFeaturesInView(features, 150, 550).map((f) => f.name)).toEqual(["A", "B"])
    expect(omimFeaturesInView(features, 250, 400)).toHaveLength(0)
  })
})
