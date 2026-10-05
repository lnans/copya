import { describe, expect, it } from "vitest"

import { indexAnnotationFeatures } from "@/lib/annotations/annotation-catalog"
import type { Segment } from "@/lib/types"

import { segmentGeneEntries } from "./segment-genes"

describe("segmentGeneEntries", () => {
  it("marks RefSeq genes that overlap ClinGen Gene-Disease", () => {
    const refSeq = indexAnnotationFeatures([
      { chrom: "chr17", start: 100, end: 500, name: "BRCA1" },
      { chrom: "chr17", start: 600, end: 900, name: "OTHER" },
    ])
    const clinGen = indexAnnotationFeatures([
      {
        chrom: "chr17",
        start: 150,
        end: 250,
        name: "Breast cancer",
        clinGenClassification: "Definitive",
        clinGenGeneSymbol: "BRCA1",
      },
    ])
    const segment: Segment = {
      id: "1",
      chrom: "chr17",
      start: 0,
      end: 1000,
      log2: 0,
      type: "unknown",
    }
    expect(segmentGeneEntries(refSeq, clinGen, segment)).toEqual([
      { name: "BRCA1", clinGen: true },
      { name: "OTHER", clinGen: false },
    ])
  })
})
