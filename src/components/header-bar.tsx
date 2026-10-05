import { FolderOpenIcon, LayersIcon, ShieldCheckIcon } from "lucide-react"

import logoImage from "@/assets/logo.png"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { t } from "@/i18n/fr"

type HeaderBarProps = {
  onOpenSampleImport: () => void
  onOpenAnnotationsImport: () => void
}

export function HeaderBar({ onOpenSampleImport, onOpenAnnotationsImport }: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card/95 px-3 py-2 backdrop-blur supports-backdrop-filter:bg-card/90 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <img
            src={logoImage}
            alt=""
            role="presentation"
            className="h-7 w-auto max-w-[9rem] shrink-0 object-contain object-left sm:h-8 sm:max-w-[11rem] md:max-w-[12rem]"
            width={818}
            height={242}
            decoding="async"
          />
          <div className="min-w-0 border-l border-border pl-2 sm:pl-3">
            <h1 className="truncate text-[13px] font-semibold leading-tight tracking-tight sm:text-sm">
              {t.header.brandTitle}
            </h1>
            <p className="hidden max-w-[14rem] text-[10px] leading-snug text-muted-foreground sm:block sm:line-clamp-2 sm:max-w-none sm:text-[11px] lg:max-w-md">
              {t.header.brandSubtitle}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="secondary" className="hidden sm:inline-flex">
            <ShieldCheckIcon />
            {t.offlineBadge}
          </Badge>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t.header.importAnnotations}
                  onClick={onOpenAnnotationsImport}
                />
              }
            >
              <LayersIcon />
            </TooltipTrigger>
            <TooltipContent>{t.header.importAnnotations}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t.header.importSample}
                  onClick={onOpenSampleImport}
                />
              }
            >
              <FolderOpenIcon />
            </TooltipTrigger>
            <TooltipContent>{t.header.importSample}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  )
}
