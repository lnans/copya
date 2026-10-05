import { useMemo } from "react"

import { OptionSelect } from "@/components/option-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { t } from "@/i18n/fr"
import type { AnnotationCatalog } from "@/lib/annotations/annotation-catalog"
import { segmentCnvTypeKey } from "@/lib/cnv/segment-cnv-type"
import { segmentCopyNumber } from "@/lib/cnv/segment-copy-number"
import {
  cytoBandsForSegment,
  formatCytoLocation,
  formatIscnSeq,
} from "@/lib/cnv/segment-cytoband"
import { binRangesByChrom, countBinsOverlappingSegment } from "@/lib/cnv/bins"
import {
  segmentGeneEntries,
  truncateGeneList,
  type SegmentGeneEntry,
} from "@/lib/cnv/segment-genes"
import { formatLog2 } from "@/lib/format"
import { HG38_CYTO_BANDS } from "@/lib/genome/cyto-band"
import type { Bins, Segment, SegmentClassification } from "@/lib/types"
import { cn } from "@/lib/utils"

const GENE_LIST_MAX_CHARS = 56

type SegmentsTableProps = {
  segments: Segment[]
  bins: Bins | null
  classifications: Record<string, SegmentClassification>
  notes: Record<string, string>
  refSeqCatalog: AnnotationCatalog | null
  clinGenCatalog: AnnotationCatalog | null
  selectedSegmentId: string | null
  onSelectSegment: (segment: Segment) => void
  onClassificationChange: (segmentId: string, value: SegmentClassification) => void
  onNotesChange: (segmentId: string, value: string) => void
}

function SegmentGeneNames({ genes }: { genes: SegmentGeneEntry[] | null }) {
  if (!genes) {
    return <span className="text-muted-foreground">—</span>
  }

  if (genes.length === 0) {
    return <span className="text-muted-foreground">—</span>
  }

  const { entries, truncated, fullLabel } = truncateGeneList(genes, GENE_LIST_MAX_CHARS)
  const content = (
    <span className="text-xs leading-snug">
      {entries.map((gene, i) => (
        <span key={gene.name}>
          {i > 0 ? ", " : null}
          <span className={gene.clinGen ? "font-medium text-(--cnv-clingen-orange)" : undefined}>
            {gene.name}
          </span>
        </span>
      ))}
      {truncated ? "…" : null}
    </span>
  )

  if (!truncated) return content

  return (
    <span className="underline decoration-dotted underline-offset-2" title={fullLabel}>
      {content}
    </span>
  )
}

function segmentBinCount(
  bins: Bins | null,
  chromRanges: readonly [number, number][] | null,
  segment: Segment
): number | null {
  if (bins && chromRanges) {
    return countBinsOverlappingSegment(bins, chromRanges, segment)
  }
  if (segment.bins !== undefined && Number.isFinite(segment.bins)) {
    return segment.bins
  }
  return null
}

export function SegmentsTable({
  segments,
  bins,
  classifications,
  notes,
  refSeqCatalog,
  clinGenCatalog,
  selectedSegmentId,
  onSelectSegment,
  onClassificationChange,
  onNotesChange,
}: SegmentsTableProps) {
  const chromBinRanges = useMemo(() => (bins ? binRangesByChrom(bins) : null), [bins])

  const segmentGenesById = useMemo(() => {
    if (!refSeqCatalog || !clinGenCatalog) return null
    const map = new Map<string, SegmentGeneEntry[]>()
    for (const segment of segments) {
      map.set(segment.id, segmentGeneEntries(refSeqCatalog, clinGenCatalog, segment))
    }
    return map
  }, [segments, refSeqCatalog, clinGenCatalog])

  if (segments.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.segments.empty}</p>
  }

  return (
    <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.segments.chromosome}</TableHead>
              <TableHead className="text-right">{t.segments.start}</TableHead>
              <TableHead className="text-right">{t.segments.stop}</TableHead>
              <TableHead>{t.segments.cytoband}</TableHead>
              <TableHead className="min-w-[10rem]">{t.segments.geneNames}</TableHead>
              <TableHead className="text-right">{t.segments.sizeBp}</TableHead>
              <TableHead>{t.segments.type}</TableHead>
              <TableHead className="text-right">{t.segments.bins}</TableHead>
              <TableHead className="text-right">{t.segments.meanLogRatio}</TableHead>
              <TableHead className="min-w-[14rem] font-mono text-xs">{t.segments.iscn}</TableHead>
              <TableHead>{t.segments.classification}</TableHead>
              <TableHead className="min-w-[8rem]">{t.segments.notes}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {segments.map((segment) => {
              const bands = cytoBandsForSegment(HG38_CYTO_BANDS, segment)
              const cytoLocation = formatCytoLocation(segment.chrom, bands)
              const copyNumber = segmentCopyNumber(segment)
              const iscn = formatIscnSeq(segment, cytoLocation, copyNumber)
              const sizeBp = segment.end - segment.start
              const cnvKey = segmentCnvTypeKey(segment)
              const binCount = segmentBinCount(bins, chromBinRanges, segment)

              return (
                <TableRow
                  key={segment.id}
                  data-state={segment.id === selectedSegmentId ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => onSelectSegment(segment)}
                >
                  <TableCell className="font-mono text-xs">{segment.chrom}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {(segment.start + 1).toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {segment.end.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{cytoLocation}</TableCell>
                  <TableCell>
                    <SegmentGeneNames genes={segmentGenesById?.get(segment.id) ?? null} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {sizeBp.toLocaleString("fr-FR")}
                  </TableCell>
                  <TableCell className="text-xs">{t.segmentCnvType[cnvKey]}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {binCount !== null ? binCount.toLocaleString("fr-FR") : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {formatLog2(segment.log2)}
                  </TableCell>
                  <TableCell className="max-w-[18rem] truncate font-mono text-[11px]" title={iscn}>
                    {iscn}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <OptionSelect
                      size="sm"
                      className="min-w-[8.5rem]"
                      aria-label={t.segments.classification}
                      value={classifications[segment.id] ?? "unset"}
                      options={t.segmentClassification}
                      onChange={(value) => onClassificationChange(segment.id, value)}
                    />
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <textarea
                      aria-label={t.segments.notes}
                      className={cn(
                        "field-sizing-content min-h-8 w-full min-w-[7rem] resize-y rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-xs",
                        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      )}
                      rows={1}
                      value={notes[segment.id] ?? ""}
                      onChange={(e) => onNotesChange(segment.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
  )
}
