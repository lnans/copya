import { describe, expect, it } from "vitest"

import {
  guessValueScale,
  log2ToCopyNumber,
  mosaicExpectedLog2,
  ratioToLog2,
} from "./scale"

describe("conversions", () => {
  it("converts linear ratios to log2", () => {
    expect(ratioToLog2(1)).toBe(0)
    expect(ratioToLog2(0.5)).toBe(-1)
    expect(ratioToLog2(1.5)).toBeCloseTo(0.585, 3)
    expect(ratioToLog2(0)).toBeNaN()
  })

  it("converts log2 to copy number", () => {
    expect(log2ToCopyNumber(0)).toBe(2)
    expect(log2ToCopyNumber(-1)).toBe(1)
    expect(log2ToCopyNumber(Math.log2(1.5))).toBeCloseTo(3)
  })
})

describe("mosaicExpectedLog2", () => {
  it("matches full trisomy and monosomy at f = 100 %", () => {
    expect(mosaicExpectedLog2(1, "gain")).toBeCloseTo(Math.log2(1.5))
    expect(mosaicExpectedLog2(1, "loss")).toBe(-1)
  })

  it("gives log2(1.15) for a 30 % mosaic gain", () => {
    expect(mosaicExpectedLog2(0.3, "gain")).toBeCloseTo(0.2016, 4)
  })
})

describe("guessValueScale", () => {
  it("detects log2 from negative values", () => {
    expect(guessValueScale([1.2, 0.9, -0.1])).toBe("log2")
  })

  it("detects linear ratios centred on 1", () => {
    expect(guessValueScale([0.98, 1.02, 1.0, 1.5])).toBe("ratio")
  })

  it("defaults to log2 for values centred on 0", () => {
    expect(guessValueScale([0.01, 0.02, 0.0])).toBe("log2")
  })
})
