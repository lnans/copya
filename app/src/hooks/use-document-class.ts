import { useSyncExternalStore } from "react"

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

/**
 * The `<html>` class list (e.g. `dark`). Canvas drawing reads CSS variables,
 * so it must redraw after the theme provider has applied the class.
 */
export function useDocumentClass(): string {
  return useSyncExternalStore(subscribe, () => document.documentElement.className)
}
