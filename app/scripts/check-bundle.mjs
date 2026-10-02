// Fails the build if the distributed HTML could reach the network
// (requirements, section 7). Inlined code may be base64-encoded, so long
// base64 literals are decoded and scanned too.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const DIST = join(import.meta.dirname, "..", "dist")
const EXPECTED = "viewer-cnv.html"

const FORBIDDEN_APIS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bsendBeacon\b/,
  /\bEventSource\b/,
  /\bimportScripts\s*\(/,
  /\bRTCPeerConnection\b/,
]

const FORBIDDEN_MARKUP = [
  /<script[^>]+\bsrc=/i,
  /<link[^>]+\bhref=["'](?!data:)/i,
  /<(img|iframe|source|video|audio)[^>]+\bsrc=["']https?:/i,
  /url\(\s*["']?https?:/i,
  /@import\s+["']?(url\()?\s*["']?https?:/i,
]

const failures = []

const files = existsSync(DIST) ? readdirSync(DIST) : []
if (files.length !== 1 || files[0] !== EXPECTED) {
  console.error(`✗ dist/ must contain only ${EXPECTED}, found: ${files.join(", ") || "nothing"}`)
  process.exit(1)
}

const html = readFileSync(join(DIST, EXPECTED), "utf8")

if (!/<meta http-equiv="Content-Security-Policy"[^>]+connect-src 'none'/.test(html)) {
  failures.push("missing Content-Security-Policy with connect-src 'none'")
}

for (const pattern of FORBIDDEN_MARKUP) {
  const match = html.match(pattern)
  if (match) failures.push(`external resource: ${match[0]}`)
}

const sources = [{ name: "html", text: html }]
for (const [literal] of html.matchAll(/[A-Za-z0-9+/]{2000,}={0,2}/g)) {
  sources.push({ name: "inline base64", text: Buffer.from(literal, "base64").toString("utf8") })
}

for (const { name, text } of sources) {
  for (const pattern of FORBIDDEN_APIS) {
    const match = text.match(pattern)
    if (match) {
      const at = match.index ?? 0
      failures.push(`${name}: ${pattern} near "${text.slice(Math.max(0, at - 60), at + 60)}"`)
    }
  }
}

if (failures.length) {
  console.error(`✗ ${EXPECTED} failed the offline check:\n  - ${failures.join("\n  - ")}`)
  process.exit(1)
}

const kb = (Buffer.byteLength(html) / 1024).toFixed(0)
console.log(
  `✓ ${EXPECTED} (${kb} kB): single file, CSP present, no network API (${sources.length - 1} base64 blob(s) also scanned)`
)
