import type { ParseOptions } from "@/lib/parse/table"
import type { Bins, Segment } from "@/lib/types"

import ParseWorker from "./parse.worker?worker&inline"
import type { ParseFailure, ParseResponse } from "./parse-protocol"

export class ParseWorkerError extends Error {
  readonly failure: ParseFailure

  constructor(failure: ParseFailure) {
    super(failure.message ?? failure.code)
    this.name = "ParseWorkerError"
    this.failure = failure
  }
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, (response: ParseResponse) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new ParseWorker()
    worker.onmessage = (event: MessageEvent<ParseResponse>) => {
      pending.get(event.data.id)?.(event.data)
      pending.delete(event.data.id)
    }
  }
  return worker
}

function request(kind: "bins" | "segments", file: File, options?: ParseOptions) {
  const id = nextId++
  return new Promise<ParseResponse>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ id, kind, file, options })
  })
}

export async function parseBinsFile(file: File, options?: ParseOptions): Promise<Bins> {
  const response = await request("bins", file, options)
  if (!response.ok) throw new ParseWorkerError(response)
  if (response.kind !== "bins") throw new Error("unexpected response")
  return response.bins
}

export async function parseSegmentsFile(file: File, options?: ParseOptions): Promise<Segment[]> {
  const response = await request("segments", file, options)
  if (!response.ok) throw new ParseWorkerError(response)
  if (response.kind !== "segments") throw new Error("unexpected response")
  return response.segments
}

export function terminateParseWorker() {
  worker?.terminate()
  worker = null
  pending.clear()
}
