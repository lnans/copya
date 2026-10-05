# Cahier des charges : visualiseur web local de CNV (shallow WGS)

Version 0.1, à compléter après récupération d'exemples de fichiers réels au laboratoire.

## 1. Contexte et objectif

Le laboratoire de cytogénétique (diagnostic prénatal et postnatal) remplace sa CGH array par du **shallow WGS (séquençage génome entier à faible couverture)**. Le calling des CNV est fait par le pipeline bioinformatique existant. Il manque une **interface de visualisation** équivalente à Agilent CytoGenomics : vue génome entier, zoom chromosome, segments, annotations, mosaïques.

**Objectif** : un outil de visualisation et de revue des CNV, utilisé par des biologistes et internes, qui tourne **entièrement en local dans le navigateur**.

**Hors périmètre** : le calling des CNV et l'estimation des mosaïques. L'outil ne recalcule rien, il affiche ce que produit le pipeline.

## 2. Contraintes non négociables

1. **Aucune donnée patient ne quitte le navigateur** (fichiers lus via l'API File, pas d'upload vers un serveur). Pas de CDN externe, pas de télémétrie, pas d'analytics, pas d'API tierce.
2. **Déploiement** : site statique (HTML, JS/CSS bundlés, dossier `annotations/` sur le même hôte, p.ex. Azure Static Web Apps). Pas d'installation sur le poste utilisateur au-delà d'un navigateur récent (Chrome, Edge, Firefox).
3. **Génome de référence : GRCh38 (hg38)** uniquement dans la v1.
4. Les **échantillons** peuvent être ouverts hors ligne une fois l'application chargée ; le chargement initial de l'app et des annotations intégrées suppose l'hôte statique (requêtes same-origin uniquement).
5. **Interface en français** (textes facilement externalisables pour une version anglaise).
6. **Les données patient ne sont jamais persistées** (pas de localStorage/IndexedDB avec des données d'échantillon). Seules les annotations (non nominatives) peuvent être mises en cache.

## 3. Utilisateurs et usage

- Biologistes médicaux, internes, techniciens de cytogénétique.
- Usage en routine : ouvrir un échantillon, parcourir le génome, inspecter chaque segment, annoter, exporter une capture ou un tableau pour le compte rendu.
- Deux contextes avec des réglages par défaut différents : **prénatal** (résolution et seuils souvent plus prudents, attention au mosaïcisme et au contaminant maternel) et **postnatal**. Prévoir des **presets** de seuils modifiables.

## 4. Données d'entrée

### 4.1 Formats à supporter (phase 1)

| Type          | Formats                                   | Contenu minimal                                                                         |
| ------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Bins / ratios | TSV, CSV, BED-like (avec ou sans en-tête) | chr, début, fin, ratio ou log2 (éventuellement z-score, nb de reads)                    |
| Segments CNV  | BED, TSV, CSV, VCF (SVTYPE=CNV/DEL/DUP)   | chr, début, fin, log2 ou copy number, optionnel : nb de bins, statut, % mosaïque estimé |

**Le format exact dépend de l'outil du pipeline (WisecondorX, ichorCNA, QDNAseq ou autre) et sera précisé après analyse d'un exemple réel.** D'où l'exigence suivante.

### 4.2 Mappeur de colonnes (indispensable)

- Détection automatique du séparateur, de la présence d'en-tête et du nom des colonnes (chr/chrom/#CHROM, start/begin/pos, end/stop, log2/ratio/copy_ratio, etc.).
- Écran de confirmation : aperçu des 10 premières lignes, choix manuel de la colonne correspondant à chaque champ, choix de l'échelle (log2 ou ratio linéaire, conversion automatique).
- Normalisation des noms de chromosomes (`chr1` / `1`, `X`/`23`, `Y`/`24`).
- **Profils de format enregistrables** (en JSON exportable/importable) pour ne pas refaire le mapping à chaque fois.
- Messages d'erreur clairs (ligne fautive, colonne manquante).

### 4.3 Phase 2 : BAM / CRAM

- Lecture directe d'un BAM/CRAM + index dans le navigateur, comptage en bins de taille configurable, affichage de la profondeur/ratio.
- À traiter avec des bibliothèques JS embarquées (par exemple `@gmod/bam`, `@gmod/cram`), en Web Worker, sans jamais charger le fichier entier en mémoire.
- Hors MVP, à ne lancer qu'une fois la phase 1 validée.

### 4.4 Métadonnées échantillon

Champs saisis ou lus : identifiant échantillon, sexe (XX/XY/inconnu), type (prénatal/postnatal), taille de bin, version du pipeline. Le sexe sert à afficher correctement X et Y.

## 5. Fonctionnalités

Priorités : **M** = indispensable (MVP), **S** = souhaitable, **C** = confort.

### 5.1 Vue génome entier (M)

- Tous les chromosomes (1 à 22, X, Y) concaténés sur un axe, séparateurs et étiquettes de chromosomes.
- Un point par bin (log2), segments du pipeline en surcouche (ligne épaisse à la valeur du segment).
- Lignes de référence horizontales : 0 (diploïde), seuils de gain et de perte configurables.
- Code couleur : gains, pertes, neutre, par défaut type CytoGenomics (rouge pour les gains, bleu pour les pertes, à ajuster).
- Axe Y réglable (plage et échelle), bascule log2 / ratio / copy number.
- Clic ou sélection sur un chromosome, ou sur un segment, pour zoomer.
- Performance : fluide avec 30 000 à 300 000 bins (rendu Canvas 2D ou WebGL, décimation au dézoom).

### 5.2 Vue chromosome et zoom (M)

- Zoom/déplacement à la souris et au clavier, sélection d'une fenêtre par glisser, saisie de coordonnées (`chr22:18,000,000-22,000,000`) ou d'un nom de gène.
- **Idéogramme** hg38 avec bandes cytogénétiques (fichier `cytoBand` UCSC) et indicateur de la région affichée.
- Pistes empilées et alignées sur le même axe : ratios, segments, gènes, régions ClinGen, DGV.
- Historique de navigation (précédent/suivant), bouton « retour génome entier ».

### 5.3 Affichage des mosaïques (M, visualisation seule)

- Les segments à valeur intermédiaire sont visibles et distingués visuellement (code couleur ou intensité selon le log2, pas de seuil binaire).
- Si le pipeline fournit un **% de mosaïque** ou un copy number non entier, l'afficher dans l'infobulle et le tableau.
- **Lignes de référence théoriques** activables, pour aider à l'œil : pour une fraction `f` de cellules anormales, le log2 attendu vaut `log2(1 + f/2)` pour un gain d'une copie et `log2(1 − f/2)` pour une perte d'une copie. Afficher par exemple f = 10 %, 20 %, 30 %, 50 %, 100 %.
- Aucun calling ni estimation recalculés dans l'outil.

### 5.4 Tableau des segments (M)

Colonnes : localisation (chr:début-fin, hg38), bande cytogénétique, taille, type (gain/perte/mosaïque si fourni), log2, nb de bins, nb de gènes, gènes OMIM morbides, score ClinGen, % de chevauchement DGV.

- Tri, filtres (taille minimale, |log2| minimal, type, chromosome, présence de gène OMIM, etc.), recherche texte.
- Clic sur une ligne = zoom sur le segment, et inversement clic sur segment = ligne surlignée.
- **Statut de revue par segment** saisi par l'utilisateur (à examiner / pathogène / VOUS / bénin / artefact), utilisé pour l'export.

### 5.5 Annotations (M)

Toutes **locales**, embarquées ou chargées depuis des fichiers locaux :

- **Gènes RefSeq** (de préférence transcrits MANE Select GRCh38), avec piste gènes et recherche par nom.
- **ClinGen** : régions et gènes de sensibilité au dosage (scores HI / TS), sans aucune requête web.
- **DGV** : variants de la population générale GRCh38, avec calcul du chevauchement (en % du segment et réciproque) et de la fréquence quand disponible.
- **OMIM (licence)** : **ne jamais distribuer dans l'outil.** Import par le laboratoire de son propre export sous licence (`genemap2.txt` par exemple) via un sélecteur de fichier, conservé localement (annotations seulement).
- Modularité : pistes d'annotation facultatives (S) pour ajouter ensuite DECIPHER, gnomAD-SV, pLI/HI, régions récurrentes (22q11.2, 15q11-q13…), ou un fichier BED/GFF personnalisé du labo.

### 5.6 Fiche segment (M)

Au clic sur un segment : coordonnées, bandes, taille, log2/mosaïque, liste des gènes (avec marquage OMIM morbide et HI/TS ClinGen), régions ClinGen chevauchées, chevauchement DGV, commentaire libre.

### 5.7 Nomenclature ISCN (S)

Génération d'une **proposition** de formule `arr[GRCh38] ...` à partir des segments retenus, toujours modifiable, avec mention claire qu'elle doit être vérifiée par un biologiste.

### 5.8 Export et traçabilité (M pour les captures et le tableau, S pour le rapport)

- Export **PNG et SVG** de la vue courante (génome entier et chromosome).
- Export **TSV/CSV** du tableau de segments avec statuts.
- Rapport imprimable (HTML/PDF via impression navigateur) : en-tête avec identifiant, date, nom du fichier source, **somme de contrôle SHA-256**, version de l'outil, version des annotations, build hg38, paramètres de seuils.
- Bouton **« Effacer toutes les données »**.

### 5.9 Confort (C)

- Comparaison côte à côte de 2 échantillons (par exemple trio, ou contrôle).
- Mode sombre, raccourcis clavier, annotation de régions d'intérêt.

## 6. Architecture technique recommandée

- **TypeScript**, build **Vite** → dossier `dist/` (`index.html`, assets, `annotations/` copié depuis `public/`).
- Rendu : **Canvas 2D** (suffisant en général) ou WebGL si besoin ; éviter un DOM/SVG par point.
- **Web Workers** pour le parsing et les calculs de chevauchement ; fichiers lus en flux via l'API File, sans envoi nulle part.
- Structures en mémoire typées (`Float32Array`, `Uint32Array`) ; index par intervalles (arbre d'intervalles ou tri + recherche binaire) pour les chevauchements.
- Annotations intégrées : fichiers BED/gzip servis sous `/annotations/`, chargés au démarrage (`fetch` same-origin, gros fichiers parsés en flux). Import manuel complémentaire via sélecteur de fichier (OMIM, gnomAD, etc.).
- **Aucun CDN** : toutes les dépendances sont bundlées.
- État de l'application sérialisable (paramètres, statuts de revue) sans données patient brutes.
- Code testé (Vitest) : parseurs, mappeur de colonnes, conversions, chevauchements.

## 7. Sécurité et confidentialité

- Balise `<meta http-equiv="Content-Security-Policy">` restrictive : ressources et `connect-src` limités au **même origine** que l'application (pas de domaines externes).
- **Test de recette** : onglet Réseau pendant un scénario → uniquement l'hôte de l'app (HTML, assets, `/annotations/*`) ; aucune requête vers un domaine tiers ; les fichiers patient restent en local (File API).
- Pas de stockage navigateur de données patient ; les noms de fichiers sont affichables ou masquables (option d'anonymisation à l'affichage et à l'export).
- Conserver la liste et les licences des dépendances.

## 8. Données de test (aucun fichier patient nécessaire)

Il n'y a pas d'exemple réel pour l'instant, donc le développeur prévoit :

1. **Un générateur Python de données synthétiques hg38** (`make_test_data.py`) : bins de 50 ou 100 kb, bruit gaussien réaliste (écart-type de 0,05 à 0,15 en log2), dérive légère et quelques bins aberrants, avec des anomalies injectées dont les coordonnées sont connues :
   - trisomie 21 complète (gain entier) ;
   - trisomie 21 en **mosaïque à 30 %** ;
   - délétion 1p36 (~ 5 Mb) et duplication 22q11.2 (~ 3 Mb) ;
   - petite délétion d'environ 300 kb (limite de résolution) ;
   - profils XX, XY, XXY, et mosaïque X ;
   - un fichier de segments correspondant, dans 2 ou 3 formats de colonnes différents pour tester le mappeur.
2. **Données publiques** : les BAM/CRAM du projet 1000 Genomes (couverture basse) ou GIAB, sous-échantillonnés avec `samtools view -s`, puis passés dans WisecondorX, ichorCNA ou QDNAseq pour obtenir de vrais fichiers de bins et segments. Les jeux de démonstration de ces outils servent aussi de référence de format.
3. **Sources d'annotations libres à télécharger** (le développeur vérifie la version, le build GRCh38 et la licence de chacune) : UCSC `cytoBand` ; RefSeq/MANE (NCBI) ; ClinGen dosage sensitivity (FTP ClinGen) ; DGV (Database of Genomic Variants).

## 9. Critères d'acceptation (MVP)

- Accès via l'URL du site statique ; chargement des annotations intégrées depuis le même hôte.
- Chargement d'un fichier de bins de 100 000 lignes + segments en moins de 3 secondes, interaction fluide ensuite.
- Le mappeur de colonnes charge correctement les 3 formats synthétiques de test.
- Les anomalies injectées sont visibles aux bonnes coordonnées, avec bonnes bandes, gènes et annotations.
- La mosaïque à 30 % est visiblement distincte d'un gain entier, et les lignes théoriques correspondent.
- Filtre/tri du tableau et liaison tableau ↔️ graphique opérationnels.
- Export PNG/SVG, TSV et rapport imprimable avec traçabilité.
- Test réseau : aucune requête vers un domaine autre que celui du site statique ; pas d'upload de données patient.
- Import OMIM local fonctionnel, et aucune donnée OMIM dans le fichier distribué.

## 10. Livrables et phases

1. **Phase 1 (MVP)** : sections 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8 partiellement, générateur de données de test, tests automatisés.
2. **Phase 2** : lecture BAM/CRAM, ISCN, rapport complet, pistes d'annotation additionnelles.
3. **Phase 3** : comparaison d'échantillons, confort.

Livrables : code source versionné (Git), artefact `dist/` prêt à publier sur un hébergeur statique, documentation utilisateur courte en français, documentation de la construction des annotations (sources, versions, scripts de conversion), jeux de données de test.

## 11. Cadre réglementaire et qualité (à clarifier avec le laboratoire)

Pour un usage en diagnostic de routine, l'outil relève de la démarche qualité du laboratoire (vérification/validation des méthodes et des logiciels dans le cadre de l'accréditation ISO 15189, traçabilité des versions, gestion des données de santé au titre du RGPD). Le cahier des charges ci-dessus ne remplace pas ces démarches : prévoir avec le responsable qualité et la DSI la **validation de l'outil**, sa version figée et son mode de diffusion sur les postes.

## 12. Points à préciser après retour du laboratoire

- Outil réel de calling et format exact des fichiers de bins et de segments (en-têtes, colonnes).
- Taille de bin utilisée et traitement des chromosomes sexuels.
- Présence ou non d'un % de mosaïque dans la sortie du pipeline.
- Seuils en usage (gain, perte, mosaïque) pour le prénatal et le postnatal.
- Éléments attendus dans le compte rendu (capture, tableau, formule ISCN).

## 13. Conseils pour développer avec une IA

- Avancer **par petites étapes testables** : d'abord le générateur de données et les parseurs avec tests, puis la vue génome, puis le zoom, puis les annotations.
- Donner ce document en contexte à chaque session et demander du code **avec tests** à chaque module.
- Faire relire le rendu par la biologiste (Charlotte) à chaque étape sur les données synthétiques.
- Vérifier soi-même les points de sécurité (section 7), qui ne doivent pas être déléguées sans contrôle.
