/**
 * Copy-number signal computed from per-bin read counts.
 *
 * For shallow whole-genome sequencing, the read depth in a bin is proportional to the
 * copy number of that region. Each bin count is normalised by the median bin count of
 * the autosomes (assumed diploid), giving a log2 ratio:
 *   0 = 2 copies, -1 = 1 copy (loss), +0.58 = 3 copies (gain), ...
 * Mosaic CNVs appear as intermediate values, hence the optional smoothing.
 *
 * Depends on ShallowCnv.chromosomes.
 */
(function (global) {
  'use strict';

  const ns = global.ShallowCnv || (global.ShallowCnv = {});

  /**
   * @typedef {object} CoverageReference
   * @property {string} name name in the BAM
   * @property {string} displayName UCSC-style name
   * @property {number} length length in bp
   * @property {import('./bai.js').ReferenceRange | null} range location in the BAM
   */

  /**
   * @typedef {object} CoverageDataset
   * @property {CoverageReference[]} references all BAM references, in BAM order
   * @property {Uint32Array[]} counts read count per bin, per reference (empty until counted)
   * @property {number} binSize bin size in bp
   * @property {number} median reference bin count used for normalisation
   * @property {Set<number>} countedIndices indices of the references already counted
   * @property {number} totalToCount number of references that will be counted
   */

  /**
   * @typedef {object} BinValue
   * @property {string} chrom
   * @property {number} start 0-based
   * @property {number} end exclusive
   * @property {number} value
   */

  /**
   * Median of the non-empty bins of the autosomes counted so far (or, if none is counted
   * yet, of every counted chromosome). Empty bins (N regions, centromeres...) are excluded.
   * When several values are in the middle, the upper one is returned.
   *
   * @param {CoverageDataset} dataset
   * @returns {number} median bin count, 1 if there is no data
   */
  function computeMedianBinCount(dataset) {
    const collect = (keepReference) => {
      const values = [];
      for (const index of dataset.countedIndices) {
        if (!keepReference(dataset.references[index])) continue;
        for (const count of dataset.counts[index]) if (count) values.push(count);
      }
      return values;
    };

    let values = collect((ref) => ns.chromosomes.AUTOSOME_PATTERN.test(ref.displayName));
    if (!values.length) values = collect(() => true);
    const sorted = Float64Array.from(values).sort();
    return sorted[sorted.length >> 1] || 1;
  }

  /**
   * @param {Uint32Array} counts read count per bin
   * @param {number} median normalisation value
   * @returns {(number | null)[]} log2(count / median) per bin, null for empty bins
   */
  function log2Ratios(counts, median) {
    return Array.from(counts, (count) => (count ? Math.log2(count / median) : null));
  }

  /**
   * Applies `reduce` to a sliding window centred on each non-null value.
   * The window spans `windowSize >> 1` bins on each side (so an even size behaves like the
   * next odd size), is truncated at the chromosome ends, and skips null values.
   *
   * @param {(number | null)[]} values
   * @param {number} windowSize
   * @param {(neighbours: number[]) => number} reduce receives at least one value
   * @returns {(number | null)[]} null where the input is null
   */
  function slidingWindow(values, windowSize, reduce) {
    const half = windowSize >> 1;
    return values.map((value, i) => {
      if (value == null) return null;
      const neighbours = [];
      for (let k = Math.max(0, i - half); k <= Math.min(values.length - 1, i + half); k++) {
        if (values[k] != null) neighbours.push(values[k]);
      }
      return reduce(neighbours);
    });
  }

  /**
   * Rolling median (upper median for an even number of values). windowSize 1 = no smoothing.
   * @param {(number | null)[]} values
   * @param {number} windowSize in bins
   * @returns {(number | null)[]}
   */
  function rollingMedian(values, windowSize) {
    if (windowSize >> 1 === 0) return values.slice();
    return slidingWindow(values, windowSize, (neighbours) => {
      neighbours.sort((a, b) => a - b);
      return neighbours[neighbours.length >> 1];
    });
  }

  /**
   * Rolling mean.
   * @param {(number | null)[]} values
   * @param {number} windowSize in bins
   * @returns {(number | null)[]}
   */
  function rollingMean(values, windowSize) {
    return slidingWindow(values, windowSize, (neighbours) => {
      let sum = 0;
      for (const v of neighbours) sum += v;
      return sum / neighbours.length;
    });
  }

  /**
   * Computes the log2 ratio of every non-empty bin of the primary chromosomes counted so far,
   * after an optional per-chromosome transformation (smoothing).
   *
   * @param {CoverageDataset} dataset
   * @param {(log2: (number | null)[]) => (number | null)[]} [transform] identity by default
   * @returns {BinValue[]} in BAM order; the last bin of a chromosome is clipped to its length
   */
  function computeBinValues(dataset, transform = (values) => values) {
    const { references, binSize } = dataset;
    const rows = [];
    references.forEach((ref, index) => {
      if (!ns.chromosomes.PRIMARY_CHROMOSOME_PATTERN.test(ref.displayName)) return;
      const values = transform(log2Ratios(dataset.counts[index], dataset.median));
      for (let bin = 0; bin < values.length; bin++) {
        const start = bin * binSize;
        if (values[bin] == null || start >= ref.length) continue;
        rows.push({ chrom: ref.displayName, start, end: Math.min(start + binSize, ref.length), value: values[bin] });
      }
    });
    return rows;
  }

  /**
   * Formats bin values as bedGraph text (chrom, start, end, value with 3 decimals).
   * @param {BinValue[]} rows
   * @returns {string}
   */
  function toBedgraph(rows) {
    return rows.map((r) => `${r.chrom}\t${r.start}\t${r.end}\t${r.value.toFixed(3)}\n`).join('');
  }

  /**
   * bedGraph of the log2 ratio, smoothed by a rolling median.
   * @param {CoverageDataset} dataset
   * @param {number} [medianWindow=1] in bins, 1 = no smoothing
   * @returns {string}
   */
  function buildLog2Bedgraph(dataset, medianWindow = 1) {
    return toBedgraph(computeBinValues(dataset, (values) => rollingMedian(values, medianWindow)));
  }

  /**
   * bedGraph of the rolling mean of the log2 ratio.
   * @param {CoverageDataset} dataset
   * @param {number} window in bins
   * @returns {string}
   */
  function buildMovingAverageBedgraph(dataset, window) {
    return toBedgraph(computeBinValues(dataset, (values) => rollingMean(values, window)));
  }

  ns.coverage = {
    computeMedianBinCount,
    log2Ratios,
    rollingMedian,
    rollingMean,
    computeBinValues,
    toBedgraph,
    buildLog2Bedgraph,
    buildMovingAverageBedgraph,
  };
})(globalThis);
