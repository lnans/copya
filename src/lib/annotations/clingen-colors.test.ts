import { describe, expect, it } from "vitest"

import { clinGenFillCssVar, strongerClinGenClass } from "./clingen-colors"

describe("clingen-colors", () => {
  it("maps evidence classes to orange and others to blue", () => {
    expect(clinGenFillCssVar("Definitive")).toBe("--cnv-clingen-orange")
    expect(clinGenFillCssVar("Limited")).toBe("--cnv-clingen-orange")
    expect(clinGenFillCssVar("Disputed")).toBe("--cnv-clingen-blue")
    expect(clinGenFillCssVar("Refuted")).toBe("--cnv-clingen-blue")
  })

  it("picks stronger classification", () => {
    expect(strongerClinGenClass("Limited", "Definitive")).toBe("Definitive")
  })
})
