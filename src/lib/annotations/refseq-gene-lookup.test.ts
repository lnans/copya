import { describe, expect, it } from "vitest"

import { indexAnnotationFeatures } from "./annotation-catalog"
import { lookupRefSeqGeneSymbol } from "./refseq-gene-lookup"

describe("lookupRefSeqGeneSymbol", () => {
  const catalog = indexAnnotationFeatures([
    { chrom: "chr7", start: 1000, end: 5000, name: "BRAF" },
    { chrom: "chr7", start: 1200, end: 4800, name: "BRAF" },
    { chrom: "chr17", start: 100, end: 900, name: "TP53" },
  ])

  it("finds gene case-insensitively and merges isoforms", () => {
    const result = lookupRefSeqGeneSymbol(catalog, "braf", 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.region.chrom).toBe("chr7")
    expect(result.region.end - result.region.start).toBeGreaterThanOrEqual(50_000)
  })

  it("reports ambiguous symbols on multiple chromosomes", () => {
    const multi = indexAnnotationFeatures([
      { chrom: "chr1", start: 1, end: 2, name: "X" },
      { chrom: "chr2", start: 1, end: 2, name: "X" },
    ])
    expect(lookupRefSeqGeneSymbol(multi, "X").ok).toBe(false)
  })
})
