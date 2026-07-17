/* =========================================================
   Atyclock — tap timer / rappels programmables
   (nom de code d'origine : Heho, projet source heho2)
   Données : localStorage (clé "atyclock-v1"), avec migration
   automatique depuis l'ancienne clé "heho-v1" si elle existe.
   Ce script tourne sur TOUTES les pages (index.html + atyclock.html)
   pour que la vérification des rappels et la bannière fonctionnent
   partout ; l'interface du minuteur ne s'active que sur atyclock.html.
   ========================================================= */
(function () {
  const ATYCLOCK_KEY = "atyclock-v1";
  const LEGACY_HEHO_KEY = "heho-v1";
  const CHECK_INTERVAL_MS = 15000;
  const $ = (id) => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const onAtyclockPage = !!$("targetClock");

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }
  function formatClock(date) {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
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
        if (Array.isArray(d.reminders)) return d;
      }
    } catch (e) {
      console.error("Atyclock : chargement impossible", e);
    }
    return { reminders: [], notifAsked: false };
  }
  function saveAtyclockState() {
    try {
      localStorage.setItem(ATYCLOCK_KEY, JSON.stringify(astate));
    } catch (e) {
      console.error("Atyclock : sauvegarde impossible", e);
    }
  }
  function getVierge() {
    return astate.reminders.find((r) => !r.zoneId) || null;
  }

  let astate = loadAtyclockState();
  // Déclarés ici (et non plus bas, près de leur usage) car checkReminders()
  // peut appeler renderTarget() dès l'init partagée, avant que le bloc
  // "interface du minuteur" ne s'exécute.
  let pendingTarget = Date.now();
  let pendingDaily = false;

  // ---------- Bannière (toutes les pages) ----------
  function injectBannerStyle() {
    if ($("atyclockBannerStyle")) return;
    const style = document.createElement("style");
    style.id = "atyclockBannerStyle";
    style.textContent =
      ".atyclock-banner{position:fixed;left:14px;right:14px;top:max(14px,env(safe-area-inset-top));" +
      "z-index:200;background:var(--surface2,#16292E);border:1px solid var(--accent,#5BE3A9);" +
      "border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" +
      "display:flex;align-items:center;gap:10px;transform:translateY(-140%);" +
      "transition:transform 0.3s ease;font-family:'Avenir Next','Segoe UI',system-ui,sans-serif;}" +
      ".atyclock-banner.show{transform:translateY(0);}" +
      ".atyclock-banner .txt{flex:1;font-size:14px;line-height:1.4;color:var(--text,#EAF4F0);}" +
      ".atyclock-banner button{background:transparent;border:none;color:var(--accent,#5BE3A9);" +
      "font-weight:700;font-size:13px;padding:6px;cursor:pointer;}" +
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
    el.innerHTML = '<div class="txt"></div><button type="button">OK</button>';
    el.querySelector("button").onclick = () => el.classList.remove("show");
    document.body.appendChild(el);
    return el;
  }
  function showBanner(text) {
    const el = ensureBannerEl();
    el.querySelector(".txt").textContent = text;
    el.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove("show"), 8000);
  }

  // ---------- Vérification des rappels dus ----------
  function checkReminders() {
    const now = Date.now();
    const due = [];
    let dirty = false;
    astate.reminders = astate.reminders.filter((r) => {
      if (r.targetTime > now) return true;
      due.push(r.targetTime);
      dirty = true;
      if (r.isDaily) {
        while (r.targetTime <= now) r.targetTime += 86400000;
        return true;
      }
      return false;
    });
    if (dirty) saveAtyclockState();
    due.forEach((originalTarget) => notifyDue(originalTarget, now));
    if (onAtyclockPage) renderTarget();
  }
  function notifyDue(originalTarget, now) {
    const late = now - originalTarget > CHECK_INTERVAL_MS * 2;
    const text = late ? "🕐 Un rappel est passé" : "🕐 C'est l'heure";
    vibrate([80, 40, 80]);
    showBanner(text);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Atycasa", { body: text, icon: "icons/icon-192.png" });
      } catch (e) {
        // silencieux : certains contextes n'autorisent pas le constructeur Notification
      }
    }
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

  // ---------- Init partagée (toutes les pages) ----------
  injectBannerStyle();
  checkReminders();
  setInterval(checkReminders, CHECK_INTERVAL_MS);

  const launchBtn = $("btnAtyclock");
  if (launchBtn) launchBtn.onclick = () => { location.href = "atyclock.html"; };

  // ---------- Interface du minuteur (atyclock.html uniquement) ----------
  if (!onAtyclockPage) return;

  (function syncPendingFromStorage() {
    const r = getVierge();
    if (r) {
      pendingTarget = r.targetTime;
      pendingDaily = r.isDaily;
    }
  })();

  function renderNow() {
    $("nowClock").textContent = formatClock(new Date());
  }

  function renderTarget() {
    const r = getVierge();
    const active = !!r;
    if (active) {
      pendingTarget = r.targetTime;
      pendingDaily = r.isDaily;
    }
    $("targetClock").textContent = formatClock(new Date(pendingTarget));
    $("statusRow").classList.toggle("active", active);
    $("statusText").textContent = active ? "Actif" : "En attente";
    $("dailyNote").classList.toggle("hidden", !pendingDaily);
    $("btnCancel").classList.toggle("hidden", !active);
    $("programHint").textContent = pendingDaily
      ? "Mode quotidien activé 🔁"
      : "Appui long pour un rappel quotidien 🔁";
    $("btnProgram").classList.toggle("daily", pendingDaily);
  }

  let badgeTimer = null;
  function showOffsetBadge(label) {
    const el = $("offsetBadge");
    el.textContent = label;
    el.classList.remove("show");
    void el.offsetWidth; // relance la transition
    el.classList.add("show");
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function addOffset(minutes, label) {
    pendingTarget += minutes * 60000;
    const r = getVierge();
    if (r) {
      r.targetTime = pendingTarget;
      saveAtyclockState();
    }
    vibrate(20);
    showOffsetBadge(label);
    renderTarget();
  }

  function armReminder() {
    ensureNotifPermission();
    let r = getVierge();
    if (!r) {
      r = { id: uid(), targetTime: pendingTarget, isDaily: pendingDaily, zoneId: null, createdAt: Date.now() };
      astate.reminders.push(r);
    } else {
      r.targetTime = pendingTarget;
      r.isDaily = pendingDaily;
    }
    saveAtyclockState();
    vibrate([20, 30, 20]);
    renderTarget();
  }

  function toggleDaily() {
    pendingDaily = !pendingDaily;
    const r = getVierge();
    if (r) {
      r.isDaily = pendingDaily;
      saveAtyclockState();
    }
    vibrate(20);
    renderTarget();
  }

  function cancelReminder() {
    const r = getVierge();
    if (!r) return;
    astate.reminders = astate.reminders.filter((x) => x.id !== r.id);
    saveAtyclockState();
    pendingTarget = Date.now();
    pendingDaily = false;
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

  renderNow();
  renderTarget();
  setInterval(renderNow, 1000);
  $("btnPlus5").onclick = () => addOffset(5, "+5 min");
  $("btnPlus60").onclick = () => addOffset(60, "+1h");
  $("btnCancel").onclick = cancelReminder;
  $("btnBack").onclick = () => { location.href = "index.html"; };
  bindProgramButton();
  bindStatusRow();
})();
