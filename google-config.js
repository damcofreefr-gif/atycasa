/* Config Google Calendar pour le lien "agenda" d'Atyclock (relances
   répétées sur les événements du jour, jusqu'à confirmation que c'est
   fait). Lecture seule de ton agenda Google — c'est le seul moyen pour
   une PWA de lire un vrai agenda : aucun navigateur n'expose l'agenda
   natif du téléphone (type Samsung Calendar) à une page web, quel que
   soit l'effort qu'on y met. Comme Samsung Calendar est synchronisé
   avec ton compte Google, ça revient en pratique au même.

   Marche à suivre (une seule fois) :
   1. Va sur https://console.cloud.google.com, crée un projet (gratuit).
   2. Dans "API et services" > "Bibliothèque", active "Google Calendar API".
   3. Dans "API et services" > "Écran de consentement OAuth" : type
      "Externe", renseigne un nom d'appli + ton email en contact ; plus
      bas, ajoute ton adresse Google comme "utilisateur test" (évite la
      validation Google, suffisant pour un usage perso). Laisse en mode
      "Test" (pas besoin de publier).
   4. Dans "Identifiants" > "Créer des identifiants" > "ID client OAuth"
      > type "Application Web". Dans "Origines JavaScript autorisées",
      ajoute l'URL de ton app (ex : https://atycasa.vercel.app) ET
      http://localhost:8080 (pour tester en local).
   5. Copie le "ID client" généré ci-dessous.
   Cet identifiant n'est pas secret en soi (conçu pour être public côté
   client, comme les clés Firebase) — la vraie protection vient de la
   liste d'origines autorisées à l'étape 4, et du fait que chaque
   utilisateur se connecte avec SON propre compte Google (rien n'est
   partagé entre utilisateurs). Tant que ce fichier garde sa valeur
   REMPLACE_MOI, Atyclock affiche un état "non connecté" au lieu de
   planter. */
const GOOGLE_CONFIG = {
  clientId: "REMPLACE_MOI.apps.googleusercontent.com",
};
