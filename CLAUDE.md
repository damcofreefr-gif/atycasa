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
- "Plus tard" sur la modale de proposition ne referme pas juste la
  fenêtre : si une autre zone a soif (< 50 %, hors celles déjà
  déclinées dans cette même chaîne), elle est aussitôt proposée à la
  place — jamais de cul-de-sac tant qu'il reste une zone qui a besoin
  d'attention.
- Fleur au centre de chaque zone : 🌸 ≥70 % → 🌷 ≥45 % → 🥀 ≥20 % → 🍂 <20 %.
- Scène décorative en bas de l'onglet Maison (initIdleFlowerLoop dans
  app.js) : une fleur fane puis se fait arroser (réutilise le SVG +
  animations tilt/fall de l'arrosoir du timer), en boucle continue.
  Purement visuel, sans lien avec les vraies zones — juste pour combler
  le vide quand le contenu est court.

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

## Atygo (déblocage / démarrage d'action)
- Bouton 🪄 dans l'en-tête d'Atycasa (à gauche du bouton 🕐). Rôle :
  débloquer l'indécision face à la multiplication des tâches de
  logistique du quotidien, à n'importe quel moment de la journée —
  jamais spécifiquement "routine du matin". Propose UNE seule
  micro-action précise à la fois (jamais une liste à trier soi-même),
  volontairement indépendant d'Atycasa/Atyclock (aucun lien de
  données) même s'il réutilise le même langage visuel (fleur =
  urgence) pour rester cohérent avec le reste de l'app.
- Fichiers atygo.html + atygo.js (mêmes contraintes vanilla, non
  chargés sur les autres pages — pas de logique partagée nécessaire).
- Questionnaire de démarrage (1 seul écran, 4 interrupteurs : voiture,
  animal, plantes, papiers/classeurs) affiché au tout premier
  lancement. Revisitable à tout moment via "🔁 Revoir les questions
  de départ" dans l'écran de gestion (⚙️) : ne réinitialise jamais
  l'historique ni les actions personnalisées, se contente de
  réappliquer l'activation par catégorie selon les nouvelles réponses
  (`finishOnboarding()` distingue premier lancement vs revisite).
  "Passer" active tout par défaut.
- 13 catégories, ~30 actions par défaut (voir defaultActions() dans
  atygo.js) : Administratif, Papiers/classeurs (dont "trier une
  rubrique de classeur", demandé explicitement), Domestique léger,
  Alimentation, Santé, Finances, Communication, Organisation,
  Véhicule, Numérique, Espace de vie, Animaux, Plantes (catégorie
  séparée des Animaux — arroser une plante et nourrir un animal sont
  deux actions distinctes, chacune gérée par sa propre question du
  questionnaire).
- Priorité (basse/normale/haute) × décroissance par action
  (decayDays) → urgence = priorité × (temps écoulé depuis "fait" /
  décroissance). La plus urgente et non déclinée/non repoussée dans
  la session en cours est proposée. Trois issues sur une suggestion :
  - "Fait !" mémorise l'instant (localStorage) et réinitialise les
    refus de la session.
  - "Plus tard" décline pour cette session ET repousse l'action
    (`snoozedUntil`) d'une durée proportionnelle à sa propre
    échéance (`snoozeDurationMs()` : ~30 % du decayDays, plancher 1h,
    plafond 24h — un repas de ce soir revient dans quelques heures,
    une tâche à échéance large revient au plus tard le lendemain),
    puis propose la suivante (même logique de chaîne que "Plus tard"
    sur la modale Atycasa). Persistant : l'action ne revient pas tout
    de suite même après avoir quitté/rouvert Atygo.
  - "Ne plus proposer cette action" (lien discret sous "Plus tard")
    désactive l'action directement depuis l'écran de suggestion,
    sans repasser par l'écran de gestion.
  Si tout est décliné/repoussé, écran neutre ("tu as fait le tour")
  plutôt qu'une erreur.
- Cohérence temporelle entre suggestions successives (deux mécanismes,
  jamais un simple filtre rigide) :
  - `dayOnly` sur une action (ex : prendre rdv, appeler, faire le
    plein) : jamais proposée hors de la plage 8h-21h (DAY_START_HOUR/
    DAY_END_HOUR dans atygo.js), retirée du pool de candidats.
  - `duration` (1 rapide <5 min / 2 moyen 10-20 min / 3 long 30 min+) :
    un malus doux (COHERENCE_PENALTY, pas un blocage) pénalise l'écart
    de durée avec la dernière action affichée/faite (`lastDuration`),
    pour éviter d'enchaîner un gros chantier salissant après un coup
    de fil de 2 min — sans jamais empêcher une action bien plus
    urgente de passer devant. `lastDuration` se réinitialise à chaque
    entrée fraîche sur l'écran principal (nouveau "point d'ancrage"
    sans biais), et persiste entre "Fait !"/"Plus tard" au sein d'une
    même session.
- Personnalisable dans l'écran de gestion : activer/désactiver,
  cycler la priorité, supprimer les actions ajoutées par
  l'utilisateur (pas les actions par défaut, seulement désactivables),
  ajouter une action libre (nom + précision + catégorie) — c'est
  ainsi qu'on nomme des rubriques de classeur spécifiques (ex :
  "Trier la rubrique Impôts").
- Bouton "?" (`suggInfoBtn`) à côté du libellé de la suggestion,
  affiché seulement quand l'action a un champ `info` et/ou `link`
  (pas de champ dédié dans l'écran d'ajout — réservé aux actions par
  défaut qui bénéficient d'un vrai repère). Ouvre une modale
  (`infoOverlay`) avec le texte et/ou un lien externe cliquable
  (`a.link = {url, label}`, ouvert dans un nouvel onglet). Champ
  `info` rempli pour 4 actions : "Trier une rubrique de classeur"
  (durées de conservation courantes des papiers administratifs —
  factures, quittances, relevés, impôts…), "Jeter le courrier
  périmé" (version courte, pointe vers la précédente), "Renouveler
  un document" (durées de validité CNI/passeport/permis/carte
  grise), "Sauvegarder un fichier important" (règle 3-2-1). Champ
  `link` rempli pour "Faire le plein" (renvoie vers
  prix-carburants.gouv.fr, le site officiel de comparaison des prix
  des stations). Contenu volontairement non exhaustif : uniquement
  des repères factuels et non ambigus, ou des liens vers des sources
  officielles stables — pas de terrain glissant comme la santé ou
  les soins animaux/plantes où une réponse générique serait
  trompeuse. Textes présentés "à titre indicatif" avec renvoi à
  service-public.fr en cas de doute.
- Bilan du jour : récapitulatif chaleureux de ce qui a été fait
  aujourd'hui (jamais de ce qui ne l'a pas été, cf. règle anti-dette
  du projet). Chaque "Fait !" ajoute une entrée à `astate.daily.done`
  (label, catégorie, horodatage) ; `astate.daily` se réinitialise
  automatiquement au changement de date (`dayKey`, format
  AAAA-MM-JJ). Accès : badge discret sur l'écran principal dès qu'au
  moins une action est faite dans la journée ("🪄 X fait aujourd'hui"),
  et entrée permanente "🪄 Voir le bilan du jour" dans l'écran de
  gestion (état neutre si rien n'est fait). Les deux ouvrent la même
  modale (`reportOverlay`), liste chronologique inversée. Notification
  navigateur (permission demandée une seule fois, lors du tout
  premier "Fait !" — jamais redemandée si refusée, même logique
  qu'Atyclock) déclenchée à partir de 20h (`EOD_HOUR`) s'il y a eu au
  moins une action ce jour-là et que le bilan n'a pas déjà été montré
  (`reportShownAt`), vérifié par un intervalle (`checkDailyReport`,
  60s) + au retour au premier plan + juste après chaque "Fait !".
  Limite assumée (pas de serveur = pas de réveil en arrière-plan) :
  la notification ne part que si l'onglet est encore ouvert à ce
  moment-là ; sinon le badge/l'entrée de menu prennent le relais dès
  la prochaine ouverture, sans jamais présenter ça comme un retard.
- Données : localStorage clé "atygo-v1", {onboarded, prefs: {car,
  pet, papers}, actions: [{id, category, label, hint, decayDays,
  priority, enabled, lastDoneAt, custom, info?, link?}], daily:
  {dayKey, done: [{label, category, at}], reportShownAt}, notifAsked}.

## Atynote (bloc-note de suggestions partagé)
- Bouton 📝 dans l'en-tête d'Atycasa (à droite du bouton 🕐). Rôle :
  bloc-note partagé en direct entre deux personnes (ex : conjoint·e)
  pour déposer des suggestions de modifs sur l'app, consultables
  sans manip côté lecteur. Seule fonctionnalité de tout le projet à
  sortir du localStorage pur — voir justification ci-dessous.
- Fichiers atynote.html + atynote.js (mêmes contraintes vanilla que
  le reste), + firebase-config.js (config à remplir une fois, voir
  ce fichier pour la marche à suivre pas à pas). atynote.js tourne
  sur index.html (juste pour la pastille du bouton 📝) et sur
  atynote.html (interface complète) — jamais sur atyclock.html/
  atygo.html, qui restent indépendants.
- Stockage : Firebase Realtime Database (le seul point de l'app qui
  ne soit pas 100% local — une suggestion écrite sur un téléphone
  doit apparaître aussitôt sur l'autre, ce qu'un simple localStorage
  ne permet pas). Tant que firebase-config.js garde ses valeurs
  REMPLACE_MOI, Atynote affiche un écran d'installation au lieu de
  planter — le reste de l'app (Atycasa/Atyclock/Atygo) continue de
  fonctionner normalement sans configuration Firebase.
- Identité : pas de compte, juste un prénom saisi une fois par
  appareil (localStorage clé "atynote-name-v1") pour signer les
  suggestions et savoir qui a écrit quoi.
- Chaque suggestion : {text, author, createdAt, seen}. "✓ Vu" bascule
  `seen` (visible par les deux, pas de lecture "par appareil") ;
  "✕ Supprimer" retire l'entrée. Pas de note, pas de statut complexe
  — juste texte + auteur + vu ou pas.
  Bouton 📝 pulse (même mécanique que le bouton 🕐) dès qu'une
  suggestion non vue existe ET n'est pas de son propre prénom — on
  n'est jamais notifié de son propre message.
- Sécurité assumée : les clés Firebase (apiKey compris) ne sont pas
  secrètes en soi, la vraie protection vient des règles de la base
  (voir firebase-config.js) combinées à un segment de chemin
  aléatoire (`notePath`) — pas d'auth, pas d'écran de connexion,
  pour rester dans l'esprit "zéro friction" du projet. C'est une
  protection raisonnable pour un bloc-note familial, pas un vrai
  chiffrement — à garder en tête si le dépôt GitHub est public.

## Architecture — contraintes strictes
- Vanilla JS uniquement. Aucun framework, aucun bundler, aucun build.
  Déploiement = push des fichiers statiques tels quels sur GitHub Pages.
- Fichiers : index.html (structure + styles), app.js (toute la logique),
  sw.js (service worker network-first : chaque push met à jour l'app
  installée), manifest.webmanifest, icons/.
- Données : localStorage clé "maison-v1", objet {floors, zones, cells}.
  Export/import JSON de secours dans l'onglet Zones. Aucun serveur —
  seule exception : Atynote (bloc-note partagé, voir section dédiée),
  qui utilise Firebase Realtime Database car un partage "en direct"
  entre deux téléphones est impossible avec du localStorage seul.
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