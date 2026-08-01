# Atycasa — Topo session
Date : 2026-07-21 (premier topo, tous les 15 jours désormais)

## Contexte

PWA mobile de routine de rangement/nettoyage conçue pour un cerveau
TDAH. Principe central : réduire la friction et la culpabilité à zéro.
Plan de maison en pixel-art, fraîcheur des zones qui se dégrade (jamais
de "retard" affiché), sessions chronométrées type "arrosage".

- Repo : `damcofreefr-gif/atycasa` (public à ce jour — passage en privé
  prévu, manuel, voir plus bas), branche `main` en production, mais les
  derniers commits (verrou d'accès inclus) sont pour l'instant sur
  `claude/atyroad-vehicle-selection-m10nrq`, pas encore mergés.
- Vanilla JS pur, aucun framework/bundler/build. Hébergement réel :
  **Vercel** (confirmé le 21/07 — CLAUDE.md mentionne encore GitHub
  Pages, à corriger/vérifier, incohérence non résolue dans ce cycle).
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

**Verrou d'accès (21/07, en fin de journée)**
- Repo passé en revue pour la sécurité : `android.keystore` n'existe
  pas ici (c'est un sujet Atyroad), mais la question posée était plus
  large — "sécuriser les applis pour qu'aucun inconnu ne puisse s'y
  connecter, et sécuriser aussi les repos".
- Un premier réflexe (QR code + petit contrôle en JS côté client) a été
  écarté après explication : sur un site 100% statique, un contrôle en
  JS classique est lisible et contournable par n'importe qui ouvrant les
  devtools — ça décourage un curieux, ça n'empêche pas un visiteur un
  peu motivé.
- Solution retenue : **Edge Middleware Vercel**. Ce code tourne côté
  serveur Vercel, avant même que la page ne soit envoyée au navigateur
  — il n'est jamais visible ni modifiable depuis le poste du visiteur,
  contrairement à du JS embarqué dans la page. Gratuit sur le plan
  Vercel actuel (Hobby), fonctionne sur l'URL `*.vercel.app` par défaut
  (pas besoin d'acheter un nom de domaine).
- Fichiers ajoutés : `middleware.js` (la vérification elle-même) et
  `invite.html` (petit écran "entre ton code d'accès").
- Deux codes secrets distincts, à configurer par Dam's dans les
  variables d'environnement Vercel (jamais dans le code, jamais dans
  git) :
  - `ATYCASA_INVITE_CODE` — le code "grand public" à partager (lien ou
    QR code) aux personnes invitées.
  - `ATYCASA_ADMIN_CODE` — un code séparé, réservé à Dam's, qui donne
    en plus accès à `admin.html`.
  - `ATYCASA_COOKIE_SECRET` — sert uniquement à signer les cookies,
    jamais partagé avec personne.
- **Tant que ces variables ne sont pas configurées côté Vercel, rien
  n'est bloqué** — le middleware laisse tout passer par défaut
  (choix délibéré, pour ne jamais casser l'appli par erreur de config).
  Donc à ce jour (21/07), l'appli est toujours ouverte à tous comme
  avant. Voir `notes.md` pour la checklist exacte de mise en service.

### Implications pour ta propre connexion (Dam's)

- Une fois les variables configurées, **toi aussi tu seras bloqué** au
  premier accès si tu arrives sans code (par ex. via un vieux favori
  dans ton navigateur) — il n'y a pas de compte "propriétaire"
  reconnu automatiquement, uniquement la possession du bon code.
- Pour retrouver l'accès complet (y compris `admin.html`), il te faudra
  visiter une fois une URL contenant ton code admin
  (`?invite=TON_CODE_ADMIN`). Un cookie est alors posé sur cet
  appareil/navigateur précis, valable 1 an — pas besoin de le refaire à
  chaque visite ni de changer d'appareil pour ça, mais un nouvel
  appareil ou un navigateur différent (ou un mode privé) redemandera le
  code.
- Le code admin donne accès à tout, y compris ce que voient les
  personnes invitées avec le code général — tu n'as donc besoin que
  d'un seul lien pour toi-même.

### Implications pour les autres personnes (invités)

- Une personne sans aucun code n'a plus aucun accès à l'appli, y
  compris aux fichiers statiques (icônes, manifest, service worker) —
  le blocage est volontairement large (`matcher: '/:path*'`, tout est
  concerné sauf la page de saisie du code elle-même).
- Une personne avec le code général (`ATYCASA_INVITE_CODE`) obtient
  l'accès complet à l'appli, mais **jamais** à `admin.html`, même en
  devinant ou en tapant directement cette URL.
- Le cookie posé après un code valide dure 1 an sur cet appareil ;
  passé ce délai, la personne devra ressaisir le code.
- **Révocation** — deux niveaux, à bien distinguer :
  - Changer `ATYCASA_INVITE_CODE` seul : bloque les *nouvelles*
    tentatives avec l'ancien code, mais ne déconnecte **pas** les
    personnes qui ont déjà un cookie valide (elles gardent l'accès
    jusqu'à expiration du cookie, un an après leur première visite).
  - Changer `ATYCASA_COOKIE_SECRET` : invalide **tous** les cookies
    existants d'un coup, pour tout le monde y compris Dam's — tout le
    monde devra ressaisir un code après ça. C'est le seul levier pour
    "réinitialiser" tout le monde en même temps.
  - Il n'existe pas aujourd'hui de moyen de révoquer une seule personne
    invitée sans déconnecter tout le monde (conséquence du choix "un
    seul code partagé" plutôt qu'un code par personne, décidé pour
    aller plus vite — un code par personne resterait possible plus
    tard si le besoin s'en fait sentir, ça demanderait un petit
    stockage en plus, type Vercel Edge Config).

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
| Compte / auth | Toujours aucun vrai compte (Atynote reste juste un prénom local). Remplacé pour l'accès global par un code d'invitation vérifié côté serveur (voir ci-dessus) — pas un compte, mais un vrai verrou. |
| Verrou d'accès (middleware) | Code écrit et poussé, **inactif** tant que les 3 variables d'environnement ne sont pas configurées sur Vercel — action manuelle requise |
| Branche | Verrou d'accès + admin.html sur `claude/atyroad-vehicle-selection-m10nrq`, pas encore mergés sur `main` |
| Repo public | Toujours public — passage en privé manuel non fait (gratuit, sans impact Vercel) |
| Hébergement réel | Vercel confirmé — CLAUDE.md à corriger (mentionne encore GitHub Pages) |
| TWA / Play Store | Non commencé, à l'initiative de Dam's uniquement |
| Widget Android natif | Discussion à reprendre plus tard (CLAUDE.md) |
