/**
 * Checks that the extracted modules (js/lib) give exactly the same results as the
 * original single-file viewer ("shallow-cnv-viewer V7.html") on real data.
 *
 * Usage:
 *   npm run verify -- [--bam file.bam] [--bai file.bai] [--chromosomes chr7,chrX] [--bin 15000]
 *
 * By default it uses the first .bam/.bai/.bed files of the project folder and counts all
 * primary chromosomes. BED files of the folder are all compared.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const ORIGINAL_HTML = path.join(ROOT, 'shallow-cnv-viewer V7.html');
const LIB_FILES = ['chromosomes', 'bgzf', 'bai', 'bam', 'bed', 'coverage', 'coverage-job'];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const firstWithExtension = (ext) => {
    const file = fs.readdirSync(ROOT).find((f) => f.toLowerCase().endsWith(ext));
    return file && path.join(ROOT, file);
  };
  return {
    bam: get('bam') || firstWithExtension('.bam'),
    bai: get('bai') || firstWithExtension('.bai'),
    beds: fs.readdirSync(ROOT).filter((f) => f.endsWith('.bed')).map((f) => path.join(ROOT, f)),
    chromosomes: get('chromosomes') ? get('chromosomes').split(',') : null,
    binSize: +(get('bin') || 15000),
  };
}

/** Evaluates the original inline script with a stub DOM and returns its internal functions. */
function loadOriginal() {
  const html = fs.readFileSync(ORIGINAL_HTML, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const stubDocument = { querySelector: () => ({}), querySelectorAll: () => [] };
  const context = vm.createContext({
    pako: require('pako'),
    document: stubDocument,
    navigator: { hardwareConcurrency: 4 },
    performance,
    Blob,
    File,
    URL,
    TextDecoder,
    console,
  });
  vm.runInContext(
    `${script};globalThis.__original={inflate,readBai,readHeader,countRef,calcMed,mkBg,mkMA,parseBed,S};`,
    context,
  );
  return context.__original;
}

function loadRefactored() {
  globalThis.pako = require('pako');
  for (const name of LIB_FILES) require(path.join(ROOT, 'js', 'lib', `${name}.js`));
  return globalThis.ShallowCnv;
}

async function timed(label, fn) {
  const start = performance.now();
  const result = await fn();
  console.log(`  ${label}: ${((performance.now() - start) / 1000).toFixed(1)} s`);
  return result;
}

async function main() {
  const options = parseArgs();
  const original = loadOriginal();
  const lib = loadRefactored();
  const bamFile = await fs.openAsBlob(options.bam);
  const baiFile = await fs.openAsBlob(options.bai);

  console.log('BED files');
  for (const bedPath of options.beds) {
    original.S.bed = await fs.openAsBlob(bedPath);
    const expected = await original.parseBed();
    const bedFile = await fs.openAsBlob(bedPath);
    const toOriginalShape = (cnvs, startShift) =>
      cnvs.map((c) => ({ chr: c.chrom, s: c.start + startShift, e: c.end, n: c.label, z: c.zScore, v: c.score }));

    const asZeroBased = await lib.bed.readCnvBed(bedFile, { coordinates: '0-based' });
    assert.deepEqual(toOriginalShape(asZeroBased.cnvs, 0), Array.from(expected, (c) => ({ ...c })));

    const detected = await lib.bed.readCnvBed(bedFile);
    const shift = detected.coordinateSystem === '1-based' ? 1 : 0;
    assert.deepEqual(toOriginalShape(detected.cnvs, shift), Array.from(expected, (c) => ({ ...c })));
    const types = detected.cnvs.map((c) => `${c.type}${c.typeConflict ? '!' : ''}`).join(',');
    console.log(
      `  ${path.basename(bedPath)}: ${detected.cnvs.length} CNVs identical; ` +
        `detected ${detected.coordinateSystem} (${detected.detectionReason}); types ${types}`,
    );
  }

  console.log('BAI index');
  const expectedRanges = await original.readBai(baiFile);
  const actualRanges = await lib.bai.readBai(baiFile);
  assert.deepEqual(
    actualRanges.map((r) => r && { b: r.startOffset, e: r.endOffset }),
    Array.from(expectedRanges, (r) => r && { ...r }),
  );
  console.log(`  ${actualRanges.length} references identical`);

  console.log('BAM header');
  const expectedRefs = await original.readHeader(bamFile);
  const actualRefs = await lib.bam.readBamHeader(bamFile);
  assert.deepEqual(actualRefs.map((r) => ({ name: r.name, len: r.length })), Array.from(expectedRefs, (r) => ({ ...r })));
  console.log(`  ${actualRefs.length} references identical`);

  console.log(`Read counts (bin ${options.binSize} bp)`);
  const job = await lib.CoverageJob.create(bamFile, baiFile, { binSize: options.binSize });
  const dataset = job.dataset;
  const selected = job.queue.filter(
    (i) => !options.chromosomes || options.chromosomes.includes(dataset.references[i].displayName),
  );
  const originalRefs = expectedRefs.map((r, i) => ({
    ...r,
    rng: expectedRanges[i],
    nm: r.name.startsWith('chr') ? r.name : `chr${r.name}`,
  }));
  const originalData = {
    refs: originalRefs,
    cnt: originalRefs.map(() => new Uint32Array(0)),
    bin: options.binSize,
    med: 1,
    done: new Set(),
  };

  for (const index of selected) {
    const ref = dataset.references[index];
    const expected = Uint32Array.from(
      await timed(`${ref.displayName} original`, () =>
        original.countRef(bamFile, options.binSize, originalRefs[index], index, () => {}),
      ),
    );
    job.prioritize(ref.displayName);
    await timed(`${ref.displayName} refactored`, () => job.countNext(1));
    assert.deepEqual(dataset.counts[index], expected, `counts differ on ${ref.displayName}`);
    originalData.cnt[index] = expected;
    originalData.done.add(index);
    const total = expected.reduce((a, b) => a + b, 0);
    console.log(`  ${ref.displayName}: ${expected.length} bins, ${total} reads, identical`);
  }

  console.log('Median and bedGraph tracks');
  original.calcMed(originalData);
  dataset.median = lib.coverage.computeMedianBinCount(dataset);
  assert.equal(dataset.median, originalData.med);
  console.log(`  median bin count: ${dataset.median}, identical`);

  for (const window of [1, 5]) {
    const expected = await original.mkBg(originalData, window).text();
    assert.equal(lib.coverage.buildLog2Bedgraph(dataset, window), expected);
    console.log(`  log2 bedGraph, median window ${window}: ${expected.split('\n').length - 1} lines, identical`);
  }
  for (const window of [21]) {
    const expected = await original.mkMA(originalData, window).text();
    assert.equal(lib.coverage.buildMovingAverageBedgraph(dataset, window), expected);
    console.log(`  moving average bedGraph, window ${window}: identical`);
  }

  console.log('All checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
