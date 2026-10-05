import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { binRangesByChrom, countBinsOverlappingSegment } from "@/lib/cnv/bins"
import { defaultParseOptions, parseBins, parseSegments, sniff } from "@/lib/parse/table"

const ROOT = join(import.meta.dirname, "../..")

describe("segment bin count (sample files)", () => {
  it("counts 15 kb bins inside SWG aberration segments", () => {
    const segText = readFileSync(
      join(ROOT, "../files/SWG-199_S23_15kb_4_aberrations.bed"),
      "utf8"
    )
    const binText = readFileSync(join(ROOT, "../files/SWG-199_S23.bins.15kb.bed"), "utf8")
    const { segments } = parseSegments(segText, defaultParseOptions(sniff(segText)))
    const { bins } = parseBins(binText, defaultParseOptions(sniff(binText)))
    const ranges = binRangesByChrom(bins)
    const counts = segments.map((s) => countBinsOverlappingSegment(bins, ranges, s))
    expect(counts.every((n) => n > 0)).toBe(true)
    expect(counts[0]).toBe(16)
  })
})
