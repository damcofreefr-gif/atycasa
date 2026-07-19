/* =========================================================
   Ma maison respire — logique de l'app
   Données : localStorage (clé "maison-v1") + export/import JSON
   ========================================================= */

// ---------- Constantes ----------
const COLS = 12;
const ROWS = 9;
const PALETTE = [
  "#5BE3A9", "#5BB8E3", "#B98BE8", "#E88BB5",
  "#E8C05B", "#8BE85B", "#E8875B", "#7B9FE8",
];
const DRY = { r: 122, g: 108, b: 90 };
const STORAGE_KEY = "maison-v1";
const DEFAULTS = {
  daily: { decayDays: 3, sessionMin: 15, label: "Quotidienne" },
  expedition: { decayDays: 21, sessionMin: 45, label: "Expédition" },
};

// ---------- État ----------
let state = {
  floors: [{ id: "f0", name: "Rez-de-chaussée" }],
  zones: [], // {id, name, color, type, decayDays, level, totalMin, progressMin, freshBase, freshAt}
  cells: {}, // "floorId:x:y" -> zoneId
};
let ui = {
  tab: "home",
  floorIdx: 0,
  brush: null,
  formType: "daily",
  formColor: PALETTE[0],
  painting: false,
  proposal: null, // {zoneId, minutes}
  session: null,  // {zoneId, minutes, startedAt}
  timerInterval: null,
};

// ---------- Utilitaires ----------
const $ = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9);

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function mixWithDry(hex, freshness) {
  const c = hexToRgb(hex);
  const t = Math.max(0, Math.min(100, freshness)) / 100;
  const r = Math.round(DRY.r + (c.r - DRY.r) * t);
  const g = Math.round(DRY.g + (c.g - DRY.g) * t);
  const b = Math.round(DRY.b + (c.b - DRY.b) * t);
  return `rgb(${r},${g},${b})`;
}
function effDecayDays(z) {
  return z.decayDays * (1 + 0.15 * (z.level || 0));
}
function freshnessOf(z, now = Date.now()) {
  const elapsed = now - (z.freshAt || now);
  const total = effDecayDays(z) * 86400000;
  const lost = (elapsed / total) * 100;
  return Math.max(0, Math.min(100, (z.freshBase ?? 100) - lost));
}
function suggestedMinutes(z, fresh) {
  const base = DEFAULTS[z.type].sessionMin;
  if (z.type === "expedition") {
    if (fresh < 15) return 75;
    if (fresh < 40) return 60;
    return base;
  }
  return base;
}
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function flowerOf(fresh) {
  if (fresh >= 70) return "🌸";
  if (fresh >= 45) return "🌷";
  if (fresh >= 20) return "🥀";
  return "🍂";
}

// ---------- Persistance ----------
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSaveStatus("Sauvegardé ✓");
  } catch (e) {
    setSaveStatus("Erreur de sauvegarde !", true);
  }
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.floors && d.zones && d.cells) state = d;
    }
  } catch (e) {
    console.error("Chargement impossible", e);
  }
}
let statusTimer = null;
function setSaveStatus(msg, isError = false) {
  const el = $("saveStatus");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  if (statusTimer) clearTimeout(statusTimer);
  if (!isError) statusTimer = setTimeout(() => (el.textContent = ""), 2000);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `maison-sauvegarde-${d}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d.floors || !d.zones || !d.cells) throw new Error("format");
      state = d;
      save();
      renderAll();
      setSaveStatus("Données importées ✓");
    } catch (e) {
      setSaveStatus("Fichier invalide !", true);
    }
  };
  reader.readAsText(file);
}

// ---------- Actions ----------
function addZone(name, type, color) {
  const z = {
    id: uid(),
    name,
    color,
    type,
    decayDays: DEFAULTS[type].decayDays,
    level: 0,
    totalMin: 0,
    progressMin: 0,
    freshBase: 100,
    freshAt: Date.now(),
  };
  state.zones.push(z);
  ui.brush = z.id;
  save();
  return z;
}
function deleteZone(id) {
  state.zones = state.zones.filter((z) => z.id !== id);
  for (const k of Object.keys(state.cells)) {
    if (state.cells[k] === id) delete state.cells[k];
  }
  if (ui.brush === id) ui.brush = null;
  save();
}
function paintCell(x, y) {
  if (!ui.brush) return;
  const key = `${state.floors[ui.floorIdx].id}:${x}:${y}`;
  if (ui.brush === "erase") delete state.cells[key];
  else state.cells[key] = ui.brush;
  renderGrid();
  save();
}
function addFloor() {
  const names = ["Rez-de-chaussée", "1er étage", "2e étage", "Sous-sol / garage", "Combles"];
  state.floors.push({
    id: uid(),
    name: names[state.floors.length] || `Niveau ${state.floors.length + 1}`,
  });
  ui.floorIdx = state.floors.length - 1;
  save();
  renderAll();
}

function nextZone() {
  if (state.zones.length === 0) return null;
  return [...state.zones].sort((a, b) => freshnessOf(a) - freshnessOf(b))[0];
}
// Autre zone qui a soif (même seuil que le combo), en excluant toutes
// celles déjà déclinées dans cette même chaîne de propositions — pour
// toujours proposer une alternative plutôt que de refermer sur un
// cul-de-sac, sans jamais reproposer une zone déjà refusée.
function nextNeedyZoneExcluding(excludeIds) {
  const excludeSet = new Set(excludeIds);
  const candidates = state.zones.filter((z) => !excludeSet.has(z.id) && freshnessOf(z) < 50);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => freshnessOf(a) - freshnessOf(b))[0];
}
function comboZone(mainId) {
  const mainFloors = new Set(
    Object.entries(state.cells)
      .filter(([, v]) => v === mainId)
      .map(([k]) => k.split(":")[0])
  );
  return (
    state.zones.find((z) => {
      if (z.id === mainId || freshnessOf(z) >= 50) return false;
      return Object.entries(state.cells).some(
        ([k, v]) => v === z.id && mainFloors.has(k.split(":")[0])
      );
    }) || null
  );
}

// ---------- Sessions ----------
function openProposal(zone, declinedIds) {
  const fresh = freshnessOf(zone);
  ui.proposal = { zoneId: zone.id, minutes: suggestedMinutes(zone, fresh), declinedIds: declinedIds || [] };
  $("propName").textContent = `${flowerOf(fresh)} ${zone.name}`;
  $("propName").style.color = zone.color;
  $("propInfo").textContent =
    `Fraîcheur : ${Math.round(fresh)} % · ${ui.proposal.minutes} min d'arrosage suggérées`;
  const combo = comboZone(zone.id);
  const comboEl = $("propCombo");
  if (combo) {
    comboEl.innerHTML =
      `💡 <b>${escapeHtml(combo.name)}</b> est au même niveau et a soif aussi ` +
      `(${Math.round(freshnessOf(combo))} %). Combo possible après !`;
    comboEl.classList.remove("hidden");
  } else {
    comboEl.classList.add("hidden");
  }
  $("proposalOverlay").classList.remove("hidden");
}
function startSession() {
  if (!ui.proposal) return;
  ui.session = { ...ui.proposal, startedAt: Date.now() };
  ui.proposal = null;
  $("proposalOverlay").classList.add("hidden");
  const z = state.zones.find((x) => x.id === ui.session.zoneId);
  $("timerZone").textContent = z.name;
  $("timerZone").style.color = z.color;
  $("timerProgress").style.background = z.color;
  $("timerScreen").classList.remove("hidden");
  ui.timerInterval = setInterval(tickTimer, 500);
  tickTimer();
}
function tickTimer() {
  if (!ui.session) return;
  const elapsedSec = Math.floor((Date.now() - ui.session.startedAt) / 1000);
  const totalSec = ui.session.minutes * 60;
  const remain = Math.max(0, totalSec - elapsedSec);
  $("timerClock").textContent = fmt(remain);
  $("timerProgress").style.width = `${Math.min(100, (elapsedSec / totalSec) * 100)}%`;
  if (remain === 0) finishSession(ui.session.minutes);
}
function stopSession() {
  if (!ui.session) return;
  const elapsedMin = Math.floor((Date.now() - ui.session.startedAt) / 60000);
  finishSession(elapsedMin);
}
function finishSession(minutes) {
  clearInterval(ui.timerInterval);
  const s = ui.session;
  ui.session = null;
  $("timerScreen").classList.add("hidden");
  minutes = Math.max(1, minutes);

  const z = state.zones.find((x) => x.id === s.zoneId);
  if (!z) return;
  const cur = freshnessOf(z);
  const gain = (minutes / DEFAULTS[z.type].sessionMin) * 100;
  z.freshBase = Math.min(100, cur + gain);
  z.freshAt = Date.now();
  z.totalMin = (z.totalMin || 0) + minutes;
  let progress = (z.progressMin || 0) + minutes;
  let leveledUp = null;
  while (progress >= 60) {
    progress -= 60;
    z.level = (z.level || 0) + 1;
    leveledUp = z.level;
  }
  z.progressMin = progress;
  save();
  renderAll();

  if (leveledUp) {
    $("celebrateTitle").textContent = `${z.name} passe niveau ${leveledUp} !`;
    $("celebrateSub").textContent = "La zone tiendra plus longtemps maintenant.";
  } else {
    $("celebrateTitle").textContent = `+${minutes} min sur ${z.name}`;
    $("celebrateSub").textContent = "Zone rafraîchie. C'est tout ce qui compte aujourd'hui.";
  }
  $("celebrateOverlay").classList.remove("hidden");
}

// ---------- Rendu ----------
function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderFloorBar() {
  const bar = $("floorBar");
  bar.innerHTML = "";
  state.floors.forEach((f, i) => {
    const b = document.createElement("button");
    b.className = "floor-btn" + (i === ui.floorIdx ? " active" : "");
    b.textContent = f.name;
    b.onclick = () => { ui.floorIdx = i; renderAll(); };
    bar.appendChild(b);
  });
  if (ui.tab === "edit") {
    const b = document.createElement("button");
    b.className = "floor-btn";
    b.textContent = "+ étage";
    b.onclick = addFloor;
    bar.appendChild(b);
  }
}

function renderGrid() {
  const grid = $("grid");
  grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
  grid.innerHTML = "";
  const floor = state.floors[ui.floorIdx];
  const zoneAt = (x, y) => {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    return state.cells[`${floor.id}:${x}:${y}`] || null;
  };

  // Centre de chaque zone présente sur cet étage (pour poser la fleur)
  const centers = {};
  const byZone = {};
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const zid = zoneAt(x, y);
      if (zid) (byZone[zid] = byZone[zid] || []).push([x, y]);
    }
  }
  for (const [zid, pts] of Object.entries(byZone)) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let best = pts[0], bd = Infinity;
    for (const p of pts) {
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    centers[zid] = `${best[0]}:${best[1]}`;
  }

  const SEP = "1px solid rgba(0,0,0,0.45)";
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const zid = zoneAt(x, y);
      const zone = zid ? state.zones.find((z) => z.id === zid) : null;
      const cell = document.createElement("div");
      cell.className = "cell" + (zone ? " zoned" : "");
      cell.dataset.x = x;
      cell.dataset.y = y;
      if (zone) {
        const fresh = freshnessOf(zone);
        cell.style.background = mixWithDry(zone.color, fresh);
        // Bordure uniquement là où la zone s'arrête (fusion des cases)
        const diffL = zoneAt(x - 1, y) !== zid;
        const diffR = zoneAt(x + 1, y) !== zid;
        const diffT = zoneAt(x, y - 1) !== zid;
        const diffB = zoneAt(x, y + 1) !== zid;
        if (diffL) cell.style.borderLeft = SEP;
        if (diffR) cell.style.borderRight = SEP;
        if (diffT) cell.style.borderTop = SEP;
        if (diffB) cell.style.borderBottom = SEP;
        // Coins arrondis sur les angles extérieurs de la forme
        cell.style.borderRadius =
          `${diffT && diffL ? 8 : 0}px ${diffT && diffR ? 8 : 0}px ` +
          `${diffB && diffR ? 8 : 0}px ${diffB && diffL ? 8 : 0}px`;
        // La fleur au centre de la zone
        if (centers[zid] === `${x}:${y}`) {
          const f = document.createElement("span");
          f.className = "flower";
          f.textContent = flowerOf(fresh);
          cell.appendChild(f);
        }
      }
      grid.appendChild(cell);
    }
  }
}

function renderHome() {
  const el = $("homeContent");
  if (state.zones.length === 0) {
    el.innerHTML =
      `<div class="empty-msg">Commence par créer tes zones dans l'onglet <b>Zones</b>, ` +
      `puis dessine-les sur le plan dans l'onglet <b>Plan</b>.</div>`;
    return;
  }
  const z = nextZone();
  const fresh = freshnessOf(z);
  el.innerHTML =
    `<button class="go-btn" id="goBtn">` +
    `<span class="go-sub">Zone qui a le plus soif</span>` +
    `<span class="go-main">GO · ${escapeHtml(z.name)} · ${suggestedMinutes(z, fresh)} min</span>` +
    `</button>` +
    `<div class="hint">Ou touche n'importe quelle zone du plan pour la choisir.</div>`;
  $("goBtn").onclick = () => openProposal(z);
}

function renderBrushes() {
  const el = $("brushes");
  el.innerHTML = "";
  state.zones.forEach((z) => {
    const b = document.createElement("button");
    b.className = "brush" + (ui.brush === z.id ? " selected" : "");
    b.style.background = z.color;
    b.textContent = z.name;
    b.onclick = () => { ui.brush = z.id; renderBrushes(); };
    el.appendChild(b);
  });
  const eraser = document.createElement("button");
  eraser.className = "brush util" + (ui.brush === "erase" ? " selected" : "");
  eraser.textContent = "🧽 Gomme";
  eraser.onclick = () => { ui.brush = "erase"; renderBrushes(); };
  el.appendChild(eraser);
  const add = document.createElement("button");
  add.className = "brush util";
  add.textContent = "+ Nouvelle zone";
  add.onclick = () => { switchTab("zones"); showForm(true); };
  el.appendChild(add);
}

function renderZoneList() {
  const el = $("zoneList");
  el.innerHTML = "";
  state.zones.forEach((z) => {
    const fresh = freshnessOf(z);
    const card = document.createElement("div");
    card.className = "zone-card";
    card.innerHTML =
      `<div class="zone-head">` +
      `<div class="zone-dot" style="background:${z.color}"></div>` +
      `<div class="zone-name">${flowerOf(fresh)} ${escapeHtml(z.name)}</div>` +
      `<div class="zone-meta">${DEFAULTS[z.type].label} · Niv. ${z.level || 0}</div>` +
      `<button class="btn-tiny">✕</button>` +
      `</div>` +
      `<div class="progress-outer"><div class="progress-inner" ` +
      `style="width:${fresh}%;background:${mixWithDry(z.color, fresh)}"></div></div>` +
      `<div class="zone-stats">` +
      `<span>Fraîcheur ${Math.round(fresh)} %</span>` +
      `<span>${z.progressMin || 0}/60 min vers niv. ${(z.level || 0) + 1}</span>` +
      `</div>`;
    card.querySelector(".btn-tiny").onclick = () => {
      if (confirm(`Supprimer la zone « ${z.name} » ?`)) {
        deleteZone(z.id);
        renderAll();
      }
    };
    el.appendChild(card);
  });
}

function renderColorRow() {
  const el = $("colorRow");
  el.innerHTML = "";
  PALETTE.forEach((c) => {
    const b = document.createElement("button");
    b.className = "color-swatch" + (ui.formColor === c ? " selected" : "");
    b.style.background = c;
    b.onclick = () => { ui.formColor = c; renderColorRow(); };
    el.appendChild(b);
  });
}

function showForm(show) {
  $("zoneForm").classList.toggle("hidden", !show);
  $("btnShowForm").classList.toggle("hidden", show);
  if (show) { renderColorRow(); $("fName").focus(); }
}

function switchTab(tab) {
  ui.tab = tab;
  document.querySelectorAll(".tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  $("panel-home").classList.toggle("hidden", tab !== "home");
  $("panel-edit").classList.toggle("hidden", tab !== "edit");
  $("panel-zones").classList.toggle("hidden", tab !== "zones");
  renderAll();
}

function renderAll() {
  renderFloorBar();
  renderGrid();
  if (ui.tab === "home") renderHome();
  if (ui.tab === "edit") renderBrushes();
  if (ui.tab === "zones") renderZoneList();
}

// ---------- Événements ----------
function bindEvents() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
  $("btnAtygo").onclick = () => { location.href = "atygo.html"; };

  // Peinture sur la grille (tactile + souris)
  const grid = $("grid");
  const cellFromEvent = (e) => {
    const t = e.touches ? e.touches[0] : e;
    const el = document.elementFromPoint(t.clientX, t.clientY);
    return el && el.classList.contains("cell") ? el : null;
  };
  const handlePaint = (e) => {
    if (ui.tab === "edit") {
      const cell = cellFromEvent(e);
      if (cell) {
        paintCell(+cell.dataset.x, +cell.dataset.y);
        e.preventDefault();
      }
    }
  };
  grid.addEventListener("pointerdown", (e) => {
    if (ui.tab === "edit") { ui.painting = true; handlePaint(e); }
    else if (ui.tab === "home") {
      const cell = cellFromEvent(e);
      if (cell) {
        const key = `${state.floors[ui.floorIdx].id}:${cell.dataset.x}:${cell.dataset.y}`;
        const zid = state.cells[key];
        const zone = zid && state.zones.find((z) => z.id === zid);
        if (zone) openProposal(zone);
      }
    }
  });
  grid.addEventListener("pointermove", (e) => { if (ui.painting) handlePaint(e); });
  window.addEventListener("pointerup", () => (ui.painting = false));
  grid.addEventListener("touchmove", (e) => { if (ui.painting) handlePaint(e); }, { passive: false });

  // Formulaire zone
  $("btnShowForm").onclick = () => showForm(true);
  $("btnCancelForm").onclick = () => showForm(false);
  document.querySelectorAll(".type-btn").forEach((b) => {
    b.onclick = () => {
      ui.formType = b.dataset.type;
      document.querySelectorAll(".type-btn").forEach((x) =>
        x.classList.toggle("active", x.dataset.type === ui.formType)
      );
    };
  });
  $("btnAddZone").onclick = () => {
    const name = $("fName").value.trim();
    if (!name) return;
    addZone(name, ui.formType, ui.formColor);
    $("fName").value = "";
    showForm(false);
    switchTab("edit");
  };

  // Modales
  $("btnStart").onclick = startSession;
  $("btnLater").onclick = () => {
    const declinedId = ui.proposal ? ui.proposal.zoneId : null;
    const allDeclined = declinedId
      ? [...(ui.proposal.declinedIds || []), declinedId]
      : [];
    ui.proposal = null;
    const alt = declinedId ? nextNeedyZoneExcluding(allDeclined) : null;
    if (alt) {
      openProposal(alt, allDeclined);
    } else {
      $("proposalOverlay").classList.add("hidden");
    }
  };
  $("proposalOverlay").onclick = (e) => {
    if (e.target === $("proposalOverlay")) $("btnLater").onclick();
  };
  $("btnCelebrateOk").onclick = () => $("celebrateOverlay").classList.add("hidden");
  $("btnStop").onclick = stopSession;

  // Sauvegarde / restauration
  $("btnExport").onclick = exportData;
  $("btnImport").onclick = () => $("importFile").click();
  $("importFile").onchange = (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = "";
  };

  // Rafraîchir la fraîcheur chaque minute
  setInterval(() => { if (!ui.session) renderAll(); }, 60000);
}

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---------- Scène décorative (fleur qui fane puis se fait arroser) ----------
// Purement décoratif, sans lien avec les vraies zones : comble le vide en
// bas de l'onglet Maison quand il y a peu de contenu.
function initIdleFlowerLoop() {
  const flowerEl = $("idleFlower");
  const canWrap = $("idleCanWrap");
  if (!flowerEl || !canWrap) return;
  const stages = ["🌸", "🌷", "🥀", "🍂"];
  let i = 0;
  function pop() {
    flowerEl.classList.remove("bloom-pop");
    void flowerEl.offsetWidth; // relance l'animation
    flowerEl.classList.add("bloom-pop");
  }
  function tick() {
    flowerEl.textContent = stages[i];
    pop();
    if (i < stages.length - 1) {
      i++;
      setTimeout(tick, 1500);
    } else {
      setTimeout(() => {
        canWrap.classList.add("watering");
        setTimeout(() => {
          canWrap.classList.remove("watering");
          i = 0;
          setTimeout(tick, 300);
        }, 2400);
      }, 1200);
    }
  }
  tick();
}

// ---------- Démarrage ----------
load();
bindEvents();
renderAll();
initIdleFlowerLoop();
