#!/usr/bin/env node
/**
 * Export UCSC hg38 clinGenGeneDisease.bb → BED for the viewer.
 *
 *   node scripts/clingen-gene-disease-to-bed.mjs [input.bb] [output.bed]
 *
 * Source: https://hgdownload.soe.ucsc.edu/gbdb/hg38/bbi/clinGen/clinGenGeneDisease.bb
 *
 * BED columns: chrom, start, end, diseaseName, Classification, geneSymbol
 */
import { createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import { BigBed } from "@gmod/bbi"

const ROOT = join(import.meta.dirname, "..")
const input = process.argv[2] ?? join(ROOT, "files/clinGenGeneDisease.bb")
const output = process.argv[3] ?? join(ROOT, "public/annotations/clingen-gene-disease.bed")

const MAGIC = "# clinGenGeneDisease\tUCSC hg38 clinGenGeneDisease.bb"

const DISEASE_NAME_IDX = 0
const GENE_SYMBOL_IDX = 6
const CLASSIFICATION_IDX = 11

const RANK = {
  Definitive: 8,
  Strong: 7,
  Moderate: 6,
  Limited: 5,
  "Animal Model Only": 4,
  Disputed: 3,
  Refuted: 2,
  "No Known Disease Relationship": 1,
}

function stronger(a, b) {
  return (RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b
}

function bedField(s) {
  return s.replace(/\t/g, " ").trim()
}

async function main() {
  const file = new BigBed({ path: input })
  const header = await file.getHeader()
  const refs = Object.values(header.refsByNumber).sort((a, b) => a.id - b.id)

  /** @type {Map<string, { chrom: string, start: number, end: number, disease: string, gene: string, cls: string }>} */
  const byAssertion = new Map()
  for (const ref of refs) {
    const feats = await file.getFeatures(ref.name, 0, ref.length)
    for (const { start, end, rest } of feats) {
      const cols = rest.split("\t")
      const disease = cols[DISEASE_NAME_IDX]?.trim()
      const gene = cols[GENE_SYMBOL_IDX]?.trim()
      const cls = cols[CLASSIFICATION_IDX]?.trim()
      if (!disease || !gene || !cls || !RANK[cls]) continue
      const key = `${ref.name}\t${gene.toUpperCase()}\t${disease}`
      const prev = byAssertion.get(key)
      if (!prev) {
        byAssertion.set(key, { chrom: ref.name, start, end, disease, gene, cls })
        continue
      }
      prev.start = Math.min(prev.start, start)
      prev.end = Math.max(prev.end, end)
      prev.cls = stronger(prev.cls, cls)
    }
  }

  const lines = [MAGIC]
  for (const row of byAssertion.values()) {
    lines.push(
      `${row.chrom}\t${row.start}\t${row.end}\t${bedField(row.disease)}\t${row.cls}\t${bedField(row.gene)}`
    )
  }
  lines.sort((a, b) => {
    if (a.startsWith("#") || b.startsWith("#")) return a.startsWith("#") ? -1 : 1
    const [ca, sa, , diseaseA] = a.split("\t")
    const [cb, sb, , diseaseB] = b.split("\t")
    const ci = ca.localeCompare(cb)
    if (ci !== 0) return ci
    const si = Number(sa) - Number(sb)
    if (si !== 0) return si
    return diseaseA.localeCompare(diseaseB)
  })

  await mkdir(dirname(output), { recursive: true })
  await pipeline(Readable.from(lines.map((l) => `${l}\n`)), createWriteStream(output))
  console.log(
    `→ ${basename(output)} (${byAssertion.size.toLocaleString("fr-FR")} associations gène–maladie, depuis ${basename(input)})`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
