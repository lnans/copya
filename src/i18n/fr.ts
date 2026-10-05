import type { ParseErrorCode } from "@/lib/parse/table"
import type { SegmentCnvTypeKey } from "@/lib/cnv/segment-cnv-type"
import type { SegmentClassification, SampleContext, Sex } from "@/lib/types"

/** All UI strings. Add `en.ts` with the same shape for an English version. */
export const fr = {
  appTitle: "Visualiseur CNV",
  appSubtitle: "shallow WGS · GRCh38",
  offlineBadge: "Échantillon local · rien n'est envoyé au serveur",

  errorBoundary: {
    title: "L'application a rencontré une erreur",
    description:
      "Une exception non gérée a interrompu l'affichage. Les détails ci-dessous peuvent aider au diagnostic.",
    details: "Stack trace",
    reload: "Recharger la page",
    retry: "Réessayer sans recharger",
  },

  header: {
    brandTitle: "Copy Analysis",
    brandSubtitle: "Interactive visualization of genomic copy-number profiles",
    importSample: "Importer l'échantillon (bins et segments)",
    importAnnotations: "Importer les fichiers d'annotation",
  },

  footer: {
    about:
      "COPYA is a web-based viewer for interactive visualization and exploration of genome-wide copy-number profiles generated from sequencing data, with a current focus on shallow whole-genome sequencing.",
    developedBy:
      "Developed by the Cytogenetics Unit, Genetics Department, Hospices Civils de Lyon (HCL).",
    scientificTeamTitle: "Scientific team",
    scientificTeamMembers: "Charlotte Tardy · Mathilde Pujalte · Nicolas Chatron",
    developerTitle: "Developer",
    developerName: "Nans Laupretre",
    copyright: "© 2026 COPYA — Cytogenetics Unit, Hospices Civils de Lyon. All rights reserved.",
    disclaimer:
      "For research and professional use. COPYA is intended as a visualization and support tool and does not replace validated laboratory procedures, biological expertise, or clinical interpretation.",
  },

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
    bam: "Fichier BAM (alignements triés par coordonnées)",
    bai: "Index BAI du BAM",
    bamBinSize: "Taille de bin (pb)",
    bamConvert: "Générer le profil et afficher",
    bamConvertingTitle: "Conversion BAM → bins",
    bamConvertingHint: "Comptage des reads par fenêtre génomique (peut prendre plusieurs minutes).",
    bamConvertingHeader: "Lecture de l'en-tête BAM et préparation de l'index…",
    bamConvertingChrom: (chrom: string, step: number, total: number) =>
      `Chromosome ${chrom} (${step}/${total})`,
    bamConverted: (n: number, median: number) =>
      `${n.toLocaleString("fr-FR")} bins générés (médiane ${median.toLocaleString("fr-FR")} reads/bin)`,
    segments: "Fichier de segments (BED, TSV, CSV)",
    clearAll: "Effacer toutes les données",
    sampleDialogTitle: "Fichiers d'échantillon",
    sampleDialogDescription:
      "Chargez un BAM + BAI (ou les segments seuls si les bins existent déjà ailleurs), puis les annotations via l'icône calques. Tout reste local.",
    annotationsDialogTitle: "Annotations",
    loading: "Lecture en cours…",
    binsLoaded: (n: number) => `${n.toLocaleString("fr-FR")} bins chargés`,
    segmentsLoaded: (n: number) => `${n.toLocaleString("fr-FR")} segments chargés`,
    annotationsTitle: "Annotations (pistes vue région)",
    annotationsHint:
      "RefSeq, DGV Gold, DGV Supp. et ClinGen sont chargés automatiquement. OMIM, gnomAD SV et PanelApp restent optionnels — voir files/README.md",
    bundledAnnotationsLoadingTitle: "Chargement des annotations",
    bundledAnnotationsLoadingHint:
      "Lecture des pistes RefSeq, DGV et ClinGen. L’étape DGV Supp. est volumineuse (~1 Go décompressé) : comptez plusieurs minutes.",
    bundledAnnotationsLoadingStep: (label: string, step: number, total: number) =>
      `${label} (${step}/${total})`,
    bundledAnnotationsLoadFailed: "Impossible de charger les annotations intégrées.",
    bundledAnnotationsRetry: "Réessayer",
    annotationLoaded: (label: string, n: number) =>
      `${label} : ${n.toLocaleString("fr-FR")} entrées chargées`,
    omim: "OMIM (omimGene2)",
    clinGenGeneDisease: "ClinGen Gene-Disease (clinGenGeneDisease.bb)",
    refseq: "NCBI RefSeq",
    dgvGold: "DGV Gold (dgvGold.bb → BED)",
    dgvSupp: "DGV SuppVar (dgvSupporting)",
    gnomadSv: "gnomAD SV v4.1",
    panelApp: "PanelApp Australia (genesAus.bb → BED)",
    cleared: "Toutes les données ont été effacées",
  },

  annotationErrors: {
    empty_file: "Le fichier d'annotation est vide.",
    no_rows: "Aucune entrée valide (BED, DGV ou RefSeq genePred).",
  },

  annotationTracks: {
    omim: "OMIM",
    clinGenGeneDisease: "ClinGen Gene-Disease Validity",
    refseq: "RefSeq",
    dgvGold: "DGV Gold",
    dgvSupp: "DGV Supp.",
    gnomadSv: "gnomAD SV",
    missingFile: "Fichier non chargé (barre d'outils → Annotations).",
    emptyWindow: "Aucune entrée dans la fenêtre.",
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
    clickHint:
      "Caryotype vertical (style CytoGenomics) : idéogramme et profil par chromosome. Cliquez une colonne pour ouvrir le chromosome.",
    resetZoom: "Réinitialiser le zoom",
    empty: "Chargez un BAM + BAI pour générer et afficher le profil CNV (idéogrammes hg38 ci-dessus).",
    ideogram: "Bandes cytogénétiques (UCSC hg38)",
    regionField: "Région (chr:début-fin)",
    regionPlaceholder: "chr1:29,150,390-235,360,173",
    regionGo: "Aller à la région",
    regionInvalid: "Format attendu : chr1:29,150,390-235,360,173",
    geneSymbolField: "Gène (RefSeq)",
    geneSymbolPlaceholder: "BRAF, TP53…",
    geneSymbolGo: "Aller au gène",
    geneSymbolNotLoaded: "Chargez NCBI RefSeq via la barre d'outils (Annotations).",
    geneSymbolNotFound: "Symbole introuvable dans RefSeq.",
    geneSymbolAmbiguous: (chroms: string) =>
      `Symbole présent sur plusieurs chromosomes (${chroms}). Précisez via le champ région.`,
  },

  summary: {
    title: "Log2 médian par chromosome",
    description: "Bins non vides uniquement.",
    median: "Log2 médian",
  },

  segments: {
    title: "Segments",
    empty: "Aucun segment chargé.",
    chromosome: "Chromosome",
    start: "Start",
    stop: "Stop",
    cytoband: "Cytoband",
    geneNames: "Gene name",
    sizeBp: "Size (bp)",
    type: "Type",
    bins: "Bins",
    meanLogRatio: "Log ratio moyen",
    iscn: "ISCN (formule)",
    classification: "Classification",
    notes: "Notes",
  },
  cnvType: { gain: "Gain", loss: "Perte", unknown: "—" },
  segmentCnvType: {
    deletionHet: "Délétion hétérozygote",
    deletionHom: "Délétion homozygote",
    duplication: "Duplication",
    triplication: "Triplication",
    multiplication: "Multiplication",
    unknown: "—",
  } satisfies Record<SegmentCnvTypeKey, string>,
  segmentClassification: {
    unset: "—",
    benign: "Bénin",
    likely_benign: "Proba bénin",
    vus: "VSI",
    likely_pathogenic: "Proba patho",
    pathogenic: "Patho",
    piev: "PIEV",
  } satisfies Record<SegmentClassification, string>,
}

export const t = fr
