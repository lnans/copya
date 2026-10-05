import { describe, expect, it } from "vitest"

import { cytoBandsInView, parseCytoBand } from "./cyto-band"

describe("parseCytoBand", () => {
  it("parses UCSC cytoBand rows", () => {
    const text = "chr1\t0\t2300000\tp36.33\tgneg\nchr1\t2300000\t5300000\tp36.32\tgpos25\n"
    const catalog = parseCytoBand(text)
    const chr1 = catalog.byChrom.get("chr1")
    expect(chr1).toHaveLength(2)
    expect(chr1![0].name).toBe("p36.33")
  })
})

describe("cytoBandsInView", () => {
  const bands = [
    { chrom: "chr1" as const, start: 0, end: 1e6, name: "a", stain: "gneg" },
    { chrom: "chr1" as const, start: 5e6, end: 6e6, name: "b", stain: "gpos50" },
  ]

  it("filters by viewport", () => {
    expect(cytoBandsInView(bands, 0, 2e6)).toHaveLength(1)
    expect(cytoBandsInView(bands, 4e6, 7e6)[0].name).toBe("b")
  })
})
