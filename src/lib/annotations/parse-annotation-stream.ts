import {
  AnnotationStreamParser,
  type ParseAnnotationResult,
} from "@/lib/annotations/annotation-catalog"

function annotationUrl(baseUrl: string, file: string): string {
  const base = baseUrl.replace(/\/?$/, "/")
  return `${base}annotations/${file}`
}

/** Stream-parse a large annotation file (e.g. DGV Supp. ~1 GB decompressed). */
export async function parseAnnotationFileFromUrl(
  baseUrl: string,
  file: string
): Promise<ParseAnnotationResult> {
  const response = await fetch(annotationUrl(baseUrl, file))
  if (!response.ok) {
    throw new Error(`annotations/${file} (${response.status})`)
  }
  if (!response.body) {
    throw new Error(`annotations/${file} (empty body)`)
  }

  const encoding = response.headers.get("content-encoding")?.toLowerCase() ?? ""
  const browserDecoded = encoding.includes("gzip") || encoding.includes("deflate")
  const needsGunzip = file.endsWith(".gz") && !browserDecoded

  let byteStream: ReadableStream<Uint8Array> = response.body
  if (needsGunzip) {
    byteStream = byteStream.pipeThrough(
      new DecompressionStream("gzip") as TransformStream<Uint8Array, Uint8Array>
    )
  }

  const parser = new AnnotationStreamParser()
  const reader = byteStream
    .pipeThrough(new TextDecoderStream() as TransformStream<Uint8Array, string>)
    .getReader()
  let pending = ""

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    pending += value
    let newline = pending.indexOf("\n")
    while (newline >= 0) {
      parser.pushLine(pending.slice(0, newline))
      pending = pending.slice(newline + 1)
      newline = pending.indexOf("\n")
    }
  }
  if (pending.length > 0) parser.pushLine(pending)

  return parser.finish()
}
