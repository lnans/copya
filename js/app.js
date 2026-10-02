/**
 * Shallow genome CNV viewer: user interface and IGV integration.
 *
 * Workflow:
 *   1. the user drops a BAM, its BAI and (optionally) a BED of CNVs;
 *   2. "Visualiser" reads the BED, then counts reads per bin, chromosome by chromosome
 *      (the chromosome of the first CNV first, the others in the background);
 *   3. two IGV browsers show the log2 ratio: a whole-chromosome view (to spot mosaics) and
 *      a CNV region view (with genes, ratio and alignments). Ratio tracks are regenerated
 *      when the selected chromosome or the last chromosome has been counted, or when the
 *      smoothing settings change.
 *
 * Everything runs locally: files are read in the browser and never uploaded.
 *
 * Depends on the global `igv` (igv.js 3) and on the ShallowCnv modules in js/lib.
 */
(function () {
  'use strict';

  const { bed, chromosomes, coverage, CoverageJob } = window.ShallowCnv;

  /**
   * Fixed settings. User-editable settings and their defaults are the inputs of the
   * "Paramètres avancés" section of index.html (see readCountOptions / readDisplaySettings).
   */
  const CONFIG = {
    /** Smallest accepted bin size, in bp. */
    minBinSize: 100,
    /** RefSeq genes from UCSC: the "Select" set (one transcript per gene) for hg38. */
    geneTrackUrl: (genome) =>
      `https://hgdownload.soe.ucsc.edu/goldenPath/${genome}/database/${genome === 'hg38' ? 'ncbiRefSeqSelect' : 'refGene'}.txt.gz`,
  };

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

  const elements = {
    dropZone: $('#dz'),
    fileInput: $('#inp'),
    fileList: $('#files'),
    genome: $('#genome'),
    binSize: $('#bin'),
    medianWindow: $('#sm'),
    movingAverageWindow: $('#ma'),
    goButton: $('#go'),
    status: $('#st'),
    cnvTable: $('#tbl'),
    bedInfo: $('#bed-info'),
    bedCoordinates: $('#bed-coordinates'),
    chromosome: $('#chr'),
    chromosomeView: $('#igv1'),
    regionView: $('#igv2'),
    countSettings: $('#count-settings'),
    displaySettings: $('#display-settings'),
    minMappingQuality: $('#mapq'),
    ratioMin: $('#ratio-min'),
    ratioMax: $('#ratio-max'),
    gainColor: $('#color-gain'),
    lossColor: $('#color-loss'),
    movingAverageColor: $('#color-ma'),
    movingAverageWidth: $('#width-ma'),
    regionTrackHeight: $('#height-region'),
    chromosomeTrackHeight: $('#height-chromosome'),
    alignmentWindow: $('#alignment-window'),
    paddingFraction: $('#padding-fraction'),
    minPadding: $('#padding-min'),
  };

  const state = {
    files: { bam: null, bai: null, bed: null },
    /** @type {import('./lib/bed.js').Cnv[]} */
    cnvs: [],
    /** @type {CoverageJob | null} */
    job: null,
    /** [chromosomeBrowser, regionBrowser] once created. */
    browsers: [],
    /** Index in `cnvs` of the CNV shown in the region view, or -1. */
    selectedCnv: -1,
    /** [browser, track] pairs to remove before the ratio tracks are reloaded. */
    loadedTracks: [],
    /** IGV config of the alignment track, reloaded after the ratio tracks. */
    alignmentTrackConfig: null,
    /** Serialises track reloads triggered by background counting. */
    refreshChain: Promise.resolve(),
  };

  const setStatus = (text) => {
    elements.status.textContent = text;
  };

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  /**
   * Reads a numeric input, clamped to [min, max]. Falls back to the default value
   * written in the HTML when the field is empty or invalid.
   */
  function readNumber(input, { min = -Infinity, max = Infinity, integer = false } = {}) {
    let value = parseFloat(input.value);
    if (!Number.isFinite(value)) value = parseFloat(input.defaultValue);
    if (integer) value = Math.round(value);
    return Math.min(max, Math.max(min, value));
  }

  /** Read filters, applied when counting (options of ShallowCnv.bam.countReadsPerBin). */
  function readCountOptions() {
    const UNMAPPED = 0x4;
    let excludedFlags = UNMAPPED;
    for (const box of elements.countSettings.querySelectorAll('input[type=checkbox]:checked')) {
      excludedFlags |= +box.value;
    }
    return {
      minMappingQuality: readNumber(elements.minMappingQuality, { min: 0, max: 255, integer: true }),
      excludedFlags,
    };
  }

  /** Display settings, applied immediately. */
  function readDisplaySettings() {
    let ratioMin = readNumber(elements.ratioMin);
    let ratioMax = readNumber(elements.ratioMax);
    if (ratioMin >= ratioMax) {
      ratioMin = parseFloat(elements.ratioMin.defaultValue);
      ratioMax = parseFloat(elements.ratioMax.defaultValue);
      setStatus("Échelle log2 : le minimum doit être inférieur au maximum, valeurs par défaut utilisées.");
    }
    return {
      ratioMin,
      ratioMax,
      gainColor: elements.gainColor.value,
      lossColor: elements.lossColor.value,
      movingAverageColor: elements.movingAverageColor.value,
      movingAverageWidth: readNumber(elements.movingAverageWidth, { min: 1, max: 20 }),
      regionTrackHeight: readNumber(elements.regionTrackHeight, { min: 50, max: 2000, integer: true }),
      chromosomeTrackHeight: readNumber(elements.chromosomeTrackHeight, { min: 50, max: 2000, integer: true }),
      alignmentVisibilityWindow: readNumber(elements.alignmentWindow, { min: 1 }) * 1000,
      cnvPaddingFraction: readNumber(elements.paddingFraction, { min: 0 }) / 100,
      minCnvPadding: readNumber(elements.minPadding, { min: 0 }) * 1000,
    };
  }

  // ---------------------------------------------------------------------------
  // File selection
  // ---------------------------------------------------------------------------

  /** Sorts dropped/selected files by extension and updates the file list. */
  function addFiles(files) {
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.bam')) state.files.bam = file;
      else if (name.endsWith('.bai')) state.files.bai = file;
      else if (name.endsWith('.bed')) state.files.bed = file;
    }
    const { bam, bai, bed: bedFile } = state.files;
    elements.fileList.innerHTML = [['BAM', bam], ['BAI', bai], ['BED', bedFile]]
      .map(([kind, file]) => `<div class="${file ? 'ok' : ''}"><b>${kind}</b>${file ? escapeHtml(file.name) : 'non fourni'}</div>`)
      .join('');
    elements.goButton.disabled = !(bam && bai);
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  /** Human-readable genomic length. */
  function formatLength(bp) {
    if (bp >= 1e6) return `${(bp / 1e6).toFixed(2)} Mb`;
    if (bp >= 1e3) return `${(bp / 1e3).toFixed(0)} kb`;
    return `${bp} pb`;
  }

  const TYPE_LABELS = { gain: 'Gain', loss: 'Perte' };

  /** Second line of a CNV table row, e.g. "Perte · log2 -0.8236, z-score -13.18". */
  function describeCnv(cnv) {
    const type = TYPE_LABELS[cnv.type];
    const label = isNaN(parseFloat(cnv.label)) ? cnv.label : `log2 ${cnv.label}`;
    const zScore = cnv.zScore ? `${cnv.label ? ', ' : ''}z-score ${cnv.zScore}` : '';
    return (type ? `${type} · ` : '') + label + zScore;
  }

  /** Lists the CNVs; the coloured left border shows the type with the gain/loss track colours. */
  function renderCnvTable() {
    const { gainColor, lossColor } = readDisplaySettings();
    const typeColors = { gain: gainColor, loss: lossColor };
    elements.cnvTable.innerHTML = state.cnvs
      .map((cnv, i) => {
        const color = typeColors[cnv.type] || 'transparent';
        const conflict = cnv.typeConflict
          ? '<small class="conflict">Type du BED incohérent avec le signe du ratio log2</small>'
          : '';
        return (
          `<div data-i="${i}" class="${i === state.selectedCnv ? 'sel' : ''}" style="border-left-color:${color}">` +
          `<span>${escapeHtml(cnv.chrom)}:${cnv.start + 1}-${cnv.end}</span>` +
          `<span>${formatLength(cnv.end - cnv.start)}</span><small>${escapeHtml(describeCnv(cnv))}</small>${conflict}</div>`
        );
      })
      .join('');
  }

  /** Reads the BED with the selected coordinate convention and refreshes the CNV table. */
  async function loadCnvs() {
    const parsed = await bed.readCnvBed(state.files.bed, { coordinates: elements.bedCoordinates.value });
    state.cnvs = parsed ? parsed.cnvs : [];
    elements.bedInfo.textContent = parsed
      ? `${parsed.cnvs.length} CNV · coordonnées ${parsed.coordinateSystem} (${parsed.detectionReason}) · affichées en 1-based`
      : '';
    renderCnvTable();
  }

  // ---------------------------------------------------------------------------
  // Counting
  // ---------------------------------------------------------------------------

  /** Counts up to `maxChromosomes` chromosomes, reporting progress and refreshing the tracks. */
  async function countChromosomes(job, maxChromosomes) {
    await job.countNext(maxChromosomes, {
      onProgress: ({ chromosome, position, total, fraction }) =>
        setStatus(`Comptage ${chromosome} (${position}/${total}) : ${Math.round(fraction * 100)} %`),
      onCounted: ({ wasPrioritized, isLast }) => {
        if (wasPrioritized || isLast) scheduleRefresh();
      },
    });
    if (job === state.job && job.isComplete) {
      setStatus(`Comptage terminé en ${Math.round(job.elapsedSeconds)} s`);
    }
  }

  // ---------------------------------------------------------------------------
  // IGV tracks
  // ---------------------------------------------------------------------------

  const readMedianWindow = () => Math.max(1, Math.round(+elements.medianWindow.value) || 1);
  const readMovingAverageWindow = () => Math.round(+elements.movingAverageWindow.value) || 0;

  /** Queues a track reload after the ones already in progress (they must not overlap). */
  function scheduleRefresh() {
    if (!state.job || state.browsers.length !== 2) return;
    state.refreshChain = state.refreshChain
      .then(refreshRatioTracks)
      .catch((error) => setStatus(error.message || String(error)));
  }

  /** (Re)loads the log2 ratio tracks in both browsers from the counts available so far. */
  async function refreshRatioTracks() {
    const { job } = state;
    const { dataset } = job;
    dataset.median = coverage.computeMedianBinCount(dataset);

    const medianWindow = readMedianWindow();
    const movingAverageWindow = readMovingAverageWindow();
    const display = readDisplaySettings();
    const [chromosomeBrowser, regionBrowser] = state.browsers;

    const trackName =
      `log2 ratio (${dataset.binSize / 1000} kb` +
      `${medianWindow > 1 ? `, médiane ${medianWindow} bins` : ''}` +
      `${job.isComplete ? '' : ', provisoire'})`;

    const regionRatioTrack = {
      name: trackName,
      type: 'wig',
      format: 'bedgraph',
      url: new File([coverage.buildLog2Bedgraph(dataset, medianWindow)], 'log2ratio.bedgraph'),
      graphType: 'bar',
      autoscale: false,
      min: display.ratioMin,
      max: display.ratioMax,
      height: display.regionTrackHeight,
      order: 2,
      color: display.gainColor,
      altColor: display.lossColor,
    };

    const { min, max, ...withoutFixedScale } = regionRatioTrack;
    const pointsTrack = {
      ...withoutFixedScale,
      graphType: 'points',
      height: display.chromosomeTrackHeight,
      autoscale: true,
      alpha: 1,
    };

    const chromosomeTrack =
      movingAverageWindow > 1
        ? {
            type: 'merged',
            name: trackName,
            height: display.chromosomeTrackHeight,
            order: 2,
            autoscale: true,
            alpha: 1,
            tracks: [
              { ...pointsTrack, name: 'log2 ratio' },
              {
                name: `moyenne mobile (${movingAverageWindow} bins)`,
                type: 'wig',
                format: 'bedgraph',
                url: new File([coverage.buildMovingAverageBedgraph(dataset, movingAverageWindow)], 'moyenne_mobile.bedgraph'),
                graphType: 'line',
                color: display.movingAverageColor,
                lineWidth: display.movingAverageWidth,
                autoscale: true,
                alpha: 1,
              },
            ],
          }
        : pointsTrack;

    state.loadedTracks.forEach(([browser, track]) => browser.removeTrack(track));
    state.loadedTracks = [
      [chromosomeBrowser, await chromosomeBrowser.loadTrack(chromosomeTrack)],
      [regionBrowser, await regionBrowser.loadTrack({ ...regionRatioTrack })],
    ];
    if (state.alignmentTrackConfig) {
      const alignmentTrack = { ...state.alignmentTrackConfig, visibilityWindow: display.alignmentVisibilityWindow };
      state.loadedTracks.push([regionBrowser, await regionBrowser.loadTrack(alignmentTrack)]);
    }
  }

  /** Creates the two IGV browsers: whole chromosome, and CNV region with genes. */
  async function createBrowsers(genome, initialChromosome) {
    const geneTrack = {
      name: 'Gènes (RefSeq)',
      type: 'annotation',
      format: 'refgene',
      indexed: false,
      displayMode: 'EXPANDED',
      order: 3,
      url: CONFIG.geneTrackUrl(genome),
    };
    state.browsers.push(
      await igv.createBrowser(elements.chromosomeView, {
        genome,
        loadDefaultGenomeTracks: false,
        locus: initialChromosome || 'chr1',
        tracks: [],
      }),
    );
    state.browsers.push(
      await igv.createBrowser(elements.regionView, {
        genome,
        loadDefaultGenomeTracks: false,
        locus: 'chr1',
        tracks: [geneTrack],
      }),
    );
    // Some genome definitions still add the full RefSeq annotation track: remove it.
    for (const browser of state.browsers) {
      for (const track of browser.findTracks((t) => /refseq.*all/i.test(t.name || ''))) browser.removeTrack(track);
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /** Shows CNV number `i` in both browsers and counts its chromosome first. */
  function showCnv(i) {
    const cnv = state.cnvs[i];
    const [chromosomeBrowser, regionBrowser] = state.browsers;
    if (!cnv || !regionBrowser) return;

    state.selectedCnv = i;
    const { minCnvPadding, cnvPaddingFraction } = readDisplaySettings();
    const padding = Math.max(minCnvPadding, Math.round((cnv.end - cnv.start) * cnvPaddingFraction));
    regionBrowser.search(`${cnv.chrom}:${Math.max(1, cnv.start - padding)}-${cnv.end + padding}`);
    chromosomeBrowser.search(cnv.chrom);
    if (state.job) state.job.prioritize(cnv.chrom);
    elements.chromosome.value = cnv.chrom;
    document.querySelectorAll('#tbl div').forEach((row, k) => row.classList.toggle('sel', k === i));
  }

  // ---------------------------------------------------------------------------
  // Main action
  // ---------------------------------------------------------------------------

  async function visualise() {
    const genome = elements.genome.value;
    const binSize = Math.round(+elements.binSize.value * 1000);
    if (!(binSize >= CONFIG.minBinSize)) {
      setStatus('Indiquez une taille de bin en kb (0,1 ou plus).');
      return;
    }

    elements.goButton.disabled = true;
    setStatus('');
    state.browsers.forEach((browser) => igv.removeBrowser(browser));
    state.browsers = [];
    state.selectedCnv = -1;

    try {
      await loadCnvs();

      const firstCnv = state.cnvs[0];
      if (state.job) state.job.cancel();
      state.job = null;
      const job = await CoverageJob.create(state.files.bam, state.files.bai, {
        binSize,
        priorityChromosome: firstCnv && firstCnv.chrom,
        countOptions: readCountOptions(),
      });
      state.job = job;
      state.refreshChain = Promise.resolve();
      await countChromosomes(job, 1);

      state.alignmentTrackConfig = {
        name: state.files.bam.name,
        type: 'alignment',
        format: 'bam',
        url: state.files.bam,
        indexURL: state.files.bai,
        displayMode: 'SQUISHED',
        order: 4,
      };
      await createBrowsers(genome, firstCnv && firstCnv.chrom);
      state.loadedTracks = [];
      await refreshRatioTracks();

      countChromosomes(job, Infinity).catch((error) => setStatus(error.message || String(error)));
      if (firstCnv) {
        elements.chromosome.value = firstCnv.chrom;
        showCnv(0);
      }
    } catch (error) {
      setStatus(error.message || String(error));
    }
    elements.goButton.disabled = false;
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------

  elements.chromosome.innerHTML = chromosomes.PRIMARY_CHROMOSOMES.map((c) => `<option>${c}</option>`).join('');

  const { dropZone, fileInput } = elements;
  dropZone.onclick = () => fileInput.click();
  dropZone.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') fileInput.click();
  };
  dropZone.ondragover = (event) => {
    event.preventDefault();
    dropZone.classList.add('on');
  };
  dropZone.ondragleave = () => dropZone.classList.remove('on');
  dropZone.ondrop = (event) => {
    event.preventDefault();
    dropZone.classList.remove('on');
    addFiles([...event.dataTransfer.files]);
  };
  fileInput.onchange = () => addFiles([...fileInput.files]);

  elements.cnvTable.onclick = (event) => {
    const row = event.target.closest('div[data-i]');
    if (row) showCnv(+row.dataset.i);
  };

  elements.medianWindow.onchange = elements.movingAverageWindow.onchange = scheduleRefresh;

  elements.displaySettings.onchange = (event) => {
    const { refresh } = event.target.dataset;
    if (refresh === 'tracks') {
      scheduleRefresh();
      if (event.target.type === 'color') renderCnvTable();
    } else if (refresh === 'cnv' && state.selectedCnv >= 0) {
      showCnv(state.selectedCnv);
    }
  };

  elements.bedCoordinates.onchange = async () => {
    if (!state.files.bed) return;
    try {
      await loadCnvs();
      if (state.selectedCnv >= 0) showCnv(state.selectedCnv);
    } catch (error) {
      setStatus(error.message || String(error));
    }
  };

  elements.chromosome.onchange = (event) => {
    const [chromosomeBrowser] = state.browsers;
    if (!chromosomeBrowser) return;
    if (state.job) state.job.prioritize(event.target.value);
    chromosomeBrowser.search(event.target.value);
  };

  elements.goButton.onclick = visualise;
})();
