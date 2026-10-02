/**
 * Background counting of all chromosomes of a BAM file.
 *
 * Chromosomes are counted one after the other from a queue. The chromosome the user is
 * looking at can be moved to the front of the queue at any time, so that it is displayed
 * without waiting for the whole genome.
 *
 * Depends on ShallowCnv.bam, ShallowCnv.bai and ShallowCnv.chromosomes.
 */
(function (global) {
  'use strict';

  const ns = global.ShallowCnv || (global.ShallowCnv = {});

  /**
   * @typedef {object} CountProgress
   * @property {string} chromosome chromosome being counted
   * @property {number} position 1-based rank of this chromosome in the counting order
   * @property {number} total number of chromosomes to count
   * @property {number} fraction progress within this chromosome, 0..1
   */

  class CoverageJob {
    /**
     * Use CoverageJob.create.
     * @param {Blob} bamFile
     * @param {import('./coverage.js').CoverageDataset} dataset
     * @param {number[]} queue reference indices still to count
     * @param {object} countOptions forwarded to ShallowCnv.bam.countReadsPerBin
     */
    constructor(bamFile, dataset, queue, countOptions) {
      this.bamFile = bamFile;
      this.dataset = dataset;
      this.queue = queue;
      this.countOptions = countOptions;
      /** Index of the last chromosome passed to prioritize(), or null. */
      this.priorityIndex = null;
      this.cancelled = false;
      this.startTime = performance.now();
    }

    /**
     * Reads the BAM header and the BAI index, and prepares the queue of chromosomes to count
     * (chr1-22, X, Y having reads), with `priorityChromosome` first.
     *
     * @param {Blob} bamFile coordinate-sorted BAM
     * @param {Blob} baiFile its index
     * @param {object} options
     * @param {number} options.binSize bin size in bp
     * @param {string} [options.priorityChromosome] UCSC-style name of the chromosome to count first
     * @param {object} [options.countOptions] minMappingQuality, excludedFlags, pool
     * @returns {Promise<CoverageJob>}
     * @throws {Error} if the files are invalid or do not match
     */
    static async create(bamFile, baiFile, { binSize, priorityChromosome, countOptions = {} }) {
      const { bam, bai, chromosomes } = ns;
      const references = await bam.readBamHeader(bamFile);
      const ranges = await bai.readBai(baiFile);
      if (ranges.length !== references.length) throw new Error('Le BAI ne correspond pas à ce BAM.');

      references.forEach((ref, i) => {
        ref.range = ranges[i];
        ref.displayName = chromosomes.normalizeChromosomeName(ref.name);
      });

      const queue = references
        .map((_, i) => i)
        .filter((i) => chromosomes.PRIMARY_CHROMOSOME_PATTERN.test(references[i].displayName) && references[i].range);
      if (!queue.length) {
        throw new Error('Aucun read trouvé sur les chromosomes 1-22, X, Y (BAM non trié ?).');
      }

      const priorityPosition = queue.findIndex((i) => references[i].displayName === priorityChromosome);
      if (priorityPosition > 0) queue.unshift(queue.splice(priorityPosition, 1)[0]);

      const dataset = {
        references,
        counts: references.map(() => new Uint32Array(0)),
        binSize,
        median: 1,
        countedIndices: new Set(),
        totalToCount: queue.length,
      };
      return new CoverageJob(bamFile, dataset, queue, countOptions);
    }

    /** True when every chromosome has been counted. */
    get isComplete() {
      return this.queue.length === 0;
    }

    /** Elapsed time since the job was created, in seconds. */
    get elapsedSeconds() {
      return (performance.now() - this.startTime) / 1000;
    }

    /**
     * Moves a chromosome to the front of the queue, if it is not counted yet.
     * @param {string} displayName UCSC-style name
     */
    prioritize(displayName) {
      const index = this.dataset.references.findIndex((ref) => ref.displayName === displayName);
      const position = this.queue.indexOf(index);
      if (position < 0) return;
      this.priorityIndex = index;
      if (position > 0) {
        this.queue.splice(position, 1);
        this.queue.unshift(index);
      }
    }

    /** Stops counting after the chromosome in progress; callbacks are no longer called. */
    cancel() {
      this.cancelled = true;
    }

    /**
     * Counts up to `maxChromosomes` chromosomes from the queue.
     *
     * @param {number} maxChromosomes Infinity to count everything left
     * @param {object} [callbacks]
     * @param {(progress: CountProgress) => void} [callbacks.onProgress]
     * @param {(event: {index: number, wasPrioritized: boolean, isLast: boolean}) => void} [callbacks.onCounted]
     *   called after each chromosome; `wasPrioritized` is true for the chromosome last passed
     *   to prioritize(), `isLast` when the queue is now empty
     * @returns {Promise<void>}
     */
    async countNext(maxChromosomes, { onProgress, onCounted } = {}) {
      const { dataset } = this;
      for (let remaining = maxChromosomes; remaining > 0 && this.queue.length && !this.cancelled; remaining--) {
        const index = this.queue.shift();
        const ref = dataset.references[index];
        dataset.counts[index] = await ns.bam.countReadsPerBin(this.bamFile, ref, index, dataset.binSize, {
          ...this.countOptions,
          onProgress: (fraction) => {
            if (this.cancelled || !onProgress) return;
            onProgress({
              chromosome: ref.displayName,
              position: dataset.countedIndices.size + 1,
              total: dataset.totalToCount,
              fraction,
            });
          },
        });
        dataset.countedIndices.add(index);
        if (!this.cancelled && onCounted) {
          onCounted({ index, wasPrioritized: index === this.priorityIndex, isLast: !this.queue.length });
        }
      }
    }
  }

  ns.CoverageJob = CoverageJob;
})(globalThis);
