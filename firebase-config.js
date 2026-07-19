/* Config Firebase pour Atynote (bloc-note de suggestions partagé en
   direct). C'est le seul endroit de l'app qui ne soit pas 100% local :
   une suggestion écrite sur un téléphone doit apparaître aussitôt sur
   l'autre, ce que localStorage seul ne permet pas.

   Marche à suivre (une seule fois) :
   1. Va sur https://console.firebase.google.com, crée un projet
      (gratuit), puis active "Realtime Database" (pas Firestore).
   2. Dans les paramètres du projet (⚙️ > Paramètres du projet >
      Général), copie les valeurs de la section "Vos applications"
      (ajoute une appli web si besoin) et colle-les ci-dessous.
   3. Choisis un identifiant aléatoire pour notePath (n'importe quelle
      chaîne, ex : "atynote_" + une suite de caractères au hasard) et
      remplace-le ci-dessous. Ce n'est pas un vrai mot de passe, mais
      ça évite qu'un tiers qui tomberait sur ce dépôt public devine le
      chemin de la base au premier essai.
   4. Dans Realtime Database > Règles, colle (en remplaçant
      REMPLACE_PAR_TON_ID par la même valeur qu'à l'étape 3) :
        {
          "rules": {
            ".read": false,
            ".write": false,
            "REMPLACE_PAR_TON_ID": {
              "suggestions": { ".read": true, ".write": true }
            }
          }
        }
   Ces clés (apiKey compris) ne sont pas secrètes en soi — Firebase
   les conçoit pour être publiques dans le code client. La vraie
   protection vient des règles ci-dessus et du chemin aléatoire, pas
   de cette clé. Tant que ce fichier garde ses valeurs REMPLACE_MOI,
   Atynote affiche un écran d'installation au lieu de planter. */
const FIREBASE_CONFIG = {
  apiKey: "REMPLACE_MOI",
  authDomain: "REMPLACE_MOI.firebaseapp.com",
  databaseURL: "https://REMPLACE_MOI-default-rtdb.firebaseio.com",
  projectId: "REMPLACE_MOI",
  notePath: "atynote_REMPLACE_MOI",
};
