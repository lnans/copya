import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { t } from "@/i18n/fr"
import type { AnnotationCatalog } from "@/lib/annotations/annotation-catalog"
import { lookupRefSeqGeneSymbol } from "@/lib/annotations/refseq-gene-lookup"
import { formatRegionField, parseRegionField } from "@/lib/cnv/parse-region"
import { chromLength } from "@/lib/cnv/gene-region"
import { clampViewport, type BpViewport } from "@/lib/cnv/viewport"
import type { ChromName } from "@/lib/genome/hg38"
import type { GeneRegion } from "@/lib/types"

type GeneRegionControlsProps = {
  chrom: ChromName
  /** Settled visible range (after pan end / scroll debounce). */
  viewport: BpViewport | null
  refSeqCatalog: AnnotationCatalog | null
  onApply: (region: GeneRegion) => void
}

export function GeneRegionControls({ chrom, viewport, refSeqCatalog, onApply }: GeneRegionControlsProps) {
  const [value, setValue] = useState("")
  const [geneQuery, setGeneQuery] = useState("")
  const editingRef = useRef(false)

  useEffect(() => {
    if (editingRef.current || !viewport) return
    setValue(formatRegionField(chrom, viewport.start, viewport.end))
  }, [chrom, viewport])

  const apply = () => {
    const parsed = parseRegionField(value)
    if (!parsed) {
      toast.error(t.genome.regionInvalid)
      return
    }
    const length = chromLength(parsed.chrom)
    const clamped = clampViewport(parsed.start, parsed.end, length)
    editingRef.current = false
    onApply({ chrom: parsed.chrom, start: clamped.start, end: clamped.end })
  }

  const goToGene = () => {
    if (!refSeqCatalog) {
      toast.error(t.genome.geneSymbolNotLoaded)
      return
    }
    const result = lookupRefSeqGeneSymbol(refSeqCatalog, geneQuery)
    if (!result.ok) {
      if (result.code === "ambiguous") {
        toast.error(t.genome.geneSymbolAmbiguous(result.chroms?.join(", ") ?? ""))
      } else if (result.code === "not_found") {
        toast.error(t.genome.geneSymbolNotFound)
      }
      return
    }
    setGeneQuery(result.symbol)
    onApply(result.region)
  }

  return (
    <div className="grid gap-4">
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <Label htmlFor="gene-region-field">{t.genome.regionField}</Label>
        <Input
          id="gene-region-field"
          className="font-mono text-sm"
          placeholder={t.genome.regionPlaceholder}
          value={value}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => {
            editingRef.current = true
          }}
          onBlur={() => {
            editingRef.current = false
          }}
        />
      </div>
      <Button type="submit" variant="secondary" size="sm">
        {t.genome.regionGo}
      </Button>
    </form>
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        goToGene()
      }}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <Label htmlFor="gene-symbol-field">{t.genome.geneSymbolField}</Label>
        <Input
          id="gene-symbol-field"
          className="text-sm"
          placeholder={t.genome.geneSymbolPlaceholder}
          value={geneQuery}
          spellCheck={false}
          disabled={!refSeqCatalog}
          title={!refSeqCatalog ? t.genome.geneSymbolNotLoaded : undefined}
          onChange={(e) => setGeneQuery(e.target.value)}
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={!refSeqCatalog || !geneQuery.trim()}>
        {t.genome.geneSymbolGo}
      </Button>
    </form>
    </div>
  )
}
