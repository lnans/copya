/**
 * Reader for the BED file listing the CNVs (copy number variants) called on the sample.
 *
 * Expected columns (tab or space separated), extra columns are ignored:
 *
 *   1  chromosome   "7" or "chr7"
 *   2  start        see "Coordinates" below
 *   3  end          inclusive in 1-based files, exclusive in 0-based files (same number)
 *   4  label        optional: log2 ratio (e.g. "-0.8236") or a keyword (del/loss/dup/gain/amp)
 *   5  z-score      optional
 *   6  type         optional: "loss" / "gain" (or del/dup/amp)
 *
 * "track", "browser" and "#" lines are skipped, as is any line whose start/end columns
 * are not numbers (e.g. a header line "chr start end ratio zscore type").
 *
 * Coordinates: standard BED is 0-based, half-open. WisecondorX "_aberrations.bed" files
 * instead write 1-based, closed intervals (start = bin start + 1, end = bin end).
 * Both describe the same interval once the start is decremented, so every CNV is returned
 * as 0-based, half-open. The convention can be forced or detected (see detectCoordinateSystem).
 *
 * Depends on ShallowCnv.chromosomes.
 */
(function (global) {
  'use strict';

  const ns = global.ShallowCnv || (global.ShallowCnv = {});

  const DIRECTIVE_LINE = /^(track|browser|#)/;

  /** Header line written by WisecondorX in its aberrations BED files. */
  const WISECONDORX_HEADER = ['chr', 'start', 'end', 'ratio', 'zscore', 'type'];

  /**
   * @typedef {'0-based' | '1-based'} CoordinateSystem
   */

  /**
   * @typedef {object} Cnv
   * @property {string} chrom UCSC-style chromosome name
   * @property {number} start 0-based start
   * @property {number} end exclusive end
   * @property {string} label raw 4th column ('' if absent)
   * @property {string} zScore raw 5th column ('' if absent)
   * @property {number | null} score numeric value of the label: the log2 ratio if it is a
   *   number, -1 for a loss, +1 for a gain, null if unknown
   * @property {'gain' | 'loss' | null} type from the 6th column, or from the sign of `score`
   *   when that column is absent or not recognised
   * @property {boolean} typeConflict true when the 6th column and the sign of the log2 ratio disagree
   */

  /**
   * @typedef {object} CnvBed
   * @property {Cnv[]} cnvs CNVs in file order
   * @property {CoordinateSystem} coordinateSystem convention used to read the file
   * @property {string} detectionReason why this convention was used (French, for display)
   */

  /**
   * @param {string} text
   * @returns {'gain' | 'loss' | null}
   */
  function typeFromText(text) {
    if (/del|loss/i.test(text)) return 'loss';
    if (/dup|gain|amp/i.test(text)) return 'gain';
    return null;
  }

  /**
   * Converts the label column into a signed value.
   * @param {string} label
   * @returns {number | null}
   */
  function scoreFromLabel(label) {
    const value = parseFloat(label);
    if (!isNaN(value)) return value;
    const type = typeFromText(label);
    return type === 'loss' ? -1 : type === 'gain' ? 1 : null;
  }

  /**
   * Guesses the coordinate convention of a CNV BED file:
   *   - a WisecondorX header means 1-based;
   *   - otherwise, if every start ends in ...001 and every end in ...000 (bin-aligned calls
   *     shifted by one, as written by WisecondorX), 1-based;
   *   - otherwise standard 0-based BED.
   *
   * @param {string[] | null} headerColumns lowercased header columns, if the file has a header
   * @param {{start: number, end: number}[]} rows raw coordinates
   * @returns {{coordinateSystem: CoordinateSystem, reason: string}}
   */
  function detectCoordinateSystem(headerColumns, rows) {
    if (headerColumns && WISECONDORX_HEADER.every((name, i) => headerColumns[i] === name)) {
      return { coordinateSystem: '1-based', reason: 'en-tête WisecondorX détecté' };
    }
    if (rows.length && rows.every((r) => r.start % 1000 === 1 && r.end % 1000 === 0)) {
      return { coordinateSystem: '1-based', reason: 'débuts en …001, fins en …000' };
    }
    return { coordinateSystem: '0-based', reason: 'BED standard' };
  }

  /**
   * Parses the content of a CNV BED file.
   *
   * @param {string} text
   * @param {object} [options]
   * @param {'auto' | CoordinateSystem} [options.coordinates='auto']
   * @returns {CnvBed}
   */
  function parseCnvBed(text, { coordinates = 'auto' } = {}) {
    const lines = text
      .split('\n')
      .filter((line) => line.trim() && !DIRECTIVE_LINE.test(line))
      .map((line) => line.trim().split(/\s+/));

    const isDataLine = (columns) => columns.length >= 3 && +columns[1] >= 0 && +columns[2] > 0;
    const headerColumns = lines.length && !isDataLine(lines[0]) ? lines[0].map((c) => c.toLowerCase()) : null;
    const rows = lines.filter(isDataLine);

    const detection =
      coordinates === 'auto'
        ? detectCoordinateSystem(headerColumns, rows.map((c) => ({ start: +c[1], end: +c[2] })))
        : { coordinateSystem: coordinates, reason: 'choisi manuellement' };
    const startShift = detection.coordinateSystem === '1-based' ? 1 : 0;

    const cnvs = rows.map((columns) => {
      const label = columns[3] || '';
      const score = scoreFromLabel(label);
      const declaredType = typeFromText(columns[5] || '');
      const ratioType = score > 0 ? 'gain' : score < 0 ? 'loss' : null;
      return {
        chrom: ns.chromosomes.normalizeChromosomeName(columns[0]),
        start: Math.max(0, +columns[1] - startShift),
        end: +columns[2],
        label,
        zScore: columns[4] || '',
        score,
        type: declaredType || ratioType,
        typeConflict: Boolean(declaredType && ratioType && declaredType !== ratioType),
      };
    });

    return { cnvs, coordinateSystem: detection.coordinateSystem, detectionReason: detection.reason };
  }

  /**
   * Reads a CNV BED file.
   * @param {Blob | null} file
   * @param {object} [options] see parseCnvBed
   * @returns {Promise<CnvBed | null>} null if no file is given
   */
  async function readCnvBed(file, options) {
    return file ? parseCnvBed(await file.text(), options) : null;
  }

  ns.bed = { parseCnvBed, readCnvBed, scoreFromLabel, typeFromText, detectCoordinateSystem };
})(globalThis);
