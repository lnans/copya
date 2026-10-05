import { describe, expect, it } from "vitest"

import {
  defaultParseOptions,
  ParseError,
  parseBins,
  parseSegments,
  sniff,
} from "./table"

const WISECONDORX_SEGMENTS = [
  "chr\tstart\tend\tratio\tzscore\ttype",
  "7\t3640001\t3850000\t-0.8236\t-13.18\tloss",
  "X\t152980001\t153310000\t-0.8765\t-24.86\tloss",
  "21\t5010001\t46700000\t0.58\t20.1\tgain",
].join("\n")

const HEADERLESS_BED_BINS = [
  "track name=bins",
  "chr2\t100000\t200000\t0.02",
  "chr1\t0\t100000\t-0.05",
  "chr1\t100000\t200000\t",
  "chrUn_KI270742v1\t0\t100000\t0.1",
].join("\n")

const CSV_RATIO_BINS = [
  "Chromosome,Start,End,Copy_Ratio,Reads",
  "1,0,50000,1.0,120",
  "1,50000,100000,0.5,60",
  "23,0,50000,1.5,180",
].join("\r\n")

describe("sniff", () => {
  it("detects a tab-separated header and guesses columns", () => {
    const s = sniff(WISECONDORX_SEGMENTS)
    expect(s.delimiter).toBe("\t")
    expect(s.hasHeader).toBe(true)
    expect(s.mapping).toMatchObject({ chrom: 0, start: 1, end: 2, value: 3, type: 5 })
    expect(s.preview).toHaveLength(3)
  })

  it("falls back to BED column order without header", () => {
    const s = sniff(HEADERLESS_BED_BINS)
    expect(s.hasHeader).toBe(false)
    expect(s.columns).toEqual(["col1", "col2", "col3", "col4"])
    expect(s.mapping).toEqual({ chrom: 0, start: 1, end: 2, value: 3 })
  })

  it("detects CSV with CRLF line endings", () => {
    const s = sniff(CSV_RATIO_BINS)
    expect(s.delimiter).toBe(",")
    expect(s.mapping).toMatchObject({ chrom: 0, start: 1, end: 2, value: 3 })
  })

  it("accepts a #CHROM style header", () => {
    const s = sniff("##meta\n#CHROM\tSTART\tEND\tLOG2\nchr1\t0\t10\t0.1")
    expect(s.hasHeader).toBe(true)
    expect(s.columns).toEqual(["CHROM", "START", "END", "LOG2"])
  })

  it("rejects an empty file", () => {
    expect(() => sniff("\n\n")).toThrowError(ParseError)
  })
})

describe("parseBins", () => {
  it("sorts bins, keeps empty values as NaN and skips other contigs", () => {
    const { bins, skippedContigs } = parseBins(
      HEADERLESS_BED_BINS,
      defaultParseOptions(sniff(HEADERLESS_BED_BINS))
    )
    expect(skippedContigs).toBe(1)
    expect(bins.length).toBe(3)
    expect(Array.from(bins.chromIndex)).toEqual([0, 0, 1])
    expect(Array.from(bins.start)).toEqual([0, 100000, 100000])
    expect(bins.log2[0]).toBeCloseTo(-0.05)
    expect(bins.log2[1]).toBeNaN()
  })

  it("converts linear ratios to log2 and maps 23 to chrX", () => {
    const { bins } = parseBins(CSV_RATIO_BINS, defaultParseOptions(sniff(CSV_RATIO_BINS)))
    expect(Array.from(bins.log2)).toEqual([0, -1, Math.fround(Math.log2(1.5))])
    expect(bins.chromIndex[2]).toBe(22)
  })

  it("reports the faulty line", () => {
    const text = "chr1\t0\t100\t0.1\nchr1\tabc\t200\t0.1"
    try {
      parseBins(text, defaultParseOptions(sniff(text)))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError)
      expect((error as ParseError).code).toBe("not_numeric")
      expect((error as ParseError).line).toBe(2)
    }
  })
})

describe("parseSegments", () => {
  it("converts WisecondorX 1-based starts and reads the type column", () => {
    const { segments } = parseSegments(
      WISECONDORX_SEGMENTS,
      defaultParseOptions(sniff(WISECONDORX_SEGMENTS))
    )
    expect(segments.map((s) => s.chrom)).toEqual(["chr7", "chr21", "chrX"])
    expect(segments[0]).toMatchObject({ start: 3640000, end: 3850000, type: "loss" })
    expect(segments[1].type).toBe("gain")
  })

  it("derives log2 from copy number and reads mosaic fractions", () => {
    const text = "chrom\tstart\tend\tcn\tmosaic\nchr21\t0\t46709983\t2.3\t0.3"
    const { segments } = parseSegments(text, defaultParseOptions(sniff(text)))
    expect(segments[0].log2).toBeCloseTo(Math.log2(1.15))
    expect(segments[0].mosaicPercent).toBeCloseTo(30)
    expect(segments[0].type).toBe("gain")
  })
})
