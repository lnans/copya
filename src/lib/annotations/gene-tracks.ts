import type { AnnotationFeature } from "@/lib/annotations/annotation-catalog"

/** Fixed annotation rows under the gene view (after OMIM). */
export const GENE_ANNOTATION_TRACK_IDS = [
  "omim",
  "clinGenGeneDisease",
  "refseq",
  "dgvGold",
  "dgvSupp",
  "gnomadSv",
] as const

export type GeneAnnotationTrackId = (typeof GENE_ANNOTATION_TRACK_IDS)[number]

export type GeneAnnotationTrackConfig = {
  id: GeneAnnotationTrackId
  titleKey: GeneAnnotationTrackId
  fillCssVar: string
  labelCssVar: string
  features: readonly AnnotationFeature[] | null
}

export function buildGeneAnnotationTracks(input: {
  omim: readonly AnnotationFeature[] | null
  clinGenGeneDisease: readonly AnnotationFeature[] | null
  refseq: readonly AnnotationFeature[] | null
  dgvGold: readonly AnnotationFeature[] | null
  dgvSupp: readonly AnnotationFeature[] | null
  gnomadSv: readonly AnnotationFeature[] | null
}): GeneAnnotationTrackConfig[] {
  return [
    { id: "omim", titleKey: "omim", fillCssVar: "--cnv-omim", labelCssVar: "--cnv-omim-label", features: input.omim },
    {
      id: "clinGenGeneDisease",
      titleKey: "clinGenGeneDisease",
      fillCssVar: "--cnv-clingen-blue",
      labelCssVar: "--cnv-clingen-label",
      features: input.clinGenGeneDisease,
    },
    {
      id: "refseq",
      titleKey: "refseq",
      fillCssVar: "--cnv-track-refseq",
      labelCssVar: "--cnv-track-refseq-label",
      features: input.refseq,
    },
    {
      id: "dgvGold",
      titleKey: "dgvGold",
      fillCssVar: "--cnv-track-dgv-gold",
      labelCssVar: "--cnv-track-dgv-gold-label",
      features: input.dgvGold,
    },
    {
      id: "dgvSupp",
      titleKey: "dgvSupp",
      fillCssVar: "--cnv-track-dgv-supp",
      labelCssVar: "--cnv-track-dgv-supp-label",
      features: input.dgvSupp,
    },
    {
      id: "gnomadSv",
      titleKey: "gnomadSv",
      fillCssVar: "--cnv-track-gnomad-sv",
      labelCssVar: "--cnv-track-gnomad-sv-label",
      features: input.gnomadSv,
    },
  ]
}
