/* =========================================================
   Atynote — bloc-note de suggestions partagé en direct entre deux
   téléphones. Seul point de l'app qui ne soit pas 100% local : une
   suggestion écrite d'un côté doit apparaître aussitôt de l'autre,
   ce que localStorage seul ne permet pas. Stockage : Firebase
   Realtime Database (voir firebase-config.js pour la configuration).
   Ce script tourne sur index.html (juste pour la pastille du bouton
   📝) et sur atynote.html (interface complète) — jamais sur
   atyclock.html/atygo.html, qui restent indépendants.
   Identité : un prénom stocké localement par appareil (pas de
   compte), utilisé pour signer les suggestions et savoir qui a
   écrit quoi.
   ========================================================= */
(function () {
  const $ = (id) => document.getElementById(id);
  const NAME_KEY = "atynote-name-v1";
  const onNotePage = !!$("noteList");

  const configured =
    typeof FIREBASE_CONFIG !== "undefined" &&
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.apiKey.indexOf("REMPLACE") === -1 &&
    FIREBASE_CONFIG.notePath &&
    FIREBASE_CONFIG.notePath.indexOf("REMPLACE") === -1;

  let db = null;
  if (configured && typeof firebase !== "undefined") {
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.database();
    } catch (e) {
      console.error("Atynote : connexion Firebase impossible", e);
      db = null;
    }
  }

  function myName() {
    return localStorage.getItem(NAME_KEY) || "";
  }
  function setMyName(n) {
    localStorage.setItem(NAME_KEY, n);
  }

  // ---------- Pastille sur le bouton 📝 (toutes les pages) ----------
  // Ne pastille pas sur ses propres suggestions non lues, seulement
  // sur celles de l'autre — sinon on serait notifié de son propre
  // message.
  function renderNotePulse(suggestions) {
    const btn = $("btnNote");
    if (!btn) return;
    const name = myName();
    const unseen = Object.values(suggestions).filter(
      (s) => !s.seen && (!name || s.author !== name)
    ).length;
    btn.classList.toggle("pulse", unseen > 0);
  }

  // ---------- Écran principal (atynote.html uniquement) ----------
  function suggestionsRef() {
    return db.ref(`${FIREBASE_CONFIG.notePath}/suggestions`);
  }

  function renderList(suggestions) {
    const list = $("noteList");
    const entries = Object.entries(suggestions).sort(
      (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
    );
    $("noteEmpty").classList.toggle("hidden", entries.length > 0);
    list.innerHTML = "";
    entries.forEach(([id, s]) => {
      const row = document.createElement("div");
      row.className = "note-item" + (s.seen ? " seen" : "");

      const head = document.createElement("div");
      head.className = "note-item-head";
      const author = document.createElement("span");
      author.className = "note-item-author";
      author.textContent = s.author || "Anonyme";
      const time = document.createElement("span");
      time.className = "note-item-time";
      time.textContent = s.createdAt
        ? new Date(s.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "";
      head.appendChild(author);
      head.appendChild(time);

      const text = document.createElement("div");
      text.className = "note-item-text";
      text.textContent = s.text;

      const actions = document.createElement("div");
      actions.className = "note-item-actions";
      const seenBtn = document.createElement("button");
      seenBtn.className = "note-item-btn";
      seenBtn.textContent = s.seen ? "↺ Marquer non vu" : "✓ Vu";
      seenBtn.onclick = () => suggestionsRef().child(id).update({ seen: !s.seen });
      const delBtn = document.createElement("button");
      delBtn.className = "note-item-btn del";
      delBtn.textContent = "✕ Supprimer";
      delBtn.onclick = () => suggestionsRef().child(id).remove();
      actions.appendChild(seenBtn);
      actions.appendChild(delBtn);

      row.appendChild(head);
      row.appendChild(text);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function addSuggestion() {
    const input = $("noteInput");
    const text = input.value.trim();
    if (!text || !db) return;
    suggestionsRef().push({
      text,
      author: myName() || "Anonyme",
      createdAt: Date.now(),
      seen: false,
    });
    input.value = "";
  }

  function showNameScreen() {
    $("screenName").classList.remove("hidden");
    $("screenNote").classList.add("hidden");
  }
  function showNoteScreen() {
    $("signedName").textContent = myName();
    $("screenName").classList.add("hidden");
    $("screenNote").classList.remove("hidden");
  }

  if (onNotePage) {
    if (!configured) {
      $("screenSetup").classList.remove("hidden");
    } else if (!myName()) {
      showNameScreen();
    } else {
      showNoteScreen();
    }
    $("btnSaveName").onclick = () => {
      const n = $("nameInput").value.trim();
      if (!n) return;
      setMyName(n);
      showNoteScreen();
    };
    $("btnChangeName").onclick = () => {
      $("nameInput").value = myName();
      showNameScreen();
    };
    $("btnSend").onclick = addSuggestion;
    $("btnBack").onclick = () => { location.href = "index.html"; };
  }

  const launchBtn = $("btnNote");
  if (launchBtn) launchBtn.onclick = () => { location.href = "atynote.html"; };

  if (db) {
    suggestionsRef().on("value", (snap) => {
      const val = snap.val() || {};
      renderNotePulse(val);
      if (onNotePage) renderList(val);
    });
  }
})();
