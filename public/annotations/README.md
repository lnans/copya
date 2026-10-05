# Annotations servies avec l’app

Ces fichiers sont chargés automatiquement au démarrage (`fetch` sur `/annotations/…`). Ils ne sont pas versionnés s’ils sont volumineux (voir `.gitignore`).

| Fichier attendu              | Source typique |
| ---------------------------- | -------------- |
| `clingen-gene-disease.bed`   | `yarn annotations:clingen` (BigBed UCSC → BED) |
| `dgv-gold.bed`               | `yarn annotations:dgv-gold` |
| `dgv-supp.txt.gz`            | export UCSC `dgvSupporting.txt.gz` (renommer si besoin) |
| `refseq.txt.gz`              | export NCBI `ncbiRefSeq.txt.gz` (renommer si besoin) |

Place les téléchargements ou les sorties des scripts **directement ici**, avec ces noms. `yarn build` les copie tels quels dans `dist/annotations/`.

Pour l’import manuel (OMIM, gnomAD, etc.), utilise le dialogue Annotations dans l’app ; `files/` reste utile pour préparer ces exports (`yarn annotations:prepare`).
