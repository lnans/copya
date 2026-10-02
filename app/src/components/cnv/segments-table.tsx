import { OptionSelect } from "@/components/option-select"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { t } from "@/i18n/fr"
import { formatLocation, formatLog2, formatSize } from "@/lib/format"
import type { ReviewStatus, Segment } from "@/lib/types"
import { cn } from "@/lib/utils"

type SegmentsTableProps = {
  segments: Segment[]
  statuses: Record<string, ReviewStatus>
  selectedSegmentId: string | null
  onSelectSegment: (segment: Segment) => void
  onStatusChange: (segmentId: string, status: ReviewStatus) => void
}

export function SegmentsTable({
  segments,
  statuses,
  selectedSegmentId,
  onSelectSegment,
  onStatusChange,
}: SegmentsTableProps) {
  if (segments.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.segments.empty}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t.segments.location}</TableHead>
          <TableHead>{t.segments.band}</TableHead>
          <TableHead className="text-right">{t.segments.size}</TableHead>
          <TableHead>{t.segments.type}</TableHead>
          <TableHead className="text-right">{t.segments.log2}</TableHead>
          <TableHead className="text-right">{t.segments.bins}</TableHead>
          <TableHead className="text-right">{t.segments.mosaic}</TableHead>
          <TableHead>{t.segments.status}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {segments.map((segment) => (
          <TableRow
            key={segment.id}
            data-state={segment.id === selectedSegmentId ? "selected" : undefined}
            className="cursor-pointer"
            onClick={() => onSelectSegment(segment)}
          >
            <TableCell className="font-mono text-xs">
              {formatLocation(segment.chrom, segment.start, segment.end)}
            </TableCell>
            <TableCell className="text-muted-foreground">—</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatSize(segment.end - segment.start)}
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={cn(
                  segment.type === "gain" && "border-(--cnv-gain) text-(--cnv-gain)",
                  segment.type === "loss" && "border-(--cnv-loss) text-(--cnv-loss)"
                )}
              >
                {t.cnvType[segment.type]}
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatLog2(segment.log2)}</TableCell>
            <TableCell className="text-right tabular-nums">{segment.bins ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {segment.mosaicPercent !== undefined ? `${Math.round(segment.mosaicPercent)} %` : "—"}
            </TableCell>
            <TableCell onClick={(event) => event.stopPropagation()}>
              <OptionSelect
                size="sm"
                aria-label={t.segments.status}
                value={statuses[segment.id] ?? "to_review"}
                options={t.reviewStatus}
                onChange={(status) => onStatusChange(segment.id, status)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
