/* =========================================================
   Atymemo — aide-mémoire logistique du quotidien : repères à
   consulter (numéros utiles, durées légales, liens officiels),
   jamais une action à cocher. Indépendant d'Atycasa/Atyclock/Atygo
   (aucun lien de données), page autonome uniquement.
   Deux sections personnalisables (propres à chaque foyer, aucune
   valeur générique fiable n'existant) : heures creuses (plages +
   graphique 24h + photo de référence) et jours de collecte.
   Données : localStorage (clé "atymemo-v1").
   ========================================================= */
(function () {
  const STORAGE_KEY = "atymemo-v1";
  const $ = (id) => document.getElementById(id);

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.heuresCreuses && Array.isArray(d.heuresCreuses.ranges)) return d;
      }
    } catch (e) {
      console.error("Atymemo : chargement impossible", e);
    }
    return { heuresCreuses: { ranges: [{ start: "22:00", end: "06:00" }], photoDataUrl: null }, collecte: "" };
  }
  let mstate = load();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mstate));
    } catch (e) {
      console.error("Atymemo : sauvegarde impossible (photo trop lourde ?)", e);
    }
  }

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

  // ---------- Heures creuses : photo de référence ----------
  // Redimensionnée côté client (max 800px de large, JPEG) avant
  // stockage pour rester léger dans localStorage — aucune lecture
  // automatique du contenu (pas d'OCR pour l'instant, cf. CLAUDE.md).
  function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 800;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        callback(canvas.toDataURL("image/jpeg", 0.7));
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

  // ---------- Collecte des poubelles ----------
  function renderCollecte() {
    $("collecteInput").value = mstate.collecte || "";
  }

  // ---------- Liaison ----------
  $("btnBack").onclick = () => { location.href = "index.html"; };
  $("btnHcAdd").onclick = addRange;
  $("btnHcPhoto").onclick = () => $("hcPhotoInput").click();
  $("hcPhotoInput").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    compressImage(file, (dataUrl) => {
      mstate.heuresCreuses.photoDataUrl = dataUrl;
      save();
      renderPhoto();
    });
    e.target.value = "";
  };
  $("btnHcPhotoRemove").onclick = () => {
    mstate.heuresCreuses.photoDataUrl = null;
    save();
    renderPhoto();
  };
  $("collecteInput").addEventListener("input", () => {
    mstate.collecte = $("collecteInput").value;
    save();
  });

  renderRanges();
  renderBar();
  renderPhoto();
  renderCollecte();
})();
