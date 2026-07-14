# Atycasa

## Vision
PWA mobile de routine de rangement/nettoyage conçue pour un cerveau TDAH.
Principe central : réduire la friction et la culpabilité à zéro.
L'app affiche un plan de maison en pixel-art ; chaque zone a une "fraîcheur"
qui se dégrade avec le temps (métaphore : une fleur qui fane, qu'on arrose
par des sessions chronométrées).

## Règles produit NON NÉGOCIABLES
- Fraîcheur qui se dégrade, jamais de dette qui s'accumule. On n'affiche
  jamais de retard, de streak cassé, ou de temps "dû". Une zone a "soif",
  elle n'est jamais "en retard".
- Toute session compte. Arrêter à 5 min sur 15 est une réussite, pas un
  échec. Le bouton s'appelle "J'arrête là (ça compte !)".
- Zéro friction au lancement : un seul gros bouton GO qui propose la zone
  la plus assoiffée. Aucune décision à prendre pour démarrer.
- Ton de l'app : chaleureux, jamais culpabilisant. Textes en français.

## Mécaniques
- Zones quotidiennes (sessions 15 min, dégradation ~3 jours) vs
  expéditions (garage, cave… sessions 45 min, dégradation ~21 jours).
- Expéditions : durée suggérée augmente si très fanée (45 → 60 → 75 min,
  plafonné à 75 — jamais plus, plafond anti-découragement).
- 60 min cumulées sur une zone = niveau +1 = dégradation ralentie de 15 %
  par niveau.
- Combo : si une autre zone du même étage a une fraîcheur < 50 %, on la
  suggère en complément (rentabiliser le déplacement).
- Fleur au centre de chaque zone : 🌸 ≥70 % → 🌷 ≥45 % → 🥀 ≥20 % → 🍂 <20 %.

## Architecture — contraintes strictes
- Vanilla JS uniquement. Aucun framework, aucun bundler, aucun build.
  Déploiement = push des fichiers statiques tels quels sur GitHub Pages.
- Fichiers : index.html (structure + styles), app.js (toute la logique),
  sw.js (service worker network-first : chaque push met à jour l'app
  installée), manifest.webmanifest, icons/.
- Données : localStorage clé "maison-v1", objet {floors, zones, cells}.
  Export/import JSON de secours dans l'onglet Zones. Aucun serveur.
- Modèle zone : {id, name, color, type: 'daily'|'expedition', decayDays,
  level, totalMin, progressMin, freshBase, freshAt}.
  Fraîcheur : freshBase - (now - freshAt) / (decayDays_eff * 86400000) * 100.
- Cellules du plan : cells["floorId:x:y"] = zoneId, grille 12×9 par étage.
- Cible : mobile d'abord (PWA installée), tactile, mode sombre.
  Fond #0E1B1E, accent #5BE3A9.

## Workflow
- Test local : npx http-server -p 8080 (le service worker exige un
  serveur, pas de file://). URL de test : http://localhost:8080
- Déploiement : commit + push sur main → GitHub Pages.
- Après modification de sw.js ou des assets : incrémenter la constante
  CACHE dans sw.js (ex : "maison-v2").
- Avant chaque commit : node --check app.js + tester le parcours complet
  (créer zone → peindre → GO → timer → fin de session).

## Pièges connus
- Ne jamais casser la compatibilité du localStorage existant : si le
  modèle change, écrire une migration depuis "maison-v1".
- La peinture du plan utilise pointer events + elementFromPoint :
  attention aux régressions tactiles sur mobile.
- prefers-reduced-motion doit rester respecté sur toute animation.
- python n'est pas installé sur cette machine (stub Windows Store
  uniquement) ; le port 8000 est occupé par un autre projet Node —
  toujours utiliser 8080.