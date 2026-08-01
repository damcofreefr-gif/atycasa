# Atycasa — Topo session
Date : 2026-08-01

## Contexte

PWA mobile de routine de rangement/nettoyage conçue pour un cerveau
TDAH. Principe central : réduire la friction et la culpabilité à zéro.
Plan de maison en pixel-art, fraîcheur des zones qui se dégrade (jamais
de "retard" affiché), sessions chronométrées type "arrosage".

- Repo : `damcofreefr-gif/atycasa` (toujours public à ce jour — voir
  Points de vigilance), branche `main` en production.
- Vanilla JS pur, aucun framework/bundler/build. Hébergement réel :
  **Vercel** — CLAUDE.md corrigé ce cycle (mentionnait encore GitHub
  Pages par erreur, incohérence héritée du cycle précédent).
- Aucun backend, aucun compte utilisateur — tout en `localStorage`
  (clé `maison-v1`). Seule exception : Atynote (bloc-note partagé),
  qui utilise Firebase Realtime Database pour le partage en direct
  entre deux téléphones.
- Voir `CLAUDE.md` à la racine pour les règles produit non négociables
  et le détail des mécaniques — ce topo ne les reproduit pas, il suit
  leur évolution.

## Fait depuis le dernier topo

**Fusion de la branche verrou d'accès (01/08)**
- `claude/atyroad-vehicle-selection-m10nrq` (verrou d'accès Edge
  Middleware + `admin.html` + `topos_sessions/`, écrite le 21/07 mais
  jamais mergée) fusionnée dans `main` sans conflit. `main` avait
  entre-temps gagné Boost (voir plus bas) ; les deux historiques ont
  divergé proprement depuis un ancêtre commun, fusion propre.
- CLAUDE.md corrigé pour refléter la réalité : section "Accès / verrou"
  ajoutée (documentait nulle part avant), ligne de déploiement
  GitHub Pages → Vercel.
- Nouvelle section "Règles de collaboration Claude" commune aux 4
  applis Zéphyr Apps (Atycasa, Atyroad, Atyread, Sanpévé) : autocommit
  sans confirmation systématique, continuité via `topos_sessions/`.
  Demande explicite de Dam's ce cycle : harmoniser le workflow entre
  les 4 applis pour la continuité de développement (voir aussi les
  topos Atyroad/Atyread/Sanpévé du même jour).

**Boost — priorité du moment + relance douce (entre le 21/07 et le
01/08, avant la fusion ci-dessus)**
- Phase 1 livrée : bouton ⚡, flow de définition en 3 écrans (priorité
  du moment + première action + récap), rappels programmables (15/30/60
  min) avec bannière + notification service worker, chronométrage
  (démarrer/pause/terminer, minimum 1 minute comptée), détection
  d'absence prolongée ("Tu es toujours dessus ?"), mise en veille
  automatique après 3 rappels sans réaction, graphique hebdomadaire en
  CSS pur. Voir CLAUDE.md pour le détail complet des règles produit.
- Phase 2 (push serveur Supabase, pour les rappels app fermée) pas
  commencée — attend un feu vert explicite + mise en place Supabase.

**Atyclock**
- Resserrement de la mise en page pour tenir sans scroll.

**Rappel agenda du matin**
- Architecture v1 ajoutée à Atyclock (rappel quotidien auto-créé à 8h,
  ouvre Google Calendar). Voir CLAUDE.md pour le détail.

## Idées et souhaits

**Checklist mise en service du verrou d'accès (notée le 21/07,
toujours en attente)** — `middleware.js` + `invite.html` sont en place
mais inactifs (fail-open) tant que ces 3 variables d'environnement ne
sont pas configurées sur Vercel (Project Settings → Environment
Variables, Production + Preview) :
- `ATYCASA_COOKIE_SECRET` — secret de signature des cookies, jamais
  partagé
- `ATYCASA_INVITE_CODE` — code donné aux personnes invitées (accès à
  l'app, jamais à `/admin.html`)
- `ATYCASA_ADMIN_CODE` — code réservé à Dam's (accès à tout, y compris
  `/admin.html`)

Valeurs générées proposées dans la conversation Claude du 21/07/2026 —
à récupérer là, ou à remplacer par ses propres valeurs. Après ajout des
variables : redéployer (un nouveau push suffit, ou "Redeploy" depuis le
dashboard Vercel). Vérifier ensuite que l'app est bien bloquée sans
code avant de considérer que c'est en service.

## Avant mise en ligne Play Store

Pas de projet TWA/Bubblewrap commencé pour Atycasa (contrairement à
Atyroad). Pour rappel (voir CLAUDE.md, "Avant publication") : un vrai
widget Android natif nécessiterait d'empaqueter l'app en Trusted Web
Activity (Bubblewrap) puis d'écrire un App Widget natif (Kotlin) — un
projet à part, hors du cadre vanilla JS actuel. **Ne pas lancer
spontanément** : c'est à Dam's de juger l'app prête et de relancer le
sujet.

## Points de vigilance

| Point | État |
|---|---|
| Compte / auth | Toujours aucun vrai compte (Atynote reste juste un prénom local). Remplacé pour l'accès global par un code d'invitation vérifié côté serveur. |
| Verrou d'accès (middleware) | Fusionné sur `main` ce cycle, code actif dès que les 3 variables Vercel seront configurées — **inactif** pour l'instant (voir Idées et souhaits) |
| Branche | ✅ Résolu ce cycle — `claude/atyroad-vehicle-selection-m10nrq` fusionnée dans `main` |
| Repo public | Toujours public — passage en privé manuel non fait (gratuit, sans impact Vercel) |
| Hébergement réel | ✅ Résolu ce cycle — CLAUDE.md corrigé (Vercel, plus GitHub Pages) |
| Routine topos périodiques | La Routine automatique existait déjà pour Atycasa/Atyroad/Atyread mais échouait silencieusement sur Atycasa (dossier `topos_sessions/` inexistant sur `main` jusqu'à ce cycle). Routine mise à jour ce cycle pour inclure aussi Sanpévé (4 applis) — à vérifier au prochain déclenchement (16/08) que les 4 repos sont bien traités. |
| TWA / Play Store | Non commencé, à l'initiative de Dam's uniquement |
| Widget Android natif | Discussion à reprendre plus tard (CLAUDE.md) |
