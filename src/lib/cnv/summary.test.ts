import { describe, expect, it } from "vitest"

import { DEMO_ANOMALIES, generateDemoSample } from "@/lib/demo"

import { mosaicExpectedLog2 } from "./scale"
import { summarizeByChromosome } from "./summary"

describe("summarizeByChromosome on the demo sample", () => {
  const { bins, segments } = generateDemoSample({ sex: "XY" })
  const summary = Object.fromEntries(
    summarizeByChromosome(bins).map((s) => [s.chrom, s.median])
  )

  it("covers the genome with 100 kb bins", () => {
    expect(bins.length).toBeGreaterThan(30_000)
  })

  it("puts the 30 % mosaic trisomy 21 on the expected theoretical line", () => {
    expect(summary.chr21).toBeCloseTo(mosaicExpectedLog2(0.3, "gain"), 1)
    expect(summary.chr21).toBeLessThan(Math.log2(1.5) - 0.2)
  })

  it("shows one X and one Y copy for an XY sample", () => {
    expect(summary.chrX).toBeCloseTo(-1, 1)
    expect(summary.chrY).toBeCloseTo(-1, 1)
    expect(summary.chr2).toBeCloseTo(0, 1)
  })

  it("returns a segment for each injected anomaly", () => {
    expect(segments.length).toBe(DEMO_ANOMALIES.length + 2)
  })
})
