// Builds the viewer's bins file (BED-like, log2 per bin) from a BAM and its BAI.
//   npm run bam-to-bins -- sample.bam [--bai sample.bam.bai] [--bin 15000] [--mapq 10]
//                                     [--exclude-flags 0xf04] [--out sample.bins.15kb.bed]
import { existsSync, openAsBlob } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { basename } from "node:path"
import { parseArgs, promisify } from "node:util"
import { inflateRaw as zlibInflateRaw } from "node:zlib"

import {
  bamToBins,
  binRows,
  formatBinsFile,
} from "../src/lib/bam/bam-to-bins.ts"
import {
  DEFAULT_EXCLUDED_FLAGS,
  DEFAULT_MIN_MAPPING_QUALITY,
} from "../src/lib/bam/bam.ts"

const USAGE = `Usage: yarn bam-to-bins -- <file.bam> [options]

Options:
  --bai <path>            BAM index (default: <file.bam>.bai, then <file>.bai)
  --bin <bp>              bin size in bp (default: 15000)
  --mapq <n>              minimum mapping quality (default: ${DEFAULT_MIN_MAPPING_QUALITY})
  --exclude-flags <mask>  SAM flags to skip (default: 0x${DEFAULT_EXCLUDED_FLAGS.toString(16)})
  --out <path>            output file (default: <file>.bins.<bin>kb.bed next to the BAM)
  -h, --help`

function fail(message: string): never {
  console.error(`Erreur : ${message}\n\n${USAGE}`)
  process.exit(1)
}

function positiveInteger(raw: string, name: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0)
    fail(`--${name} doit être un entier positif (reçu « ${raw} »)`)
  return value
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    bai: { type: "string" },
    bin: { type: "string", default: "15000" },
    mapq: { type: "string", default: String(DEFAULT_MIN_MAPPING_QUALITY) },
    "exclude-flags": {
      type: "string",
      default: `0x${DEFAULT_EXCLUDED_FLAGS.toString(16)}`,
    },
    out: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
})

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}

const bamPath = positionals[0]
if (!bamPath) fail("fichier BAM manquant")
if (!existsSync(bamPath)) fail(`BAM introuvable : ${bamPath}`)

const baiPath =
  values.bai ??
  [`${bamPath}.bai`, bamPath.replace(/\.bam$/i, ".bai")].find((p) =>
    existsSync(p)
  )
if (!baiPath || !existsSync(baiPath))
  fail(`index BAI introuvable pour ${bamPath} (utiliser --bai)`)

const binSize = positiveInteger(values.bin, "bin")
if (binSize === 0) fail("--bin doit être supérieur à 0")
const minMappingQuality = positiveInteger(values.mapq, "mapq")
const excludedFlags = positiveInteger(values["exclude-flags"], "exclude-flags")
const binLabel = binSize % 1000 === 0 ? `${binSize / 1000}kb` : `${binSize}bp`
const outPath =
  values.out ?? `${bamPath.replace(/\.bam$/i, "")}.bins.${binLabel}.bed`

const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
)
const inflateAsync = promisify(zlibInflateRaw)
const startTime = performance.now()
let lastChrom = ""

console.error(
  `BAM ${bamPath}\nBAI ${baiPath}\nbins de ${binSize} pb, MAPQ ≥ ${minMappingQuality}`
)

const bai = await readFile(baiPath)
const result = await bamToBins(
  await openAsBlob(bamPath),
  bai.buffer.slice(bai.byteOffset, bai.byteOffset + bai.byteLength),
  {
    binSize,
    minMappingQuality,
    excludedFlags,
    inflateRaw: (bytes) => inflateAsync(bytes),
    onChromosome: ({ chrom, index, total }) => {
      if (chrom === lastChrom) return
      lastChrom = chrom
      console.error(`  ${String(index + 1).padStart(2)}/${total} ${chrom}`)
    },
  }
).catch((error: Error) => fail(error.message))

const rows = [...binRows(result.chromosomes, binSize, result.median)]
await writeFile(
  outPath,
  formatBinsFile(rows, {
    source: basename(bamPath),
    binSize,
    median: result.median,
    minMappingQuality,
    excludedFlags,
    version,
  })
)

const seconds = ((performance.now() - startTime) / 1000).toFixed(1)
console.error(
  `✓ ${rows.length.toLocaleString("fr-FR")} bins → ${outPath} (médiane ${result.median} reads/bin, ${seconds} s)`
)
