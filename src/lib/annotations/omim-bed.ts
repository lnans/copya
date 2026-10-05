import {
  featuresInView,
  parseAnnotationFile,
  type AnnotationCatalog,
  type AnnotationFeature,
  type ParseAnnotationResult,
} from "@/lib/annotations/annotation-catalog"

export type OmimFeature = AnnotationFeature
export type OmimCatalog = AnnotationCatalog
export type ParseOmimBedResult = ParseAnnotationResult

/** UCSC `omimGene2` BED export or any BED4 annotation file. */
export const parseOmimBed = parseAnnotationFile
export const omimFeaturesInView = featuresInView
