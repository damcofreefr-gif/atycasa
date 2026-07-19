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

## Atyclock (tap timer)
- Rappel programmable accessible via le bouton 🕐 dans l'en-tête d'Atycasa.
  Ce bouton pulse (agrandissement + halo, classe .pulse, respecte
  prefers-reduced-motion) dès qu'au moins un rappel est programmé
  (n'importe lequel, pas seulement celui de la zone courante) — un
  simple point était trop discret. En miroir, le bouton 🏡 (retour à
  l'accueil) dans l'en-tête d'atyclock.html pulse dès qu'une zone a une
  fraîcheur < 50 % — atyclock.js lit directement le localStorage
  "maison-v1" (app.js n'est pas chargé sur cette page) en réappliquant
  la même formule de fraîcheur que app.js, pour rester en lecture seule
  sans dépendance.
  Fichiers atyclock.html + atyclock.js (mêmes contraintes vanilla que le
  reste de l'app) ; atyclock.js est aussi chargé par index.html pour que
  la vérification des rappels, la bannière et ces points fonctionnent
  sur toutes les pages, pas seulement sur atyclock.html.
- Code source d'origine : le projet React Native/Expo "heho2", dont le
  comportement a servi de spec pour une réécriture intégrale en vanilla
  JS (aucune dépendance ni code conservés).
- Double nature :
  - Page autonome — accès via le bouton 🕐 de l'en-tête, atyclock.html
    reste vierge (rappel sans zoneId).
  - Pont sessions — bouton "🕐 Me le rappeler" dans la modale de
    proposition (à côté de "Plus tard") : ouvre
    atyclock.html?zone=..&name=..&color=.. pré-contextualisé, le nom et
    la couleur de la zone sont affichés sur la page, et le rappel créé
    porte ce zoneId + zoneName. Au déclenchement, la bannière propose
    directement la session ("🕐 C'est l'heure — arroser [zone] ?") avec
    un bouton qui ouvre la proposition ; si la zone a été supprimée
    entre-temps, bannière neutre sans erreur ni mention de zone.
- Données : localStorage clé "atyclock-v1", {reminders: [{id, targetTime,
  isDaily, zoneId, zoneName, createdAt}], notifAsked, soundEnabled}.
  Migration automatique depuis l'ancienne clé "heho-v1" au premier
  chargement si elle existe.
- Notifications : la permission navigateur n'est demandée qu'au tout
  premier "Programmer", jamais à l'ouverture de l'app ; si refusée, on ne
  la redemande plus jamais (l'app retombe en mode bannière + vibration
  uniquement).
- Alarme sonore (bips générés via Web Audio API, sans fichier audio) au
  déclenchement d'un rappel : désactivée par défaut (soundEnabled:
  false), pour rester peu intrusive en attendant de vraies notifications
  push. Cloche 🔔/🔕 intégrée au bouton de validation ("Valider pour
  HH:MM") d'atyclock.html, appui long pour activer/désactiver ; réglage
  global, partagé par tous les rappels.
  Quand elle est activée, l'alarme sonne en boucle (comme un vrai réveil)
  jusqu'à ce que l'utilisateur la désactive explicitement (bouton "OK" ou
  action "Arroser" de la bannière) — jamais d'arrêt automatique sur un
  simple délai ; la bannière elle-même reste alors affichée sans se
  refermer toute seule, pour toujours garder un moyen visible de
  l'arrêter.
- Rappel quotidien : se réarme automatiquement pour la prochaine
  occurrence future, même après plusieurs jours d'absence — jamais de
  rattrapage en rafale. La règle anti-dette du CLAUDE.md (voir Règles
  produit) s'applique aussi à Atyclock : un rappel manqué n'est jamais
  présenté comme un échec ou un retard.

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
  Fond anthracite chaud #16130F → #221C15 (dégradé), accent #5BE3A9.
  Choix voulu : le sombre reste plus confortable pour ce profil
  (moins de sur-stimulation, usage tardif fréquent) mais un noir-bleu
  froid contredit le ton "chaleureux, jamais culpabilisant" — d'où un
  anthracite à undertone chaud plutôt qu'un vrai mode clair.

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

## Avant publication
- Reparler avec l'utilisateur d'un vrai widget Android (écran d'accueil)
  quand l'app sera prête à être publiée. Pas possible en PWA pure : il
  faudrait empaqueter Atycasa en Trusted Web Activity (Bubblewrap) pour
  un APK installable, puis écrire un App Widget natif (Kotlin,
  AppWidgetProvider) publié sur le Play Store — un vrai projet natif à
  part, hors du cadre vanilla JS actuel. Ne pas lancer ça spontanément :
  l'utilisateur doit d'abord juger l'app prête.