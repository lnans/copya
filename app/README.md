# viewer-cnv

Offline CNV viewer for shallow WGS (GRCh38), built from [`../Requirements.md`](../Requirements.md).
The deliverable is a single `dist/viewer-cnv.html` that opens by double-click, with no server,
no CDN and no network request.

Stack: React + TypeScript, Vite + `vite-plugin-singlefile`, Tailwind CSS,
[shadcn/ui](https://ui.shadcn.com) (Base UI), [shadcn charts](https://ui.shadcn.com/docs/components/chart) (Recharts), Vitest.

## Commands

```bash
npm install
npm run dev      # dev server (no CSP, hot reload)
npm test         # unit tests (parsers, conversions, demo data)
npm run build    # type-check, build dist/viewer-cnv.html, run the offline check
```

### Bins file from a BAM

```bash
npm run bam-to-bins -- ../sample.bam                 # → ../sample.bins.15kb.bed
npm run bam-to-bins -- ../sample.bam --bin 100000 --mapq 20 --out /tmp/sample.bed
npm run bam-to-bins -- --help
```

Reads a coordinate-sorted BAM and its BAI (`sample.bam.bai` or `sample.bai`) without loading the
BAM in memory, and writes the file to load in **Fichier de bins**: `##` metadata lines, then
`chrom start end log2 reads` (0-based starts, empty bins omitted). Reads are counted by leftmost
position on chr1-22, X, Y, skipping MAPQ < 10 and flags `0xf04` (unmapped, secondary, QC fail,
duplicate, supplementary); log2 = log2(reads / median of non-empty autosome bins). The output is
identical to the previous viewer (`../js/lib`). The code is in `src/lib/bam/`, browser-compatible
for phase 2 (the CLI passes `node:zlib` as the DEFLATE decoder).

`npm run build` fails if `scripts/check-bundle.mjs` finds more than one output file, a missing
Content-Security-Policy, an external `src`/`href`/`url()`, or a network API (`fetch`,
`XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`…).

## Offline guarantees

- All JS, CSS, the Geist font and the parsing Web Worker are inlined in the HTML.
- The production build gets a CSP `<meta>` (see `vite.config.ts`): `default-src 'none'`,
  `connect-src 'none'`, only inline/`data:`/`blob:` sources.
- Patient data stays in memory; only the theme preference is stored (`localStorage`).
  **Effacer toutes les données** resets everything and terminates the worker.

## Rendering

The bin scatter plot (`GenomePlot`) is drawn on a Canvas 2D: 30 000 to 300 000 points are too many
for SVG. shadcn charts (Recharts, SVG) are used for aggregated views, e.g. the median log2 per
chromosome. Both read the same CSS variables (`--cnv-gain`, `--cnv-loss`, `--cnv-neutral`).

## Layout

```
src/
  App.tsx                         page: sample, files, genome view, summary, segments
  i18n/fr.ts                      all UI strings (add en.ts with the same shape)
  components/cnv/                 GenomePlot (canvas), ChromosomeSummaryChart, SegmentsTable
  components/ui/                  shadcn components (generated, `npx shadcn@latest add …`)
  lib/genome/hg38.ts              GRCh38 chromosome sizes, chr name normalisation
  lib/parse/table.ts              delimiter/header/column detection, bins and segments parsers
  lib/cnv/scale.ts                log2/ratio/copy number, mosaic theoretical lines, presets
  lib/demo.ts                     seeded synthetic sample (T21 30 % mosaic, 1p36 del, 22q11 dup…)
  workers/                        parsing Web Worker and its promise client
scripts/check-bundle.mjs          offline check of the built HTML
```

## Not done yet (MVP, see requirements)

- Column mapper screen (10-line preview, manual mapping, JSON format profiles). `sniff()` already
  returns the preview and guessed mapping.
- VCF segments, gzip input.
- Zoom/pan, coordinate or gene search, navigation history.
- Ideogram and annotations (cytoBand, RefSeq/MANE, ClinGen, DGV, local OMIM import).
- Table filters/sort, segment sheet, PNG/SVG/TSV export, printable report with SHA-256.
- Python synthetic data generator (`make_test_data.py`).
- Threshold presets are placeholders until the laboratory provides validated values.
