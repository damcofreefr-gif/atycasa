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
          return d;
        }
      }
    } catch (e) {
      console.error("Atyclock : chargement impossible", e);
    }
    return { reminders: [], notifAsked: false, soundEnabled: false };
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
    btn.classList.toggle("pulse", astate.reminders.length > 0);
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
  function notifyDue(d, now) {
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
    }
    $("programLabel").textContent = active ? "Rappel à" : "Programmer à";
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
        renderTarget();
      }
    }, PREVIEW_MS);
  }

  function addOffset(minutes) {
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

  renderZoneContext();
  renderNow();
  renderTarget();
  renderSoundToggle();
  setInterval(renderNow, 1000);
  $("btnPlus1").onclick = () => addOffset(1);
  $("btnPlus5").onclick = () => addOffset(5);
  $("btnPlus15").onclick = () => addOffset(15);
  $("btnPlus60").onclick = () => addOffset(60);
  $("btnCancel").onclick = cancelReminder;
  $("btnBack").onclick = () => { location.href = "index.html"; };
  bindProgramButton();
  bindStatusRow();
  bindSoundButton();
})();
