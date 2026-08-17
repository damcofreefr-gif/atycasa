/* Service worker — stratégie "réseau d'abord, cache en secours".
   Avantage : chaque push sur GitHub met l'app à jour dès la prochaine
   ouverture avec connexion, et l'app reste utilisable hors ligne. */

const CACHE = "maison-v68";
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
  "./google-config.js",
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

self.addEventListener("notificationclick", (e) => {
  const n = e.notification;
  const tag = n.tag || "";
  e.notification.close();

  // Atyclock : rappel de zone ou rappel agenda du matin (voir
  // sendAtyclockNotification dans atyclock.js). Un onglet déjà ouvert est
  // rechargé sur la bonne page/paramètre plutôt que de lui poster un
  // message — plus simple ici, ces clics amènent de toute façon vers un
  // écran précis (proposition de zone ou calendrier), pas un ajustement
  // d'état en cours comme pour Boost ci-dessous.
  if (tag === "atyclock-reminder" || tag === "atyclock-agenda") {
    const zoneId = n.data && n.data.zoneId;
    const url =
      tag === "atyclock-agenda"
        ? "atyclock.html?notifAction=openAgenda"
        : zoneId
        ? "index.html?openZone=" + encodeURIComponent(zoneId)
        : "index.html";
    e.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        const client = list[0];
        if (client && "navigate" in client) return client.navigate(url).then((c) => c.focus());
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
    );
    return;
  }

  // Atyclock : relance sur un événement d'agenda choisi ("🔔 Me
  // relancer") — action "✅ C'est fait" sur la notification. Même
  // principe que Boost ci-dessous : message à un onglet déjà ouvert
  // (pas de reload, l'état s'applique directement), sinon ouverture
  // avec l'action en paramètre d'URL, lue par atyclock.js au chargement.
  if (tag.indexOf("atyclock-agenda-item-") === 0) {
    const itemId = (n.data && n.data.itemId) || "";
    const action = e.action || "";
    e.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            if (action) client.postMessage({ type: "atyclock-agenda-action", action, itemId });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(
            "atyclock.html" + (action ? "?notifAction=agendaDone&itemId=" + encodeURIComponent(itemId) : "")
          );
        }
      })
    );
    return;
  }

  // Boost : actions "▶ Je l'ai démarré" / "✅ Je l'ai terminé" sur la
  // notification de rappel. Si un onglet boost.html est déjà ouvert, on
  // lui passe l'action par message (elle applique le changement sans
  // recharger) ; sinon on l'ouvre avec l'action en paramètre d'URL,
  // lue au chargement par boost.js.
  const action = e.action || "";
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
