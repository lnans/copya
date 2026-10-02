import { useState } from "react"
import { FlaskConicalIcon, MoonIcon, ShieldCheckIcon, SunIcon, Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { GenomePlot } from "@/components/cnv/genome-plot"
import { SegmentsTable } from "@/components/cnv/segments-table"
import { OptionSelect } from "@/components/option-select"
import { useTheme } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { t } from "@/i18n/fr"
import { chromLength, geneRegionFromSegment } from "@/lib/cnv/gene-region"
import { THRESHOLD_PRESETS } from "@/lib/cnv/scale"
import { generateDemoSample } from "@/lib/demo"
import { formatLocation } from "@/lib/format"
import { shortChromLabel, type ChromName } from "@/lib/genome/hg38"
import type { BpViewport } from "@/lib/cnv/viewport"
import type { Bins, GeneRegion, ReviewStatus, SampleMeta, Segment, Thresholds } from "@/lib/types"
import {
  parseBinsFile,
  parseSegmentsFile,
  ParseWorkerError,
  terminateParseWorker,
} from "@/workers/parse-client"

const EMPTY_META: SampleMeta = { id: "", sex: "unknown", context: "postnatal" }
const DEFAULT_MOVING_AVERAGE_WINDOW = 21

function describeError(error: unknown): string {
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
  const { theme, setTheme } = useTheme()
  const [meta, setMeta] = useState<SampleMeta>(EMPTY_META)
  const [bins, setBins] = useState<Bins | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [statuses, setStatuses] = useState<Record<string, ReviewStatus>>({})
  const [thresholds, setThresholds] = useState<Thresholds>(THRESHOLD_PRESETS.postnatal)
  const [showMosaicLines, setShowMosaicLines] = useState(true)
  const [showBins, setShowBins] = useState(true)
  const [movingAverageWindow, setMovingAverageWindow] = useState(DEFAULT_MOVING_AVERAGE_WINDOW)
  const [medianWindow, setMedianWindow] = useState(1)
  const [focusChrom, setFocusChrom] = useState<ChromName | null>(null)
  const [geneRegion, setGeneRegion] = useState<GeneRegion | null>(null)
  const [geneVisibleViewport, setGeneVisibleViewport] = useState<BpViewport | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fileInputsKey, setFileInputsKey] = useState(0)

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

  const selectSegment = (segment: Segment) => {
    setFocusChrom(segment.chrom)
    setSelectedSegmentId(segment.id)
    setGeneRegion(geneRegionFromSegment(segment))
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

  const loadFile = async (kind: "bins" | "segments", file: File | undefined) => {
    if (!file) return
    setLoading(true)
    try {
      if (kind === "bins") {
        const parsed = await parseBinsFile(file)
        setBins(parsed)
        setMeta((m) => ({ ...m, sourceFileName: file.name }))
        if (!focusChrom) setFocusChrom("chr1")
        toast.success(t.files.binsLoaded(parsed.length))
      } else {
        const parsed = await parseSegmentsFile(file)
        setSegments(parsed)
        setStatuses({})
        setSelectedSegmentId(null)
        toast.success(t.files.segmentsLoaded(parsed.length))
      }
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setLoading(false)
    }
  }

  const loadDemo = () => {
    const demo = generateDemoSample({ sex: "XY" })
    setBins(demo.bins)
    setSegments(demo.segments)
    setStatuses({})
    setSelectedSegmentId(null)
    setGeneRegion(null)
    setGeneVisibleViewport(null)
    setFocusChrom("chr21")
    setMeta({ id: "DEMO-001", sex: demo.sex, context: "prenatal", binSize: 100_000 })
    setThresholds(THRESHOLD_PRESETS.prenatal)
  }

  const clearAll = () => {
    terminateParseWorker()
    setBins(null)
    setSegments([])
    setStatuses({})
    setSelectedSegmentId(null)
    setFocusChrom(null)
    setGeneRegion(null)
    setGeneVisibleViewport(null)
    setMeta(EMPTY_META)
    setThresholds(THRESHOLD_PRESETS.postnatal)
    setFileInputsKey((k) => k + 1)
    toast(t.files.cleared)
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-[1600px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">{t.appTitle}</h1>
          <p className="text-xs text-muted-foreground">{t.appSubtitle}</p>
        </div>
        <Badge variant="secondary">
          <ShieldCheckIcon />
          {t.offlineBadge}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.theme.toggle}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t.files.title}</CardTitle>
          <CardDescription>{t.files.description}</CardDescription>
          <CardAction className="flex gap-2">
            <Button variant="outline" onClick={loadDemo}>
              <FlaskConicalIcon />
              {t.files.demo}
            </Button>
            <Button variant="destructive" onClick={clearAll}>
              <Trash2Icon />
              {t.files.clearAll}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="grid gap-1.5">
            <Label htmlFor="sample-id">{t.sample.id}</Label>
            <Input
              id="sample-id"
              value={meta.id}
              autoComplete="off"
              onChange={(e) => setMeta((m) => ({ ...m, id: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sample-sex">{t.sample.sex}</Label>
            <OptionSelect
              id="sample-sex"
              className="w-full"
              value={meta.sex}
              options={t.sex}
              onChange={(sex) => setMeta((m) => ({ ...m, sex }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sample-context">{t.sample.context}</Label>
            <OptionSelect
              id="sample-context"
              className="w-full"
              value={meta.context}
              options={t.context}
              onChange={(context) => {
                setMeta((m) => ({ ...m, context }))
                setThresholds(THRESHOLD_PRESETS[context])
              }}
            />
          </div>
          <div key={`bins-${fileInputsKey}`} className="grid gap-1.5">
            <Label htmlFor="bins-file">{t.files.bins}</Label>
            <Input
              id="bins-file"
              type="file"
              accept=".tsv,.csv,.bed,.txt"
              disabled={loading}
              onChange={(e) => loadFile("bins", e.target.files?.[0])}
            />
          </div>
          <div key={`segments-${fileInputsKey}`} className="grid gap-1.5">
            <Label htmlFor="segments-file">{t.files.segments}</Label>
            <Input
              id="segments-file"
              type="file"
              accept=".tsv,.csv,.bed,.txt"
              disabled={loading}
              onChange={(e) => loadFile("segments", e.target.files?.[0])}
            />
          </div>
        </CardContent>
      </Card>

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
          {bins ? (
            <GenomePlot
              {...plotCommon}
              scope="genome"
              focusChrom={focusChrom}
              height={240}
              onSelectChrom={(chrom) => {
                setFocusChrom(chrom)
                setGeneRegion(null)
                setGeneVisibleViewport(null)
              }}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">{t.genome.empty}</p>
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
          {bins && focusChrom ? (
            <GenomePlot
              {...plotCommon}
              scope="chromosome"
              focusChrom={focusChrom}
              height={240}
              visibleGeneViewport={geneVisibleViewport}
              onOpenGeneRegion={openGene}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">{t.genome.pickChromosome}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.genome.geneTitle}</CardTitle>
          <CardDescription>
            {activeGeneRegion
              ? `${formatLocation(activeGeneRegion.chrom, activeGeneRegion.start, activeGeneRegion.end)} · ${t.genome.geneHint}`
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
        <CardContent>
          {bins && activeGeneRegion ? (
            <GenomePlot
              key={`${activeGeneRegion.chrom}:${activeGeneRegion.start}-${activeGeneRegion.end}`}
              {...plotCommon}
              scope="gene"
              focusChrom={activeGeneRegion.chrom}
              geneRegion={activeGeneRegion}
              height={300}
              onOpenGeneRegion={openGene}
              onVisibleViewportChange={setGeneVisibleViewport}
            />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">{t.genome.pickChromosome}</p>
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
            statuses={statuses}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={selectSegment}
            onStatusChange={(id, status) => setStatuses((s) => ({ ...s, [id]: status }))}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default App
