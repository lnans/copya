import { Loader2Icon } from "lucide-react"

import { t } from "@/i18n/fr"
import type { ChromName } from "@/lib/genome/hg38"
import { shortChromLabel } from "@/lib/genome/hg38"

type BamConversionOverlayProps = {
  chrom: ChromName | null
  index: number
  total: number
  fraction: number
  phase?: "header"
}

export function BamConversionOverlay({ chrom, index, total, fraction, phase }: BamConversionOverlayProps) {
  const overall = total > 0 ? Math.min(1, (index + fraction) / total) : 0
  const percent = total > 0 ? Math.round(overall * 100) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <Loader2Icon className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground">{t.files.bamConvertingTitle}</p>
            <p className="text-sm text-muted-foreground">{t.files.bamConvertingHint}</p>
            {phase === "header" && total === 0 && (
              <p className="text-sm text-muted-foreground">{t.files.bamConvertingHeader}</p>
            )}
            {chrom && total > 0 && (
              <p className="text-sm text-muted-foreground">
                {t.files.bamConvertingChrom(shortChromLabel(chrom), index + 1, total)}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">{percent} %</p>
      </div>
    </div>
  )
}
