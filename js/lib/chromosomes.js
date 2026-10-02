/**
 * Chromosome naming helpers shared by the BAM, BED and coverage modules.
 *
 * The viewer works with UCSC-style names ("chr1" ... "chr22", "chrX", "chrY").
 * Files using Ensembl/NCBI-style names ("1", "X", ...) are normalised by
 * prefixing "chr". Other contigs (chrM, alt/random contigs, decoys, ...) are ignored.
 */
(function (global) {
  'use strict';

  const ns = global.ShallowCnv || (global.ShallowCnv = {});

  /** Matches chr1 .. chr22. Used to compute the reference (diploid) median. */
  const AUTOSOME_PATTERN = /^chr([1-9]|1\d|2[0-2])$/;

  /** Matches chr1 .. chr22, chrX, chrY: the chromosomes that are counted and displayed. */
  const PRIMARY_CHROMOSOME_PATTERN = /^chr([1-9]|1\d|2[0-2]|X|Y)$/;

  /** Ordered list of primary chromosomes, used to populate the chromosome selector. */
  const PRIMARY_CHROMOSOMES = Array.from({ length: 22 }, (_, i) => `chr${i + 1}`).concat('chrX', 'chrY');

  /**
   * Returns the UCSC-style name of a chromosome.
   * @param {string} name e.g. "7" or "chr7"
   * @returns {string} e.g. "chr7"
   */
  function normalizeChromosomeName(name) {
    return name.startsWith('chr') ? name : `chr${name}`;
  }

  ns.chromosomes = {
    AUTOSOME_PATTERN,
    PRIMARY_CHROMOSOME_PATTERN,
    PRIMARY_CHROMOSOMES,
    normalizeChromosomeName,
  };
})(globalThis);
