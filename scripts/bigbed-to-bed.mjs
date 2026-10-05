#!/usr/bin/env node
/**
 * Export a UCSC BigBed (.bb) to tab-separated BED (12 columns when blocks are present).
 *
 *   node scripts/bigbed-to-bed.mjs [input.bb] [output.bed]
 */
import { createWriteStream } from "node:fs"
import { mkdir } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import { BigBed } from "@gmod/bbi"

const ROOT = join(import.meta.dirname, "..")
const input = process.argv[2] ?? join(ROOT, "files/dgvGold.bb")
const output = process.argv[3] ?? join(ROOT, "public/annotations/dgv-gold.bed")

/** BED columns 4–12: name … chromStarts (9 fields). Extra autoSql fields are dropped. */
const BED_EXTRA_FIELDS = 9

function featureToBedLine(chrom, start, end, rest) {
  const cols = rest.split("\t")
  const name = cols[0] ?? "."
  if (cols.length < BED_EXTRA_FIELDS) {
    return `${chrom}\t${start}\t${end}\t${name}`
  }
  const bed = `${chrom}\t${start}\t${end}\t${cols.slice(0, BED_EXTRA_FIELDS).join("\t")}`
  const variantType = cols[10]
  const variantSubType = cols[11]
  if (variantType !== undefined && variantSubType !== undefined) {
    return `${bed}\t${variantType}\t${variantSubType}`
  }
  return bed
}

async function main() {
  const file = new BigBed({ path: input })
  const header = await file.getHeader()
  const refs = Object.values(header.refsByNumber).sort((a, b) => a.id - b.id)

  let count = 0
  const lines = []
  for (const ref of refs) {
    const feats = await file.getFeatures(ref.name, 0, ref.length)
    for (const { start, end, rest } of feats) {
      lines.push(featureToBedLine(ref.name, start, end, rest))
      count++
    }
  }
  lines.sort((a, b) => {
    const [ca, sa] = a.split("\t")
    const [cb, sb] = b.split("\t")
    const ci = ca.localeCompare(cb)
    if (ci !== 0) return ci
    return Number(sa) - Number(sb)
  })

  await mkdir(dirname(output), { recursive: true })
  await pipeline(Readable.from(lines.map((l) => `${l}\n`)), createWriteStream(output))
  console.log(`→ ${basename(output)} (${count.toLocaleString("fr-FR")} lignes, depuis ${basename(input)})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
