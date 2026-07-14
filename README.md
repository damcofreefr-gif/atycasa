# 🏡 Atycasa

App de routine de rangement et nettoyage en micro-sessions, pensée pour les cerveaux TDAH.

## Mise en ligne (une seule fois)

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas.
2. Crée un nouveau dépôt (bouton **New repository**), nomme-le par exemple `atycasa`, coche **Public**, puis **Create repository**.
3. Sur la page du dépôt, clique **uploading an existing file**, glisse-dépose TOUS les fichiers de ce dossier (y compris le dossier `icons`), puis **Commit changes**.
4. Va dans **Settings → Pages**, section *Build and deployment* : Source = **Deploy from a branch**, Branch = **main** + dossier **/ (root)**, puis **Save**.
5. Attends 1-2 minutes. Ton app est en ligne à l'adresse :
   `https://TON-PSEUDO.github.io/atycasa/`

## Installation sur ton téléphone

- **Android (Chrome)** : ouvre l'adresse → menu ⋮ → **Installer l'application**.
- **iPhone (Safari)** : ouvre l'adresse → bouton Partager → **Sur l'écran d'accueil**.

L'app fonctionne ensuite hors ligne et tes données restent sur ton téléphone.

## Mettre à jour l'app

À chaque évolution : remplace les fichiers modifiés sur GitHub (bouton **Add file → Upload files**, ça écrase les anciens) → l'app se met à jour toute seule à sa prochaine ouverture avec du réseau.

## Tes données

- Tout est stocké **localement sur ton appareil** (localStorage). Rien ne part sur un serveur.
- Pense à faire un export de temps en temps : onglet **Zones → 💾 Exporter mes données**. Ça télécharge un fichier `.json` que tu peux réimporter si tu changes de téléphone ou si tu vides le cache du navigateur.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure et styles de l'app |
| `app.js` | Toute la logique (zones, fraîcheur, sessions, niveaux) |
| `manifest.webmanifest` | Fiche d'identité PWA (nom, icônes, couleurs) |
| `sw.js` | Service worker : hors ligne + mises à jour auto |
| `icons/` | Icônes de l'écran d'accueil |
