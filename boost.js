/* =========================================================
   Boost — définir UNE priorité + sa toute première action, se faire
   relancer gentiment jusqu'à démarrer, chronométrer la session.
   Un seul boost actif à la fois. Rappels via le moteur de
   notifications SW (actions "démarré"/"terminé" gérées dans sw.js,
   notificationclick) pour fonctionner même si l'app n'est pas au
   premier plan — pas de vrai push serveur tant que Supabase n'est
   pas en place (phase 2).
   Ce script tourne sur index.html (juste pour que les rappels
   continuent de vérifier en arrière-plan) et sur boost.html
   (interface complète).
   Données : localStorage (clé "boost-v1"), {boosts, sessions,
   reminderIntervalMin, notifAsked}.
   ========================================================= */
(function () {
  const STORAGE_KEY = "boost-v1";
  const $ = (id) => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const onBoostPage = !!$("screenHome");
  const params = new URLSearchParams(location.search);

  const CHECK_INTERVAL_MS = 15000;
  const HEARTBEAT_MS = 20000;
  const SIGNIFICANT_GAP_MS = 3 * 60000;
  const MAX_REMINDERS = 3;

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }
  function todayKey(d) {
    const dt = d || new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ---------- Persistance ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.boosts) && Array.isArray(d.sessions)) {
          if (typeof d.reminderIntervalMin !== "number") d.reminderIntervalMin = 30;
          if (typeof d.notifAsked !== "boolean") d.notifAsked = false;
          return d;
        }
      }
    } catch (e) {
      console.error("Boost : chargement impossible", e);
    }
    return { boosts: [], sessions: [], reminderIntervalMin: 30, notifAsked: false };
  }
  let bstate = load();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bstate));
    } catch (e) {
      console.error("Boost : sauvegarde impossible", e);
    }
  }
  function getCurrentBoost() {
    return bstate.boosts.find((b) => b.status === "active" || b.status === "started") || null;
  }

  // ---------- Encouragements (rotation sans répétition immédiate) ----------
  const ENCOURAGEMENTS = {
    start: [
      "C'est parti, un pas à la fois 🌱",
      "Le plus dur est fait : tu as commencé.",
      "Go ! Pas besoin que ce soit parfait, juste commencé.",
      "Et voilà, lancé. Le reste suivra.",
      "Belle décision. On y va.",
    ],
    finish: [
      "Bravo, c'est dans la boîte ✅",
      "Une victoire de plus, même petite.",
      "Fait, et bien fait. Respire un peu.",
      "Ça compte, quelle que soit la durée.",
      "Boost terminé — tu peux être fier·e de toi.",
    ],
    return: [
      "Content de te revoir 🌿",
      "Pas de souci pour la pause, on reprend quand tu veux.",
      "Toujours là pour toi, sans jugement.",
      "On reprend en douceur ?",
      "Ravi que tu repasses.",
    ],
  };
  const lastEncouragementIdx = {};
  function pickEncouragement(category) {
    const pool = ENCOURAGEMENTS[category];
    if (!pool || pool.length === 0) return "";
    let idx = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && idx === lastEncouragementIdx[category]) {
      idx = (idx + 1) % pool.length;
    }
    lastEncouragementIdx[category] = idx;
    return pool[idx];
  }

  // ---------- Bannière (page boost.html + index.html) ----------
  function injectBannerStyle() {
    if ($("boostBannerStyle")) return;
    const style = document.createElement("style");
    style.id = "boostBannerStyle";
    style.textContent =
      ".boost-banner{position:fixed;left:14px;right:14px;top:max(14px,env(safe-area-inset-top));" +
      "z-index:200;background:var(--surface2,#241E17);border:1px solid var(--accent,#5BE3A9);" +
      "border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" +
      "display:flex;align-items:center;gap:10px;transform:translateY(-140%);" +
      "transition:transform 0.3s ease;font-family:'Avenir Next','Segoe UI',system-ui,sans-serif;}" +
      ".boost-banner.show{transform:translateY(0);}" +
      ".boost-banner .txt{flex:1;font-size:14px;line-height:1.4;color:var(--text,#EAF4F0);}" +
      ".boost-banner button{background:transparent;border:none;color:var(--accent,#5BE3A9);" +
      "font-weight:700;font-size:13px;padding:6px;cursor:pointer;white-space:nowrap;}" +
      ".boost-banner button.hidden{display:none;}" +
      "@media (prefers-reduced-motion: reduce){.boost-banner{transition:none;}}";
    document.head.appendChild(style);
  }
  let bannerTimer = null;
  function ensureBannerEl() {
    let el = $("boostBanner");
    if (el) return el;
    el = document.createElement("div");
    el.id = "boostBanner";
    el.className = "boost-banner";
    el.innerHTML = '<div class="txt"></div><button type="button" class="action hidden"></button><button type="button" class="close">OK</button>';
    el.querySelector(".close").onclick = () => el.classList.remove("show");
    document.body.appendChild(el);
    return el;
  }
  function showBoostBanner(text, action) {
    const el = ensureBannerEl();
    el.querySelector(".txt").textContent = text;
    const actionBtn = el.querySelector(".action");
    if (action) {
      actionBtn.textContent = action.label;
      actionBtn.classList.remove("hidden");
      actionBtn.onclick = action.onClick;
    } else {
      actionBtn.classList.add("hidden");
      actionBtn.onclick = null;
    }
    el.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove("show"), 8000);
  }

  // ---------- Notifications (permission réutilisée, jamais redemandée) ----------
  function ensureNotifPermission() {
    if (!("Notification" in window)) return;
    if (bstate.notifAsked) return;
    bstate.notifAsked = true;
    save();
    if (Notification.permission === "default") {
      try {
        Notification.requestPermission();
      } catch (e) {
        // silencieux
      }
    }
  }
  // Les actions ("▶ Je l'ai démarré" / "✅ Je l'ai terminé") ne sont
  // supportées que par les notifications déclenchées via le service
  // worker (ServiceWorkerRegistration.showNotification), pas par le
  // constructeur Notification() classique — d'où ce chemin dédié.
  function sendBoostNotification(title, body, actions) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(title, { body, icon: "icons/icon-192.png", actions: actions || [], tag: "boost-reminder", renotify: true }))
      .catch(() => {});
  }

  // ---------- Moteur de rappels (toutes les pages) ----------
  function checkBoostReminders() {
    const b = getCurrentBoost();
    if (!b || b.status !== "active" || b.dormant) return;
    const intervalMs = (bstate.reminderIntervalMin || 30) * 60000;
    const base = b.lastReminderAt || b.createdAt;
    if (Date.now() - base < intervalMs) return;
    if ((b.remindCount || 0) >= MAX_REMINDERS) {
      b.dormant = true;
      save();
      notifyBoostDormant(b);
      return;
    }
    b.remindCount = (b.remindCount || 0) + 1;
    b.lastReminderAt = Date.now();
    save();
    notifyBoostReminder(b);
    renderBoostPulse();
  }
  function notifyBoostReminder(b) {
    const text = `⚡ Toujours partant pour : ${b.firstAction} ?`;
    vibrate([80, 40, 80]);
    showBoostBanner(text, { label: "Ouvrir", onClick: () => { location.href = "boost.html"; } });
    sendBoostNotification("Atycasa · Boost", text, [
      { action: "start", title: "▶ Je l'ai démarré" },
      { action: "done", title: "✅ Je l'ai terminé" },
    ]);
  }
  function notifyBoostDormant(b) {
    const text = "Je me fais discret — reviens quand tu veux, le boost t'attend";
    showBoostBanner(text, null);
    sendBoostNotification("Atycasa · Boost", text, []);
  }
  function renderBoostPulse() {
    const btn = $("btnBoost");
    if (!btn) return;
    const b = getCurrentBoost();
    btn.classList.toggle("pulse", !!b && b.status === "active" && !b.dormant);
  }

  // ---------- Actions déclenchées depuis une notification ----------
  function applyNotifAction(action) {
    const b = getCurrentBoost();
    if (!b) return;
    if (action === "start" && b.status === "active") {
      startBoost();
    } else if (action === "done") {
      finishBoost();
    }
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "boost-action") applyNotifAction(e.data.action);
    });
  }

  // ---------- Init partagée (toutes les pages) ----------
  injectBannerStyle();
  checkBoostReminders();
  setInterval(checkBoostReminders, CHECK_INTERVAL_MS);

  const launchBtn = $("btnBoost");
  if (launchBtn) {
    launchBtn.onclick = () => { location.href = "boost.html"; };
    renderBoostPulse();
  }

  // ---------- Interface (boost.html uniquement) ----------
  if (!onBoostPage) return;

  let draft = { priority: "", firstAction: "" };
  let runningTicker = null;

  function handleActionParam() {
    const action = params.get("action");
    if (!action) return;
    applyNotifAction(action);
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, "", location.pathname);
    }
  }

  function showScreen(name) {
    ["screenHome", "screenFlowA", "screenFlowB", "screenFlowC", "screenActive", "screenRunning"].forEach((id) => {
      $(id).classList.toggle("hidden", id !== name);
    });
    if (runningTicker) {
      clearInterval(runningTicker);
      runningTicker = null;
    }
    if (name === "screenRunning") {
      renderRunningTick();
      runningTicker = setInterval(renderRunningTick, 1000);
    }
  }

  // ---------- Accueil : graphique hebdo ----------
  const WEEK_LABELS = ["L", "M", "M", "J", "V", "S", "D"];
  function renderWeekChart() {
    const chart = $("weekChart");
    chart.innerHTML = "";
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = todayKey(d);
      const minutes = bstate.sessions.filter((s) => s.date === key).reduce((sum, s) => sum + s.minutes, 0);
      days.push({ key, minutes, weekday: (d.getDay() + 6) % 7 }); // lundi = 0
    }
    const maxMinutes = Math.max(...days.map((d) => d.minutes), 1);
    days.forEach((d) => {
      const col = document.createElement("div");
      col.className = "week-day";
      const slot = document.createElement("div");
      slot.className = "week-bar-slot";
      if (d.minutes > 0) {
        const bar = document.createElement("div");
        bar.className = "week-bar";
        const pct = Math.max(10, Math.round((d.minutes / maxMinutes) * 100));
        bar.style.height = pct + "%";
        slot.appendChild(bar);
      }
      const label = document.createElement("div");
      label.className = "week-day-label";
      label.textContent = WEEK_LABELS[d.weekday];
      col.appendChild(slot);
      col.appendChild(label);
      chart.appendChild(col);
    });
    const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
    const totalEl = $("weekTotal");
    if (totalMinutes === 0) {
      totalEl.textContent = "Pas encore de session boostée cette semaine — à toi de jouer 🌱";
    } else {
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      const label = h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}` : `${m} min`;
      totalEl.textContent = `${label} boostées cette semaine 🌱`;
    }
  }
  function renderHome() {
    renderWeekChart();
    showScreen("screenHome");
  }

  // ---------- Flow guidé ----------
  function startFlow(prefill) {
    draft = prefill ? { priority: prefill.priority, firstAction: prefill.firstAction } : { priority: "", firstAction: "" };
    $("inputPriority").value = draft.priority;
    showScreen("screenFlowA");
  }
  function cancelFlow() {
    draft = { priority: "", firstAction: "" };
    renderHome();
  }
  function goFlowB() {
    draft.priority = $("inputPriority").value.trim();
    if (!draft.priority) return;
    $("inputFirstAction").value = draft.firstAction;
    showScreen("screenFlowB");
  }
  function goFlowC() {
    draft.firstAction = $("inputFirstAction").value.trim();
    if (!draft.firstAction) return;
    $("recapPriority").textContent = draft.priority;
    $("recapFirstAction").textContent = draft.firstAction;
    showScreen("screenFlowC");
  }
  function confirmBoost() {
    const existing = getCurrentBoost();
    if (existing) {
      existing.priority = draft.priority;
      existing.firstAction = draft.firstAction;
      save();
      renderActive(existing);
      return;
    }
    const b = {
      id: uid(),
      priority: draft.priority,
      firstAction: draft.firstAction,
      createdAt: Date.now(),
      status: "active",
      startedAt: null,
      accumulatedMs: 0,
      paused: false,
      pausedAt: null,
      remindCount: 0,
      dormant: false,
      lastReminderAt: null,
      lastSeenAt: Date.now(),
      finishedAt: null,
      minutes: null,
    };
    bstate.boosts.push(b);
    save();
    renderActive(b);
  }

  // ---------- Écran actif (défini, pas démarré) ----------
  function renderActive(b) {
    $("activePriority").textContent = b.priority;
    $("activeFirstAction").textContent = b.firstAction;
    $("activeEncouragement").textContent = "";
    renderReminderPicker();
    showScreen("screenActive");
  }
  function renderReminderPicker() {
    [15, 30, 60].forEach((min) => {
      $("pill" + min).classList.toggle("on", (bstate.reminderIntervalMin || 30) === min);
    });
  }
  function setReminderInterval(min) {
    bstate.reminderIntervalMin = min;
    save();
    renderReminderPicker();
    vibrate(20);
  }

  // ---------- Démarrage / minuteur / fin ----------
  function startBoost() {
    const b = getCurrentBoost();
    if (!b || b.status !== "active") return;
    b.status = "started";
    b.startedAt = Date.now();
    b.paused = false;
    b.pausedAt = null;
    b.remindCount = 0;
    b.dormant = false;
    b.lastSeenAt = Date.now();
    save();
    renderBoostPulse();
    $("runningFirstAction").textContent = b.firstAction;
    $("runningEncouragement").textContent = pickEncouragement("start");
    vibrate([20, 30, 20]);
    showScreen("screenRunning");
  }
  function elapsedMs(b) {
    return (b.accumulatedMs || 0) + (b.paused || b.status !== "started" ? 0 : Date.now() - b.startedAt);
  }
  function renderRunningTick() {
    const b = getCurrentBoost();
    if (!b || b.status !== "started") return;
    $("timerClock").textContent = formatDuration(elapsedMs(b));
    $("timerClock").classList.toggle("paused", !!b.paused);
    $("btnPause").textContent = b.paused ? "▶ Reprendre" : "⏸ Pause";
  }
  function togglePause() {
    const b = getCurrentBoost();
    if (!b || b.status !== "started") return;
    if (b.paused) {
      b.paused = false;
      b.startedAt = Date.now();
      b.pausedAt = null;
    } else {
      b.accumulatedMs = elapsedMs(b);
      b.paused = true;
      b.pausedAt = Date.now();
    }
    save();
    vibrate(20);
    renderRunningTick();
  }
  function finishBoost() {
    const b = getCurrentBoost();
    if (!b) return;
    const totalMs = elapsedMs(b);
    const minutes = Math.max(1, Math.round(totalMs / 60000));
    b.status = "done";
    b.finishedAt = Date.now();
    b.minutes = minutes;
    bstate.sessions.push({ date: todayKey(), minutes, boostId: b.id });
    save();
    renderBoostPulse();
    const msg = pickEncouragement("finish");
    vibrate([20, 30, 20, 30, 20]);
    renderHome();
    showBoostBanner(msg, null);
  }
  function abandonBoost() {
    const b = getCurrentBoost();
    if (!b) return;
    bstate.boosts = bstate.boosts.filter((x) => x.id !== b.id);
    save();
    renderBoostPulse();
    renderHome();
  }

  // ---------- Retour après absence (session en cours) ----------
  function checkReturnPrompt(b) {
    if (!b || b.status !== "started" || b.paused) return false;
    const gap = Date.now() - (b.lastSeenAt || b.startedAt);
    if (gap < SIGNIFICANT_GAP_MS) return false;
    const mins = Math.round(gap / 60000);
    $("returnBody").textContent = `Ça fait environ ${mins} min qu'on ne s'est pas vus. Tu as travaillé sur "${b.firstAction}" pendant tout ce temps ?`;
    $("returnAdjustInput").value = mins;
    $("returnAdjustRow").classList.remove("show");
    $("returnOverlay").classList.remove("hidden");
    return true;
  }
  function resolveReturn(mode) {
    const b = getCurrentBoost();
    if (!b) { $("returnOverlay").classList.add("hidden"); return; }
    if (mode === "all") {
      // Rien à changer : startedAt n'a pas bougé, le temps compte tel quel.
    } else if (mode === "stopped") {
      // Exclut le trou : on ne compte que jusqu'au dernier signe de vie connu.
      b.accumulatedMs = (b.accumulatedMs || 0) + Math.max(0, (b.lastSeenAt || b.startedAt) - b.startedAt);
      b.startedAt = Date.now();
    } else if (mode === "adjust") {
      const adjustedMin = Math.max(0, parseInt($("returnAdjustInput").value, 10) || 0);
      b.startedAt = Date.now() - adjustedMin * 60000;
      b.accumulatedMs = b.accumulatedMs || 0;
    }
    b.lastSeenAt = Date.now();
    save();
    $("returnOverlay").classList.add("hidden");
    showScreen("screenRunning");
  }

  // ---------- Heartbeat (détecte les absences) ----------
  function heartbeat() {
    const b = getCurrentBoost();
    if (!b) return;
    b.lastSeenAt = Date.now();
    save();
  }
  setInterval(() => { if (!document.hidden) heartbeat(); }, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) heartbeat(); });

  // ---------- Liaison des boutons ----------
  $("btnBack").onclick = () => { location.href = "index.html"; };
  $("btnNewBoost").onclick = () => startFlow(null);
  $("inputPriority").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); goFlowB(); } });
  $("inputFirstAction").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); goFlowC(); } });
  $("btnFlowANext").onclick = goFlowB;
  $("btnFlowACancel").onclick = cancelFlow;
  $("btnFlowBNext").onclick = goFlowC;
  $("btnFlowBBack").onclick = () => showScreen("screenFlowA");
  $("btnFlowBCancel").onclick = cancelFlow;
  $("btnFlowCConfirm").onclick = confirmBoost;
  $("btnFlowCBack").onclick = () => showScreen("screenFlowB");
  $("btnFlowCCancel").onclick = cancelFlow;
  $("pill15").onclick = () => setReminderInterval(15);
  $("pill30").onclick = () => setReminderInterval(30);
  $("pill60").onclick = () => setReminderInterval(60);
  $("btnStart").onclick = () => { ensureNotifPermission(); startBoost(); };
  $("btnEdit").onclick = () => { const b = getCurrentBoost(); if (b) startFlow(b); };
  $("btnAbandon").onclick = abandonBoost;
  $("btnFinish").onclick = finishBoost;
  $("btnPause").onclick = togglePause;
  $("btnReturnAll").onclick = () => resolveReturn("all");
  $("btnReturnStopped").onclick = () => resolveReturn("stopped");
  $("btnReturnAdjust").onclick = () => $("returnAdjustRow").classList.add("show");
  $("btnReturnAdjustConfirm").onclick = () => resolveReturn("adjust");

  // ---------- Entrée sur la page ----------
  (function init() {
    handleActionParam();
    const b = getCurrentBoost();
    if (!b) {
      renderHome();
      return;
    }
    if (b.status === "active") {
      if (b.dormant) {
        b.dormant = false;
        b.remindCount = 0;
        b.lastReminderAt = Date.now();
        save();
      }
      renderActive(b);
      $("activeEncouragement").textContent = pickEncouragement("return");
      return;
    }
    // status === "started"
    if (checkReturnPrompt(b)) return;
    b.lastSeenAt = Date.now();
    save();
    $("runningFirstAction").textContent = b.firstAction;
    showScreen("screenRunning");
  })();
})();
