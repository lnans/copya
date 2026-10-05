import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

/** `<html>` class list; canvas drawing reads CSS variables and redraws when it changes. */
export function useDocumentClass(): string {
  return useSyncExternalStore(subscribe, () => document.documentElement.className)
}
