# Atycasa — Topo session
Date : 2026-07-21 (premier topo, tous les 15 jours désormais)

## Contexte

PWA mobile de routine de rangement/nettoyage conçue pour un cerveau
TDAH. Principe central : réduire la friction et la culpabilité à zéro.
Plan de maison en pixel-art, fraîcheur des zones qui se dégrade (jamais
de "retard" affiché), sessions chronométrées type "arrosage".

- Repo : `damcofreefr-gif/atycasa` (public), branche `main`.
- Vanilla JS pur, aucun framework/bundler/build. Déploiement = push des
  fichiers statiques sur GitHub Pages.
- Aucun backend, aucun compte utilisateur — tout en `localStorage`
  (clé `maison-v1`). Seule exception : Atynote (bloc-note partagé),
  qui utilise Firebase Realtime Database pour le partage en direct
  entre deux téléphones.
- Voir `CLAUDE.md` à la racine pour les règles produit non négociables
  et le détail des mécaniques (fraîcheur, combo, Atyclock, Atygo,
  Atynote) — ce topo ne les reproduit pas, il suit leur évolution.

## Fait depuis le dernier topo

*(Historique complet depuis le début visible du repo, 50 commits du
17 au 19/07 — pas de topo précédent à ce système.)*

**Atycasa (cœur de l'app)**
- Fond anthracite réchauffé (undertone chaud plutôt que noir-bleu
  froid) pour rester cohérent avec le ton "chaleureux, jamais
  culpabilisant".
- Scène décorative en bas de l'onglet Maison : fleur qui fane puis se
  fait arroser en boucle (purement visuelle, comble le vide quand le
  contenu est court).
- La modale de proposition "Plus tard" propose désormais une autre zone
  assoiffée en chaîne plutôt que de simplement se refermer.
- Icône de l'app retravaillée (toit orange, fenêtre centrée à l'étage,
  porte à gauche, carrés fondus pour rappeler le plan de l'appli).

**Atyclock (rappel programmable)**
- Nombreuses itérations d'ergonomie : agrandissement horloge et bouton
  de validation, fusion de la cloche dans le bouton, suppression du
  scroll vertical, refonte des espacements.
- Alarme sonore : ajoutée, corrigée (déblocage iOS), sonne en boucle
  jusqu'à arrêt explicite (jamais d'arrêt automatique sur délai).
- Bouton +1 min ajouté (en plus de +15 min, qui remplace +30 min).
- Rappel quotidien : correction de la remise à zéro (cas "mode
  quotidien oublié").
- Pulsation des icônes 🕐/🏡 à la place des points verts, pour signaler
  un rappel en cours / une zone assoiffée — plus visible.
- Navigation croisée en en-tête (miroir Atycasa ↔ Atyclock).

**Atygo (déblocage / démarrage d'action)**
- Créé cette période : propose une micro-action précise face à
  l'indécision, indépendant d'Atycasa/Atyclock en données.
- Icône ⚡ → 🪄, catégorie Plantes distincte des Animaux, cohérence
  temporelle entre suggestions (plage horaire, malus de durée doux),
  "ne plus proposer cette action", questions de départ revisitables,
  bilan du jour (notif + badge), point d'info contextuel avec lien
  externe sur certaines actions, actions "Jeter 5 mails" et "Séance de
  brain gym" ajoutées.

**Atynote (bloc-note partagé)**
- Créé cette période : bloc-note de suggestions partagé en direct via
  Firebase Realtime Database — seule sortie du localStorage pur dans
  tout le projet, justifiée par le besoin de partage en direct entre
  deux téléphones.

## Idées et souhaits

*(Rien dans `notes.md` à digérer pour ce premier cycle.)*

## Avant mise en ligne Play Store

Pas de projet TWA/Bubblewrap commencé pour Atycasa (contrairement à
Atyroad). Pour rappel (voir CLAUDE.md, "Avant publication") : un vrai
widget Android natif nécessiterait d'empaqueter l'app en Trusted Web
Activity (Bubblewrap) puis d'écrire un App Widget natif (Kotlin) — un
projet à part, hors du cadre vanilla JS actuel. **Ne pas lancer
spontanément** : c'est à Dam's de juger l'app prête et de relancer le
sujet.

Si ce sujet est un jour relancé, l'audit et les corrections déjà faits
sur Atyroad (CGU publiques, keystore hors repo, assetlinks, icône
maskable, npm audit) donnent un modèle direct à réappliquer ici.

## Points de vigilance

| Point | État |
|---|---|
| Compte / auth | Aucun — par choix produit (zéro friction). Atynote reste sans vrai compte (juste un prénom local). |
| TWA / Play Store | Non commencé, à l'initiative de Dam's uniquement |
| Widget Android natif | Discussion à reprendre plus tard (CLAUDE.md) |
