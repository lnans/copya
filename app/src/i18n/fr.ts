import type { ParseErrorCode } from "@/lib/parse/table"
import type { ReviewStatus, SampleContext, Sex } from "@/lib/types"

/** All UI strings. Add `en.ts` with the same shape for an English version. */
export const fr = {
  appTitle: "Visualiseur CNV",
  appSubtitle: "shallow WGS · GRCh38",
  offlineBadge: "Hors ligne · aucune donnée transmise",

  sample: {
    id: "Identifiant échantillon",
    sex: "Sexe",
    context: "Contexte",
  },
  sex: { XX: "XX", XY: "XY", unknown: "Inconnu" } satisfies Record<Sex, string>,
  context: {
    prenatal: "Prénatal",
    postnatal: "Postnatal",
  } satisfies Record<SampleContext, string>,

  files: {
    title: "Fichiers",
    description:
      "Les fichiers sont lus localement dans le navigateur, rien n'est envoyé.",
    bins: "Fichier de bins (TSV, CSV, BED)",
    segments: "Fichier de segments (BED, TSV, CSV)",
    demo: "Charger l'échantillon de démonstration",
    clearAll: "Effacer toutes les données",
    loading: "Lecture en cours…",
    binsLoaded: (n: number) => `${n.toLocaleString("fr-FR")} bins chargés`,
    segmentsLoaded: (n: number) => `${n.toLocaleString("fr-FR")} segments chargés`,
    cleared: "Toutes les données ont été effacées",
  },

  parseErrors: {
    empty_file: "Le fichier est vide.",
    missing_column: "Colonne obligatoire manquante",
    not_numeric: "Valeur non numérique",
    no_rows: "Aucune ligne sur les chromosomes 1-22, X, Y.",
    unknown: "Erreur de lecture du fichier.",
  } satisfies Record<ParseErrorCode | "unknown", string>,
  parseErrorAt: (line?: number, column?: string) =>
    [line ? `ligne ${line}` : null, column ? `colonne « ${column} »` : null]
      .filter(Boolean)
      .join(", "),

  thresholds: {
    title: "Seuils (log2)",
    gain: "Gain",
    loss: "Perte",
    showBins: "Afficher les bins",
    showBinsHint: "Désactivé : uniquement la moyenne mobile (couleur selon les seuils)",
    mosaicLines: "Lignes théoriques de mosaïque",
    movingAverage: "Moyenne mobile (bins)",
    movingAverageHint: "Nombre de bins de la moyenne mobile, 0 = aucune",
    medianSmoothing: "Lissage : médiane glissante (nb de bins, 1 = aucun)",
    medianSmoothingHint: "Médiane glissante appliquée aux points affichés",
    placeholderWarning: "Valeurs par défaut à valider par le laboratoire.",
  },

  genome: {
    title: "Vue génome entier",
    displaySettings: "Affichage des pistes",
    chromosomePanel: "Vue chromosome",
    chromosomeTitle: (chrom: string) => `Chromosome ${chrom}`,
    chromosomeHint:
      "Échelle fixe sur tout le chromosome. Surbrillance d'une région pour ouvrir la vue gène. Les barres verticales indiquent la fenêtre visible dans la vue gène.",
    pickChromosome: "Cliquez sur un chromosome dans la vue génome entier.",
    geneTitle: "Vue gène / région",
    geneHint: "Molette : zoom · Glisser : déplacer · Double-clic : revenir à la fenêtre d'origine",
    resetGeneWindow: "Tout le chromosome",
    clickHint: "Cliquez sur un chromosome pour l'afficher ci-dessous.",
    resetZoom: "Réinitialiser le zoom",
    empty: "Chargez un fichier de bins ou l'échantillon de démonstration.",
  },

  summary: {
    title: "Log2 médian par chromosome",
    description: "Bins non vides uniquement.",
    median: "Log2 médian",
  },

  segments: {
    title: "Segments",
    empty: "Aucun segment chargé.",
    location: "Localisation (hg38)",
    band: "Bande",
    size: "Taille",
    type: "Type",
    log2: "log2",
    bins: "Nb bins",
    mosaic: "Mosaïque",
    status: "Statut",
  },
  cnvType: { gain: "Gain", loss: "Perte", unknown: "—" },
  reviewStatus: {
    to_review: "À examiner",
    pathogenic: "Pathogène",
    vus: "VOUS",
    benign: "Bénin",
    artefact: "Artefact",
  } satisfies Record<ReviewStatus, string>,

  theme: { toggle: "Basculer le mode sombre" },
}

export const t = fr
