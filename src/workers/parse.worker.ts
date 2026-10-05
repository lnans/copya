import {
  defaultParseOptions,
  ParseError,
  parseBins,
  parseSegments,
  sniff,
  type ParseOptions,
} from "@/lib/parse/table"

import type { ParseRequest, ParseResponse } from "./parse-protocol"

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  const { id, kind, file, options } = event.data
  try {
    const text = await file.text()
    const parseOptions: ParseOptions = options ?? defaultParseOptions(sniff(text))
    let response: ParseResponse
    if (kind === "bins") {
      const { bins, skippedContigs } = parseBins(text, parseOptions)
      response = { id, ok: true, kind, bins, skippedContigs }
      self.postMessage(response, {
        transfer: [bins.chromIndex.buffer, bins.start.buffer, bins.end.buffer, bins.log2.buffer],
      })
    } else {
      const { segments, skippedContigs } = parseSegments(text, parseOptions)
      response = { id, ok: true, kind, segments, skippedContigs }
      self.postMessage(response)
    }
  } catch (error) {
    const response: ParseResponse =
      error instanceof ParseError
        ? { id, ok: false, code: error.code, line: error.line, column: error.column }
        : { id, ok: false, code: "unknown", message: String(error) }
    self.postMessage(response)
  }
}
