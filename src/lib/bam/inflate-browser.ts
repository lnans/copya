import { inflateRaw } from "pako"

import type { InflateRaw } from "./bgzf.ts"

/** BGZF payloads are raw DEFLATE blocks — same as Node `zlib.inflateRaw`. */
export const browserInflateRaw: InflateRaw = (deflated) => inflateRaw(deflated)
