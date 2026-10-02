import { mosaicExpectedLog2 } from "@/lib/cnv/scale"
import { CHROM_INDEX, HG38_CHROMOSOMES, type ChromName } from "@/lib/genome/hg38"
import type { Bins, Segment, Sex } from "@/lib/types"

/** Seeded PRNG (mulberry32) so the demo sample is reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(random: () => number): number {
  const u = 1 - random()
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

type Anomaly = Omit<Segment, "id" | "type" | "bins">

const GAIN_FULL = Math.log2(1.5)

/** Known synthetic anomalies, in the spirit of section 8 of the requirements. */
export const DEMO_ANOMALIES: Anomaly[] = [
  { chrom: "chr1", start: 0, end: 5_000_000, log2: -1 },
  { chrom: "chr7", start: 3_640_000, end: 3_940_000, log2: -1 },
  { chrom: "chr21", start: 0, end: 46_709_983, log2: mosaicExpectedLog2(0.3, "gain"), mosaicPercent: 30 },
  { chrom: "chr22", start: 18_900_000, end: 21_900_000, log2: GAIN_FULL },
]

export type DemoSample = { bins: Bins; segments: Segment[]; sex: Sex }

export function generateDemoSample({
  binSize = 100_000,
  noiseSd = 0.1,
  sex = "XY" as Sex,
  seed = 42,
} = {}): DemoSample {
  const random = mulberry32(seed)
  const sexLog2: Partial<Record<ChromName, number>> =
    sex === "XY" ? { chrX: -1, chrY: -1 } : { chrY: Number.NaN }

  const total = HG38_CHROMOSOMES.reduce((n, c) => n + Math.ceil(c.length / binSize), 0)
  const bins: Bins = {
    length: total,
    chromIndex: new Uint8Array(total),
    start: new Uint32Array(total),
    end: new Uint32Array(total),
    log2: new Float32Array(total),
  }

  let i = 0
  HG38_CHROMOSOMES.forEach((chrom, ci) => {
    const base = sexLog2[chrom.name] ?? 0
    for (let start = 0; start < chrom.length; start += binSize, i++) {
      const end = Math.min(start + binSize, chrom.length)
      const anomaly = DEMO_ANOMALIES.find(
        (a) => a.chrom === chrom.name && start < a.end && end > a.start
      )
      const outlier = random() < 0.002 ? gaussian(random) * 0.8 : 0
      bins.chromIndex[i] = ci
      bins.start[i] = start
      bins.end[i] = end
      bins.log2[i] = (anomaly?.log2 ?? base) + gaussian(random) * noiseSd + outlier
    }
  })

  const segments: Segment[] = DEMO_ANOMALIES.map((a, k) => ({
    ...a,
    id: `demo-${k + 1}`,
    type: a.log2 > 0 ? "gain" : "loss",
    bins: Math.ceil((a.end - a.start) / binSize),
  }))
  if (sex === "XY") {
    for (const name of ["chrX", "chrY"] as const) {
      const length = HG38_CHROMOSOMES[CHROM_INDEX.get(name)!].length
      segments.push({
        id: `demo-${name}`,
        chrom: name,
        start: 0,
        end: length,
        log2: -1,
        type: "loss",
        bins: Math.ceil(length / binSize),
      })
    }
  }
  return { bins, segments, sex }
}
