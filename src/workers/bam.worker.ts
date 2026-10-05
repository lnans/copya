import { bamToBins, chromosomesToBins } from "@/lib/bam/bam-to-bins"
import { browserInflateRaw } from "@/lib/bam/inflate-browser"

import type { BamConvertRequest, BamConvertProgress, BamWorkerMessage } from "./bam-protocol"

self.onmessage = async (event: MessageEvent<BamConvertRequest>) => {
  const { id, bam, bai, binSize } = event.data
  try {
    const postProgress = (progress: Omit<BamConvertProgress, "id" | "type">) => {
      self.postMessage({ id, type: "progress", ...progress } satisfies BamConvertProgress)
    }
    postProgress({ chrom: "chr1", index: 0, total: 0, fraction: 0, phase: "header" })
    let lastProgressPost = 0
    const result = await bamToBins(bam, bai, {
      binSize,
      inflateRaw: browserInflateRaw,
      onChromosome: ({ chrom, index, total, fraction }) => {
        const now = performance.now()
        if (fraction > 0 && fraction < 1 && now - lastProgressPost < 120) return
        lastProgressPost = now
        postProgress({ chrom, index, total, fraction })
      },
    })
    const bins = chromosomesToBins(result.chromosomes, binSize, result.median)
    const response: BamWorkerMessage = { id, type: "done", ok: true, bins, binSize, median: result.median }
    self.postMessage(response, {
      transfer: [bins.chromIndex.buffer, bins.start.buffer, bins.end.buffer, bins.log2.buffer],
    })
  } catch (error) {
    const response: BamWorkerMessage = {
      id,
      type: "done",
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response)
  }
}
