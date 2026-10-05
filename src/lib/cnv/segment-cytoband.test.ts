import { describe, expect, it } from "vitest"

import { HG38_CYTO_BANDS } from "@/lib/genome/cyto-band"

import { cytoBandsForSegment, formatCytoLocation, formatIscnSeq } from "./segment-cytoband"

describe("formatCytoLocation", () => {
  it("formats a single band", () => {
    const bands = cytoBandsForSegment(HG38_CYTO_BANDS, {
      chrom: "chr7",
      start: 72_700_000,
      end: 74_100_000,
    })
    expect(bands.length).toBeGreaterThan(0)
    expect(formatCytoLocation("chr7", bands)).toMatch(/^7q/)
  })
})

describe("formatIscnSeq", () => {
  it("matches the documented gain example shape", () => {
    const segment = {
      id: "1",
      chrom: "chr7" as const,
      start: 72_699_999,
      end: 74_100_000,
      log2: Math.log2(1.5),
      type: "gain" as const,
      copyNumber: 3,
    }
    const iscn = formatIscnSeq(segment, "7q11.23", 3)
    expect(iscn).toBe("seq[GRCh38] 7q11.23(72700000_74100000)x3")
  })
})
