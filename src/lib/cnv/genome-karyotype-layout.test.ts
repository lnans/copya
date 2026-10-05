import { describe, expect, it } from "vitest"

import {
  buildKaryotypeLayout,
  karyotypeHitTest,
  karyotypeLocalBinMid,
  karyotypeYForBp,
} from "./genome-karyotype-layout"

describe("genome-karyotype-layout", () => {
  const layout = buildKaryotypeLayout({
    chroms: [
      { name: "chr1", length: 1000 },
      { name: "chr2", length: 500 },
    ],
    marginLeft: 40,
    plotWidth: 200,
    plotTop: 8,
    plotHeight: 100,
    ideoWidth: 10,
    columnGap: 2,
    yMin: -1,
    yMax: 1,
  })

  it("maps bp to vertical position within column", () => {
    const col = layout.columns[0]!
    expect(karyotypeYForBp(layout, col, 500)).toBe(8 + 50)
  })

  it("scales column height by chromosome length", () => {
    expect(layout.columns[0]!.contentHeight).toBe(100)
    expect(layout.columns[1]!.contentHeight).toBe(50)
  })

  it("converts genome-wide bin coords to local bp", () => {
    expect(karyotypeLocalBinMid(1000, 5000, 5500, 5600)).toBe(550)
  })

  it("hit-tests column and bp", () => {
    const col = layout.columns[1]!
    const y = karyotypeYForBp(layout, col, 250)
    const hit = karyotypeHitTest(layout, col.dataLeft + 5, y)
    expect(hit?.col.name).toBe("chr2")
    expect(hit?.bp).toBeCloseTo(250, 0)
  })
})
