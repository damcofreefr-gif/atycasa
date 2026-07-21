# Topos de session — Atycasa

Suivi chronologique du projet, régénéré automatiquement tous les 15 jours
(Routine Claude Code). Objectif : garder une trace datée de ce qui a été
fait, de ce qui reste à faire, et du contexte produit (idées, souhaits),
notamment vis-à-vis d'une éventuelle mise en ligne Play Store future
(voir CLAUDE.md, section "Avant publication" — pas à l'ordre du jour
tant que Dam's n'a pas jugé l'app prête).

## Fichiers

- `topo_AAAA-MM-JJ.md` — un topo daté par cycle de 15 jours, archivé,
  jamais réécrit une fois créé.
- `LATEST.md` — copie exacte du contenu du topo le plus récent. C'est ce
  fichier que pointe `admin.html` à la racine du repo. Écrasé à chaque
  nouveau cycle.
- `notes.md` — bloc-notes libre pour les idées et souhaits au fil de
  l'eau (toi ou une session Claude normale peut y écrire à tout moment).
  Le prochain topo automatique digère son contenu dans sa section
  "Idées et souhaits", puis le vide.

## Workflow du cycle automatique (tous les 15 jours)

1. Lire `git log` depuis la date du dernier `topo_*.md`.
2. Lire `notes.md` (idées/souhaits en attente).
3. Lire ce topo précédent (continuité du "reste à faire").
4. Lire `CLAUDE.md` (contexte produit, règles non négociables).
5. Écrire `topo_AAAA-MM-JJ.md` (date du jour) : Contexte, Fait depuis le
   dernier topo, Idées et souhaits, Avant mise en ligne Play Store
   (si applicable), Points de vigilance.
6. Écraser `LATEST.md` avec le contenu du nouveau topo.
7. Vider `notes.md` (garder juste l'en-tête).
8. Commit + push directement sur `main` (autorisé pour cette tâche
   récurrente précise, sans validation préalable).
