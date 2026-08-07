/* Service worker — stratégie "réseau d'abord, cache en secours".
   Avantage : chaque push sur GitHub met l'app à jour dès la prochaine
   ouverture avec connexion, et l'app reste utilisable hors ligne. */

const CACHE = "maison-v66";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./atyclock.html",
  "./atyclock.js",
  "./atygo.html",
  "./atygo.js",
  "./atynote.html",
  "./atynote.js",
  "./boost.html",
  "./boost.js",
  "./atymemo.html",
  "./atymemo.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Boost : actions "▶ Je l'ai démarré" / "✅ Je l'ai terminé" sur la
// notification de rappel. Si un onglet boost.html est déjà ouvert, on
// lui passe l'action par message (elle applique le changement sans
// recharger) ; sinon on l'ouvre avec l'action en paramètre d'URL,
// lue au chargement par boost.js.
self.addEventListener("notificationclick", (e) => {
  const action = e.action || "";
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.indexOf("boost.html") !== -1 && "focus" in client) {
          if (action) client.postMessage({ type: "boost-action", action });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("boost.html" + (action ? "?action=" + action : ""));
      }
    })
  );
});
