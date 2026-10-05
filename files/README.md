# Données locales (`files/`)

Échantillons BAM/BAI/BED et exports d’annotation pour **import manuel** dans l’app (non versionnés).

## Annotations auto-chargées

Les pistes ClinGen, DGV et RefSeq au démarrage viennent de **`public/annotations/`** (voir `public/annotations/README.md`), pas de ce dossier.

## Fichiers pour l’import via l’UI

| Fichier canonique (optionnel) | Source |
| ----------------------------- | ------ |
| `omim.bed`                    | UCSC Table Browser `omimGene2` |
| `refseq.gp.txt`               | `ncbiRefSeq.txt.gz` |
| `gnomad-sv.bed`               | `gnomad.v4.1.sv.sites.bed.gz` |

Après téléchargement dans `files/` :

```bash
yarn annotations:prepare
```

Décompresse/renomme les archives UCSC dans `files/` pour faciliter l’import par sélecteur de fichiers.

Les dumps génome entier sont très lourds ; privilégier des exports **régionaux** (Table Browser) pour limiter la mémoire du navigateur.
