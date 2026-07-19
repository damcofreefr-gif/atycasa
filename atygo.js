/* =========================================================
   Atygo — déblocage face à l'indécision, à tout moment de la journée.
   Propose UNE micro-action concrète de logistique du quotidien à la
   fois (jamais une liste à trier soi-même), avec mémorisation de ce
   qui a été fait pour ne pas reproposer sans arrêt la même chose.
   Indépendant d'Atycasa/Atyclock : aucun lien de données, juste le
   même langage visuel (fleur = urgence) pour rester cohérent.
   Données : localStorage (clé "atygo-v1"), {onboarded, prefs, actions}.
   ========================================================= */
(function () {
  const STORAGE_KEY = "atygo-v1";
  const $ = (id) => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 9);

  const CATEGORIES = {
    admin: { label: "Administratif", icon: "📋" },
    papers: { label: "Papiers / classeurs", icon: "🗂️" },
    domestic: { label: "Domestique léger", icon: "🧹" },
    food: { label: "Alimentation", icon: "🍽️" },
    health: { label: "Santé", icon: "💧" },
    finance: { label: "Finances", icon: "💳" },
    comm: { label: "Communication", icon: "💬" },
    organize: { label: "Organisation", icon: "🗓️" },
    vehicle: { label: "Véhicule", icon: "🚗" },
    digital: { label: "Numérique", icon: "💻" },
    space: { label: "Espace de vie", icon: "🧺" },
    pets: { label: "Animaux", icon: "🐾" },
    plants: { label: "Plantes", icon: "🪴" },
  };

  const DURATIONS = {
    1: { icon: "⚡", label: "Rapide (< 5 min)" },
    2: { icon: "⏱️", label: "Moyen (10-20 min)" },
    3: { icon: "🕓", label: "Long (30 min+)" },
  };
  const DAY_START_HOUR = 8;
  const DAY_END_HOUR = 21;

  // decayDays : au bout de combien de jours l'action redevient "à faire"
  // (repère indicatif, pas une science exacte). priority : 1 basse,
  // 2 normale, 3 haute — pondère l'urgence à décroissance égale.
  // duration : 1 rapide (<5 min), 2 moyen (10-20 min), 3 long (30 min+)
  // — sert à ne pas enchaîner un gros chantier salissant après un coup
  // de fil de 2 min, ou l'inverse (cohérence entre suggestions
  // successives, cf. dayOnly ci-dessous pour le pendant horaire).
  // dayOnly : n'a de sens qu'en journée (démarches, sorties, gros
  // travaux) — jamais proposé la nuit.
  function defaultActions() {
    return [
      { id: "a1", category: "admin", label: "Traiter une facture en attente", hint: "Ouvre l'appli ou le mail de la facture et prépare le paiement", decayDays: 10, priority: 2, duration: 2 },
      { id: "a2", category: "admin", label: "Répondre à un mail qui traîne", hint: "Ouvre ta boîte mail et réponds au plus vieux message", decayDays: 5, priority: 2, duration: 1 },
      { id: "a3", category: "admin", label: "Prendre un rendez-vous", hint: "Choisis UN rendez-vous à prendre et ouvre le téléphone ou le site", decayDays: 14, priority: 2, duration: 1, dayOnly: true },
      { id: "a4", category: "admin", label: "Renouveler un document", hint: "Identifie le document à renouveler et ouvre le site concerné", decayDays: 30, priority: 1, duration: 2, info: "Durées de validité courantes (à vérifier sur ton document, ça peut varier) :\n• Carte d'identité (adulte) : 10 ans\n• Passeport (adulte) : 10 ans\n• Permis de conduire : pas de limite (sauf poids lourd/transport, 5 ans, ou 15 ans après 60 ans)\n• Carte grise : pas d'expiration, mais adresse à mettre à jour sous 1 mois en cas de déménagement\n\nEn cas de doute, service-public.fr donne l'info à jour." },

      { id: "p1", category: "papers", label: "Trier une rubrique de classeur", hint: "Choisis UNE rubrique (ex : factures, impôts…) et range juste ça", decayDays: 14, priority: 2, duration: 2, gate: "papers", info: "Durées de conservation courantes (à titre indicatif) :\n• Factures eau / élec / gaz : 5 ans\n• Factures téléphone / internet : 1 an\n• Quittances de loyer : 3 ans après le départ\n• Relevés bancaires : 5 ans\n• Bulletins de salaire : jusqu'à la retraite\n• Avis d'imposition : 3 ans (mieux : à vie)\n• Factures de travaux / artisan : 10 ans\n• Contrats d'assurance : durée du contrat + 2 ans après résiliation\n• Ordonnances / factures médicales : 2 ans\n\nEn cas de doute, garde le document — mieux vaut trier trop peu que jeter un papier utile. Détail sur service-public.fr." },

      { id: "d1", category: "domestic", label: "Sortir une poubelle", hint: "", decayDays: 3, priority: 2, duration: 1 },
      { id: "d2", category: "domestic", label: "Lancer une lessive", hint: "", decayDays: 4, priority: 2, duration: 1 },
      { id: "d3", category: "domestic", label: "Vider le lave-vaisselle ou l'évier", hint: "", decayDays: 2, priority: 2, duration: 1 },

      { id: "f1", category: "food", label: "Décider du repas de ce soir", hint: "", decayDays: 1, priority: 2, duration: 1 },
      { id: "f2", category: "food", label: "Noter ce qui manque au frigo", hint: "Juste une note rapide, pas besoin d'aller faire les courses tout de suite", decayDays: 3, priority: 1, duration: 1 },
      { id: "f3", category: "food", label: "Préparer une gourde ou un lunch pour demain", hint: "", decayDays: 1, priority: 1, duration: 1 },

      { id: "h1", category: "health", label: "Boire un verre d'eau", hint: "", decayDays: 0.5, priority: 3, duration: 1 },
      { id: "h2", category: "health", label: "Prendre un médicament", hint: "", decayDays: 1, priority: 3, duration: 1 },
      { id: "h3", category: "health", label: "5 minutes d'étirement", hint: "", decayDays: 2, priority: 1, duration: 1 },
      { id: "h4", category: "health", label: "Appeler pour un rendez-vous médical", hint: "", decayDays: 21, priority: 2, duration: 1, dayOnly: true },

      { id: "fi1", category: "finance", label: "Vérifier le solde du compte", hint: "", decayDays: 5, priority: 2, duration: 1 },
      { id: "fi2", category: "finance", label: "Faire un virement en attente", hint: "", decayDays: 10, priority: 2, duration: 1 },

      { id: "c1", category: "comm", label: "Répondre à un message en attente", hint: "Un seul suffit pour l'instant", decayDays: 3, priority: 2, duration: 1 },
      { id: "c2", category: "comm", label: "Passer un appel repoussé", hint: "", decayDays: 5, priority: 1, duration: 1, dayOnly: true },

      { id: "o1", category: "organize", label: "Vérifier l'agenda de demain", hint: "", decayDays: 1, priority: 2, duration: 1 },
      { id: "o2", category: "organize", label: "Préparer un sac (travail, sport, sortie)", hint: "", decayDays: 2, priority: 1, duration: 1 },
      { id: "o3", category: "organize", label: "Noter une idée qui tourne en tête", hint: "", decayDays: 3, priority: 1, duration: 1 },

      { id: "v1", category: "vehicle", label: "Faire le plein", hint: "", decayDays: 7, priority: 2, duration: 2, dayOnly: true, gate: "car", link: { url: "https://www.prix-carburants.gouv.fr/", label: "Comparer les prix des stations ↗" } },
      { id: "v2", category: "vehicle", label: "Vérifier un trajet ou un billet", hint: "", decayDays: 14, priority: 1, duration: 1, gate: "car" },

      { id: "n1", category: "digital", label: "Vider les indésirables de la boîte mail", hint: "", decayDays: 10, priority: 1, duration: 1 },
      { id: "n2", category: "digital", label: "Trier 5 photos", hint: "Juste 5, pas toute la pellicule", decayDays: 14, priority: 1, duration: 1 },
      { id: "n3", category: "digital", label: "Sauvegarder un fichier important", hint: "", decayDays: 21, priority: 1, duration: 1, info: "La règle 3-2-1, simple et efficace :\n• 3 copies du fichier au total\n• 2 supports différents (ex : disque dur + cloud)\n• 1 copie hors de chez toi (cloud, ou disque chez un proche)\n\nPas besoin de tout faire d'un coup — une 2ᵉ copie vaut déjà mieux qu'aucune." },

      { id: "s1", category: "space", label: "Ranger un coin précis", hint: "Un seul coin, pas toute la pièce", decayDays: 5, priority: 1, duration: 2 },
      { id: "s2", category: "space", label: "Jeter le courrier périmé", hint: "", decayDays: 7, priority: 1, duration: 1, info: "Avant de jeter, 3 repères rapides :\n• Pub / relevés déjà obsolètes → poubelle direct\n• Facture eau/élec/gaz de plus de 5 ans → poubelle\n• Un doute (impôts, contrat, acte) → garde-le plutôt et trie-le dans les classeurs\n\nListe complète dans l'action \"Trier une rubrique de classeur\"." },

      { id: "pe1", category: "pets", label: "Nourrir / donner à boire", hint: "", decayDays: 0.5, priority: 3, duration: 1, gate: "pet" },
      { id: "pe2", category: "pets", label: "Nettoyer litière ou gamelle", hint: "", decayDays: 2, priority: 2, duration: 1, gate: "pet" },
      { id: "pe3", category: "pets", label: "Sortir promener", hint: "", decayDays: 1, priority: 2, duration: 2, gate: "pet" },

      { id: "pl1", category: "plants", label: "Arroser les plantes", hint: "Fais juste le tour, celles qui en ont besoin", decayDays: 4, priority: 2, duration: 1, gate: "plants" },
    ];
  }

  function todayKey(d) {
    const dt = d || new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  function emptyDaily() {
    return { dayKey: todayKey(), done: [], reportShownAt: null };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.actions)) {
          if (!d.daily) d.daily = emptyDaily();
          if (typeof d.notifAsked !== "boolean") d.notifAsked = false;
          return d;
        }
      }
    } catch (e) {
      console.error("Atygo : chargement impossible", e);
    }
    return { onboarded: false, prefs: { car: true, pet: true, plants: true, papers: true }, actions: [], daily: emptyDaily(), notifAsked: false };
  }
  let astate = load();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(astate));
    } catch (e) {
      console.error("Atygo : sauvegarde impossible", e);
    }
  }

  function seedActions(prefs) {
    const now = Date.now();
    return defaultActions().map((a) => ({
      ...a,
      enabled: a.gate ? !!prefs[a.gate] : true,
      // Démarre "à moitié écoulé" plutôt que jamais fait : évite que
      // tout hurle à l'urgence en même temps dès le premier lancement.
      lastDoneAt: now - a.decayDays * 86400000 * 0.5,
      custom: false,
    }));
  }

  function freshnessOf(a, now) {
    if (!a.lastDoneAt) return 0;
    const elapsed = now - a.lastDoneAt;
    const ratio = elapsed / (a.decayDays * 86400000);
    return Math.max(0, Math.min(100, 100 - ratio * 100));
  }
  function urgencyOf(a, now) {
    if (!a.lastDoneAt) return a.priority * 1000;
    const elapsed = now - a.lastDoneAt;
    return a.priority * (elapsed / (a.decayDays * 86400000));
  }
  function flowerOf(fresh) {
    if (fresh >= 70) return "🌸";
    if (fresh >= 45) return "🌷";
    if (fresh >= 20) return "🥀";
    return "🍂";
  }

  // ---------- Suggestion ----------
  let declinedIds = [];
  // Durée de la dernière action affichée/faite dans cette session : sert
  // à privilégier une suite cohérente (pas de saut rapide <-> long entre
  // deux suggestions) sans jamais bloquer une action bien plus urgente.
  let lastDuration = null;

  function isTimeOk(a, now) {
    if (!a.dayOnly) return true;
    const h = now.getHours();
    return h >= DAY_START_HOUR && h < DAY_END_HOUR;
  }

  // Combien de temps "Plus tard" repousse une action : proportionnel à
  // sa propre échéance (decayDays) plutôt qu'un délai fixe — un repas de
  // ce soir (decayDays très court) revient dans quelques heures, une
  // tâche à échéance large revient au plus tard le lendemain.
  const MIN_SNOOZE_MS = 3600000; // 1h plancher
  const MAX_SNOOZE_MS = 86400000; // 24h plafond ("au lendemain")
  function snoozeDurationMs(a) {
    const raw = (a.decayDays || 1) * 86400000 * 0.3;
    return Math.max(MIN_SNOOZE_MS, Math.min(raw, MAX_SNOOZE_MS));
  }

  function pickCandidate() {
    const now = Date.now();
    const pool = astate.actions.filter(
      (a) =>
        a.enabled &&
        !declinedIds.includes(a.id) &&
        !(a.snoozedUntil && now < a.snoozedUntil) &&
        isTimeOk(a, new Date(now))
    );
    if (pool.length === 0) return null;
    const COHERENCE_PENALTY = 0.6;
    return [...pool].sort((a, b) => {
      const scoreA = urgencyOf(a, now) - (lastDuration ? Math.abs((a.duration || 1) - lastDuration) * COHERENCE_PENALTY : 0);
      const scoreB = urgencyOf(b, now) - (lastDuration ? Math.abs((b.duration || 1) - lastDuration) * COHERENCE_PENALTY : 0);
      return scoreB - scoreA;
    })[0];
  }

  function renderSuggestion() {
    const a = pickCandidate();
    const suggestionBlock = $("suggestionBlock");
    const emptyBlock = $("emptyBlock");
    if (!a) {
      suggestionBlock.classList.add("hidden");
      emptyBlock.classList.remove("hidden");
      $("suggActions").classList.add("hidden");
      astate._current = null;
      return;
    }
    suggestionBlock.classList.remove("hidden");
    emptyBlock.classList.add("hidden");
    $("suggActions").classList.remove("hidden");
    const cat = CATEGORIES[a.category];
    const fresh = freshnessOf(a, Date.now());
    $("suggCat").textContent = `${cat.icon} ${cat.label}`;
    const flowerEl = $("suggFlower");
    flowerEl.textContent = flowerOf(fresh);
    flowerEl.classList.remove("bloom-pop");
    void flowerEl.offsetWidth;
    flowerEl.classList.add("bloom-pop");
    $("suggLabel").textContent = a.label;
    $("suggHint").textContent = a.hint || "";
    $("suggHint").classList.toggle("hidden", !a.hint);
    $("suggInfoBtn").classList.toggle("hidden", !a.info && !a.link);
    const dur = DURATIONS[a.duration || 1];
    $("suggDuration").textContent = `${dur.icon} ${dur.label}`;
    astate._current = a.id;
    lastDuration = a.duration || 1;
  }

  function openInfo() {
    const a = astate.actions.find((x) => x.id === astate._current);
    if (!a || (!a.info && !a.link)) return;
    $("infoTitle").textContent = a.label;
    $("infoBody").textContent = a.info || "";
    $("infoBody").classList.toggle("hidden", !a.info);
    const linkEl = $("infoLink");
    if (a.link) {
      linkEl.href = a.link.url;
      linkEl.textContent = a.link.label;
      linkEl.classList.remove("hidden");
    } else {
      linkEl.classList.add("hidden");
    }
    $("infoOverlay").classList.remove("hidden");
  }
  function closeInfo() {
    $("infoOverlay").classList.add("hidden");
  }

  // ---------- Bilan du jour ----------
  // Récapitulatif chaleureux de ce qui a été fait, jamais de ce qui ne l'a
  // pas été (cf. règle anti-dette du projet). Signalé par une vraie
  // notification si le navigateur l'autorise ; sinon, ou si l'appli est
  // fermée à ce moment-là (pas de serveur = pas de réveil en arrière-plan),
  // le badge/l'entrée de menu prennent le relais dès la prochaine ouverture.
  const EOD_HOUR = 20;
  const REPORT_CHECK_MS = 60000;
  function ensureDay() {
    const key = todayKey();
    if (astate.daily.dayKey !== key) {
      astate.daily = emptyDaily();
      save();
    }
  }
  function maybeAskNotifPermission() {
    if (astate.notifAsked) return;
    astate.notifAsked = true;
    if ("Notification" in window && Notification.permission === "default") {
      try {
        Notification.requestPermission();
      } catch (e) {
        // silencieux
      }
    }
  }
  function checkDailyReport() {
    ensureDay();
    if (astate.daily.done.length === 0) return;
    if (astate.daily.reportShownAt === astate.daily.dayKey) return;
    if (new Date().getHours() < EOD_HOUR) return;
    astate.daily.reportShownAt = astate.daily.dayKey;
    save();
    if ("Notification" in window && Notification.permission === "granted") {
      const n = astate.daily.done.length;
      try {
        const notif = new Notification("🪄 Petit bilan du jour", {
          body: `${n} chose${n > 1 ? "s" : ""} faite${n > 1 ? "s" : ""} aujourd'hui. Jette un œil ?`,
          icon: "icons/icon-192.png",
        });
        notif.onclick = () => {
          window.focus();
          openReport();
          notif.close();
        };
      } catch (e) {
        // silencieux : certains contextes n'autorisent pas le constructeur Notification
      }
    }
  }
  function renderDailyBadge() {
    ensureDay();
    const n = astate.daily.done.length;
    $("dailyBadge").classList.toggle("hidden", n === 0);
    $("dailyBadgeCount").textContent = n;
  }
  function renderReport() {
    ensureDay();
    const items = astate.daily.done;
    const n = items.length;
    $("reportSub").textContent = n === 0
      ? "Rien coché pour l'instant aujourd'hui. Reviens quand tu auras fait quelque chose — ou lance une suggestion maintenant."
      : `${n} chose${n > 1 ? "s" : ""} faite${n > 1 ? "s" : ""} aujourd'hui — c'est déjà ça de fait.`;
    const list = $("reportList");
    list.innerHTML = "";
    items.slice().reverse().forEach((it) => {
      const row = document.createElement("div");
      row.className = "report-item";
      const cat = CATEGORIES[it.category] || { icon: "•" };
      const label = document.createElement("div");
      label.className = "report-item-label";
      label.textContent = `${cat.icon} ${it.label}`;
      const time = document.createElement("div");
      time.className = "report-item-time";
      time.textContent = new Date(it.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      row.appendChild(label);
      row.appendChild(time);
      list.appendChild(row);
    });
  }
  function openReport() {
    renderReport();
    $("reportOverlay").classList.remove("hidden");
  }
  function closeReport() {
    $("reportOverlay").classList.add("hidden");
  }

  function markDone() {
    const a = astate.actions.find((x) => x.id === astate._current);
    if (a) {
      a.lastDoneAt = Date.now();
      ensureDay();
      astate.daily.done.push({ label: a.label, category: a.category, at: Date.now() });
      maybeAskNotifPermission();
      save();
      renderDailyBadge();
      checkDailyReport();
    }
    declinedIds = [];
    renderSuggestion();
  }
  function declineCurrent() {
    const a = astate.actions.find((x) => x.id === astate._current);
    if (a) {
      declinedIds.push(a.id);
      a.snoozedUntil = Date.now() + snoozeDurationMs(a);
      save();
    }
    renderSuggestion();
  }
  function neverAgain() {
    const a = astate.actions.find((x) => x.id === astate._current);
    if (a) {
      a.enabled = false;
      save();
    }
    renderSuggestion();
  }

  // ---------- Onboarding ----------
  function renderOnboardingSwitches() {
    $("qCar").classList.toggle("on", !!astate.prefs.car);
    $("qPet").classList.toggle("on", !!astate.prefs.pet);
    $("qPlants").classList.toggle("on", !!astate.prefs.plants);
    $("qPapers").classList.toggle("on", !!astate.prefs.papers);
  }
  function bindSwitch(el) {
    el.onclick = () => {
      const key = el.dataset.key;
      astate.prefs[key] = !astate.prefs[key];
      el.classList.toggle("on", astate.prefs[key]);
    };
  }
  function finishOnboarding() {
    if (astate.onboarded) {
      // On revoit les questions après coup : on ne réinitialise pas les
      // actions existantes (historique, personnalisées, priorités), on
      // se contente de réappliquer l'activation par catégorie.
      astate.actions.forEach((a) => {
        if (a.gate) a.enabled = !!astate.prefs[a.gate];
      });
    } else {
      astate.actions = seedActions(astate.prefs);
      astate.onboarded = true;
    }
    save();
    showScreen("main");
  }

  // ---------- Gestion ----------
  function cyclePriority(a) {
    a.priority = a.priority >= 3 ? 1 : a.priority + 1;
    save();
    renderManage();
  }
  function prioLabel(p) {
    return p === 3 ? "Haute" : p === 1 ? "Basse" : "Normale";
  }
  function renderManage() {
    const list = $("manageList");
    list.innerHTML = "";
    Object.keys(CATEGORIES).forEach((catId) => {
      const items = astate.actions.filter((a) => a.category === catId);
      if (items.length === 0) return;
      const title = document.createElement("div");
      title.className = "manage-cat-title";
      title.textContent = `${CATEGORIES[catId].icon} ${CATEGORIES[catId].label}`;
      list.appendChild(title);
      items.forEach((a) => {
        const row = document.createElement("div");
        row.className = "action-row" + (a.enabled ? "" : " disabled");
        row.innerHTML =
          `<button class="switch ${a.enabled ? "on" : ""}" data-id="${a.id}" data-act="toggle"></button>` +
          `<div class="action-row-text">` +
          `<div class="action-row-label">${escapeHtml(a.label)}</div>` +
          (a.hint ? `<div class="action-row-hint">${escapeHtml(a.hint)}</div>` : "") +
          `</div>` +
          `<button class="prio-btn" data-id="${a.id}" data-act="prio">${prioLabel(a.priority)}</button>` +
          (a.custom ? `<button class="del-btn" data-id="${a.id}" data-act="del">✕</button>` : "");
        list.appendChild(row);
      });
    });
    list.querySelectorAll("[data-act]").forEach((btn) => {
      const id = btn.dataset.id;
      const a = astate.actions.find((x) => x.id === id);
      if (!a) return;
      if (btn.dataset.act === "toggle") {
        btn.onclick = () => {
          a.enabled = !a.enabled;
          save();
          renderManage();
        };
      } else if (btn.dataset.act === "prio") {
        btn.onclick = () => cyclePriority(a);
      } else if (btn.dataset.act === "del") {
        btn.onclick = () => {
          astate.actions = astate.actions.filter((x) => x.id !== id);
          save();
          renderManage();
        };
      }
    });
  }
  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
  function populateCategorySelect() {
    const sel = $("newCategory");
    sel.innerHTML = Object.keys(CATEGORIES)
      .map((id) => `<option value="${id}">${CATEGORIES[id].icon} ${CATEGORIES[id].label}</option>`)
      .join("");
  }
  function populateDurationSelect() {
    const sel = $("newDuration");
    sel.innerHTML = Object.keys(DURATIONS)
      .map((id) => `<option value="${id}">${DURATIONS[id].icon} ${DURATIONS[id].label}</option>`)
      .join("");
  }
  function addCustomAction() {
    const label = $("newLabel").value.trim();
    if (!label) return;
    const hint = $("newHint").value.trim();
    const category = $("newCategory").value;
    const duration = +$("newDuration").value;
    const dayOnly = $("newDayOnly").classList.contains("on");
    astate.actions.push({
      id: uid(),
      category,
      label,
      hint,
      duration,
      dayOnly,
      decayDays: 7,
      priority: 2,
      enabled: true,
      lastDoneAt: Date.now() - 7 * 86400000 * 0.5,
      custom: true,
    });
    save();
    $("newLabel").value = "";
    $("newHint").value = "";
    $("newDayOnly").classList.remove("on");
    $("addForm").classList.add("hidden");
    renderManage();
  }

  // ---------- Navigation entre écrans ----------
  function showScreen(name) {
    $("screenOnboarding").classList.toggle("hidden", name !== "onboarding");
    $("screenMain").classList.toggle("hidden", name !== "main");
    $("screenManage").classList.toggle("hidden", name !== "manage");
    $("btnGear").classList.toggle("hidden", name === "onboarding");
    if (name === "main") {
      declinedIds = [];
      lastDuration = null;
      renderSuggestion();
      renderDailyBadge();
    } else if (name === "manage") {
      renderManage();
    }
  }

  // ---------- Init ----------
  populateCategorySelect();
  populateDurationSelect();
  $("newDayOnly").onclick = () => $("newDayOnly").classList.toggle("on");
  [$("qCar"), $("qPet"), $("qPlants"), $("qPapers")].forEach(bindSwitch);
  $("btnOnbStart").onclick = finishOnboarding;
  $("btnOnbSkip").onclick = () => {
    astate.prefs = { car: true, pet: true, plants: true, papers: true };
    finishOnboarding();
  };
  $("btnDone").onclick = markDone;
  $("btnLaterAction").onclick = declineCurrent;
  $("btnNeverAgain").onclick = neverAgain;
  $("suggInfoBtn").onclick = openInfo;
  $("infoClose").onclick = closeInfo;
  $("infoOverlay").onclick = (e) => { if (e.target === $("infoOverlay")) closeInfo(); };
  $("dailyBadge").onclick = openReport;
  $("btnViewReport").onclick = openReport;
  $("reportClose").onclick = closeReport;
  $("reportOverlay").onclick = (e) => { if (e.target === $("reportOverlay")) closeReport(); };
  $("btnGear").onclick = () => {
    const managing = !$("screenManage").classList.contains("hidden");
    showScreen(managing ? "main" : "manage");
  };
  $("btnBack").onclick = () => { location.href = "index.html"; };
  $("btnShowAddForm").onclick = () => $("addForm").classList.remove("hidden");
  $("btnCancelAdd").onclick = () => $("addForm").classList.add("hidden");
  $("btnAddAction").onclick = addCustomAction;
  $("btnReviewQuestions").onclick = () => {
    renderOnboardingSwitches();
    showScreen("onboarding");
  };

  if (astate.onboarded) {
    renderOnboardingSwitches(); // au cas où l'utilisateur revient sur ses choix un jour
    showScreen("main");
  } else {
    renderOnboardingSwitches();
    showScreen("onboarding");
  }

  checkDailyReport();
  setInterval(checkDailyReport, REPORT_CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDailyReport();
  });
})();
