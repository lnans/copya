# Shallow genome CNV viewer

Browser app to review CNVs (copy number variants) called on shallow whole-genome sequencing
(e.g. by WisecondorX). It reads a BAM, its BAI index and an optional BED of CNVs, computes a
log2 copy-number ratio per bin, and displays it with [igv.js](https://github.com/igvteam/igv.js).

Everything runs locally in the browser: files are never uploaded.

## Usage

1. Open `index.html` in a recent browser (double-click works; an internet connection is needed
   for igv.js, pako, the reference genome and the gene annotation).
2. Drop the `.bam`, `.bam.bai` and optionally the CNV `.bed` on the drop zone.
3. Choose the genome (hg38 / hg19) and bin size, then click **Visualiser**.
4. Click a CNV in the list to zoom on it; use the chromosome selector for the whole-chromosome view.

Requirements: coordinate-sorted BAM with its BAI index.

## Views

- **Chromosome entier**: log2 ratio per bin (points) over the whole chromosome, optionally with a
  moving average line, to spot mosaic CNVs.
- **Région du CNV**: RefSeq genes, log2 ratio (bars, fixed scale) and the reads, around the selected CNV.

## Calculations

1. **Read counting** – for each chromosome (chr1–22, X, Y), reads are counted in fixed bins
   (default 15 kb) by their leftmost position. Only the chromosome's byte range is read from the
   BAM, located with the BAI index; BGZF blocks are decompressed in parallel in Web Workers.
   Reads are skipped if:
   - mapping quality < 10 (configurable);
   - unmapped (0x4, always), or secondary (0x100), QC fail (0x200), duplicate (0x400),
     supplementary (0x800) (each configurable).
2. **Normalisation** – reference value = median of the non-empty bins of the autosomes
   counted so far (assumed diploid).
3. **log2 ratio** – per bin: `log2(count / median)`; empty bins are left out.
   0 = 2 copies, −1 = 1 copy, +0.58 = 3 copies.
4. **Smoothing (optional)**
   - rolling median over *n* bins on the region track ("Lissage", 1 = none);
   - rolling mean over *n* bins drawn over the chromosome track ("Moyenne mobile", 0 = none).

   Windows are centred, truncated at chromosome ends, and ignore empty bins.

The chromosome of the first CNV is counted first; the others are counted in the background
(tracks are marked *provisoire* until all chromosomes are done, since the median may still move).
Selecting a CNV or chromosome moves it to the front of the queue.

## CNV BED file

Columns: `chrom start end [log2 ratio] [z-score] [type]`. `track`/`browser`/`#` lines and
header lines are ignored, `7` and `chr7` are both accepted.

- **Coordinates** – WisecondorX writes 1-based starts, standard BED is 0-based. The convention
  is detected (WisecondorX header, or starts ending in …001 and ends in …000) or can be forced
  in *Paramètres avancés*. Positions are displayed 1-based.
- **Type** – `gain`/`loss` (or `dup`/`amp`/`del`) from column 6, otherwise from the sign of the
  ratio. A warning is shown when both disagree.

## Settings

Main panel: genome, bin size, median smoothing, moving average.
*Paramètres avancés*: BED coordinates, read filters (applied at the next **Visualiser**),
and display (log2 scale, colours, track heights, read display window, margin around CNVs),
applied immediately. Defaults are the `value` attributes in `index.html`.

## Project layout

```
index.html               page layout and settings inputs
css/viewer.css           styles
js/app.js                UI and IGV integration (the only IGV-dependent file)
js/lib/bgzf.js           BGZF decompression, Web Worker pool
js/lib/bai.js            BAI index: byte range of each chromosome
js/lib/bam.js            BAM header, per-bin read counting
js/lib/bed.js            CNV BED parsing
js/lib/coverage.js       median, log2 ratio, smoothing, bedGraph export
js/lib/coverage-job.js   background counting queue
js/lib/chromosomes.js    chromosome naming
test/compare-with-original.cjs
shallow-cnv-viewer V7.html   original single-file version (reference)
```

`js/lib` has no DOM or IGV dependency (only `pako`) and also runs in Node.js.
`coverage.computeBinValues()` returns plain `{chrom, start, end, value}` rows, usable with any
charting library.

## Verification

```
npm install
npm run verify                               # all chromosomes, 15 kb bins
npm run verify -- --chromosomes chr7,chrX --bin 10000
```

Runs the original V7 functions and the new modules on the BAM/BAI/BED of the project folder
and checks that BED parsing, BAI/BAM parsing, read counts, median and bedGraph output are identical.

## Known limitations

- Unsorted BAMs and BAMs over 128 GiB are not supported.
- No GC-content or mappability correction; no reference panel (the sample is its own reference).
- Settings are not saved between sessions.
