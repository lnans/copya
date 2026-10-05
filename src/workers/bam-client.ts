import type { Bins } from "@/lib/types"

import BamWorker from "./bam.worker?worker&inline"
import type { BamConvertProgress, BamWorkerMessage } from "./bam-protocol"

export class BamConvertError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BamConvertError"
  }
}

export type BamConvertResult = {
  bins: Bins
  binSize: number
  median: number
}

let worker: Worker | null = null
let nextId = 1

function getWorker(): Worker {
  if (!worker) worker = new BamWorker()
  return worker
}

export function convertBamToBins(
  bam: File,
  bai: ArrayBuffer,
  binSize: number,
  onProgress?: (progress: Omit<BamConvertProgress, "id" | "type">) => void
): Promise<BamConvertResult> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent<BamWorkerMessage>) => {
      if (event.data.id !== id) return
      const msg = event.data
      if (msg.type === "progress") {
        onProgress?.({
          chrom: msg.chrom,
          index: msg.index,
          total: msg.total,
          fraction: msg.fraction,
          phase: msg.phase,
        })
        return
      }
      worker?.removeEventListener("message", handleMessage)
      if (!msg.ok) {
        reject(new BamConvertError(msg.message))
        return
      }
      resolve({ bins: msg.bins, binSize: msg.binSize, median: msg.median })
    }
    getWorker().addEventListener("message", handleMessage)
    getWorker().postMessage({ id, bam, bai, binSize })
  })
}

export function terminateBamWorker() {
  worker?.terminate()
  worker = null
}
