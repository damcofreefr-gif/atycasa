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
  };

  // decayDays : au bout de combien de jours l'action redevient "à faire"
  // (repère indicatif, pas une science exacte). priority : 1 basse,
  // 2 normale, 3 haute — pondère l'urgence à décroissance égale.
  function defaultActions() {
    return [
      { id: "a1", category: "admin", label: "Traiter une facture en attente", hint: "Ouvre l'appli ou le mail de la facture et prépare le paiement", decayDays: 10, priority: 2 },
      { id: "a2", category: "admin", label: "Répondre à un mail qui traîne", hint: "Ouvre ta boîte mail et réponds au plus vieux message", decayDays: 5, priority: 2 },
      { id: "a3", category: "admin", label: "Prendre un rendez-vous", hint: "Choisis UN rendez-vous à prendre et ouvre le téléphone ou le site", decayDays: 14, priority: 2 },
      { id: "a4", category: "admin", label: "Renouveler un document", hint: "Identifie le document à renouveler et ouvre le site concerné", decayDays: 30, priority: 1 },

      { id: "p1", category: "papers", label: "Trier une rubrique de classeur", hint: "Choisis UNE rubrique (ex : factures, impôts…) et range juste ça", decayDays: 14, priority: 2, gate: "papers" },

      { id: "d1", category: "domestic", label: "Sortir une poubelle", hint: "", decayDays: 3, priority: 2 },
      { id: "d2", category: "domestic", label: "Lancer une lessive", hint: "", decayDays: 4, priority: 2 },
      { id: "d3", category: "domestic", label: "Vider le lave-vaisselle ou l'évier", hint: "", decayDays: 2, priority: 2 },

      { id: "f1", category: "food", label: "Décider du repas de ce soir", hint: "", decayDays: 1, priority: 2 },
      { id: "f2", category: "food", label: "Noter ce qui manque au frigo", hint: "Juste une note rapide, pas besoin d'aller faire les courses tout de suite", decayDays: 3, priority: 1 },
      { id: "f3", category: "food", label: "Préparer une gourde ou un lunch pour demain", hint: "", decayDays: 1, priority: 1 },

      { id: "h1", category: "health", label: "Boire un verre d'eau", hint: "", decayDays: 0.5, priority: 3 },
      { id: "h2", category: "health", label: "Prendre un médicament", hint: "", decayDays: 1, priority: 3 },
      { id: "h3", category: "health", label: "5 minutes d'étirement", hint: "", decayDays: 2, priority: 1 },
      { id: "h4", category: "health", label: "Appeler pour un rendez-vous médical", hint: "", decayDays: 21, priority: 2 },

      { id: "fi1", category: "finance", label: "Vérifier le solde du compte", hint: "", decayDays: 5, priority: 2 },
      { id: "fi2", category: "finance", label: "Faire un virement en attente", hint: "", decayDays: 10, priority: 2 },

      { id: "c1", category: "comm", label: "Répondre à un message en attente", hint: "Un seul suffit pour l'instant", decayDays: 3, priority: 2 },
      { id: "c2", category: "comm", label: "Passer un appel repoussé", hint: "", decayDays: 5, priority: 1 },

      { id: "o1", category: "organize", label: "Vérifier l'agenda de demain", hint: "", decayDays: 1, priority: 2 },
      { id: "o2", category: "organize", label: "Préparer un sac (travail, sport, sortie)", hint: "", decayDays: 2, priority: 1 },
      { id: "o3", category: "organize", label: "Noter une idée qui tourne en tête", hint: "", decayDays: 3, priority: 1 },

      { id: "v1", category: "vehicle", label: "Faire le plein", hint: "", decayDays: 7, priority: 2, gate: "car" },
      { id: "v2", category: "vehicle", label: "Vérifier un trajet ou un billet", hint: "", decayDays: 14, priority: 1, gate: "car" },

      { id: "n1", category: "digital", label: "Vider les indésirables de la boîte mail", hint: "", decayDays: 10, priority: 1 },
      { id: "n2", category: "digital", label: "Trier 5 photos", hint: "Juste 5, pas toute la pellicule", decayDays: 14, priority: 1 },
      { id: "n3", category: "digital", label: "Sauvegarder un fichier important", hint: "", decayDays: 21, priority: 1 },

      { id: "s1", category: "space", label: "Ranger un coin précis", hint: "Un seul coin, pas toute la pièce", decayDays: 5, priority: 1 },
      { id: "s2", category: "space", label: "Jeter le courrier périmé", hint: "", decayDays: 7, priority: 1 },

      { id: "pe1", category: "pets", label: "Nourrir / donner à boire", hint: "", decayDays: 0.5, priority: 3, gate: "pet" },
      { id: "pe2", category: "pets", label: "Nettoyer litière ou gamelle", hint: "", decayDays: 2, priority: 2, gate: "pet" },
      { id: "pe3", category: "pets", label: "Sortir promener", hint: "", decayDays: 1, priority: 2, gate: "pet" },
    ];
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (Array.isArray(d.actions)) return d;
      }
    } catch (e) {
      console.error("Atygo : chargement impossible", e);
    }
    return { onboarded: false, prefs: { car: true, pet: true, papers: true }, actions: [] };
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
  function pickCandidate() {
    const now = Date.now();
    const pool = astate.actions.filter((a) => a.enabled && !declinedIds.includes(a.id));
    if (pool.length === 0) return null;
    return [...pool].sort((a, b) => urgencyOf(b, now) - urgencyOf(a, now))[0];
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
    astate._current = a.id;
  }

  function markDone() {
    const a = astate.actions.find((x) => x.id === astate._current);
    if (a) {
      a.lastDoneAt = Date.now();
      save();
    }
    declinedIds = [];
    renderSuggestion();
  }
  function declineCurrent() {
    if (astate._current) declinedIds.push(astate._current);
    renderSuggestion();
  }

  // ---------- Onboarding ----------
  function renderOnboardingSwitches() {
    $("qCar").classList.toggle("on", !!astate.prefs.car);
    $("qPet").classList.toggle("on", !!astate.prefs.pet);
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
    astate.actions = seedActions(astate.prefs);
    astate.onboarded = true;
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
  function addCustomAction() {
    const label = $("newLabel").value.trim();
    if (!label) return;
    const hint = $("newHint").value.trim();
    const category = $("newCategory").value;
    astate.actions.push({
      id: uid(),
      category,
      label,
      hint,
      decayDays: 7,
      priority: 2,
      enabled: true,
      lastDoneAt: Date.now() - 7 * 86400000 * 0.5,
      custom: true,
    });
    save();
    $("newLabel").value = "";
    $("newHint").value = "";
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
      renderSuggestion();
    } else if (name === "manage") {
      renderManage();
    }
  }

  // ---------- Init ----------
  populateCategorySelect();
  [$("qCar"), $("qPet"), $("qPapers")].forEach(bindSwitch);
  $("btnOnbStart").onclick = finishOnboarding;
  $("btnOnbSkip").onclick = () => {
    astate.prefs = { car: true, pet: true, papers: true };
    finishOnboarding();
  };
  $("btnDone").onclick = markDone;
  $("btnLaterAction").onclick = declineCurrent;
  $("btnGear").onclick = () => {
    const managing = !$("screenManage").classList.contains("hidden");
    showScreen(managing ? "main" : "manage");
  };
  $("btnBack").onclick = () => { location.href = "index.html"; };
  $("btnShowAddForm").onclick = () => $("addForm").classList.remove("hidden");
  $("btnCancelAdd").onclick = () => $("addForm").classList.add("hidden");
  $("btnAddAction").onclick = addCustomAction;

  if (astate.onboarded) {
    renderOnboardingSwitches(); // au cas où l'utilisateur revient sur ses choix un jour
    showScreen("main");
  } else {
    renderOnboardingSwitches();
    showScreen("onboarding");
  }
})();
