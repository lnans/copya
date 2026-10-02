/// <reference types="vitest/config" />
import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

/**
 * Production-only: the dev server needs external module scripts and an HMR
 * websocket, which this policy forbids. Everything is inlined by
 * vite-plugin-singlefile, hence 'unsafe-inline' and data:/blob: sources.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "worker-src blob: data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ")

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace(
        /<meta charset="UTF-8" \/>/,
        (charset) =>
          `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`
      ),
  }
}

export const OUTPUT_FILE_NAME = "viewer-cnv.html"

function renameHtmlOutput(): Plugin {
  return {
    name: "rename-html-output",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = bundle["index.html"]
      if (html?.type !== "asset") return
      delete bundle["index.html"]
      this.emitFile({ type: "asset", fileName: OUTPUT_FILE_NAME, source: html.source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    viteSingleFile(),
    renameHtmlOutput(),
  ],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    modulePreload: { polyfill: false },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
})
