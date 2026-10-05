import { describe, expect, it } from "vitest"

import { classifyDgvGoldColor } from "./dgv-gold-colors"

describe("classifyDgvGoldColor", () => {
  it("maps DGV Gold BED fields", () => {
    expect(classifyDgvGoldColor("0,0,200", "CNV", "Gain")).toBe("gain")
    expect(classifyDgvGoldColor("200,0,0", "CNV", "Loss")).toBe("loss")
  })

  it("maps itemRgb when type columns are missing", () => {
    expect(classifyDgvGoldColor("200,0,200", undefined, undefined)).toBe("inversion")
    expect(classifyDgvGoldColor("139,69,19", undefined, undefined)).toBe("gainLoss")
  })

  it("maps dgvMerged-style labels", () => {
    expect(classifyDgvGoldColor(undefined, undefined, undefined, "gain+loss")).toBe("gainLoss")
    expect(classifyDgvGoldColor(undefined, undefined, undefined, "inversion")).toBe("inversion")
  })
})
