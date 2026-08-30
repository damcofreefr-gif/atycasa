/* =========================================================
   Atyclock — tap timer / rappels programmables
   (nom de code d'origine : Heho, projet source heho2)
   Données : localStorage (clé "atyclock-v1"), avec migration
   automatique depuis l'ancienne clé "heho-v1" si elle existe.
   Ce script tourne sur TOUTES les pages (index.html + atyclock.html)
   pour que la vérification des rappels et la bannière fonctionnent
   partout ; l'interface du minuteur ne s'active que sur atyclock.html.

   Double nature :
   - Page autonome (bouton 🕐 de l'en-tête) : reste vierge, rappel
     sans zoneId.
   - Pont sessions (bouton "🕐 Me le rappeler" dans la proposition de
     session) : atyclock.html?zone=..&name=..&color=.. contextualise
     la page, le rappel créé porte ce zoneId. Au déclenchement, la
     bannière propose directement d'arroser la zone (fonctions
     openProposal/state exposées globalement par app.js, lues ici
     seulement si présentes — jamais supposées disponibles).
   ========================================================= */
(function () {
  const ATYCLOCK_KEY = "atyclock-v1";
  const LEGACY_HEHO_KEY = "heho-v1";
  const MAISON_KEY = "maison-v1";
  const CHECK_INTERVAL_MS = 15000;
  const $ = (id) => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const onAtyclockPage = !!$("btnProgram");

  // Rappel agenda du matin : un rappel quotidien spécial, auto-créé une
  // fois (jamais recréé si l'utilisateur le désactive ensuite), repéré
  // par un zoneId factice pour ne jamais entrer en collision avec le
  // rappel "vierge" personnel de l'utilisateur (celui sans zoneId, géré
  // via getCurrentReminder() sur atyclock.html). Heure et lien calendrier
  // fixes pour l'instant — prévu pour être ajustable plus tard.
  const AGENDA_ZONE_MARKER = "__agenda__";
  const AGENDA_HOUR = 8;
  const CALENDAR_URL = "https://calendar.google.com/calendar/r/day";

  // Agenda du jour (Google Calendar) : relances répétées sur les
  // événements choisis, jusqu'à confirmation que c'est fait — voir
  // google-config.js pour la marche à suivre. Lecture seule
  // (calendar.readonly) : Atycasa ne modifie jamais ton agenda.
  const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
  const GIS_CDN_URL = "https://accounts.google.com/gsi/client";
  const AGENDA_MAX_REMINDERS = 3;

  const params = new URLSearchParams(location.search);
  const ctxZoneId = params.get("zone");
  const ctxZoneName = params.get("name");
  const ctxZoneColor = params.get("color");

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }
  // Alarme sonore en attendant des vraies notifications push fiables : trois
  // bips générés à la volée (aucun fichier audio à embarquer). Un
  // AudioContext créé loin de tout geste utilisateur (le minuteur tourne
  // seul en arrière-plan) reste "suspendu" et silencieux : on en garde
  // donc un seul, débloqué dès la première interaction sur la page, et on
  // le réutilise (avec resume() défensif) pour chaque alarme plutôt que
  // d'en recréer un neuf à chaque fois.
  let sharedAudioCtx = null;
  function getAudioCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx) {
      try {
        sharedAudioCtx = new Ctx();
      } catch (e) {
        return null;
      }
    }
    if (sharedAudioCtx.state === "suspended") {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  }
  // Sur iOS notamment, resume() seul ne suffit pas toujours : il faut
  // vraiment déclencher un son (même inaudible) depuis l'intérieur du
  // geste pour débloquer durablement l'audio programmatique ultérieur.
  document.addEventListener(
    "pointerdown",
    () => {
      const ctx = getAudioCtx();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      } catch (e) {
        // silencieux
      }
    },
    { once: true, passive: true }
  );

  function playAlarm() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const start = ctx.currentTime;
      const beep = (at, freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.3, at + 0.02);
        gain.gain.linearRampToValueAtTime(0, at + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.4);
      };
      beep(start, 880);
      beep(start + 0.45, 880);
      beep(start + 0.9, 1046.5);
    } catch (e) {
      // silencieux : lecture audio bloquée par le navigateur
    }
  }
  // L'alarme sonne en boucle jusqu'à ce que l'utilisateur la désactive
  // explicitement (bouton "OK" ou action de la bannière) — comme un vrai
  // réveil, elle ne s'arrête jamais toute seule sur un simple délai.
  let alarmLoopTimer = null;
  function startAlarmLoop() {
    stopAlarmLoop();
    playAlarm();
    alarmLoopTimer = setInterval(playAlarm, 3500);
  }
  function stopAlarmLoop() {
    if (alarmLoopTimer) {
      clearInterval(alarmLoopTimer);
      alarmLoopTimer = null;
    }
  }
  function formatClock(date) {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function frenchDayLabel(date) {
    return capitalize(
      new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(date)
    );
  }
  // Sur Android, on tente d'ouvrir l'appli calendrier native du téléphone
  // (via l'intent standard "APP_CALENDAR", pas de nom de paquet en dur —
  // ça reste l'appli calendrier par défaut du système, Samsung Calendar
  // sur un Samsung avec les comptes synchronisés) plutôt que Google
  // Calendar dans le navigateur. `browser_fallback_url` fait retomber sur
  // CALENDAR_URL si aucune appli ne gère cet intent (ou si l'ouverture
  // via intent:// échoue) — sur les autres plateformes (iOS, desktop),
  // pas d'intent Android possible : on garde directement CALENDAR_URL.
  function isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }
  function openCalendar() {
    if (isAndroid()) {
      const intentUrl =
        "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_CALENDAR;" +
        "S.browser_fallback_url=" + encodeURIComponent(CALENDAR_URL) + ";end";
      window.open(intentUrl, "_blank");
      return;
    }
    window.open(CALENDAR_URL, "_blank");
  }
  function nextDailyOccurrence(hour) {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  // ---------- Persistance ----------
  function migrateLegacyKey() {
    try {
      const legacy = localStorage.getItem(LEGACY_HEHO_KEY);
      if (legacy !== null && localStorage.getItem(ATYCLOCK_KEY) === null) {
        localStorage.setItem(ATYCLOCK_KEY, legacy);
      }
      if (legacy !== null) localStorage.removeItem(LEGACY_HEHO_KEY);
    } catch (e) {
      console.error("Atyclock : migration heho-v1 impossible", e);
    }
  }
  function loadAtyclockState() {
    migrateLegacyKey();
    try {
      const raw = localStorage.getItem(ATYCLOCK_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.reminders)) {
          // Alarme sonore désactivée par défaut (principe : peu intrusif,
          // en attendant de vraies notifications push) ; migration douce
          // pour les états enregistrés avant l'ajout de ce champ.
          if (typeof d.soundEnabled !== "boolean") d.soundEnabled = false;
          if (typeof d.agendaSeeded !== "boolean") d.agendaSeeded = false;
          if (typeof d.googleConnected !== "boolean") d.googleConnected = false;
          if (typeof d.googleCalendarId !== "string") d.googleCalendarId = null;
          if (typeof d.googleCalendarLabel !== "string") d.googleCalendarLabel = null;
          if (!Array.isArray(d.agendaItems)) d.agendaItems = [];
          if (typeof d.agendaReminderIntervalMin !== "number") d.agendaReminderIntervalMin = 30;
          return d;
        }
      }
    } catch (e) {
      console.error("Atyclock : chargement impossible", e);
    }
    return {
      reminders: [], notifAsked: false, soundEnabled: false, agendaSeeded: false,
      googleConnected: false, googleCalendarId: null, googleCalendarLabel: null,
      agendaItems: [], agendaReminderIntervalMin: 30,
    };
  }
  function saveAtyclockState() {
    try {
      localStorage.setItem(ATYCLOCK_KEY, JSON.stringify(astate));
    } catch (e) {
      console.error("Atyclock : sauvegarde impossible", e);
    }
  }
  // Le rappel "courant" de cette page : celui de la zone en contexte
  // (?zone=...), ou le rappel vierge (sans zone) si aucun contexte.
  function getCurrentReminder() {
    if (ctxZoneId) return astate.reminders.find((r) => r.zoneId === ctxZoneId) || null;
    return astate.reminders.find((r) => !r.zoneId) || null;
  }

  let astate = loadAtyclockState();
  // Déclarés ici (et non plus bas, près de leur usage) car checkReminders()
  // peut appeler renderTarget() dès l'init partagée, avant que le bloc
  // "interface du minuteur" ne s'exécute.
  let pendingTarget = Date.now();
  let pendingDaily = false;
  // Tant qu'aucun +1/+5/+15 min/+1h n'a été tapé (et qu'aucun rappel
  // n'est actif), l'heure du bouton de validation suit l'heure actuelle
  // en direct plutôt que de rester figée sur l'heure d'ouverture de la
  // page.
  let hasSelection = false;

  // ---------- Bannière (toutes les pages) ----------
  function injectBannerStyle() {
    if ($("atyclockBannerStyle")) return;
    const style = document.createElement("style");
    style.id = "atyclockBannerStyle";
    style.textContent =
      ".atyclock-banner{position:fixed;left:14px;right:14px;top:max(14px,env(safe-area-inset-top));" +
      "z-index:200;background:var(--surface2,#241E17);border:1px solid var(--accent,#5BE3A9);" +
      "border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" +
      "display:flex;align-items:center;gap:10px;transform:translateY(-140%);" +
      "transition:transform 0.3s ease;font-family:'Avenir Next','Segoe UI',system-ui,sans-serif;}" +
      ".atyclock-banner.show{transform:translateY(0);}" +
      ".atyclock-banner .txt{flex:1;font-size:14px;line-height:1.4;color:var(--text,#EAF4F0);}" +
      ".atyclock-banner button{background:transparent;border:none;color:var(--accent,#5BE3A9);" +
      "font-weight:700;font-size:13px;padding:6px;cursor:pointer;white-space:nowrap;}" +
      ".atyclock-banner button.hidden{display:none;}" +
      "@media (prefers-reduced-motion: reduce){.atyclock-banner{transition:none;}}";
    document.head.appendChild(style);
  }
  let bannerTimer = null;
  function ensureBannerEl() {
    let el = $("atyclockBanner");
    if (el) return el;
    el = document.createElement("div");
    el.id = "atyclockBanner";
    el.className = "atyclock-banner";
    el.innerHTML =
      '<div class="txt"></div>' +
      '<button type="button" class="action hidden"></button>' +
      '<button type="button" class="close">OK</button>';
    el.querySelector(".close").onclick = () => {
      stopAlarmLoop();
      el.classList.remove("show");
    };
    document.body.appendChild(el);
    return el;
  }
  // sticky: la bannière reste affichée jusqu'à ce que l'utilisateur la
  // ferme lui-même (au lieu de disparaître après 8s) — utilisé quand une
  // alarme sonne en boucle, pour toujours laisser un moyen visible de
  // l'arrêter.
  function showBanner(text, action, sticky) {
    const el = ensureBannerEl();
    el.querySelector(".txt").textContent = text;
    const actionBtn = el.querySelector(".action");
    if (action) {
      actionBtn.textContent = action.label;
      actionBtn.classList.remove("hidden");
      actionBtn.onclick = () => {
        stopAlarmLoop();
        action.onClick();
      };
    } else {
      actionBtn.classList.add("hidden");
      actionBtn.onclick = null;
    }
    el.classList.add("show");
    clearTimeout(bannerTimer);
    if (!sticky) bannerTimer = setTimeout(() => el.classList.remove("show"), 8000);
  }

  // Ouvre la proposition de session pour une zone : directement si
  // app.js est chargé sur cette page (index.html), sinon on y navigue.
  function goToProposal(zoneId) {
    if (typeof openProposal === "function" && typeof state !== "undefined" && state.zones) {
      const z = state.zones.find((zz) => zz.id === zoneId);
      if (z) {
        openProposal(z);
        return;
      }
    }
    location.href = "index.html?openZone=" + encodeURIComponent(zoneId);
  }

  // Le bouton 🕐 de l'en-tête d'Atycasa (index.html uniquement — absent
  // des autres pages, d'où le garde-fou) pulse dès qu'au moins un rappel
  // est programmé. Un simple point était trop discret, surtout pour la
  // maison (voir plus bas) : une icône qui respire se repère bien plus
  // facilement du coin de l'œil.
  function renderAtyclockPulse() {
    const btn = $("btnAtyclock");
    if (!btn) return;
    // Le rappel agenda du matin est actif par défaut pour tout le monde :
    // l'exclure garde ce signal utile (au moins un vrai rappel personnel
    // programmé) plutôt qu'un pulse permanent qui ne voudrait plus rien dire.
    const hasPersonalReminder = astate.reminders.some((r) => r.zoneId !== AGENDA_ZONE_MARKER);
    btn.classList.toggle("pulse", hasPersonalReminder);
  }

  // Même principe en miroir sur le bouton 🏡 (atyclock.html uniquement) :
  // lecture directe du localStorage "maison-v1" (app.js n'est pas chargé
  // sur cette page), avec la même formule de fraîcheur que app.js. Seuil
  // <50 % repris de la logique combo existante ("zone qui vaut le coup").
  function anyZoneThirsty() {
    try {
      const raw = localStorage.getItem(MAISON_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!Array.isArray(s.zones)) return false;
      const now = Date.now();
      return s.zones.some((z) => {
        const decayMs = (z.decayDays || 1) * (1 + 0.15 * (z.level || 0)) * 86400000;
        const elapsed = now - (z.freshAt || now);
        const lost = (elapsed / decayMs) * 100;
        const fresh = Math.max(0, Math.min(100, (z.freshBase ?? 100) - lost));
        return fresh < 50;
      });
    } catch (e) {
      return false;
    }
  }
  function renderHousePulse() {
    const btn = $("btnBack");
    if (!btn) return;
    btn.classList.toggle("pulse", anyZoneThirsty());
  }

  // ---------- Vérification des rappels dus ----------
  function checkReminders() {
    const now = Date.now();
    const due = [];
    let dirty = false;
    astate.reminders = astate.reminders.filter((r) => {
      if (r.targetTime > now) return true;
      due.push({ originalTarget: r.targetTime, zoneId: r.zoneId, zoneName: r.zoneName });
      dirty = true;
      if (r.isDaily) {
        while (r.targetTime <= now) r.targetTime += 86400000;
        return true;
      }
      return false;
    });
    if (dirty) saveAtyclockState();
    due.forEach((d) => notifyDue(d, now));
    if (onAtyclockPage) renderTarget();
    renderAtyclockPulse();
    renderHousePulse();
  }
  // Notification via le service worker plutôt que le constructeur
  // Notification() classique : sur Android, ce dernier est restreint
  // (lève une erreur "Illegal constructor" dans Chrome, silencieusement
  // avalée par le catch ci-dessous) — la notif n'atteignait donc jamais
  // le téléphone hors de l'appli, seule la bannière s'affichait. Même
  // mécanisme que Boost (`sendBoostNotification`). Le clic est géré par
  // sw.js ("notificationclick") plutôt que par un onclick JS, seule
  // façon fiable de router le clic sur ce type de notification.
  function sendAtyclockNotification(text, tag, data) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification("Atycasa", { body: text, icon: "icons/icon-192.png", tag, renotify: true, data: data || {} }))
      .catch(() => {});
  }
  function notifyDue(d, now) {
    if (d.zoneId === AGENDA_ZONE_MARKER) {
      notifyAgenda();
      return;
    }
    const late = now - d.originalTarget > CHECK_INTERVAL_MS * 2;
    let zoneName = d.zoneName;
    let zoneConfirmed = !!d.zoneId;
    // On ne peut vérifier l'existence actuelle de la zone que si app.js
    // (state.zones) est chargé sur cette page — sinon on fait confiance
    // au nom mémorisé sur le rappel, sans jamais afficher d'erreur.
    if (d.zoneId && typeof state !== "undefined" && state.zones) {
      const z = state.zones.find((zz) => zz.id === d.zoneId);
      zoneConfirmed = !!z;
      if (z) zoneName = z.name;
    }
    const hasZone = d.zoneId && zoneConfirmed;
    const text = hasZone
      ? `🕐 C'est l'heure — arroser ${zoneName} ?`
      : late
      ? "🕐 Un rappel est passé"
      : "🕐 C'est l'heure";
    vibrate([80, 40, 80]);
    if (astate.soundEnabled) startAlarmLoop();
    showBanner(
      text,
      hasZone ? { label: "Arroser", onClick: () => goToProposal(d.zoneId) } : null,
      astate.soundEnabled
    );
    sendAtyclockNotification(text, "atyclock-reminder", hasZone ? { zoneId: d.zoneId } : {});
  }
  function ensureNotifPermission() {
    if (!("Notification" in window)) return;
    if (astate.notifAsked) return;
    astate.notifAsked = true;
    saveAtyclockState();
    if (Notification.permission === "default") {
      try {
        Notification.requestPermission();
      } catch (e) {
        // silencieux
      }
    }
  }

  // ---------- Rappel agenda du matin ----------
  function notifyAgenda() {
    const text = `🗓️ ${frenchDayLabel(new Date())} — un coup d'œil à ton agenda ?`;
    vibrate([80, 40, 80]);
    showBanner(text, { label: "Ouvrir l'agenda", onClick: openCalendar }, false);
    sendAtyclockNotification(text, "atyclock-agenda", {});
  }
  function getAgendaReminder() {
    return astate.reminders.find((r) => r.zoneId === AGENDA_ZONE_MARKER) || null;
  }
  // Auto-créé une seule fois, jamais recréé après une désactivation
  // manuelle (agendaSeeded reste true) — respecte le choix de
  // l'utilisateur plutôt que de le renvoyer sans arrêt.
  function seedAgendaReminder() {
    if (astate.agendaSeeded) return;
    astate.agendaSeeded = true;
    astate.reminders.push({
      id: uid(),
      targetTime: nextDailyOccurrence(AGENDA_HOUR),
      isDaily: true,
      zoneId: AGENDA_ZONE_MARKER,
      zoneName: "Agenda",
      createdAt: Date.now(),
    });
    saveAtyclockState();
  }
  function toggleAgendaReminder() {
    const r = getAgendaReminder();
    if (r) {
      astate.reminders = astate.reminders.filter((x) => x !== r);
    } else {
      ensureNotifPermission();
      astate.reminders.push({
        id: uid(),
        targetTime: nextDailyOccurrence(AGENDA_HOUR),
        isDaily: true,
        zoneId: AGENDA_ZONE_MARKER,
        zoneName: "Agenda",
        createdAt: Date.now(),
      });
    }
    astate.agendaSeeded = true;
    saveAtyclockState();
    vibrate(20);
    renderAgendaToggle();
  }
  function renderAgendaToggle() {
    const el = $("agendaToggle");
    if (!el) return;
    el.classList.toggle("on", !!getAgendaReminder());
  }

  // ---------- Agenda du jour : moteur de relance (toutes les pages) ----------
  // La connexion Google + la liste des événements ne vivent que sur
  // atyclock.html (voir plus bas), mais le "tick" qui déclenche les
  // relances doit tourner partout, comme les autres rappels — il ne
  // dépend que des événements déjà mis en cache dans astate.agendaItems
  // (aucun appel réseau à Google nécessaire pour cocher l'heure).
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  // Les événements d'hier n'ont plus de sens ("aujourd'hui" se
  // réinitialise chaque jour) — on les laisse tomber silencieusement,
  // jamais présentés comme des rappels manqués.
  function pruneStaleAgendaItems() {
    const tk = todayKey();
    const before = astate.agendaItems.length;
    astate.agendaItems = astate.agendaItems.filter((it) => it.dayKey === tk);
    if (astate.agendaItems.length !== before) saveAtyclockState();
  }
  function notifyAgendaItem(item) {
    const text = `🗓️ ${item.title} — c'est fait ?`;
    vibrate([80, 40, 80]);
    showBanner(text, { label: "✅ C'est fait", onClick: () => markAgendaItemDone(item.id) }, false);
    if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification("Atycasa", {
          body: text,
          icon: "icons/icon-192.png",
          tag: "atyclock-agenda-item-" + item.id,
          renotify: true,
          data: { itemId: item.id },
          actions: [{ action: "done", title: "✅ C'est fait" }],
        })
      )
      .catch(() => {});
  }
  // Marque un événement "fait" (arrête ses relances). Réversible en
  // retapant dessus dans la liste — jamais de cul-de-sac.
  function markAgendaItemDone(id) {
    const item = astate.agendaItems.find((it) => it.id === id);
    if (!item) return;
    item.done = true;
    item.active = false;
    saveAtyclockState();
    if (onAtyclockPage && typeof renderGcalEvents === "function") renderGcalEvents();
  }
  function checkAgendaReminders() {
    if (!astate.agendaItems || !astate.agendaItems.length) return;
    pruneStaleAgendaItems();
    const now = Date.now();
    const intervalMs = (astate.agendaReminderIntervalMin || 30) * 60000;
    let dirty = false;
    astate.agendaItems.forEach((item) => {
      if (!item.active || item.done || item.dormant) return;
      const startTs = Date.parse(item.startISO);
      if (isNaN(startTs) || startTs > now) return;
      if (item.lastReminderAt && now - item.lastReminderAt < intervalMs) return;
      if ((item.remindCount || 0) >= AGENDA_MAX_REMINDERS) {
        item.dormant = true;
        dirty = true;
        return;
      }
      item.remindCount = (item.remindCount || 0) + 1;
      item.lastReminderAt = now;
      dirty = true;
      notifyAgendaItem(item);
    });
    if (dirty) saveAtyclockState();
  }

  // ---------- Init partagée (toutes les pages) ----------
  injectBannerStyle();
  seedAgendaReminder();
  checkReminders();
  checkAgendaReminders();
  setInterval(() => {
    checkReminders();
    checkAgendaReminders();
  }, CHECK_INTERVAL_MS);

  const launchBtn = $("btnAtyclock");
  if (launchBtn) launchBtn.onclick = () => { location.href = "atyclock.html"; };

  // Pont sessions : bouton "Me le rappeler" dans la modale de proposition
  // (index.html uniquement — ui/state existent forcément si ce bouton existe).
  const remindBtn = $("btnRemind");
  if (remindBtn) {
    remindBtn.onclick = () => {
      if (!ui.proposal) return;
      const zone = state.zones.find((z) => z.id === ui.proposal.zoneId);
      $("proposalOverlay").classList.add("hidden");
      if (!zone) {
        location.href = "atyclock.html";
        return;
      }
      const qs = new URLSearchParams({ zone: zone.id, name: zone.name, color: zone.color.replace("#", "") });
      location.href = "atyclock.html?" + qs.toString();
    };
  }

  // Ouverture directe d'une proposition suite à un clic "Arroser" dans
  // la bannière (index.html uniquement ; silencieux si la zone n'existe
  // plus — pas d'erreur, conforme à la règle anti-culpabilité).
  (function handleOpenZoneParam() {
    const openZoneId = params.get("openZone");
    if (!openZoneId) return;
    if (typeof openProposal === "function" && typeof state !== "undefined" && state.zones) {
      const z = state.zones.find((zz) => zz.id === openZoneId);
      if (z) openProposal(z);
    }
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", location.pathname);
    }
  })();

  // Rouvre le calendrier suite à un clic sur la notification "Ouvrir ton
  // agenda" — routée par sw.js ("notificationclick") vers cette page avec
  // ?notifAction=openAgenda, sur le même principe que ?openZone= ci-dessus.
  (function handleNotifActionParam() {
    if (params.get("notifAction") !== "openAgenda") return;
    openCalendar();
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", location.pathname);
    }
  })();

  // Marque un événement "fait" suite à l'action "✅ C'est fait" tapée
  // directement sur la notification — routée par sw.js vers
  // ?notifAction=agendaDone&itemId=.. quand aucun onglet n'était ouvert
  // (sinon, cf. plus bas, le message postMessage suffit sans reload).
  (function handleAgendaDoneParam() {
    if (params.get("notifAction") !== "agendaDone") return;
    const itemId = params.get("itemId");
    if (itemId) markAgendaItemDone(itemId);
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", location.pathname);
    }
  })();

  // Même action, reçue par message quand un onglet était déjà ouvert
  // (cf. sw.js "notificationclick") — pas de reload nécessaire ici.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "atyclock-agenda-action" && e.data.action === "done" && e.data.itemId) {
        markAgendaItemDone(e.data.itemId);
      }
    });
  }

  // ---------- Interface du minuteur (atyclock.html uniquement) ----------
  if (!onAtyclockPage) return;

  (function syncPendingFromStorage() {
    const r = getCurrentReminder();
    if (r) {
      pendingTarget = r.targetTime;
      pendingDaily = r.isDaily;
    }
  })();
  // Référence à partir de laquelle on affiche le cumul des taps sur les
  // boutons d'offset (+5/+15 min/+1h) ; remise à zéro à chaque
  // programmation ou annulation, pour repartir d'un cumul propre.
  let baseTarget = pendingTarget;
  function formatOffsetTotal(minutes) {
    if (minutes < 60) return `+${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `+${h}h` : `+${h}h${String(m).padStart(2, "0")}`;
  }

  function renderZoneContext() {
    const el = $("zoneContext");
    if (!ctxZoneId || !ctxZoneName) {
      el.classList.add("hidden");
      return;
    }
    $("zoneLabel").textContent = `Pour ${ctxZoneName}`;
    $("zoneDot").style.background = ctxZoneColor ? "#" + ctxZoneColor : "var(--accent)";
    el.classList.remove("hidden");
  }

  // L'horloge du haut affiche l'heure actuelle en temps normal ; le temps
  // d'un appui sur +5/+15 min/+1h, elle affiche brièvement l'heure du
  // rappel programmé, puis revient d'elle-même à l'heure actuelle. L'heure
  // du rappel reste, elle, en permanence visible dans le bouton Programmer.
  let previewing = false;
  function renderNow() {
    if (previewing) return;
    $("nowClock").textContent = formatClock(new Date());
  }

  function renderTarget() {
    const r = getCurrentReminder();
    const active = !!r;
    if (active) {
      pendingTarget = r.targetTime;
      pendingDaily = r.isDaily;
    } else if (!hasSelection) {
      pendingTarget = Date.now();
    }
    $("programLabel").textContent = active ? "Rappel à" : "Valider pour";
    $("programTime").textContent = formatClock(new Date(pendingTarget));
    $("statusRow").classList.toggle("active", active);
    $("statusText").textContent = active ? "Actif" : "En attente";
    $("btnCancel").classList.toggle("hidden", !active);
    $("programHint").textContent = pendingDaily
      ? "Mode quotidien activé 🔁"
      : "Appui long pour un rappel quotidien 🔁";
    $("btnProgram").classList.toggle("daily", pendingDaily);
    $("statusRow").classList.toggle("daily", pendingDaily);
  }

  const PREVIEW_MS = 5000;

  let badgeTimer = null;
  function showOffsetBadge(label) {
    const el = $("offsetBadge");
    el.textContent = label;
    el.classList.remove("show");
    void el.offsetWidth; // relance la transition
    el.classList.add("show");
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => el.classList.remove("show"), PREVIEW_MS);
  }

  // Tant que la programmation n'est pas validée (bouton Programmer non
  // appuyé), le cumul de taps n'est que provisoire : dès que l'aperçu
  // revient à l'heure actuelle sans validation, tout est remis à zéro.
  // Si un rappel est déjà actif, les taps l'ont déjà mis à jour en
  // direct dans le stockage : rien à réinitialiser dans ce cas.
  let previewTimer = null;
  function showTargetPreview() {
    previewing = true;
    $("nowLabel").textContent = "Rappel à";
    $("nowClock").textContent = formatClock(new Date(pendingTarget));
    $("nowClock").classList.add("preview");
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewing = false;
      $("nowLabel").textContent = "";
      $("nowClock").classList.remove("preview");
      renderNow();
      if (!getCurrentReminder()) {
        pendingTarget = Date.now();
        baseTarget = pendingTarget;
        pendingDaily = false;
        hasSelection = false;
        renderTarget();
      }
    }, PREVIEW_MS);
  }

  function addOffset(minutes) {
    hasSelection = true;
    pendingTarget += minutes * 60000;
    const r = getCurrentReminder();
    if (r) {
      r.targetTime = pendingTarget;
      saveAtyclockState();
    }
    vibrate(20);
    const cumulated = Math.round((pendingTarget - baseTarget) / 60000);
    showOffsetBadge(formatOffsetTotal(cumulated));
    showTargetPreview();
    renderTarget();
  }

  function armReminder() {
    ensureNotifPermission();
    let r = getCurrentReminder();
    if (!r) {
      r = {
        id: uid(),
        targetTime: pendingTarget,
        isDaily: pendingDaily,
        zoneId: ctxZoneId || null,
        zoneName: ctxZoneId ? ctxZoneName : null,
        createdAt: Date.now(),
      };
      astate.reminders.push(r);
    } else {
      r.targetTime = pendingTarget;
      r.isDaily = pendingDaily;
    }
    saveAtyclockState();
    baseTarget = pendingTarget;
    vibrate([20, 30, 20]);
    renderTarget();
  }

  function toggleDaily() {
    pendingDaily = !pendingDaily;
    const r = getCurrentReminder();
    if (r) {
      r.isDaily = pendingDaily;
      saveAtyclockState();
    }
    vibrate(20);
    renderTarget();
  }

  function renderSoundToggle() {
    const btn = $("btnSound");
    if (!btn) return;
    const on = !!astate.soundEnabled;
    btn.textContent = on ? "🔔" : "🔕";
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-label", on ? "Alarme sonore activée" : "Alarme sonore désactivée");
  }

  function toggleSound() {
    astate.soundEnabled = !astate.soundEnabled;
    saveAtyclockState();
    vibrate(astate.soundEnabled ? [15, 40, 15] : 15);
    renderSoundToggle();
  }

  function cancelReminder() {
    const r = getCurrentReminder();
    if (!r) return;
    astate.reminders = astate.reminders.filter((x) => x.id !== r.id);
    saveAtyclockState();
    pendingTarget = Date.now();
    pendingDaily = false;
    baseTarget = pendingTarget;
    hasSelection = false;
    vibrate(20);
    renderTarget();
  }

  function bindProgramButton() {
    const btn = $("btnProgram");
    let timer = null;
    let longFired = false;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener("pointerdown", () => {
      longFired = false;
      timer = setTimeout(() => { longFired = true; toggleDaily(); }, 350);
    });
    btn.addEventListener("pointerup", () => {
      clear();
      if (!longFired) armReminder();
    });
    btn.addEventListener("pointerleave", clear);
    btn.addEventListener("pointercancel", clear);
  }
  function bindStatusRow() {
    const row = $("statusRow");
    let timer = null;
    row.addEventListener("pointerdown", () => {
      timer = setTimeout(cancelReminder, 450);
    });
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    row.addEventListener("pointerup", clear);
    row.addEventListener("pointerleave", clear);
    row.addEventListener("pointercancel", clear);
  }

  function bindSoundButton() {
    const btn = $("btnSound");
    if (!btn) return;
    let timer = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener("pointerdown", () => {
      timer = setTimeout(toggleSound, 350);
    });
    btn.addEventListener("pointerup", clear);
    btn.addEventListener("pointerleave", clear);
    btn.addEventListener("pointercancel", clear);
  }

  // ---------- Agenda du jour (Google Calendar) — atyclock.html uniquement ----------
  // Section repliée par défaut (aucun appel réseau tant qu'elle n'est pas
  // ouverte) : le moteur de relance lui-même (checkAgendaReminders, plus
  // haut, partagé toutes pages) ne dépend que des événements déjà mis en
  // cache dans astate.agendaItems, jamais d'un jeton Google valide en
  // permanence.
  function googleConfigured() {
    return typeof GOOGLE_CONFIG !== "undefined" && GOOGLE_CONFIG.clientId && GOOGLE_CONFIG.clientId.indexOf("REMPLACE") === -1;
  }
  let googleAccessToken = null;
  let googleTokenExpiry = 0;
  let googleTokenClient = null;
  let gisLoadPromise = null;
  let gcalCalendars = [];

  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (gisLoadPromise) return gisLoadPromise;
    gisLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = GIS_CDN_URL;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Chargement Google impossible"));
      document.head.appendChild(script);
    });
    return gisLoadPromise;
  }
  function ensureTokenClient() {
    return loadGis().then(() => {
      if (!googleTokenClient) {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CONFIG.clientId,
          scope: GOOGLE_SCOPE,
          callback: () => {},
        });
      }
    });
  }
  // Enveloppe en promesse l'API par callback de Google Identity Services :
  // le client est réutilisé, on réassigne juste callback/error_callback
  // avant chaque appel.
  function requestGoogleToken(promptMode) {
    return new Promise((resolve, reject) => {
      googleTokenClient.callback = (resp) => {
        if (resp && resp.access_token) resolve(resp);
        else reject(new Error((resp && resp.error) || "Connexion refusée"));
      };
      googleTokenClient.error_callback = (err) => reject(new Error((err && err.type) || "Connexion impossible"));
      try {
        googleTokenClient.requestAccessToken(promptMode !== undefined ? { prompt: promptMode } : {});
      } catch (e) {
        reject(e);
      }
    });
  }
  // prompt:"" = tentative silencieuse (aucune UI, ne peut donc pas être
  // bloquée comme une popup) — utilisée pour rafraîchir un jeton expiré
  // sans redemander le consentement à chaque réouverture de la section.
  function ensureGoogleToken(promptMode) {
    if (googleAccessToken && Date.now() < googleTokenExpiry - 60000) return Promise.resolve();
    return ensureTokenClient()
      .then(() => requestGoogleToken(promptMode))
      .then((resp) => {
        googleAccessToken = resp.access_token;
        googleTokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
      });
  }
  function gcalFetch(url) {
    return fetch(url, { headers: { Authorization: "Bearer " + googleAccessToken } }).then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }
  function fetchCalendarList() {
    return gcalFetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader");
  }
  function fetchTodayEvents(calendarId) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const qs = new URLSearchParams({
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
    });
    return gcalFetch("https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(calendarId) + "/events?" + qs.toString());
  }

  function setGcalStatus(text) {
    [$("gcalStatus"), $("gcalStatus2")].forEach((el) => {
      if (!el) return;
      el.textContent = text;
      el.classList.toggle("hidden", !text);
    });
  }
  function renderGcalPanels() {
    const configured = googleConfigured();
    $("gcalNotConfigured").classList.toggle("hidden", configured);
    $("gcalConnect").classList.toggle("hidden", !configured || astate.googleConnected);
    $("gcalConnected").classList.toggle("hidden", !configured || !astate.googleConnected);
  }
  function renderCalendarSelect() {
    const sel = $("gcalCalendarSelect");
    sel.innerHTML = "";
    gcalCalendars.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.summary + (c.primary ? " (principal)" : "");
      if (c.id === astate.googleCalendarId) opt.selected = true;
      sel.appendChild(opt);
    });
  }
  function renderIntervalPills() {
    [15, 30, 60].forEach((m) => {
      const el = $("gcalPill" + m);
      if (el) el.classList.toggle("on", astate.agendaReminderIntervalMin === m);
    });
  }
  function renderGcalEvents() {
    const tk = todayKey();
    const items = astate.agendaItems
      .filter((it) => it.dayKey === tk)
      .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO));
    const wrap = $("gcalEventsList");
    wrap.innerHTML = "";
    $("gcalEmpty").classList.toggle("hidden", items.length > 0);
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "gcal-event" + (item.done ? " done" : "");
      const text = document.createElement("div");
      text.className = "gcal-event-text";
      const time = document.createElement("div");
      time.className = "gcal-event-time";
      time.textContent = formatClock(new Date(item.startISO));
      const title = document.createElement("div");
      title.className = "gcal-event-title";
      title.textContent = item.title;
      text.appendChild(time);
      text.appendChild(title);
      row.appendChild(text);
      if (item.done) {
        const badge = document.createElement("button");
        badge.className = "gcal-done-badge";
        badge.textContent = "✅ Fait";
        badge.setAttribute("aria-label", "Annuler, remettre en attente");
        badge.onclick = () => {
          item.done = false;
          saveAtyclockState();
          renderGcalEvents();
        };
        row.appendChild(badge);
      } else {
        const bell = document.createElement("button");
        bell.className = "gcal-bell" + (item.active ? " on" : "");
        bell.textContent = "🔔";
        bell.setAttribute("aria-label", item.active ? "Ne plus me relancer sur cet événement" : "Me relancer jusqu'à confirmation");
        bell.onclick = () => {
          item.active = !item.active;
          if (item.active) {
            item.dormant = false;
            item.remindCount = 0;
            ensureNotifPermission();
          }
          saveAtyclockState();
          vibrate(20);
          renderGcalEvents();
        };
        row.appendChild(bell);
      }
      wrap.appendChild(row);
    });
  }
  // Rouvrir la liste réarme les événements mis en veille (3 relances
  // sans réaction) — même principe que Boost quand on revient sur sa page.
  function rearmDormantAgendaItems() {
    let dirty = false;
    astate.agendaItems.forEach((item) => {
      if (item.dormant) {
        item.dormant = false;
        item.remindCount = 0;
        dirty = true;
      }
    });
    if (dirty) saveAtyclockState();
  }
  function refreshTodayEvents() {
    if (!astate.googleCalendarId) return Promise.resolve();
    setGcalStatus("Chargement des événements…");
    return fetchTodayEvents(astate.googleCalendarId)
      .then((data) => {
        const tk = todayKey();
        const timed = (data.items || []).filter((ev) => ev.start && ev.start.dateTime && ev.status !== "cancelled");
        const known = new Map(astate.agendaItems.filter((it) => it.dayKey === tk).map((it) => [it.eventId, it]));
        astate.agendaItems = timed.map((ev) => {
          const prev = known.get(ev.id);
          return {
            id: (prev && prev.id) || uid(),
            eventId: ev.id,
            title: ev.summary || "(sans titre)",
            startISO: ev.start.dateTime,
            dayKey: tk,
            active: prev ? prev.active : false,
            remindCount: prev ? prev.remindCount : 0,
            dormant: prev ? prev.dormant : false,
            lastReminderAt: prev ? prev.lastReminderAt : null,
            done: prev ? prev.done : false,
          };
        });
        saveAtyclockState();
        setGcalStatus("");
        renderGcalEvents();
      })
      .catch(() => {
        setGcalStatus("Impossible de charger les événements — réessaie plus tard.");
      });
  }
  function loadCalendarsAndEvents() {
    return fetchCalendarList()
      .then((data) => {
        gcalCalendars = (data.items || []).filter((c) => c.accessRole !== "freeBusyReader");
        if (!astate.googleCalendarId || !gcalCalendars.some((c) => c.id === astate.googleCalendarId)) {
          const chosen = gcalCalendars.find((c) => c.primary) || gcalCalendars[0];
          if (chosen) {
            astate.googleCalendarId = chosen.id;
            astate.googleCalendarLabel = chosen.summary;
            saveAtyclockState();
          }
        }
        renderCalendarSelect();
        return refreshTodayEvents();
      })
      .catch(() => {
        setGcalStatus("Impossible de charger tes agendas — réessaie plus tard.");
      });
  }
  function connectGoogle() {
    if (!googleConfigured()) return;
    setGcalStatus("Connexion en cours…");
    ensureTokenClient()
      .then(() => requestGoogleToken(undefined))
      .then((resp) => {
        googleAccessToken = resp.access_token;
        googleTokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
        astate.googleConnected = true;
        saveAtyclockState();
        setGcalStatus("");
        renderGcalPanels();
        return loadCalendarsAndEvents();
      })
      .catch(() => {
        setGcalStatus("Connexion impossible — réessaie.");
      });
  }
  function disconnectGoogle() {
    const token = googleAccessToken;
    astate.googleConnected = false;
    astate.googleCalendarId = null;
    astate.googleCalendarLabel = null;
    astate.agendaItems = [];
    saveAtyclockState();
    googleAccessToken = null;
    googleTokenExpiry = 0;
    if (token && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try {
        google.accounts.oauth2.revoke(token, () => {});
      } catch (e) {
        // silencieux
      }
    }
    renderGcalPanels();
  }
  function openGcalSection() {
    if (!astate.googleConnected) return;
    rearmDormantAgendaItems();
    renderGcalEvents();
    ensureGoogleToken("")
      .then(refreshTodayEvents)
      .catch(() => {
        setGcalStatus("Reconnexion silencieuse impossible — déconnecte puis reconnecte-toi si la liste ne se met plus à jour.");
      });
  }
  function toggleGcalSection() {
    const header = $("gcalHeader");
    const body = $("gcalBody");
    const opening = body.classList.contains("hidden");
    body.classList.toggle("hidden");
    header.classList.toggle("open", opening);
    if (!opening) return;
    renderGcalPanels();
    renderIntervalPills();
    if (astate.googleConnected) openGcalSection();
  }

  // ---------- Atytap — compteurs à appui (atyclock.html uniquement) ----------
  // Petit bouton générique : appui court = enregistre l'heure sur le
  // compteur actif (envie, prise, verre d'eau… n'importe quoi, renommé
  // librement), appui long = récap + synthèse de fréquence. Stockage à
  // part (atytap-v1) plutôt que dans atyclock-v1, comme les autres
  // sous-fonctionnalités du fichier.
  const TAP_STORAGE_KEY = "atytap-v1";
  function loadTapState() {
    try {
      const raw = localStorage.getItem(TAP_STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.counters)) return d;
      }
    } catch (e) {
      console.error("Atytap : chargement impossible", e);
    }
    return { counters: [], activeCounterId: null };
  }
  let tstate = loadTapState();
  function saveTapState() {
    try {
      localStorage.setItem(TAP_STORAGE_KEY, JSON.stringify(tstate));
    } catch (e) {
      console.error("Atytap : sauvegarde impossible", e);
    }
  }
  function ensureActiveCounter() {
    if (!tstate.counters.length) {
      const c = { id: uid(), name: "Compteur", createdAt: Date.now(), taps: [] };
      tstate.counters.push(c);
      tstate.activeCounterId = c.id;
    } else if (!tstate.activeCounterId || !tstate.counters.some((c) => c.id === tstate.activeCounterId)) {
      tstate.activeCounterId = tstate.counters[0].id;
    }
    return tstate.counters.find((c) => c.id === tstate.activeCounterId);
  }
  function flashTapButton() {
    const btn = $("btnTap");
    if (!btn) return;
    btn.classList.add("flash");
    setTimeout(() => btn.classList.remove("flash"), 400);
  }
  function logTap() {
    const counter = ensureActiveCounter();
    counter.taps.push(Date.now());
    saveTapState();
    vibrate(15);
    flashTapButton();
  }
  function addTapCounter() {
    const c = { id: uid(), name: "Compteur " + (tstate.counters.length + 1), createdAt: Date.now(), taps: [] };
    tstate.counters.push(c);
    tstate.activeCounterId = c.id;
    saveTapState();
    renderTapCounters();
  }
  function formatDuration(ms) {
    const totalMin = Math.max(0, Math.round(ms / 60000));
    if (totalMin < 1) return "< 1 min";
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  }
  // Fréquence = intervalle moyen entre le premier et le dernier tap —
  // simple et lisible, plutôt qu'une vraie analyse statistique.
  function synthesisFor(counter) {
    if (!counter.taps.length) return "Pas encore de tap enregistré.";
    const sorted = counter.taps.slice().sort((a, b) => a - b);
    const now = Date.now();
    const last = sorted[sorted.length - 1];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = sorted.filter((t) => t >= todayStart.getTime()).length;
    let freqText = "";
    if (sorted.length >= 2) {
      const avgInterval = (last - sorted[0]) / (sorted.length - 1);
      freqText = ` · en moyenne toutes les ${formatDuration(avgInterval)}`;
    }
    return `${counter.taps.length} au total · dernier il y a ${formatDuration(now - last)}${freqText} · ${todayCount} aujourd'hui`;
  }
  function tapDayLabel(ts) {
    const tk = todayKey(); // réutilise le helper "jour courant" défini plus haut (agenda)
    const d = new Date(ts);
    const dKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (dKey === tk) return "Aujourd'hui";
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yKey = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
    if (dKey === yKey) return "Hier";
    return frenchDayLabel(d);
  }
  const tapExpanded = {};
  function renderTapCounters() {
    const wrap = $("tapCountersList");
    wrap.innerHTML = "";
    tstate.counters.forEach((counter) => {
      const isActive = counter.id === tstate.activeCounterId;
      const card = document.createElement("div");
      card.className = "tap-counter" + (isActive ? " active" : "");

      const head = document.createElement("div");
      head.className = "tap-counter-head";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "tap-counter-name";
      nameInput.maxLength = 30;
      nameInput.value = counter.name;
      nameInput.addEventListener("input", () => {
        counter.name = nameInput.value;
        saveTapState();
      });
      const activeBtn = document.createElement("button");
      activeBtn.className = "tap-active-btn" + (isActive ? " on" : "");
      activeBtn.textContent = isActive ? "● Actif" : "Activer";
      activeBtn.onclick = () => {
        tstate.activeCounterId = counter.id;
        saveTapState();
        renderTapCounters();
      };
      const delBtn = document.createElement("button");
      delBtn.className = "tap-counter-del";
      delBtn.textContent = "✕";
      delBtn.setAttribute("aria-label", "Supprimer ce compteur");
      delBtn.onclick = () => {
        tstate.counters = tstate.counters.filter((c) => c.id !== counter.id);
        if (tstate.activeCounterId === counter.id) {
          tstate.activeCounterId = tstate.counters.length ? tstate.counters[0].id : null;
        }
        saveTapState();
        renderTapCounters();
      };
      head.appendChild(nameInput);
      head.appendChild(activeBtn);
      head.appendChild(delBtn);
      card.appendChild(head);

      const synth = document.createElement("div");
      synth.className = "tap-synthesis";
      synth.textContent = synthesisFor(counter);
      card.appendChild(synth);

      if (counter.taps.length) {
        const toggle = document.createElement("button");
        toggle.className = "tap-detail-toggle";
        toggle.textContent = tapExpanded[counter.id] ? "▾ Masquer le détail" : "▸ Voir le détail";
        toggle.onclick = () => {
          tapExpanded[counter.id] = !tapExpanded[counter.id];
          renderTapCounters();
        };
        card.appendChild(toggle);

        if (tapExpanded[counter.id]) {
          const log = document.createElement("div");
          log.className = "tap-log";
          const sorted = counter.taps.slice().sort((a, b) => b - a).slice(0, 200);
          let lastLabel = null;
          sorted.forEach((ts) => {
            const label = tapDayLabel(ts);
            if (label !== lastLabel) {
              const dayEl = document.createElement("div");
              dayEl.className = "tap-log-day";
              dayEl.textContent = label;
              log.appendChild(dayEl);
              lastLabel = label;
            }
            const timeEl = document.createElement("div");
            timeEl.className = "tap-log-time";
            timeEl.textContent = formatClock(new Date(ts));
            log.appendChild(timeEl);
          });
          card.appendChild(log);
        }
      }

      wrap.appendChild(card);
    });
  }
  function openTapOverlay() {
    renderTapCounters();
    $("tapOverlay").classList.remove("hidden");
  }
  function closeTapOverlay() {
    $("tapOverlay").classList.add("hidden");
  }
  // Distingue appui court (log) / appui long (récap), même logique que
  // les interrupteurs à appui long d'Atyclock/Atymemo : un mouvement >
  // 10px avant les 500 ms annule (geste de scroll, pas un tap manqué).
  function bindTapButton() {
    const btn = $("btnTap");
    if (!btn) return;
    const LONG_PRESS_MS = 500;
    const MOVE_CANCEL_PX = 10;
    let timer = null;
    let moved = false;
    let startX = 0, startY = 0;
    btn.addEventListener("pointerdown", (e) => {
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        openTapOverlay();
      }, LONG_PRESS_MS);
    });
    btn.addEventListener("pointermove", (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - startX) > MOVE_CANCEL_PX || Math.abs(e.clientY - startY) > MOVE_CANCEL_PX) {
        clearTimeout(timer);
        timer = null;
        moved = true;
      }
    });
    btn.addEventListener("pointerup", () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        if (!moved) logTap();
      }
    });
    btn.addEventListener("pointercancel", () => {
      clearTimeout(timer);
      timer = null;
    });
  }

  renderZoneContext();
  renderNow();
  renderTarget();
  renderSoundToggle();
  renderAgendaToggle();
  renderGcalPanels();
  renderIntervalPills();
  setInterval(() => {
    renderNow();
    renderTarget();
  }, 1000);
  $("btnPlus1").onclick = () => addOffset(1);
  $("btnPlus5").onclick = () => addOffset(5);
  $("btnPlus15").onclick = () => addOffset(15);
  $("btnPlus60").onclick = () => addOffset(60);
  $("btnCancel").onclick = cancelReminder;
  $("btnBack").onclick = () => { location.href = "index.html"; };
  $("agendaToggle").onclick = toggleAgendaReminder;
  $("gcalHeader").onclick = toggleGcalSection;
  $("btnGcalConnect").onclick = connectGoogle;
  $("btnGcalDisconnect").onclick = disconnectGoogle;
  $("gcalCalendarSelect").onchange = () => {
    const sel = $("gcalCalendarSelect");
    const chosen = gcalCalendars.find((c) => c.id === sel.value);
    astate.googleCalendarId = sel.value;
    astate.googleCalendarLabel = chosen ? chosen.summary : null;
    saveAtyclockState();
    refreshTodayEvents();
  };
  [15, 30, 60].forEach((m) => {
    const el = $("gcalPill" + m);
    if (el) {
      el.onclick = () => {
        astate.agendaReminderIntervalMin = m;
        saveAtyclockState();
        renderIntervalPills();
      };
    }
  });
  $("btnTapClose").onclick = closeTapOverlay;
  $("tapOverlay").onclick = (e) => { if (e.target === $("tapOverlay")) closeTapOverlay(); };
  $("btnTapAdd").onclick = addTapCounter;
  bindTapButton();
  bindProgramButton();
  bindStatusRow();
  bindSoundButton();
})();
