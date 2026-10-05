import { describe, expect, it } from "vitest"

import {
  CLINGEN_GENE_DISEASE_BED_HEADER,
  featuresInView,
  indexAnnotationFeatures,
  parseAnnotationFile,
} from "./annotation-catalog"

describe("featuresInView", () => {
  it("returns sorted overlapping features without scanning the whole chromosome", () => {
    const catalog = indexAnnotationFeatures([
      { chrom: "chr1", start: 0, end: 10, name: "a" },
      { chrom: "chr1", start: 100, end: 110, name: "b" },
      { chrom: "chr1", start: 200, end: 210, name: "c" },
      { chrom: "chr1", start: 1000, end: 1010, name: "d" },
    ])
    const chr1 = catalog.byChrom.get("chr1")!
    expect(featuresInView(chr1, 95, 115).map((f) => f.name)).toEqual(["b"])
    expect(featuresInView(chr1, 205, 1005).map((f) => f.name)).toEqual(["c", "d"])
  })
})

describe("parseAnnotationFile", () => {
  it("parses ClinGen Gene-Disease BED and keeps one row per disease", () => {
    const text = `${CLINGEN_GENE_DISEASE_BED_HEADER}\tUCSC\nchr17\t100\t200\tFanconi anemia\tLimited\tBRCA1\nchr17\t150\t250\tBreast cancer\tDefinitive\tBRCA1\n`
    const result = parseAnnotationFile(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.features).toHaveLength(2)
    expect(result.catalog.features[0]).toMatchObject({
      name: "Fanconi anemia",
      clinGenGeneSymbol: "BRCA1",
      clinGenClassification: "Limited",
    })
    expect(result.catalog.features[1]).toMatchObject({
      name: "Breast cancer",
      clinGenClassification: "Definitive",
    })
  })

  it("parses DGV Gold BED12 blocks", () => {
    const line =
      "chr1\t166210175\t166227750\tgssvG2468\t0\t.\t166227750\t166227750\t0,0,200\t3\t1,13137,1\t0,3828,17574\tCNV\tGain"
    const result = parseAnnotationFile(`${line}\n`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.features[0]).toMatchObject({ name: "gssvG2468", start: 166210175, end: 166227750 })
    expect(result.catalog.features[0].exons).toHaveLength(3)
    expect(result.catalog.features[0].dgvColor).toBe("gain")
  })

  it("parses BED4", () => {
    const result = parseAnnotationFile("chr1\t100\t200\tGENE1\n")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.features[0]).toMatchObject({ chrom: "chr1", name: "GENE1" })
  })

  it("parses DGV table rows", () => {
    const line = "585\tchr1\t10000\t22118\tnsv945698\t0\t+\t10000\t10000\t200\tduplication"
    const result = parseAnnotationFile(`${line}\n`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.features[0].name).toBe("nsv945698")
    expect(result.catalog.features[0].dgvColor).toBe("gain")
  })

  it("classifies DGV Supp. losses like DGV Gold", () => {
    const line = "9\tchr1\t10000\t2368561\tnssv2995976\t0\t+\t10000\t10000\t13107200\tloss"
    const result = parseAnnotationFile(`${line}\n`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.features[0].dgvColor).toBe("loss")
  })

  it("parses RefSeq genePred", () => {
    const line =
      "585\tNR_046018.2\tchr1\t+\t11873\t14409\t14409\t14409\t3\t11873,12612,13220,\t12227,12721,14409,\t0\tDDX11L1\tnone\tnone\t-1,-1,-1,"
    const result = parseAnnotationFile(`${line}\n`)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.catalog.features[0]).toMatchObject({ name: "DDX11L1", start: 11873, end: 14409 })
    expect(result.catalog.features[0].exons).toHaveLength(3)
    expect(result.catalog.features[0].exons![0]).toEqual({ start: 11873, end: 12227 })
  })
})
