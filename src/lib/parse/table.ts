import { guessValueScale, ratioToLog2, type ValueScale } from "@/lib/cnv/scale"
import { CHROM_INDEX, normalizeChrom } from "@/lib/genome/hg38"
import type { Bins, CnvType, Segment } from "@/lib/types"

export type Field =
  | "chrom"
  | "start"
  | "end"
  | "value"
  | "bins"
  | "copyNumber"
  | "mosaic"
  | "type"

export type ColumnMapping = Partial<Record<Field, number>>

export type Delimiter = "\t" | "," | ";" | "whitespace"

export type Sniffed = {
  delimiter: Delimiter
  hasHeader: boolean
  columns: string[]
  mapping: ColumnMapping
  /** First data rows, for the column mapper preview. */
  preview: string[][]
}

export type ParseOptions = Omit<Sniffed, "preview"> & {
  valueScale: ValueScale | "auto"
  /** WisecondorX writes 1-based starts; BED is 0-based. */
  oneBasedStart: boolean | "auto"
}

export type ParseErrorCode =
  | "empty_file"
  | "missing_column"
  | "not_numeric"
  | "no_rows"

export class ParseError extends Error {
  readonly code: ParseErrorCode
  /** 1-based line number in the source file. */
  readonly line?: number
  readonly column?: string

  constructor(
    code: ParseErrorCode,
    details: { line?: number; column?: string } = {}
  ) {
    super(
      `${code}${details.line ? ` (line ${details.line})` : ""}${details.column ? ` [${details.column}]` : ""}`
    )
    this.name = "ParseError"
    this.code = code
    this.line = details.line
    this.column = details.column
  }
}

const COLUMN_SYNONYMS: Record<Field, string[]> = {
  chrom: ["chrom", "chr", "chromosome", "seqname", "seqnames", "contig"],
  start: ["start", "begin", "pos", "position", "chromstart", "startpos", "locstart"],
  end: ["end", "stop", "chromend", "endpos", "locend"],
  value: [
    "log2",
    "log2ratio",
    "log2r",
    "logr",
    "log2copyratio",
    "segmean",
    "ratio",
    "copyratio",
    "mean",
    "value",
  ],
  bins: ["bins", "nbins", "numbins", "nprobes", "numprobes", "nummark", "nbin"],
  copyNumber: ["cn", "copynumber", "correctedcopynumber", "copies"],
  mosaic: [
    "mosaic",
    "mosaicism",
    "mosaicpercent",
    "mosaicfraction",
    "cellfraction",
    "subclonefraction",
  ],
  type: ["type", "call", "event", "svtype", "status"],
}

const PREVIEW_ROWS = 10
const SNIFF_LINES = 20

function normalizeHeader(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function isNumeric(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "" && Number.isFinite(Number(value))
}

function splitLine(line: string, delimiter: Delimiter): string[] {
  return delimiter === "whitespace" ? line.trim().split(/\s+/) : line.split(delimiter)
}

type Line = { lineNo: number; text: string }

/**
 * Yields meaningful lines: blank lines, UCSC `track`/`browser` lines and
 * `##` meta lines are skipped. A leading `#` (e.g. `#CHROM`) is kept so the
 * header can be recognised; later `#` lines are comments.
 */
function* meaningfulLines(text: string): Generator<Line> {
  let first = true
  let lineNo = 0
  let pos = 0
  while (pos <= text.length) {
    let next = text.indexOf("\n", pos)
    if (next === -1) next = text.length
    let line = text.slice(pos, next)
    if (line.endsWith("\r")) line = line.slice(0, -1)
    pos = next + 1
    lineNo++
    if (line.trim() === "") continue
    if (/^(track|browser)\b/.test(line) || line.startsWith("##")) continue
    if (line.startsWith("#")) {
      if (!first) continue
      line = line.slice(1)
    }
    first = false
    yield { lineNo, text: line }
  }
}

function detectDelimiter(lines: string[]): Delimiter {
  const candidates: Delimiter[] = ["\t", ",", ";", "whitespace"]
  for (const delimiter of candidates) {
    const counts = lines.map((l) => splitLine(l, delimiter).length)
    if (counts[0] >= 3 && counts.every((c) => c === counts[0])) return delimiter
  }
  return "\t"
}

export function guessMapping(columns: string[]): ColumnMapping {
  const normalized = columns.map(normalizeHeader)
  const mapping: ColumnMapping = {}
  const used = new Set<number>()
  for (const field of Object.keys(COLUMN_SYNONYMS) as Field[]) {
    for (const synonym of COLUMN_SYNONYMS[field]) {
      const index = normalized.findIndex((n, i) => n === synonym && !used.has(i))
      if (index !== -1) {
        mapping[field] = index
        used.add(index)
        break
      }
    }
  }
  return mapping
}

/** Detects delimiter, header and column roles from the first lines of a file. */
export function sniff(text: string): Sniffed {
  const lines: string[] = []
  for (const { text: line } of meaningfulLines(text)) {
    lines.push(line)
    if (lines.length >= SNIFF_LINES) break
  }
  if (lines.length === 0) throw new ParseError("empty_file")

  const delimiter = detectDelimiter(lines)
  const rows = lines.map((l) => splitLine(l, delimiter))
  const hasHeader = !isNumeric(rows[0][1]) || !isNumeric(rows[0][2])
  const width = rows[0].length
  const columns = hasHeader
    ? rows[0].map((c) => c.trim())
    : Array.from({ length: width }, (_, i) => `col${i + 1}`)

  let mapping: ColumnMapping = hasHeader ? guessMapping(columns) : {}
  if (mapping.chrom === undefined || mapping.start === undefined || mapping.end === undefined) {
    // BED-like: chrom, start, end, value.
    mapping = { chrom: 0, start: 1, end: 2, ...(width > 3 ? { value: 3 } : {}), ...mapping }
  }

  return {
    delimiter,
    hasHeader,
    columns,
    mapping,
    preview: rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + PREVIEW_ROWS),
  }
}

export function defaultParseOptions(sniffed: Sniffed): ParseOptions {
  const { delimiter, hasHeader, columns, mapping } = sniffed
  return { delimiter, hasHeader, columns, mapping, valueScale: "auto", oneBasedStart: "auto" }
}

type RawRow = {
  lineNo: number
  chrom: string
  start: number
  end: number
  fields: string[]
}

function* dataRows(text: string, options: ParseOptions): Generator<RawRow> {
  const { mapping, columns } = options
  for (const field of ["chrom", "start", "end"] as const) {
    if (mapping[field] === undefined) throw new ParseError("missing_column", { column: field })
  }
  const chromCol = mapping.chrom!
  const startCol = mapping.start!
  const endCol = mapping.end!

  let skipHeader = options.hasHeader
  for (const { lineNo, text: line } of meaningfulLines(text)) {
    if (skipHeader) {
      skipHeader = false
      continue
    }
    const fields = splitLine(line, options.delimiter)
    const start = Number(fields[startCol])
    const end = Number(fields[endCol])
    if (!Number.isInteger(start)) {
      throw new ParseError("not_numeric", { line: lineNo, column: columns[startCol] })
    }
    if (!Number.isInteger(end)) {
      throw new ParseError("not_numeric", { line: lineNo, column: columns[endCol] })
    }
    yield { lineNo, chrom: fields[chromCol] ?? "", start, end, fields }
  }
}

function parseFloatOrNaN(value: string | undefined): number {
  if (value === undefined) return Number.NaN
  const trimmed = value.trim()
  return trimmed === "" ? Number.NaN : Number(trimmed)
}

function looksOneBased(starts: ArrayLike<number>, ends: ArrayLike<number>): boolean {
  let votes = 0
  const n = Math.min(starts.length, 1000)
  for (let i = 0; i < n; i++) {
    if (starts[i] % 1000 === 1 && ends[i] % 1000 === 0) votes++
  }
  return n > 0 && votes / n > 0.9
}

export type BinsResult = { bins: Bins; skippedContigs: number }

export function parseBins(text: string, options: ParseOptions): BinsResult {
  const chromIndex: number[] = []
  const starts: number[] = []
  const ends: number[] = []
  const values: number[] = []
  let skippedContigs = 0
  const valueCol = options.mapping.value

  for (const row of dataRows(text, options)) {
    const chrom = normalizeChrom(row.chrom)
    if (chrom === null) {
      skippedContigs++
      continue
    }
    chromIndex.push(CHROM_INDEX.get(chrom)!)
    starts.push(row.start)
    ends.push(row.end)
    values.push(valueCol === undefined ? Number.NaN : parseFloatOrNaN(row.fields[valueCol]))
  }
  if (starts.length === 0) throw new ParseError("no_rows")

  const oneBased =
    options.oneBasedStart === "auto" ? looksOneBased(starts, ends) : options.oneBasedStart
  const scale = options.valueScale === "auto" ? guessValueScale(values) : options.valueScale

  const order = Array.from(starts.keys()).sort(
    (a, b) => chromIndex[a] - chromIndex[b] || starts[a] - starts[b]
  )
  const n = order.length
  const bins: Bins = {
    length: n,
    chromIndex: new Uint8Array(n),
    start: new Uint32Array(n),
    end: new Uint32Array(n),
    log2: new Float32Array(n),
  }
  order.forEach((src, i) => {
    bins.chromIndex[i] = chromIndex[src]
    bins.start[i] = oneBased ? starts[src] - 1 : starts[src]
    bins.end[i] = ends[src]
    bins.log2[i] = scale === "ratio" ? ratioToLog2(values[src]) : values[src]
  })
  return { bins, skippedContigs }
}

function parseCnvType(raw: string | undefined, log2: number): CnvType {
  if (raw) {
    if (/gain|dup|amp/i.test(raw)) return "gain"
    if (/loss|del/i.test(raw)) return "loss"
  }
  if (log2 > 0) return "gain"
  if (log2 < 0) return "loss"
  return "unknown"
}

export type SegmentsResult = { segments: Segment[]; skippedContigs: number }

export function parseSegments(text: string, options: ParseOptions): SegmentsResult {
  const { mapping } = options
  const rows: { row: RawRow; chrom: NonNullable<ReturnType<typeof normalizeChrom>> }[] = []
  let skippedContigs = 0
  for (const row of dataRows(text, options)) {
    const chrom = normalizeChrom(row.chrom)
    if (chrom === null) skippedContigs++
    else rows.push({ row, chrom })
  }
  if (rows.length === 0) throw new ParseError("no_rows")

  const oneBased =
    options.oneBasedStart === "auto"
      ? looksOneBased(
          rows.map((r) => r.row.start),
          rows.map((r) => r.row.end)
        )
      : options.oneBasedStart
  const rawValues = rows.map(({ row }) =>
    mapping.value === undefined ? Number.NaN : parseFloatOrNaN(row.fields[mapping.value])
  )
  const scale = options.valueScale === "auto" ? guessValueScale(rawValues) : options.valueScale

  const segments = rows.map(({ row, chrom }, i): Segment => {
    const pick = (field: Field) => {
      const col = mapping[field]
      return col === undefined ? undefined : row.fields[col]
    }
    const copyNumber = parseFloatOrNaN(pick("copyNumber"))
    let log2 = scale === "ratio" ? ratioToLog2(rawValues[i]) : rawValues[i]
    if (!Number.isFinite(log2) && Number.isFinite(copyNumber)) {
      log2 = Math.log2(copyNumber / 2)
    }
    const bins = parseFloatOrNaN(pick("bins"))
    const mosaic = parseFloatOrNaN(pick("mosaic"))
    return {
      id: `seg-${i + 1}`,
      chrom,
      start: oneBased ? row.start - 1 : row.start,
      end: row.end,
      log2,
      type: parseCnvType(pick("type"), log2),
      ...(Number.isFinite(bins) ? { bins } : {}),
      ...(Number.isFinite(copyNumber) ? { copyNumber } : {}),
      ...(Number.isFinite(mosaic) ? { mosaicPercent: mosaic <= 1 ? mosaic * 100 : mosaic } : {}),
    }
  })
  segments.sort(
    (a, b) => CHROM_INDEX.get(a.chrom)! - CHROM_INDEX.get(b.chrom)! || a.start - b.start
  )
  return { segments, skippedContigs }
}
