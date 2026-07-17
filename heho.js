/* =========================================================
   Heho — tap timer / rappels programmables
   Données : localStorage (clé "heho-v1")
   Ce script tourne sur TOUTES les pages (index.html + heho.html)
   pour que la vérification des rappels et la bannière fonctionnent
   partout ; l'interface du minuteur ne s'active que sur heho.html.
   ========================================================= */
(function () {
  const HEHO_KEY = "heho-v1";
  const CHECK_INTERVAL_MS = 15000;
  const $ = (id) => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const onHehoPage = !!$("targetClock");

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
  function loadHehoState() {
    try {
      const raw = localStorage.getItem(HEHO_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.reminders)) return d;
      }
    } catch (e) {
      console.error("Heho : chargement impossible", e);
    }
    return { reminders: [], notifAsked: false };
  }
  function saveHehoState() {
    try {
      localStorage.setItem(HEHO_KEY, JSON.stringify(hstate));
    } catch (e) {
      console.error("Heho : sauvegarde impossible", e);
    }
  }
  function getVierge() {
    return hstate.reminders.find((r) => !r.zoneId) || null;
  }

  let hstate = loadHehoState();
  // Déclarés ici (et non plus bas, près de leur usage) car checkReminders()
  // peut appeler renderTarget() dès l'init partagée, avant que le bloc
  // "interface du minuteur" ne s'exécute.
  let pendingTarget = Date.now();
  let pendingDaily = false;

  // ---------- Bannière (toutes les pages) ----------
  function injectBannerStyle() {
    if ($("hehoBannerStyle")) return;
    const style = document.createElement("style");
    style.id = "hehoBannerStyle";
    style.textContent =
      ".heho-banner{position:fixed;left:14px;right:14px;top:max(14px,env(safe-area-inset-top));" +
      "z-index:200;background:var(--surface2,#16292E);border:1px solid var(--accent,#5BE3A9);" +
      "border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" +
      "display:flex;align-items:center;gap:10px;transform:translateY(-140%);" +
      "transition:transform 0.3s ease;font-family:'Avenir Next','Segoe UI',system-ui,sans-serif;}" +
      ".heho-banner.show{transform:translateY(0);}" +
      ".heho-banner .txt{flex:1;font-size:14px;line-height:1.4;color:var(--text,#EAF4F0);}" +
      ".heho-banner button{background:transparent;border:none;color:var(--accent,#5BE3A9);" +
      "font-weight:700;font-size:13px;padding:6px;cursor:pointer;}" +
      "@media (prefers-reduced-motion: reduce){.heho-banner{transition:none;}}";
    document.head.appendChild(style);
  }
  let bannerTimer = null;
  function ensureBannerEl() {
    let el = $("hehoBanner");
    if (el) return el;
    el = document.createElement("div");
    el.id = "hehoBanner";
    el.className = "heho-banner";
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
    hstate.reminders = hstate.reminders.filter((r) => {
      if (r.targetTime > now) return true;
      due.push(r.targetTime);
      dirty = true;
      if (r.isDaily) {
        while (r.targetTime <= now) r.targetTime += 86400000;
        return true;
      }
      return false;
    });
    if (dirty) saveHehoState();
    due.forEach((originalTarget) => notifyDue(originalTarget, now));
    if (onHehoPage) renderTarget();
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
    if (hstate.notifAsked) return;
    hstate.notifAsked = true;
    saveHehoState();
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

  const launchBtn = $("btnHeho");
  if (launchBtn) launchBtn.onclick = () => { location.href = "heho.html"; };

  // ---------- Interface du minuteur (heho.html uniquement) ----------
  if (!onHehoPage) return;

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
      saveHehoState();
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
      hstate.reminders.push(r);
    } else {
      r.targetTime = pendingTarget;
      r.isDaily = pendingDaily;
    }
    saveHehoState();
    vibrate([20, 30, 20]);
    renderTarget();
  }

  function toggleDaily() {
    pendingDaily = !pendingDaily;
    const r = getVierge();
    if (r) {
      r.isDaily = pendingDaily;
      saveHehoState();
    }
    vibrate(20);
    renderTarget();
  }

  function cancelReminder() {
    const r = getVierge();
    if (!r) return;
    hstate.reminders = hstate.reminders.filter((x) => x.id !== r.id);
    saveHehoState();
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
