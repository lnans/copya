# viewer-cnv

CNV viewer for shallow WGS (GRCh38), built from [`Requirements.md`](Requirements.md).
Production build is a static site under `dist/` (`index.html`, hashed assets, and `annotations/` from `public/`).

Stack: React + TypeScript, Vite, Tailwind CSS,
[shadcn/ui](https://ui.shadcn.com) (Base UI), [shadcn charts](https://ui.shadcn.com/docs/components/chart) (Recharts), Vitest.

## Commands

```bash
yarn install
yarn dev          # dev server (no CSP, hot reload)
yarn test         # unit tests (parsers, conversions, demo data)
yarn build        # type-check + vite build → dist/ (includes public/annotations/)
yarn preview      # serve dist/ locally
```

### Deploy (static host, e.g. Azure Static Web Apps)

1. Place annotation files in `public/annotations/` (see `public/annotations/README.md`).
2. `yarn build`
3. Publish the **`dist/`** folder (includes `index.html`, `assets/`, and `annotations/`).

`staticwebapp.config.json` at the repo root is picked up by Azure SWA (SPA fallback, annotations excluded from rewrite).

Patient sample files (bins, BAM, segments) are still loaded only via the browser file picker; they are not uploaded by the static host.

### Bins file from a BAM

```bash
yarn bam-to-bins -- files/sample.bam              # → files/sample.bins.15kb.bed
yarn bam-to-bins -- files/sample.bam --bin 100000 --mapq 20 --out /tmp/sample.bed
yarn bam-to-bins -- --help
```

Reads a coordinate-sorted BAM and its BAI (`sample.bam.bai` or `sample.bai`) without loading the
BAM in memory, and writes the file to load in **Fichier de bins**: `##` metadata lines, then
`chrom start end log2 reads` (0-based starts, empty bins omitted). Reads are counted by leftmost
position on chr1-22, X, Y, skipping MAPQ < 10 and flags `0xf04` (unmapped, secondary, QC fail,
duplicate, supplementary); log2 = log2(reads / median of non-empty autosome bins). The output is
in `src/lib/bam/`, browser-compatible
for phase 2 (the CLI passes `node:zlib` as the DEFLATE decoder).

## Production build

- Bundled JS/CSS/fonts/workers under `dist/assets/`.
- Bundled annotation BED/gzip files under `dist/annotations/` (from `public/annotations/`).
- CSP `<meta>` on `index.html` (see `vite.config.ts`): same-origin scripts, styles, and `fetch` to `/annotations/*`.
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
public/annotations/               served as static files (ClinGen, RefSeq, DGV, …)
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
