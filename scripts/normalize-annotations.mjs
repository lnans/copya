#!/usr/bin/env node
/**
 * Decompress UCSC/gnomAD downloads in files/ into canonical names in the same folder.
 *
 *   node scripts/normalize-annotations.mjs
 */
import { createReadStream, createWriteStream, existsSync } from "node:fs"
import { mkdir, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { spawn } from "node:child_process"
import { createGunzip } from "node:zlib"
import { pipeline } from "node:stream/promises"

const ROOT = join(import.meta.dirname, "..")
const SRC = join(ROOT, "files")
const DEST = join(ROOT, "files")

/** Source filename in files/ → canonical output name (also in files/) */
const MAP = [
  ["dgvSupporting.txt.gz", "dgv-supp.txt"],
  ["dgvSupporting.txt", "dgv-supp.txt"],
  ["ncbiRefSeq.txt.gz", "refseq.gp.txt"],
  ["ncbiRefSeq.txt", "refseq.gp.txt"],
  ["gnomad.v4.1.sv.sites.bed.gz", "gnomad-sv.bed"],
  ["gnomad.v4.1.sv.sites.bed", "gnomad-sv.bed"],
  ["omimGene2.bed", "omim.bed"],
  ["omim.bed", "omim.bed"],
]

async function copyPlain(src, dest) {
  await pipeline(createReadStream(src), createWriteStream(dest))
}

async function gunzipTo(src, dest) {
  await pipeline(createReadStream(src), createGunzip(), createWriteStream(dest))
}

function runScript(scriptName, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, "scripts", scriptName), ...args], {
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${scriptName} exit ${code}`))
    )
  })
}

async function main() {
  await mkdir(DEST, { recursive: true })
  let done = 0

  const dgvGoldBb = join(SRC, "dgvGold.bb")
  const dgvGoldBed = join(DEST, "dgv-gold.bed")
  if (existsSync(dgvGoldBb)) {
    await runScript("bigbed-to-bed.mjs", dgvGoldBb, dgvGoldBed)
    const { size } = await stat(dgvGoldBed)
    console.log(`  ${(size / 1e6).toFixed(1)} MB`)
    done++
  }

  const clinGenBb = join(SRC, "clinGenGeneDisease.bb")
  const clinGenBed = join(DEST, "clingen-gene-disease.bed")
  if (existsSync(clinGenBb)) {
    await runScript("clingen-gene-disease-to-bed.mjs", clinGenBb, clinGenBed)
    const { size } = await stat(clinGenBed)
    console.log(`  ${(size / 1e6).toFixed(1)} MB`)
    done++
  }

  for (const [from, to] of MAP) {
    const src = join(SRC, from)
    const dest = join(DEST, to)
    if (!existsSync(src)) continue
    if (from.endsWith(".gz")) {
      console.log(`→ ${basename(dest)} (from ${from})`)
      await gunzipTo(src, dest)
    } else {
      console.log(`→ ${basename(dest)} (copy)`)
      await copyPlain(src, dest)
    }
    const { size } = await stat(dest)
    console.log(`  ${(size / 1e6).toFixed(1)} MB`)
    done++
  }
  if (done === 0) {
    console.log("No files in files/ matched the expected names. See files/README.md")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
