import type { SampleContext, Thresholds } from "@/lib/types"

export type ValueScale = "log2" | "ratio"
export type DisplayScale = "log2" | "ratio" | "copyNumber"

export function ratioToLog2(ratio: number): number {
  return ratio > 0 ? Math.log2(ratio) : Number.NaN
}

export function log2ToRatio(log2: number): number {
  return 2 ** log2
}

export function log2ToCopyNumber(log2: number, ploidy = 2): number {
  return ploidy * 2 ** log2
}

export function toDisplay(log2: number, scale: DisplayScale): number {
  if (scale === "ratio") return log2ToRatio(log2)
  if (scale === "copyNumber") return log2ToCopyNumber(log2)
  return log2
}

/**
 * Expected log2 for a single-copy gain or loss present in a fraction `f`
 * of cells: log2(1 + f/2) and log2(1 − f/2).
 */
export function mosaicExpectedLog2(
  fraction: number,
  kind: "gain" | "loss"
): number {
  return Math.log2(kind === "gain" ? 1 + fraction / 2 : 1 - fraction / 2)
}

export const MOSAIC_FRACTIONS = [0.1, 0.2, 0.3, 0.5, 1] as const

/**
 * A linear ratio is never negative, so any negative value means log2.
 * Otherwise a median close to 1 means linear ratio.
 */
export function guessValueScale(values: ArrayLike<number>): ValueScale {
  const finite: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (Number.isFinite(v)) {
      if (v < 0) return "log2"
      finite.push(v)
    }
  }
  if (finite.length === 0) return "log2"
  finite.sort((a, b) => a - b)
  const median = finite[Math.floor(finite.length / 2)]
  return median > 0.5 ? "ratio" : "log2"
}

/** Placeholder defaults, to be replaced by the laboratory's validated values. */
export const THRESHOLD_PRESETS: Record<SampleContext, Thresholds> = {
  prenatal: { gain: 0.15, loss: -0.2 },
  postnatal: { gain: 0.2, loss: -0.25 },
}
