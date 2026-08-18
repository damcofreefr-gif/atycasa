/* =========================================================
   Atygratitude — journal de gratitude "3+3" (technique associée à
   Fernando Mora, voir le texte dans #techText/#techCaveat plus bas —
   descriptif reconstitué de mémoire, à vérifier).
   Chaque jour : 3 choses pour lesquelles on est reconnaissant·e + 3
   choses qu'on a bien faites. Aucune pression : une ligne remplie
   compte déjà, un jour sans entrée n'est jamais présenté comme un
   manque (règle anti-dette du projet).
   Ce script tourne aussi (léger) sur index.html pour que le rappel
   quotidien continue de fonctionner en arrière-plan ; l'interface
   complète ne s'active que sur atygratitude.html.
   Données : localStorage (clé "atygratitude-v1").
   ========================================================= */
(function () {
  const STORAGE_KEY = "atygratitude-v1";
  const $ = (id) => document.getElementById(id);
  const onGratPage = !!$("gratTime");
  const CHECK_INTERVAL_MS = 60000;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.entries)) {
          if (typeof d.reminderEnabled !== "boolean") d.reminderEnabled = false;
          if (typeof d.reminderTime !== "string") d.reminderTime = "20:00";
          if (typeof d.lastReminderDayKey !== "string") d.lastReminderDayKey = "";
          if (typeof d.notifAsked !== "boolean") d.notifAsked = false;
          return d;
        }
      }
    } catch (e) {
      console.error("Atygratitude : chargement impossible", e);
    }
    return { entries: [], reminderEnabled: false, reminderTime: "20:00", lastReminderDayKey: "", notifAsked: false };
  }
  let gstate = load();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gstate));
    } catch (e) {
      console.error("Atygratitude : sauvegarde impossible", e);
    }
  }
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ---------- Bannière (toutes les pages) ----------
  function injectBannerStyle() {
    if ($("gratBannerStyle")) return;
    const style = document.createElement("style");
    style.id = "gratBannerStyle";
    style.textContent =
      ".grat-banner{position:fixed;left:14px;right:14px;top:max(14px,env(safe-area-inset-top));" +
      "z-index:200;background:var(--surface2,#241E17);border:1px solid var(--accent,#5BE3A9);" +
      "border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" +
      "display:flex;align-items:center;gap:10px;transform:translateY(-140%);" +
      "transition:transform 0.3s ease;font-family:'Avenir Next','Segoe UI',system-ui,sans-serif;}" +
      ".grat-banner.show{transform:translateY(0);}" +
      ".grat-banner .txt{flex:1;font-size:14px;line-height:1.4;color:var(--text,#EAF4F0);}" +
      ".grat-banner button{background:transparent;border:none;color:var(--accent,#5BE3A9);" +
      "font-weight:700;font-size:13px;padding:6px;cursor:pointer;}" +
      "@media (prefers-reduced-motion: reduce){.grat-banner{transition:none;}}";
    document.head.appendChild(style);
  }
  let bannerTimer = null;
  function showGratBanner(text, onClick) {
    let el = $("gratBanner");
    if (!el) {
      el = document.createElement("div");
      el.id = "gratBanner";
      el.className = "grat-banner";
      el.innerHTML = '<div class="txt"></div><button type="button">Ouvrir</button>';
      document.body.appendChild(el);
    }
    el.querySelector(".txt").textContent = text;
    el.querySelector("button").onclick = () => {
      el.classList.remove("show");
      if (onClick) onClick();
    };
    el.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove("show"), 8000);
  }

  // ---------- Rappel quotidien (toutes les pages) ----------
  function ensureNotifPermission() {
    if (!("Notification" in window)) return;
    if (gstate.notifAsked) return;
    gstate.notifAsked = true;
    save();
    if (Notification.permission === "default") {
      try {
        Notification.requestPermission();
      } catch (e) {
        // silencieux
      }
    }
  }
  function notifyGratitude() {
    const text = "🙏 Un instant pour ton 3+3 ?";
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    showGratBanner(text, () => { location.href = "atygratitude.html"; });
    if (!("Notification" in window) || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification("Atycasa · Atygratitude", {
          body: text,
          icon: "icons/icon-192.png",
          tag: "atygratitude-reminder",
          renotify: true,
        })
      )
      .catch(() => {});
  }
  // Un seul rappel par jour, à l'heure choisie (pas de relance en
  // boucle : c'est une invitation calme, pas une tâche à cocher). Se
  // réarme tout seul le lendemain puisque lastReminderDayKey change —
  // un jour manqué n'est jamais rattrapé ni présenté comme un échec.
  function checkGratitudeReminder() {
    if (!gstate.reminderEnabled) return;
    const now = new Date();
    const [h, m] = (gstate.reminderTime || "20:00").split(":").map(Number);
    const due = new Date(now);
    due.setHours(h, m, 0, 0);
    if (now.getTime() < due.getTime()) return;
    const tk = todayKey();
    if (gstate.lastReminderDayKey === tk) return;
    gstate.lastReminderDayKey = tk;
    save();
    notifyGratitude();
  }

  // ---------- Init partagée (toutes les pages) ----------
  injectBannerStyle();
  checkGratitudeReminder();
  setInterval(checkGratitudeReminder, CHECK_INTERVAL_MS);

  // ---------- Interface (atygratitude.html uniquement) ----------
  if (!onGratPage) return;

  const TECH_TEXT =
    "La technique du « 3+3 » est une pratique de gratitude associée à Fernando Mora, " +
    "formateur en pleine conscience (mindfulness) reconnu dans le monde hispanophone. L'idée : " +
    "chaque jour, prendre un instant pour noter 3 choses pour lesquelles tu es reconnaissant·e, " +
    "et 3 choses que tu as bien faites ou dont tu peux te féliciter — un regard à la fois tourné " +
    "vers ce qui t'a été donné, et vers ce que tu as toi-même accompli.";
  const TECH_CAVEAT =
    "⚠️ Ce descriptif est reconstitué de mémoire et n'a pas été vérifié auprès d'une source " +
    "précise sur la méthode exacte de Fernando Mora — à prendre comme point de départ, pas comme " +
    "une référence fidèle à 100 %. Si tu as une source plus exacte, ce texte se modifie facilement " +
    "(dans atygratitude.html).";

  function frenchDateLabel(dayKey) {
    const d = new Date(dayKey + "T00:00:00");
    const s = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function getOrCreateTodayEntry() {
    const tk = todayKey();
    let e = gstate.entries.find((x) => x.dayKey === tk);
    if (!e) {
      e = { dayKey: tk, gratitude: ["", "", ""], proud: ["", "", ""], updatedAt: Date.now() };
      gstate.entries.push(e);
    }
    return e;
  }
  function renderToday() {
    $("todayDate").textContent = frenchDateLabel(todayKey());
    const tk = todayKey();
    const existing = gstate.entries.find((x) => x.dayKey === tk);
    document.querySelectorAll("[data-section]").forEach((input) => {
      const section = input.dataset.section;
      const idx = Number(input.dataset.idx);
      input.value = existing ? existing[section][idx] || "" : "";
    });
  }
  function renderHistory() {
    const tk = todayKey();
    const past = gstate.entries
      .filter((e) => e.dayKey !== tk)
      .filter((e) => e.gratitude.concat(e.proud).some((line) => line && line.trim()))
      .sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1))
      .slice(0, 200);
    const wrap = $("histList");
    wrap.innerHTML = "";
    $("histEmpty").classList.toggle("hidden", past.length > 0);
    past.forEach((e) => {
      const row = document.createElement("div");
      row.className = "g-entry";
      const date = document.createElement("div");
      date.className = "g-entry-date";
      date.textContent = frenchDateLabel(e.dayKey);
      row.appendChild(date);
      e.gratitude.forEach((line) => {
        if (!line || !line.trim()) return;
        const p = document.createElement("div");
        p.className = "g-entry-line gratitude";
        p.textContent = line;
        row.appendChild(p);
      });
      e.proud.forEach((line) => {
        if (!line || !line.trim()) return;
        const p = document.createElement("div");
        p.className = "g-entry-line proud";
        p.textContent = line;
        row.appendChild(p);
      });
      wrap.appendChild(row);
    });
  }
  function renderNotifToggle() {
    $("gratNotifToggle").classList.toggle("on", !!gstate.reminderEnabled);
  }

  $("techText").textContent = TECH_TEXT;
  $("techCaveat").textContent = TECH_CAVEAT;

  document.querySelectorAll(".g-section-header").forEach((btn) => {
    btn.onclick = () => {
      $(btn.dataset.target).classList.toggle("open");
    };
  });

  document.querySelectorAll("[data-section]").forEach((input) => {
    input.addEventListener("input", () => {
      const e = getOrCreateTodayEntry();
      e[input.dataset.section][Number(input.dataset.idx)] = input.value;
      e.updatedAt = Date.now();
      save();
    });
  });

  $("gratTime").value = gstate.reminderTime;
  $("gratTime").addEventListener("change", () => {
    gstate.reminderTime = $("gratTime").value || "20:00";
    save();
  });
  $("gratNotifToggle").onclick = () => {
    gstate.reminderEnabled = !gstate.reminderEnabled;
    if (gstate.reminderEnabled) ensureNotifPermission();
    save();
    renderNotifToggle();
  };
  $("btnBack").onclick = () => { location.href = "index.html"; };

  renderToday();
  renderHistory();
  renderNotifToggle();
})();
