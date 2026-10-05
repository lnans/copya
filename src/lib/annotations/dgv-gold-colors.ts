/** UCSC DGV Gold / dgvPlus color categories. */
export type DgvGoldColorKind = "gain" | "loss" | "gainLoss" | "inversion"

const CSS_BY_KIND: Record<DgvGoldColorKind, string> = {
  gain: "--cnv-dgv-gold-gain",
  loss: "--cnv-dgv-gold-loss",
  gainLoss: "--cnv-dgv-gold-gain-loss",
  inversion: "--cnv-dgv-gold-inversion",
}

export function dgvGoldFillCssVar(kind: DgvGoldColorKind): string {
  return CSS_BY_KIND[kind]
}

function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase()
}

/** Map UCSC itemRgb (comma-separated) to a category when unambiguous. */
function kindFromItemRgb(itemRgb: string | undefined): DgvGoldColorKind | undefined {
  const rgb = norm(itemRgb).replace(/\s/g, "")
  if (!rgb) return undefined
  if (rgb === "0,0,200" || rgb === "0,0,255") return "gain"
  if (rgb === "200,0,0" || rgb === "255,0,0") return "loss"
  if (rgb === "200,0,200" || rgb === "128,0,128") return "inversion"
  if (rgb === "139,69,19" || rgb === "160,82,45" || rgb === "165,42,42") return "gainLoss"
  return undefined
}

/**
 * Classify a DGV variant for display colors (UCSC dgvPlus legend).
 * Uses variant type fields when present, else BED itemRgb (column 9).
 */
export function classifyDgvGoldColor(
  itemRgb: string | undefined,
  variantType: string | undefined,
  variantSubType: string | undefined,
  /** dgvMerged-style varType text, e.g. gain+loss */
  varTypeLabel?: string | undefined
): DgvGoldColorKind | undefined {
  const type = norm(variantType)
  const sub = norm(variantSubType)
  const label = norm(varTypeLabel)
  const combined = `${type} ${sub} ${label}`

  if (combined.includes("inversion")) return "inversion"

  const gain =
    sub === "gain" ||
    label.includes("gain") ||
    label.includes("duplication") ||
    type.includes("insertion")
  const loss =
    sub === "loss" ||
    label.includes("loss") ||
    label.includes("deletion") ||
    type.includes("deletion")

  if (gain && loss) return "gainLoss"
  if (label.includes("gain+loss") || label.includes("gain/loss")) return "gainLoss"

  if (sub === "gain" || (gain && !loss)) return "gain"
  if (sub === "loss" || (loss && !gain)) return "loss"

  return kindFromItemRgb(itemRgb)
}
