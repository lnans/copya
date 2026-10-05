import type { Bins } from "@/lib/types"

import { binRangesByChrom } from "./bins"

/**
 * Centred rolling mean of log2 over `windowBins` bins (`windowBins >> 1` on
 * each side, so an even size behaves like the next odd one), truncated at
 * chromosome ends, ignoring empty (NaN) bins. NaN where the bin itself is empty.
 *
 * The window is positional (bin width × half-window around each bin start), so
 * bins missing from the file count as empty, as in the previous viewer.
 */
export function rollingMean(bins: Bins, windowBins: number): Float32Array {
  const out = new Float32Array(bins.length).fill(Number.NaN)
  const half = windowBins >> 1
  for (const [from, to] of binRangesByChrom(bins)) {
    if (from === to) continue
    const reach = half * (bins.end[from] - bins.start[from])
    let lo = from
    let hi = from
    let sum = 0
    let count = 0
    for (let i = from; i < to; i++) {
      const center = bins.start[i]
      while (hi < to && bins.start[hi] <= center + reach) {
        const v = bins.log2[hi++]
        if (Number.isFinite(v)) {
          sum += v
          count++
        }
      }
      while (bins.start[lo] < center - reach) {
        const v = bins.log2[lo++]
        if (Number.isFinite(v)) {
          sum -= v
          count--
        }
      }
      if (Number.isFinite(bins.log2[i]) && count > 0) out[i] = sum / count
    }
  }
  return out
}

/**
 * Rolling median with the same window as `rollingMean` (upper median for an
 * even number of values). `windowBins` ≤ 2 returns the values unchanged.
 */
export function rollingMedian(bins: Bins, windowBins: number): Float32Array {
  const half = windowBins >> 1
  if (half === 0) return bins.log2.slice()
  const out = new Float32Array(bins.length).fill(Number.NaN)
  let window = new Float32Array(2 * half + 1)
  for (const [from, to] of binRangesByChrom(bins)) {
    if (from === to) continue
    const reach = half * (bins.end[from] - bins.start[from])
    let lo = from
    let hi = from
    for (let i = from; i < to; i++) {
      if (!Number.isFinite(bins.log2[i])) continue
      const center = bins.start[i]
      while (hi < to && bins.start[hi] <= center + reach) hi++
      while (bins.start[lo] < center - reach) lo++
      // Uneven bin sizes can put more than 2 × half + 1 bins in the window.
      if (hi - lo > window.length) window = new Float32Array(hi - lo)
      let n = 0
      for (let j = lo; j < hi; j++) {
        const v = bins.log2[j]
        if (Number.isFinite(v)) window[n++] = v
      }
      out[i] = window.subarray(0, n).sort()[n >> 1]
    }
  }
  return out
}
