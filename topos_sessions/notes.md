# Idées et souhaits — Atycasa

Note ici, au fil de l'eau, toute idée, souhait ou changement de contexte
produit (peu importe la forme). Le prochain topo automatique (tous les
15 jours) digère ce fichier dans sa section "Idées et souhaits", puis le
vide.

<!-- Écris en dessous de cette ligne, une entrée par ligne ou par bloc. -->

## Checklist mise en service du verrou d'accès (21/07/2026)

`middleware.js` + `invite.html` sont en place mais inactifs tant que ces
3 variables d'environnement ne sont pas configurées sur Vercel (Project
Settings → Environment Variables, cocher Production + Preview) :
- `ATYCASA_COOKIE_SECRET` — secret de signature des cookies, jamais partagé
- `ATYCASA_INVITE_CODE` — code donné aux personnes invitées (accès à
  l'app, jamais à /admin.html)
- `ATYCASA_ADMIN_CODE` — code réservé à Dam's (accès à tout, y compris
  /admin.html)

Valeurs générées proposées dans la conversation Claude du 21/07/2026 —
à récupérer là, ou à remplacer par ses propres valeurs. Après ajout des
variables : redéployer (un nouveau push suffit, ou "Redeploy" depuis le
dashboard Vercel). Vérifier ensuite que l'app est bien bloquée sans
code avant de considérer que c'est en service.

