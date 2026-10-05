import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { t } from "@/i18n/fr"

type AnnotationsLoadingOverlayProps = {
  label: string | null
  index: number
  total: number
  error: string | null
  onRetry: () => void
}

export function AnnotationsLoadingOverlay({
  label,
  index,
  total,
  error,
  onRetry,
}: AnnotationsLoadingOverlayProps) {
  const overall = total > 0 ? Math.min(1, index / total) : 0
  const percent = total > 0 ? Math.round(overall * 100) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy={!error}
    >
      <div className="mx-4 w-full max-w-md rounded-xl border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          {!error ? (
            <Loader2Icon className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
          ) : null}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-foreground">
              {error ? t.files.bundledAnnotationsLoadFailed : t.files.bundledAnnotationsLoadingTitle}
            </p>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t.files.bundledAnnotationsLoadingHint}</p>
                {label ? (
                  <p className="text-sm text-muted-foreground">
                    {t.files.bundledAnnotationsLoadingStep(label, index + 1, total)}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
        {!error ? (
          <>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">{percent} %</p>
          </>
        ) : (
          <Button type="button" className="mt-5 w-full" onClick={onRetry}>
            {t.files.bundledAnnotationsRetry}
          </Button>
        )}
      </div>
    </div>
  )
}
