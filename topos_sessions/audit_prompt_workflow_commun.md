# Prompt d'audit — workflow commun & sécurité des 4 repos Zéphyr Apps

*Rédigé le 2026-08-02, à usage ponctuel (pas une Routine récurrente).
À lancer dans une session Claude Code avec accès aux 4 repos, ou via
l'Agent tool en mode isolé (worktree) pour ne pas polluer une session
de travail en cours.*

---

## Contexte à donner à la session d'audit

Tu vas auditer le workflow de collaboration commun à 4 applications
appartenant à Dam's (compte GitHub `damcofreefr-gif`), regroupées sous
le nom "Zéphyr Apps" : `atycasa`, `atyroad`, `atyread`, `sanpeve`.

Ce n'est pas un audit de code produit (fonctionnalités, UX) — c'est un
audit de **sécurité et de fiabilité du workflow lui-même** : est-ce que
la façon dont plusieurs sessions Claude (parfois en parallèle, avec des
droits de commit/push autonomes) opèrent sur ces repos présente un
risque de perte de travail, de fuite de secret, ou de casse silencieuse
du déploiement ?

Élément déclencheur : lors d'une session sur Atycasa, un push direct
sur `main` a été rejeté (non-fast-forward) parce qu'une autre session
avait fusionné du travail entre-temps sans que la session en cours en
soit informée. Résolu proprement (merge, rien perdu), mais ça a révélé
l'existence d'une Routine automatique tournant tous les 15 jours sur
les 4 repos avec autorisation de push sans validation humaine — d'où
le besoin de vérifier que tout le système est robuste face à ce genre
de situation, pas seulement cette fois-ci par chance.

## Ce qui a déjà été vérifié (ne pas refaire, juste pour contexte)

Sur Atycasa uniquement :
- `middleware.js` (verrou d'accès Edge Middleware Vercel) : cookies
  HMAC-SHA256 signés, `HttpOnly/Secure/SameSite=Lax`, fail-open tant
  que les variables d'environnement ne sont pas configurées. Propre.
  Un point mineur théorique : comparaison de signature non en temps
  constant (`!==` au lieu d'une comparaison constant-time) — à visser
  si tu veux être exhaustif, mais faible priorité pour un usage
  familial.
- La Routine périodique (`trig_01CYFLMX5uMoGB9Av99FVS1n`, cron tous les
  1er et 16 du mois) : ne touche que des fichiers `.md` dans
  `topos_sessions/`, jamais le code applicatif. Bien cadrée. Mais son
  prompt ne dit jamais quoi faire si `git push` est rejeté
  (non-fast-forward) — pas de garde-fou explicite pour ce cas.

## Ce qu'il faut vérifier, repo par repo (atycasa, atyroad, atyread, sanpeve)

Pour chaque repo, dans cet ordre :

1. **`add_repo`** puis clone + `register_repo_root` (idempotent, à faire
   même si l'accès semble déjà là).

2. **Fuite de secrets dans l'historique git**, pas seulement l'état
   actuel :
   - `git log --all --diff-filter=A --name-only | grep -iE
     "\.env$|\.pem$|\.key$|keystore|\.p12$|secret|credentials"` (et
     variantes) pour repérer un fichier sensible qui aurait été commité
     puis supprimé — un `git rm` ne retire RIEN de l'historique, le
     secret reste récupérable par quiconque clone le repo.
   - Spécifiquement pour **Atyroad** : le topo du 21/07 mentionne un
     audit passé qui a sorti le keystore Android du repo ("keystore
     hors repo"). Vérifie que c'est toujours vrai aujourd'hui ET que le
     keystore n'existe nulle part dans l'historique complet (pas
     seulement l'état actuel).
   - Pour les repos avec Firebase/Supabase (Atycasa a `firebase-config.js`
     committé — c'est volontaire et documenté, les clés Firebase client
     ne sont pas secrètes en soi, la protection vient des règles de la
     base) : vérifie qu'aucun secret qui DEVRAIT rester privé (clé
     serveur Supabase, service role key, etc.) n'a été committé par
     erreur avec la même logique "c'est public de toute façon".

3. **Cohérence du workflow commun** : chaque repo a-t-il bien
   `topos_sessions/README.md`, `notes.md`, `LATEST.md`, et une section
   "Règles de collaboration Claude" dans son `CLAUDE.md` identique en
   substance à celle d'Atycasa ? Si un repo diverge, note-le sans le
   corriger toi-même (juste signaler — la correction doit être un choix
   conscient de Dam's, pas un effet de bord de l'audit).

4. **Protections GitHub sur `main`** : utilise l'API GitHub pour
   vérifier si une "branch protection rule" existe sur `main` pour
   chacun des 4 repos (interdiction du force-push, review obligatoire,
   etc.). À ce jour, rien de tel n'a été observé sur Atycasa — un
   `git push --force` malencontreux (humain ou IA) écraserait
   l'historique sans filet. Recommande, sans l'activer toi-même, une
   règle minimale : interdire le force-push sur `main` (n'empêche pas
   l'autocommit normal, empêche juste l'écrasement d'historique).

5. **Autres automatisations existantes** : cherche des workflows GitHub
   Actions (`.github/workflows/`) sur chaque repo. Vérifie qu'aucun ne
   fait de déploiement/push automatique avec des permissions larges
   sans contrôle (ex : un secret GITHUB_TOKEN avec des droits write
   utilisé dans un contexte qui pourrait être détourné par une PR
   externe, si les repos sont publics et acceptent des PR externes).

6. **Visibilité des repos** : confirme lesquels des 4 sont publics vs
   privés. Pour ceux publics, rappelle que le verrou d'accès (quand il
   existe) protège le site déployé, pas le code source — n'importe qui
   peut lire le code sur GitHub. Pas une action à prendre forcément,
   juste à confirmer que c'est un choix conscient et pas un oubli.

7. **La Routine périodique elle-même** — action concrète demandée :
   propose (sans l'appliquer sans validation) un ajout au prompt de la
   Routine `trig_01CYFLMX5uMoGB9Av99FVS1n` pour gérer explicitement un
   push rejeté : ne jamais force-push, toujours `git fetch` + merge (ou
   rebase) d'abord, et si un vrai conflit textuel survient dans un
   fichier `topos_sessions/*.md` (peu probable vu la portée étroite),
   s'arrêter et signaler plutôt que de résoudre à l'aveugle.

## Format de restitution attendu

Un rapport court, structuré par repo, avec pour chaque point ci-dessus :
✅ RAS / ⚠️ à surveiller / 🔴 à corriger — et pour tout 🔴, une
proposition concrète de correction (mais ne rien appliquer sans
validation explicite, conformément à la règle "ne jamais supprimer de
code sans confirmation explicite" du CLAUDE.md commun). Termine par une
réponse claire à la question initiale : est-ce que ce workflow présente
aujourd'hui un risque réel de perte de travail ou de fuite de secret,
oui/non, et pourquoi.
