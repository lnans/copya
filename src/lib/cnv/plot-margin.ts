export const PLOT_MARGIN = { top: 8, right: 40, bottom: 6, left: 40 } as const

export function plotMarginLeft(_scope: "genome" | "chromosome" | "gene"): number {
  return PLOT_MARGIN.left
}
