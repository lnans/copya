import { describe, expect, it } from "vitest"

import { genomeOffsets, HG38_CHROMOSOMES, normalizeChrom } from "./hg38"

describe("normalizeChrom", () => {
  it.each([
    ["1", "chr1"],
    ["chr1", "chr1"],
    ["CHR22", "chr22"],
    ["x", "chrX"],
    ["23", "chrX"],
    ["24", "chrY"],
    [" chrY ", "chrY"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeChrom(raw)).toBe(expected)
  })

  it("rejects non-primary contigs", () => {
    expect(normalizeChrom("chrM")).toBeNull()
    expect(normalizeChrom("chr1_KI270706v1_random")).toBeNull()
    expect(normalizeChrom("25")).toBeNull()
  })
})

describe("genomeOffsets", () => {
  it("concatenates the 24 chromosomes", () => {
    const { offsets, total } = genomeOffsets()
    expect(offsets).toHaveLength(24)
    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(HG38_CHROMOSOMES[0].length)
    expect(total).toBe(3_088_269_832)
  })
})
