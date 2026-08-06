/* =========================================================
   Atymemo — aide-mémoire logistique du quotidien : repères à
   consulter (numéros utiles, durées légales, liens officiels),
   jamais une action à cocher. Indépendant d'Atycasa/Atyclock/Atygo
   (aucun lien de données), sauf pour le rappel "1h avant les heures
   creuses" qui a besoin de tourner en arrière-plan : ce script est
   donc aussi chargé (léger) sur index.html, l'interface complète ne
   s'active que sur atymemo.html.
   Deux sections personnalisables (propres à chaque foyer, aucune
   valeur générique fiable n'existant) : heures creuses (plages +
   graphique 24h + photo de référence) et jours de collecte.
   Données : localStorage (clé "atymemo-v1").
   ========================================================= */
(function () {
  const STORAGE_KEY = "atymemo-v1";
  const $ = (id) => document.getElementById(id);
  const onMemoPage = !!$("hcRanges");
  const CHECK_INTERVAL_MS = 60000;
  const REMINDER_LEAD_MS = 60 * 60000; // rappel 1h avant le début de la plage

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.heuresCreuses && Array.isArray(d.heuresCreuses.ranges)) {
          if (typeof d.notifHc !== "boolean") d.notifHc = false;
          if (typeof d.notifAsked !== "boolean") d.notifAsked = false;
          if (!Array.isArray(d.vehicules)) d.vehicules = [];
          return d;
        }
      }
    } catch (e) {
      console.error("Atymemo : chargement impossible", e);
    }
    return {
      heuresCreuses: { ranges: [{ start: "22:00", end: "06:00" }], photoDataUrl: null },
      collecte: "",
      notifHc: false,
      notifAsked: false,
      vehicules: [],
    };
  }
  let mstate = load();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mstate));
    } catch (e) {
      console.error("Atymemo : sauvegarde impossible (photo trop lourde ?)", e);
    }
  }

  // ---------- Bannière (toutes les pages) ----------
  function injectBannerStyle() {
    if ($("atymemoBannerStyle")) return;
    const style = document.createElement("style");
    style.id = "atymemoBannerStyle";
    style.textContent =
      ".atymemo-banner{position:fixed;left:14px;right:14px;top:max(14px,env(safe-area-inset-top));" +
      "z-index:200;background:var(--surface2,#241E17);border:1px solid var(--accent,#5BE3A9);" +
      "border-radius:14px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,0.5);" +
      "display:flex;align-items:center;gap:10px;transform:translateY(-140%);" +
      "transition:transform 0.3s ease;font-family:'Avenir Next','Segoe UI',system-ui,sans-serif;}" +
      ".atymemo-banner.show{transform:translateY(0);}" +
      ".atymemo-banner .txt{flex:1;font-size:14px;line-height:1.4;color:var(--text,#EAF4F0);}" +
      ".atymemo-banner button{background:transparent;border:none;color:var(--accent,#5BE3A9);" +
      "font-weight:700;font-size:13px;padding:6px;cursor:pointer;}" +
      "@media (prefers-reduced-motion: reduce){.atymemo-banner{transition:none;}}";
    document.head.appendChild(style);
  }
  let bannerTimer = null;
  function showAtymemoBanner(text) {
    let el = $("atymemoBanner");
    if (!el) {
      el = document.createElement("div");
      el.id = "atymemoBanner";
      el.className = "atymemo-banner";
      el.innerHTML = '<div class="txt"></div><button type="button">OK</button>';
      el.querySelector("button").onclick = () => el.classList.remove("show");
      document.body.appendChild(el);
    }
    el.querySelector(".txt").textContent = text;
    el.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove("show"), 8000);
  }

  // ---------- Rappel 1h avant les heures creuses (toutes les pages) ----------
  function ensureNotifPermission() {
    if (!("Notification" in window)) return;
    if (mstate.notifAsked) return;
    mstate.notifAsked = true;
    save();
    if (Notification.permission === "default") {
      try {
        Notification.requestPermission();
      } catch (e) {
        // silencieux
      }
    }
  }
  function dayKeyFor(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function nextRangeStart(range, now) {
    const [h, m] = range.start.split(":").map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function notifyHcRappel(range) {
    const text = `🧺 Heures creuses dans 1h (${range.start}) — de quoi lancer une machine ?`;
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    showAtymemoBanner(text);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Atycasa · Atymemo", { body: text, icon: "icons/icon-192.png" });
      } catch (e) {
        // silencieux : certains contextes n'autorisent pas le constructeur Notification
      }
    }
  }
  // Une seule notif par plage et par occurrence (lastReminderDayKey stocke
  // le jour de l'occurrence déjà notifiée) — se réarme tout seul le
  // lendemain puisque le dayKey change.
  function checkHcReminders() {
    if (!mstate.notifHc) return;
    const now = Date.now();
    let dirty = false;
    mstate.heuresCreuses.ranges.forEach((r) => {
      if (!r.start) return;
      const startTs = nextRangeStart(r, now);
      if (startTs - now > REMINDER_LEAD_MS) return;
      const occurrenceKey = dayKeyFor(startTs);
      if (r.lastReminderDayKey === occurrenceKey) return;
      r.lastReminderDayKey = occurrenceKey;
      dirty = true;
      notifyHcRappel(r);
    });
    if (dirty) save();
  }

  // ---------- Rappel sur les échéances véhicule (toutes les pages) ----------
  // Automatique dès qu'une date est renseignée (pas d'interrupteur séparé,
  // contrairement aux heures creuses) — remplir la date suffit à indiquer
  // qu'on veut être prévenu. Une seule notif par valeur de date exacte
  // (`lastReminderCTFor`/`lastReminderAssuranceFor`) : renouveler le CT ou
  // l'assurance et saisir la nouvelle date réarme automatiquement le
  // rappel, sans jamais re-notifier en boucle pour une date déjà connue.
  const VEHICULE_LEAD_DAYS = 30;
  function joursJusque(dateStr) {
    const cible = new Date(dateStr + "T00:00:00");
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    return Math.round((cible - aujourdhui) / 86400000);
  }
  function notifierEcheanceVehicule(nomVehicule, label, emoji, jours, dateStr) {
    const nom = nomVehicule || "ton véhicule";
    const dateAffichee = new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR");
    const text =
      jours < 0
        ? `${emoji} ${label} de ${nom} dépassé(e) depuis ${Math.abs(jours)} j (${dateAffichee})`
        : jours === 0
        ? `${emoji} ${label} de ${nom} aujourd'hui (${dateAffichee})`
        : `${emoji} ${label} de ${nom} dans ${jours} j (${dateAffichee})`;
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    showAtymemoBanner(text);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Atycasa · Atymemo", { body: text, icon: "icons/icon-192.png" });
      } catch (e) {
        // silencieux
      }
    }
  }
  function checkVehiculeReminders() {
    let dirty = false;
    (mstate.vehicules || []).forEach((v) => {
      if (v.dateCT) {
        const jours = joursJusque(v.dateCT);
        if (jours <= VEHICULE_LEAD_DAYS && v.lastReminderCTFor !== v.dateCT) {
          v.lastReminderCTFor = v.dateCT;
          dirty = true;
          notifierEcheanceVehicule(v.nom, "Contrôle technique", "🔧", jours, v.dateCT);
        }
      }
      if (v.dateAssurance) {
        const jours = joursJusque(v.dateAssurance);
        if (jours <= VEHICULE_LEAD_DAYS && v.lastReminderAssuranceFor !== v.dateAssurance) {
          v.lastReminderAssuranceFor = v.dateAssurance;
          dirty = true;
          notifierEcheanceVehicule(v.nom, "Assurance", "📄", jours, v.dateAssurance);
        }
      }
    });
    if (dirty) save();
  }

  // ---------- Init partagée (toutes les pages) ----------
  injectBannerStyle();
  checkHcReminders();
  checkVehiculeReminders();
  setInterval(() => {
    checkHcReminders();
    checkVehiculeReminders();
  }, CHECK_INTERVAL_MS);

  // ---------- Interface (atymemo.html uniquement) ----------
  if (!onMemoPage) return;

  // ---------- Sections repliables ----------
  document.querySelectorAll(".memo-section-header").forEach((btn) => {
    btn.onclick = () => {
      $(btn.dataset.target).classList.toggle("open");
    };
  });
  // La section heures creuses est la plus utile en premier : ouverte
  // par défaut, les autres restent repliées pour ne pas noyer la page.
  $("secHeuresCreuses").classList.add("open");

  // ---------- Heures creuses : plages horaires ----------
  function renderRanges() {
    const wrap = $("hcRanges");
    wrap.innerHTML = "";
    const ranges = mstate.heuresCreuses.ranges;
    ranges.forEach((r, idx) => {
      const row = document.createElement("div");
      row.className = "hc-range-row";
      const startInput = document.createElement("input");
      startInput.type = "time";
      startInput.value = r.start;
      startInput.onchange = () => { r.start = startInput.value; save(); renderBar(); };
      const sep = document.createElement("span");
      sep.className = "hc-range-sep";
      sep.textContent = "à";
      const endInput = document.createElement("input");
      endInput.type = "time";
      endInput.value = r.end;
      endInput.onchange = () => { r.end = endInput.value; save(); renderBar(); };
      row.appendChild(startInput);
      row.appendChild(sep);
      row.appendChild(endInput);
      if (ranges.length > 1) {
        const del = document.createElement("button");
        del.className = "hc-del-btn";
        del.textContent = "✕";
        del.setAttribute("aria-label", "Retirer cette plage");
        del.onclick = () => {
          mstate.heuresCreuses.ranges.splice(idx, 1);
          save();
          renderRanges();
          renderBar();
        };
        row.appendChild(del);
      }
      wrap.appendChild(row);
    });
  }
  function addRange() {
    mstate.heuresCreuses.ranges.push({ start: "12:30", end: "14:30" });
    save();
    renderRanges();
    renderBar();
  }
  function minutesOf(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }
  function renderBar() {
    const bar = $("hcBar");
    bar.innerHTML = "";
    mstate.heuresCreuses.ranges.forEach((r) => {
      if (!r.start || !r.end) return;
      const startPct = (minutesOf(r.start) / 1440) * 100;
      const endPct = (minutesOf(r.end) / 1440) * 100;
      if (startPct === endPct) return;
      const addSeg = (fromPct, toPct) => {
        const seg = document.createElement("div");
        seg.className = "hc-bar-seg";
        seg.style.left = fromPct + "%";
        seg.style.width = (toPct - fromPct) + "%";
        bar.appendChild(seg);
      };
      if (startPct < endPct) {
        addSeg(startPct, endPct);
      } else {
        // La plage traverse minuit (ex : 22h -> 6h) : deux segments.
        addSeg(startPct, 100);
        addSeg(0, endPct);
      }
    });
  }

  // ---------- Heures creuses : lecture automatique (OCR) ----------
  // Tesseract.js tourne entièrement dans le navigateur (WASM), aucun
  // serveur requis — chargé à la demande seulement (pas au chargement
  // de la page) pour ne pas alourdir Atymemo pour qui n'utilise pas
  // cette fonction. Suggestions seulement : jamais appliqué aux
  // horaires réels sans un tap explicite sur "+ Ajouter" — l'OCR sur
  // une photo de facture reste trop peu fiable pour remplir le
  // graphique à l'aveugle (mise en page très variable selon fournisseur).
  const TESSERACT_CDN_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  let tesseractLoading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (tesseractLoading) return tesseractLoading;
    tesseractLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TESSERACT_CDN_URL;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Chargement Tesseract impossible"));
      document.head.appendChild(script);
    });
    return tesseractLoading;
  }
  // Repère des paires d'heures PROCHES l'une de l'autre dans le texte
  // reconnu ("22h00 à 06h00", "22h-6h", "22h/6h00"...) plutôt que
  // d'apparier n'importe quelles deux heures trouvées dans tout le
  // document (un montant ou une date mal lus par l'OCR se font sans ça
  // facilement passer pour une heure, et s'apparient avec une heure
  // bien réelle mais sans rapport, ailleurs dans le texte) — toujours
  // une heuristique, d'où les suggestions à valider soi-même.
  function detecterPlagesHoraires(texte) {
    const heure = "([01]?\\d|2[0-3])\\s?[h:]\\s?([0-5]\\d)?";
    const re = new RegExp(heure + "\\s*(?:à|a|-|/|et)\\s*" + heure, "gi");
    const paires = [];
    let m;
    while ((m = re.exec(texte)) !== null) {
      const start = `${String(m[1]).padStart(2, "0")}:${m[2] || "00"}`;
      const end = `${String(m[3]).padStart(2, "0")}:${m[4] || "00"}`;
      if (start !== end) paires.push({ start, end });
    }
    return paires;
  }
  function renderOcrSuggestions(paires) {
    const wrap = $("hcOcrSuggestions");
    wrap.innerHTML = "";
    if (paires.length === 0) {
      wrap.classList.add("hidden");
      return;
    }
    paires.forEach((p) => {
      const row = document.createElement("div");
      row.className = "hc-ocr-suggestion";
      const label = document.createElement("span");
      label.textContent = `Détecté : ${p.start} → ${p.end}`;
      const btn = document.createElement("button");
      btn.textContent = "+ Ajouter";
      btn.onclick = () => {
        mstate.heuresCreuses.ranges.push({ start: p.start, end: p.end });
        save();
        renderRanges();
        renderBar();
        row.remove();
        if (!wrap.querySelector(".hc-ocr-suggestion")) wrap.classList.add("hidden");
      };
      row.appendChild(label);
      row.appendChild(btn);
      wrap.appendChild(row);
    });
    wrap.classList.remove("hidden");
  }
  function runOcr(file) {
    $("hcOcrStatus").classList.remove("hidden");
    $("hcOcrStatusText").textContent = "Analyse de la photo en cours…";
    $("hcOcrSuggestions").classList.add("hidden");
    loadTesseract()
      .then(() => window.Tesseract.recognize(file, "fra"))
      .then(({ data: { text } }) => {
        const paires = detecterPlagesHoraires(text || "");
        if (paires.length === 0) {
          $("hcOcrStatusText").textContent = "Rien détecté automatiquement — renseigne les horaires toi-même ci-dessus.";
          setTimeout(() => $("hcOcrStatus").classList.add("hidden"), 4000);
        } else {
          $("hcOcrStatus").classList.add("hidden");
          renderOcrSuggestions(paires);
        }
      })
      .catch(() => {
        $("hcOcrStatusText").textContent = "Analyse impossible (connexion nécessaire au premier essai) — renseigne les horaires toi-même.";
        setTimeout(() => $("hcOcrStatus").classList.add("hidden"), 4000);
      });
  }

  // ---------- Heures creuses : photo de référence ----------
  // Redimensionnée côté client (max 1600px de large, JPEG) avant
  // stockage pour rester raisonnable dans localStorage tout en restant
  // lisible une fois agrandie (la photo sert aussi à vérifier à l'œil
  // ce que l'OCR a pu mal lire).
  function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1600;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        callback(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  function renderPhoto() {
    const has = !!mstate.heuresCreuses.photoDataUrl;
    $("hcPhotoThumbWrap").classList.toggle("hidden", !has);
    $("btnHcPhoto").classList.toggle("hidden", has);
    if (has) $("hcPhotoThumb").src = mstate.heuresCreuses.photoDataUrl;
  }
  function openLightbox() {
    if (!mstate.heuresCreuses.photoDataUrl) return;
    $("hcLightboxImg").src = mstate.heuresCreuses.photoDataUrl;
    $("hcLightbox").classList.remove("hidden");
  }
  function closeLightbox() {
    $("hcLightbox").classList.add("hidden");
  }

  // ---------- Collecte des poubelles ----------
  function renderCollecte() {
    $("collecteInput").value = mstate.collecte || "";
  }

  // ---------- Mes véhicules ----------
  const uid = () => Math.random().toString(36).slice(2, 9);
  // Statut neutre (jamais "en retard" avec un ton de reproche, juste un
  // repère factuel) — le CT/l'assurance restent des échéances légales,
  // donc un code couleur léger reste pertinent ici, contrairement aux
  // zones d'Atycasa.
  function statutDate(dateStr) {
    if (!dateStr) return null;
    const cible = new Date(dateStr + "T00:00:00");
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    const jours = Math.round((cible - aujourdhui) / 86400000);
    if (jours < 0) return { texte: `Dépassé de ${Math.abs(jours)} j`, classe: "veh-status-late" };
    if (jours === 0) return { texte: "Aujourd'hui", classe: "veh-status-soon" };
    if (jours <= 30) return { texte: `Dans ${jours} j`, classe: "veh-status-soon" };
    return { texte: `Dans ${jours} j`, classe: "veh-status-ok" };
  }
  function champDate(label, value, onChange) {
    const field = document.createElement("div");
    field.className = "veh-field";
    const lab = document.createElement("label");
    lab.className = "veh-field-label";
    lab.textContent = label;
    const input = document.createElement("input");
    input.type = "date";
    input.value = value || "";
    field.appendChild(lab);
    field.appendChild(input);
    const statut = statutDate(value);
    if (statut) {
      const status = document.createElement("span");
      status.className = "veh-field-status " + statut.classe;
      status.textContent = statut.texte;
      field.appendChild(status);
    }
    input.onchange = () => onChange(input.value);
    return field;
  }
  function champPneu(label, pneu, onSave) {
    const col = document.createElement("div");
    col.className = "veh-tire-col";
    const lab = document.createElement("div");
    lab.className = "veh-tire-label";
    lab.textContent = label;
    const dim = document.createElement("input");
    dim.type = "text";
    dim.placeholder = "Dimensions (ex : 205/55 R16)";
    dim.maxLength = 20;
    dim.value = pneu.dimension || "";
    dim.addEventListener("input", () => { pneu.dimension = dim.value; onSave(); });
    const km = document.createElement("input");
    km.type = "number";
    km.inputMode = "numeric";
    km.min = 0;
    km.placeholder = "Km sur ce train";
    km.value = pneu.km != null ? pneu.km : "";
    km.addEventListener("input", () => { pneu.km = km.value ? Number(km.value) : null; onSave(); });
    col.appendChild(lab);
    col.appendChild(dim);
    col.appendChild(km);
    return col;
  }
  function renderVehicules() {
    const wrap = $("vehiculesList");
    wrap.innerHTML = "";
    mstate.vehicules.forEach((v, idx) => {
      const card = document.createElement("div");
      card.className = "veh-card";

      const head = document.createElement("div");
      head.className = "veh-card-head";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "veh-name-input";
      nameInput.placeholder = "Nom du véhicule (ex : Clio)";
      nameInput.maxLength = 30;
      nameInput.value = v.nom || "";
      nameInput.addEventListener("input", () => { v.nom = nameInput.value; save(); });
      const delBtn = document.createElement("button");
      delBtn.className = "veh-del-btn";
      delBtn.textContent = "✕";
      delBtn.setAttribute("aria-label", "Supprimer ce véhicule");
      delBtn.onclick = () => {
        mstate.vehicules.splice(idx, 1);
        save();
        renderVehicules();
      };
      head.appendChild(nameInput);
      head.appendChild(delBtn);
      card.appendChild(head);

      card.appendChild(champDate("Contrôle technique", v.dateCT, (val) => {
        v.dateCT = val;
        if (val) ensureNotifPermission();
        save();
        renderVehicules();
        checkVehiculeReminders();
      }));
      card.appendChild(champDate("Échéance assurance", v.dateAssurance, (val) => {
        v.dateAssurance = val;
        if (val) ensureNotifPermission();
        save();
        renderVehicules();
        checkVehiculeReminders();
      }));

      const tiresRow = document.createElement("div");
      tiresRow.className = "veh-tires-row";
      tiresRow.appendChild(champPneu("Avant", v.pneus.av, save));
      tiresRow.appendChild(champPneu("Arrière", v.pneus.ar, save));
      card.appendChild(tiresRow);

      wrap.appendChild(card);
    });
  }
  function addVehicule() {
    mstate.vehicules.push({
      id: uid(),
      nom: "",
      dateCT: "",
      dateAssurance: "",
      pneus: { av: { dimension: "", km: null }, ar: { dimension: "", km: null } },
    });
    save();
    renderVehicules();
  }

  // ---------- Rappel 1h avant : interrupteur ----------
  function renderNotifToggle() {
    $("hcNotifToggle").classList.toggle("on", !!mstate.notifHc);
  }

  // ---------- Liaison ----------
  $("btnBack").onclick = () => { location.href = "index.html"; };
  $("btnHcAdd").onclick = addRange;
  $("btnVehAdd").onclick = addVehicule;
  $("hcNotifToggle").onclick = () => {
    mstate.notifHc = !mstate.notifHc;
    if (mstate.notifHc) ensureNotifPermission();
    save();
    renderNotifToggle();
  };
  $("btnHcPhoto").onclick = () => $("hcPhotoInput").click();
  $("hcPhotoInput").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    compressImage(file, (dataUrl) => {
      mstate.heuresCreuses.photoDataUrl = dataUrl;
      save();
      renderPhoto();
    });
    runOcr(file);
    e.target.value = "";
  };
  $("btnHcPhotoRemove").onclick = () => {
    mstate.heuresCreuses.photoDataUrl = null;
    save();
    renderPhoto();
  };
  $("hcPhotoThumb").onclick = openLightbox;
  $("btnHcLightboxClose").onclick = closeLightbox;
  $("hcLightbox").onclick = (e) => { if (e.target === $("hcLightbox")) closeLightbox(); };
  $("collecteInput").addEventListener("input", () => {
    mstate.collecte = $("collecteInput").value;
    save();
  });

  renderRanges();
  renderBar();
  renderPhoto();
  renderCollecte();
  renderNotifToggle();
  renderVehicules();
})();
