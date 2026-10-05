import { useCallback, useEffect, useMemo, useState } from "react"
import { Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { GeneRegionControls } from "@/components/cnv/gene-region-controls"
import { GenomePlot } from "@/components/cnv/genome-plot"
import { SegmentsTable } from "@/components/cnv/segments-table"
import { AppFooter } from "@/components/app-footer"
import { AnnotationsLoadingOverlay } from "@/components/annotations-loading-overlay"
import { BamConversionOverlay } from "@/components/bam-conversion-overlay"
import { HeaderBar } from "@/components/header-bar"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { t } from "@/i18n/fr"
import { parseAnnotationFile, type AnnotationCatalog } from "@/lib/annotations/annotation-catalog"
import { loadBundledAnnotations } from "@/lib/annotations/load-bundled-annotations"
import { buildGeneAnnotationTracks } from "@/lib/annotations/gene-tracks"
import { DEFAULT_BAM_BIN_SIZE } from "@/lib/bam/bam-to-bins"
import { chromLength, geneRegionFromSegment } from "@/lib/cnv/gene-region"
import { THRESHOLD_PRESETS } from "@/lib/cnv/scale"
import { formatLocation } from "@/lib/format"
import { shortChromLabel, type ChromName } from "@/lib/genome/hg38"
import type { BpViewport } from "@/lib/cnv/viewport"
import type {
  Bins,
  GeneRegion,
  SampleMeta,
  Segment,
  SegmentClassification,
  Thresholds,
} from "@/lib/types"
import { BamConvertError, convertBamToBins, terminateBamWorker } from "@/workers/bam-client"
import { parseSegmentsFile, ParseWorkerError, terminateParseWorker } from "@/workers/parse-client"

const EMPTY_META: SampleMeta = { id: "", sex: "unknown", context: "postnatal" }
const DEFAULT_MOVING_AVERAGE_WINDOW = 21
const DEFAULT_PLOT_CHROM: ChromName = "chr1"

function describeError(error: unknown): string {
  if (error instanceof BamConvertError) return error.message
  if (error instanceof ParseWorkerError) {
    const { code, line, column } = error.failure
    const where = t.parseErrorAt(line, column)
    return where ? `${t.parseErrors[code]} (${where})` : t.parseErrors[code]
  }
  return t.parseErrors.unknown
}

const plotSettings = (
  thresholds: Thresholds,
  setThresholds: (fn: (t: Thresholds) => Thresholds) => void,
  medianWindow: number,
  setMedianWindow: (n: number) => void,
  movingAverageWindow: number,
  setMovingAverageWindow: (n: number) => void,
  showMosaicLines: boolean,
  setShowMosaicLines: (v: boolean) => void,
  showBins: boolean,
  setShowBins: (v: boolean) => void
) => (
  <div className="flex flex-wrap items-center gap-4">
    <div className="flex items-center gap-2">
      <Label htmlFor="threshold-gain">{t.thresholds.gain}</Label>
      <Input
        id="threshold-gain"
        type="number"
        step={0.05}
        className="w-20"
        value={thresholds.gain}
        onChange={(e) => setThresholds((th) => ({ ...th, gain: Number(e.target.value) }))}
      />
      <Label htmlFor="threshold-loss">{t.thresholds.loss}</Label>
      <Input
        id="threshold-loss"
        type="number"
        step={0.05}
        className="w-20"
        value={thresholds.loss}
        onChange={(e) => setThresholds((th) => ({ ...th, loss: Number(e.target.value) }))}
      />
    </div>
    <div className="flex items-center gap-2">
      <Label htmlFor="median-smoothing">{t.thresholds.medianSmoothing}</Label>
      <Input
        id="median-smoothing"
        type="number"
        min={1}
        step={2}
        className="w-20"
        title={t.thresholds.medianSmoothingHint}
        value={medianWindow}
        onChange={(e) => setMedianWindow(Math.max(1, Math.round(Number(e.target.value)) || 1))}
      />
    </div>
    <div className="flex items-center gap-2">
      <Label htmlFor="moving-average">{t.thresholds.movingAverage}</Label>
      <Input
        id="moving-average"
        type="number"
        min={0}
        step={1}
        className="w-20"
        title={t.thresholds.movingAverageHint}
        value={movingAverageWindow}
        onChange={(e) => setMovingAverageWindow(Math.max(0, Math.round(Number(e.target.value)) || 0))}
      />
    </div>
    <div className="flex items-center gap-2">
      <Switch id="show-bins" checked={showBins} onCheckedChange={setShowBins} />
      <Label htmlFor="show-bins" title={t.thresholds.showBinsHint}>
        {t.thresholds.showBins}
      </Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="mosaic-lines" checked={showMosaicLines} onCheckedChange={setShowMosaicLines} />
      <Label htmlFor="mosaic-lines">{t.thresholds.mosaicLines}</Label>
    </div>
  </div>
)

export function App() {
  const [, setMeta] = useState<SampleMeta>(EMPTY_META)
  const [bins, setBins] = useState<Bins | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [classifications, setClassifications] = useState<Record<string, SegmentClassification>>({})
  const [segmentNotes, setSegmentNotes] = useState<Record<string, string>>({})
  const [thresholds, setThresholds] = useState<Thresholds>(THRESHOLD_PRESETS.postnatal)
  const [showMosaicLines, setShowMosaicLines] = useState(true)
  const [showBins, setShowBins] = useState(true)
  const [movingAverageWindow, setMovingAverageWindow] = useState(DEFAULT_MOVING_AVERAGE_WINDOW)
  const [medianWindow, setMedianWindow] = useState(1)
  const [focusChrom, setFocusChrom] = useState<ChromName | null>(null)
  const [geneRegion, setGeneRegion] = useState<GeneRegion | null>(null)
  const [geneVisibleViewport, setGeneVisibleViewport] = useState<BpViewport | null>(null)
  const [omimCatalog, setOmimCatalog] = useState<AnnotationCatalog | null>(null)
  const [clinGenCatalog, setClinGenCatalog] = useState<AnnotationCatalog | null>(null)
  const [refSeqCatalog, setRefSeqCatalog] = useState<AnnotationCatalog | null>(null)
  const [dgvGoldCatalog, setDgvGoldCatalog] = useState<AnnotationCatalog | null>(null)
  const [dgvSuppCatalog, setDgvSuppCatalog] = useState<AnnotationCatalog | null>(null)
  const [gnomadSvCatalog, setGnomadSvCatalog] = useState<AnnotationCatalog | null>(null)
  const [, setPanelAppCatalog] = useState<AnnotationCatalog | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [geneRegionFocusKey, setGeneRegionFocusKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [fileInputsKey, setFileInputsKey] = useState(0)
  const [sampleImportOpen, setSampleImportOpen] = useState(false)
  const [annotationsImportOpen, setAnnotationsImportOpen] = useState(false)
  const [pendingBam, setPendingBam] = useState<File | null>(null)
  const [pendingBai, setPendingBai] = useState<File | null>(null)
  const [bamBinSize, setBamBinSize] = useState(DEFAULT_BAM_BIN_SIZE)
  const [bamConverting, setBamConverting] = useState(false)
  const [bamProgress, setBamProgress] = useState<{
    chrom: ChromName
    index: number
    total: number
    fraction: number
    phase?: "header"
  } | null>(null)
  const [bundledAnnotationsReady, setBundledAnnotationsReady] = useState(false)
  const [bundledLoadProgress, setBundledLoadProgress] = useState({
    index: 0,
    total: 4,
    label: "",
  })
  const [bundledLoadError, setBundledLoadError] = useState<string | null>(null)

  const loadBundledAnnotationCatalogs = useCallback(async () => {
    setBundledLoadError(null)
    setBundledAnnotationsReady(false)
    try {
      const bundled = await loadBundledAnnotations((index, total, label) => {
        setBundledLoadProgress({ index, total, label })
      })
      setClinGenCatalog(bundled.clinGenCatalog)
      setRefSeqCatalog(bundled.refSeqCatalog)
      setDgvGoldCatalog(bundled.dgvGoldCatalog)
      setDgvSuppCatalog(bundled.dgvSuppCatalog)
      setBundledAnnotationsReady(true)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t.files.bundledAnnotationsLoadFailed
      setBundledLoadError(message)
      toast.error(t.files.bundledAnnotationsLoadFailed)
    }
  }, [])

  useEffect(() => {
    void loadBundledAnnotationCatalogs()
  }, [loadBundledAnnotationCatalogs])

  const openGene = (region: GeneRegion) => {
    setFocusChrom(region.chrom)
    setGeneRegion(region)
  }

  /** Full chromosome when no locus was chosen yet; keeps the gene panel usable. */
  const activeGeneRegion: GeneRegion | null = focusChrom
    ? geneRegion?.chrom === focusChrom
      ? geneRegion
      : { chrom: focusChrom, start: 0, end: chromLength(focusChrom) }
    : null

  const chromFeatures = (catalog: AnnotationCatalog | null) =>
    activeGeneRegion && catalog ? (catalog.byChrom.get(activeGeneRegion.chrom) ?? []) : null

  const geneAnnotationTracks = useMemo(
    () =>
      buildGeneAnnotationTracks({
        omim: chromFeatures(omimCatalog),
        clinGenGeneDisease: chromFeatures(clinGenCatalog),
        refseq: chromFeatures(refSeqCatalog),
        dgvGold: chromFeatures(dgvGoldCatalog),
        dgvSupp: chromFeatures(dgvSuppCatalog),
        gnomadSv: chromFeatures(gnomadSvCatalog),
      }),
    [
      omimCatalog,
      clinGenCatalog,
      refSeqCatalog,
      dgvGoldCatalog,
      dgvSuppCatalog,
      gnomadSvCatalog,
      activeGeneRegion,
    ]
  )

  const geneRegionForDisplay =
    activeGeneRegion && geneVisibleViewport
      ? {
          chrom: activeGeneRegion.chrom,
          start: geneVisibleViewport.start,
          end: geneVisibleViewport.end,
        }
      : activeGeneRegion

  const displayChrom: ChromName = focusChrom ?? DEFAULT_PLOT_CHROM
  const placeholderGeneRegion = useMemo(
    (): GeneRegion => ({
      chrom: displayChrom,
      start: 0,
      end: chromLength(displayChrom),
    }),
    [displayChrom]
  )
  const genePlotRegion = activeGeneRegion ?? placeholderGeneRegion

  const selectSegment = (segment: Segment) => {
    setFocusChrom(segment.chrom)
    setSelectedSegmentId(segment.id)
    setGeneRegion(geneRegionFromSegment(segment))
    setGeneRegionFocusKey((k) => k + 1)
  }

  const plotCommon = {
    bins,
    segments,
    thresholds,
    showMosaicLines,
    showBins,
    movingAverageWindow,
    medianWindow,
    selectedSegmentId,
    onSelectSegment: selectSegment,
  }

  const loadAnnotationFile = async (
    file: File | undefined,
    label: string,
    setCatalog: (catalog: AnnotationCatalog | null) => void
  ) => {
    if (!file) return
    setLoading(true)
    try {
      const result = parseAnnotationFile(await file.text())
      if (!result.ok) {
        toast.error(t.annotationErrors[result.code])
        return
      }
      setCatalog(result.catalog)
      toast.success(t.files.annotationLoaded(label, result.catalog.features.length))
    } catch {
      toast.error(t.parseErrors.unknown)
    } finally {
      setLoading(false)
    }
  }

  const loadSegmentsFile = async (file: File | undefined) => {
    if (!file) return
    setLoading(true)
    try {
      const parsed = await parseSegmentsFile(file)
      setSegments(parsed)
      setClassifications({})
      setSegmentNotes({})
      setSelectedSegmentId(null)
      toast.success(t.files.segmentsLoaded(parsed.length))
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setLoading(false)
    }
  }

  const runBamConversion = async () => {
    if (!pendingBam || !pendingBai) return
    setBamConverting(true)
    setBamProgress(null)
    setSampleImportOpen(false)
    try {
      const baiBuffer = await pendingBai.arrayBuffer()
      const { bins, binSize, median } = await convertBamToBins(
        pendingBam,
        baiBuffer,
        bamBinSize,
        (progress) => setBamProgress(progress)
      )
      setBins(bins)
      setMeta((m) => ({ ...m, sourceFileName: pendingBam.name, binSize }))
      if (!focusChrom) setFocusChrom("chr1")
      toast.success(t.files.bamConverted(bins.length, median))
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBamConverting(false)
      setBamProgress(null)
    }
  }

  const clearAll = () => {
    terminateParseWorker()
    terminateBamWorker()
    setBins(null)
    setSegments([])
    setClassifications({})
    setSegmentNotes({})
    setSelectedSegmentId(null)
    setFocusChrom(null)
    setGeneRegion(null)
    setGeneVisibleViewport(null)
    setOmimCatalog(null)
    setGnomadSvCatalog(null)
    setPanelAppCatalog(null)
    setMeta(EMPTY_META)
    setThresholds(THRESHOLD_PRESETS.postnatal)
    setPendingBam(null)
    setPendingBai(null)
    setBamBinSize(DEFAULT_BAM_BIN_SIZE)
    setFileInputsKey((k) => k + 1)
    toast(t.files.cleared)
  }

  const annotationFileRows = (
    [
      ["omim-file", t.files.omim, setOmimCatalog],
      ["gnomad-sv-file", t.files.gnomadSv, setGnomadSvCatalog],
      ["panel-app-file", t.files.panelApp, setPanelAppCatalog],
    ] as const
  ).map(([id, label, setCatalog]) => (
    <div key={`${id}-${fileInputsKey}`} className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept=".bed,.txt,.tsv,.gz"
        disabled={loading}
        onChange={(e) => loadAnnotationFile(e.target.files?.[0], label, setCatalog)}
      />
    </div>
  ))

  return (
    <div className="flex min-h-svh w-full flex-col">
      {(!bundledAnnotationsReady || bundledLoadError) && (
        <AnnotationsLoadingOverlay
          label={bundledLoadProgress.label || null}
          index={bundledLoadProgress.index}
          total={bundledLoadProgress.total}
          error={bundledLoadError}
          onRetry={() => void loadBundledAnnotationCatalogs()}
        />
      )}
      {bamConverting && (
        <BamConversionOverlay
          chrom={bamProgress?.chrom ?? null}
          index={bamProgress?.index ?? 0}
          total={bamProgress?.total ?? 0}
          fraction={bamProgress?.fraction ?? 0}
          phase={bamProgress?.phase}
        />
      )}
      <HeaderBar
        onOpenSampleImport={() => setSampleImportOpen(true)}
        onOpenAnnotationsImport={() => setAnnotationsImportOpen(true)}
      />

      <main className="flex w-full flex-col gap-4 px-3 pt-3 pb-4 sm:px-4 sm:pt-4 md:px-6">
      <Dialog open={sampleImportOpen} onOpenChange={setSampleImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.files.sampleDialogTitle}</DialogTitle>
            <DialogDescription>{t.files.sampleDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div key={`bam-${fileInputsKey}`} className="grid gap-1.5">
              <Label htmlFor="bam-file">{t.files.bam}</Label>
              <Input
                id="bam-file"
                type="file"
                accept=".bam"
                disabled={loading || bamConverting}
                onChange={(e) => setPendingBam(e.target.files?.[0] ?? null)}
              />
            </div>
            <div key={`bai-${fileInputsKey}`} className="grid gap-1.5">
              <Label htmlFor="bai-file">{t.files.bai}</Label>
              <Input
                id="bai-file"
                type="file"
                accept=".bai"
                disabled={loading || bamConverting}
                onChange={(e) => setPendingBai(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bam-bin-size">{t.files.bamBinSize}</Label>
              <Input
                id="bam-bin-size"
                type="number"
                min={1000}
                step={1000}
                value={bamBinSize}
                disabled={bamConverting}
                onChange={(e) =>
                  setBamBinSize(Math.max(1000, Math.round(Number(e.target.value)) || DEFAULT_BAM_BIN_SIZE))
                }
              />
            </div>
            <Button
              className="w-fit"
              disabled={!pendingBam || !pendingBai || bamConverting}
              onClick={() => void runBamConversion()}
            >
              {t.files.bamConvert}
            </Button>
            <div key={`segments-${fileInputsKey}`} className="grid gap-1.5 border-t pt-4">
              <Label htmlFor="segments-file">{t.files.segments}</Label>
              <Input
                id="segments-file"
                type="file"
                accept=".tsv,.csv,.bed,.txt"
                disabled={loading || bamConverting}
                onChange={(e) => loadSegmentsFile(e.target.files?.[0])}
              />
            </div>
            <Button variant="destructive" className="w-fit" onClick={clearAll} disabled={bamConverting}>
              <Trash2Icon />
              {t.files.clearAll}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={annotationsImportOpen} onOpenChange={setAnnotationsImportOpen}>
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.files.annotationsDialogTitle}</DialogTitle>
            <DialogDescription>{t.files.annotationsHint}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">{annotationFileRows}</div>
        </DialogContent>
      </Dialog>

      {bins && (
        <Card>
          <CardHeader>
            <CardTitle>{t.genome.displaySettings}</CardTitle>
          </CardHeader>
          <CardContent>
            {plotSettings(
              thresholds,
              setThresholds,
              medianWindow,
              setMedianWindow,
              movingAverageWindow,
              setMovingAverageWindow,
              showMosaicLines,
              setShowMosaicLines,
              showBins,
              setShowBins
            )}
            <p className="mt-3 text-xs text-muted-foreground">{t.thresholds.placeholderWarning}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.genome.title}</CardTitle>
          <CardDescription>{t.genome.clickHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <GenomePlot
            {...plotCommon}
            scope="genome"
            focusChrom={focusChrom}
            height={320}
            onSelectChrom={(chrom) => {
              setFocusChrom(chrom)
              setGeneRegion(null)
              setGeneVisibleViewport(null)
            }}
          />
          {!bins && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{t.genome.empty}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {focusChrom ? t.genome.chromosomeTitle(shortChromLabel(focusChrom)) : t.genome.chromosomePanel}
          </CardTitle>
          <CardDescription>{t.genome.chromosomeHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <GenomePlot
            {...plotCommon}
            scope="chromosome"
            focusChrom={displayChrom}
            height={320}
            visibleGeneViewport={geneVisibleViewport}
            onOpenGeneRegion={openGene}
          />
          {!bins && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{t.genome.empty}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.genome.geneTitle}</CardTitle>
          <CardDescription>
            {geneRegionForDisplay
              ? `${formatLocation(geneRegionForDisplay.chrom, geneRegionForDisplay.start, geneRegionForDisplay.end)} · ${t.genome.geneHint}`
              : t.genome.pickChromosome}
          </CardDescription>
          {activeGeneRegion && geneRegion && (
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => setGeneRegion(null)}>
                <XIcon />
                {t.genome.resetGeneWindow}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          <GeneRegionControls
            chrom={genePlotRegion.chrom}
            refSeqCatalog={refSeqCatalog}
            viewport={
              geneVisibleViewport ?? {
                start: genePlotRegion.start,
                end: genePlotRegion.end,
              }
            }
            onApply={(region) => {
              setFocusChrom(region.chrom)
              setGeneRegion(region)
            }}
          />
          <GenomePlot
            {...plotCommon}
            scope="gene"
            focusChrom={genePlotRegion.chrom}
            geneRegion={genePlotRegion}
            geneRegionFocusKey={geneRegionFocusKey}
            height={380}
            onOpenGeneRegion={openGene}
            onVisibleViewportChange={setGeneVisibleViewport}
            geneAnnotationTracks={geneAnnotationTracks}
          />
          {!bins && (
            <p className="text-center text-xs text-muted-foreground">{t.genome.empty}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.segments.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentsTable
            segments={segments}
            bins={bins}
            classifications={classifications}
            notes={segmentNotes}
            refSeqCatalog={refSeqCatalog}
            clinGenCatalog={clinGenCatalog}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={selectSegment}
            onClassificationChange={(id, value) =>
              setClassifications((s) => ({ ...s, [id]: value }))
            }
            onNotesChange={(id, value) => setSegmentNotes((s) => ({ ...s, [id]: value }))}
          />
        </CardContent>
      </Card>

      </main>
      <AppFooter />
    </div>
  )
}

export default App
