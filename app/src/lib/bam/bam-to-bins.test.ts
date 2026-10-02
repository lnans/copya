import { crc32, deflateRawSync, inflateRawSync } from "node:zlib"
import { beforeAll, describe, expect, it } from "vitest"

import { defaultParseOptions, parseBins, sniff } from "@/lib/parse/table"

import {
  bamToBins,
  binRows,
  formatBinsFile,
  medianBinCount,
  type BamToBinsResult,
} from "./bam-to-bins"

function bgzfBlock(data: Uint8Array): Uint8Array {
  const payload = deflateRawSync(data)
  const block = new Uint8Array(18 + payload.length + 8)
  const view = new DataView(block.buffer)
  block.set([0x1f, 0x8b, 8, 4, 0, 0, 0, 0, 0, 0xff, 6, 0, 66, 67, 2, 0])
  view.setUint16(16, block.length - 1, true)
  block.set(payload, 18)
  view.setUint32(block.length - 8, crc32(data), true)
  view.setUint32(block.length - 4, data.length, true)
  return block
}

function bamHeader(refs: { name: string; length: number }[]): Uint8Array {
  const parts: number[] = [66, 65, 77, 1, 0, 0, 0, 0]
  const int32 = (v: number) => parts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff)
  int32(refs.length)
  for (const ref of refs) {
    int32(ref.name.length + 1)
    for (const ch of ref.name) parts.push(ch.charCodeAt(0))
    parts.push(0)
    int32(ref.length)
  }
  return Uint8Array.from(parts)
}

type Read = { refId: number; pos: number; mapq?: number; flag?: number }

function alignments(reads: Read[]): Uint8Array {
  const out = new Uint8Array(reads.length * 38)
  const view = new DataView(out.buffer)
  reads.forEach(({ refId, pos, mapq = 60, flag = 0 }, i) => {
    const o = i * 38
    view.setInt32(o, 34, true)
    view.setInt32(o + 4, refId, true)
    view.setInt32(o + 8, pos, true)
    out[o + 12] = 2
    out[o + 13] = mapq
    view.setUint16(o + 18, flag, true)
    view.setInt32(o + 24, -1, true)
    view.setInt32(o + 28, -1, true)
    out[o + 36] = 114
  })
  return out
}

/** One BGZF block for the header, one per reference, then the EOF block. */
function syntheticBamAndBai(refs: { name: string; length: number }[], readsByRef: Read[][]) {
  const blocks = [bgzfBlock(bamHeader(refs)), ...readsByRef.map((r) => bgzfBlock(alignments(r)))]
  blocks.push(bgzfBlock(new Uint8Array(0)))
  const offsets: number[] = []
  let total = 0
  for (const block of blocks) {
    offsets.push(total)
    total += block.length
  }
  const bam = new Uint8Array(total)
  blocks.forEach((block, i) => bam.set(block, offsets[i]))

  const bai = new DataView(new ArrayBuffer(8 + refs.length * (4 + 4 + 4 + 16 + 4)))
  bai.setUint32(0, 0x01494142, true)
  bai.setInt32(4, refs.length, true)
  let o = 8
  refs.forEach((_, i) => {
    bai.setInt32(o, 1, true)
    bai.setUint32(o + 4, 4681, true)
    bai.setInt32(o + 8, 1, true)
    bai.setBigUint64(o + 12, BigInt(offsets[i + 1]) << 16n, true)
    bai.setBigUint64(o + 20, BigInt(offsets[i + 2]) << 16n, true)
    bai.setInt32(o + 28, 0, true)
    o += 32
  })
  return { bam: new Blob([bam]), bai: bai.buffer }
}

const inflateRaw = (bytes: Uint8Array) => new Uint8Array(inflateRawSync(bytes))

describe("bamToBins on a synthetic BAM", () => {
  let result: BamToBinsResult
  const { bam, bai } = syntheticBamAndBai(
    [
      { name: "2", length: 250 },
      { name: "1", length: 250 },
      { name: "chrM", length: 100 },
    ],
    [
      [50, 60, 70, 80].map((pos) => ({ refId: 0, pos })),
      [
        { refId: 1, pos: 10 },
        { refId: 1, pos: 20 },
        { refId: 1, pos: 150 },
        { refId: 1, pos: 160, mapq: 5 },
        { refId: 1, pos: 170, flag: 0x400 },
      ],
      [{ refId: 2, pos: 5 }],
    ]
  )
  beforeAll(async () => {
    result = await bamToBins(bam, bai, { binSize: 100, inflateRaw })
  })

  it("counts primary chromosomes in hg38 order and applies MAPQ and flag filters", () => {
    expect(result.chromosomes.map((c) => c.chrom)).toEqual(["chr1", "chr2"])
    expect(Array.from(result.chromosomes[0].counts)).toEqual([2, 1, 0, 0])
    expect(Array.from(result.chromosomes[1].counts)).toEqual([4, 0, 0, 0])
  })

  it("normalises by the upper median of non-empty autosome bins", () => {
    expect(result.median).toBe(2)
    const rows = [...binRows(result.chromosomes, 100, result.median)]
    expect(rows).toEqual([
      { chrom: "chr1", start: 0, end: 100, reads: 2, log2: 0 },
      { chrom: "chr1", start: 100, end: 200, reads: 1, log2: -1 },
      { chrom: "chr2", start: 0, end: 100, reads: 4, log2: 1 },
    ])
  })

  it("writes a file the viewer parses back", () => {
    const text = formatBinsFile(binRows(result.chromosomes, 100, result.median), {
      source: "test.bam",
      binSize: 100,
      median: result.median,
      minMappingQuality: 10,
      excludedFlags: 0xf04,
      version: "0.0.0",
    })
    const { bins } = parseBins(text, defaultParseOptions(sniff(text)))
    expect(bins.length).toBe(3)
    expect(Array.from(bins.start)).toEqual([0, 100, 0])
    expect(Array.from(bins.log2)).toEqual([0, -1, 1])
  })
})

describe("medianBinCount", () => {
  it("falls back to all chromosomes when no autosome has reads", () => {
    expect(medianBinCount([{ chrom: "chrX", length: 10, counts: Uint32Array.from([0, 3, 5]) }])).toBe(5)
  })

  it("returns 1 without reads", () => {
    expect(medianBinCount([])).toBe(1)
  })
})
