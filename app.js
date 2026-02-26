// ======================================================
// 1. Firebase Imports & Config (The Solo Dev Backend)
// ======================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA4hTFB9N-Sv6pZ5t1fQgcuyX3AKy6j4po",
  authDomain: "check-in-113fa.firebaseapp.com",
  projectId: "check-in-113fa",
  storageBucket: "check-in-113fa.firebasestorage.app",
  messagingSenderId: "287196111282",
  appId: "1:287196111282:web:275e2e96aa59b9fdd644ab",
  measurementId: "G-LRX9J25PD7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// The Offline-First Magic (Saves you when Wi-Fi drops)
enableIndexedDbPersistence(db).catch(err => console.warn("Offline persistence issue:", err.code));

let currentTeacherUid = null;

// ======================================================
// 2. Teacher Authentication Flow
// ======================================================
const loginBtn = document.getElementById("teacher-login-btn");
if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    if (currentTeacherUid) signOut(auth);
    else signInWithPopup(auth, new GoogleAuthProvider()).catch(e => alert("Login failed: " + e.message));
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentTeacherUid = user.uid;
    if (loginBtn) loginBtn.textContent = `Sign Out (${user.displayName || user.email})`;
    await loadTeacherDataFromCloud(user.uid);
  } else {
    currentTeacherUid = null;
    if (loginBtn) loginBtn.textContent = "Sign in with Google";
  }
});

async function loadTeacherDataFromCloud(uid) {
  try {
    const docRef = doc(db, "teachers", uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      let needsUpdate = false;
      
      if (data.classPresets) {
        classPresets = data.classPresets;
        needsUpdate = true;
      }
      if (data.feelingsPresets) {
        feelingsPresets = data.feelingsPresets;
        needsUpdate = true;
      }

      if (needsUpdate) {
        applyActiveClassPresetToRuntime();
        rebuildStudentsRowFromConfig();
        renderFeelingsGrid();
        updateAll();
        if (typeof refreshSetupPanelUI === 'function') refreshSetupPanelUI();
      }
    }
  } catch (e) {
    console.error("Error loading from cloud:", e);
  }
}

// ======================================================
// Scaling (fit design into viewport)
// ======================================================
function applyScale() {
  const root = document.getElementById("feelings-poll-root");
  const wrapper = document.getElementById("scale-wrapper");
  if (!root || !wrapper) return;

  root.style.transform = "scale(1)";
  const rect = root.getBoundingClientRect();
  const cs = window.getComputedStyle(wrapper);
  const padTop = parseFloat(cs.paddingTop || "0") || 0;
  const padBottom = parseFloat(cs.paddingBottom || "0") || 0;
  const padLeft = parseFloat(cs.paddingLeft || "0") || 0;
  const padRight = parseFloat(cs.paddingRight || "0") || 0;

  const usableWidth = Math.max(0, window.innerWidth - padLeft - padRight);
  const usableHeight = Math.max(0, window.innerHeight - padTop - padBottom);

  const scale = Math.min(usableWidth / rect.width, usableHeight / rect.height, 1.2);
  root.style.transform = "scale(" + scale + ")";
}

window.addEventListener("load", applyScale);
window.addEventListener("resize", applyScale);

// ======================================================
// Storage keys (legacy + presets)
// ======================================================
const SETUP_STORAGE_KEY = "feelings_poll_students_v1";      // legacy
const FEELINGS_STORAGE_KEY = "feelings_poll_feelings_v1";   // legacy
const FEELINGS_PRESETS_KEY = "feelings_poll_feelings_presets_v1";
const CLASS_PRESETS_KEY = "feelings_poll_class_presets_v1";

// ======================================================
// Helpers
// ======================================================
function safeText(v, fallback) {
  const s = (v == null ? "" : String(v)).trim();
  return s ? s : fallback;
}

function isValidHexColour(s) {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function createId() {
  return ("f_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36));
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ======================================================
// Default feelings config
// ======================================================
function getDefaultFeelingsConfig() {
  return [
    { id: "happy", emoji: "😊", label: "Happy", help: "Feeling good", colour: "#22c55e" },
    { id: "excited", emoji: "🤩", label: "Excited", help: "Big energy", colour: "#f97316" },
    { id: "calm", emoji: "😌", label: "Calm", help: "Relaxed / okay", colour: "#3b82f6" },
    { id: "worried", emoji: "😟", label: "Worried", help: "Something on my mind", colour: "#eab308" },
    { id: "sad", emoji: "😢", label: "Sad", help: "Feeling low", colour: "#6366f1" },
    { id: "tired", emoji: "🥱", label: "Tired", help: "Low energy", colour: "#a855f7" },
    { id: "angry", emoji: "😠", label: "Angry", help: "Cross / mad", colour: "#ef4444" },
    { id: "sick", emoji: "🤢", label: "Sick", help: "Body not okay", colour: "#10b981" },
    { id: "hungry", emoji: "😋", label: "Hungry", help: "Need food", colour: "#f59e0b" },
    { id: "thirsty", emoji: "🥤", label: "Thirsty", help: "Need drink", colour: "#06b6d4" },
    { id: "bored", emoji: "😐", label: "Bored", help: "Nothing interesting", colour: "#6b7280" },
    { id: "thoughtful", emoji: "🤔", label: "Thoughtful", help: "Thinking / wondering", colour: "#14b8a6" }
  ];
}

// ======================================================
// DOM (guard early)
// ======================================================
const rootEl = document.getElementById("feelings-poll-root");
if (!rootEl) throw new Error("Root element missing");

const statusEl = rootEl.querySelector(".poll-status");
const totalVotesEl = rootEl.querySelector("#total-votes");
const resetBtn = rootEl.querySelector("#reset-feelings-poll");
const pieCanvas = document.getElementById("feelings-pie");
const pieCtx = pieCanvas ? pieCanvas.getContext("2d") : null;

let legendContent = document.getElementById("pie-legend-content") || document.getElementById("bar-legend-content") || document.getElementById("legend-content");
if (!legendContent) {
  const legendHost = rootEl.querySelector(".chart-legend");
  if (legendHost) {
    legendContent = document.createElement("div");
    legendContent.id = "pie-legend-content";
    legendContent.className = "chart-empty";
    legendContent.textContent = "No votes yet. The chart will appear when someone chooses a feeling.";
    const insertBeforeEl = legendHost.querySelector(".total-votes") || null;
    legendHost.insertBefore(legendContent, insertBeforeEl);
  }
}

const feelingsGridEl = rootEl.querySelector(".feelings-grid");
const studentsRowEl = rootEl.querySelector(".students-row");
const studentsStripInstructions = document.getElementById("students-strip-instructions");

const setupPanel = document.getElementById("setup-panel");
const openSetupBtn = document.getElementById("open-setup");
const closeSetupBtn = document.getElementById("close-setup");
const resetDefaultsBtn = document.getElementById("reset-defaults");

const studentCountInput = document.getElementById("student-count-input");
const studentConfigRows = document.getElementById("student-config-rows");
const applySetupBtn = document.getElementById("apply-setup");

const feelingsListEl = document.getElementById("feelings-list");
const addFeelingBtn = document.getElementById("add-feeling");
const editorEmptyEl = document.getElementById("feeling-editor-empty");
const editorFormEl = document.getElementById("feeling-editor");

const emojiInput = document.getElementById("feeling-emoji");
const labelInput = document.getElementById("feeling-label");
const helpInput = document.getElementById("feeling-help");
const colourInput = document.getElementById("feeling-colour");
const colourHexInput = document.getElementById("feeling-colour-hex");

const saveFeelingsBtn = document.getElementById("save-feelings");
const deleteFeelingBtn = document.getElementById("delete-feeling");
const moveUpBtn = document.getElementById("move-feeling-up");
const moveDownBtn = document.getElementById("move-feeling-down");

const classPresetsEl = document.getElementById("class-presets");
const feelingsPresetsEl = document.getElementById("feelings-presets");

// ======================================================
// Presets state
// ======================================================
let activeClassIndex = 0;
let activeFeelingsPresetIndex = 0;
let feelingsPresets = null;
let classPresets = null;
let feelingsConfig = getDefaultFeelingsConfig();
let counts = {};
let anonymousCounts = {};
const studentFeeling = {};

function getDefaultStudentsConfig() {
  return [
    { id: "s1", name: "Student 1", photoDataUrl: null },
    { id: "s2", name: "Student 2", photoDataUrl: null },
    { id: "s3", name: "Student 3", photoDataUrl: null },
    { id: "s4", name: "Student 4", photoDataUrl: null },
    { id: "s5", name: "Student 5", photoDataUrl: null },
    { id: "s6", name: "Student 6", photoDataUrl: null },
    { id: "s7", name: "Damian", photoDataUrl: "assets/sys-default.jpg" }
  ];
}
let studentsConfig = getDefaultStudentsConfig();

function getFeelingsOrder() { return feelingsConfig.map(f => f.id); }
function getFeelingById(id) { return feelingsConfig.find(f => f.id === id) || null; }
function getLabelsMap() { const out = {}; feelingsConfig.forEach(f => (out[f.id] = f.label)); return out; }
function getColoursMap() { const out = {}; feelingsConfig.forEach(f => (out[f.id] = f.colour)); return out; }
function cleanFeelingsArray(arr) {
  if (!Array.isArray(arr)) return null;
  const cleaned = arr.filter(x => x && typeof x === "object" && typeof x.id === "string").map(x => ({
    id: x.id, emoji: safeText(x.emoji, "🙂").slice(0, 4), label: safeText(x.label, "Feeling").slice(0, 32),
    help: safeText(x.help, "").slice(0, 40), colour: isValidHexColour(x.colour) ? x.colour : "#3b82f6"
  }));
  return cleaned.length ? cleaned : null;
}

// ======================================================
// Legacy loaders (for migration)
// ======================================================
function loadLegacyFeelingsConfig() {
  try {
    const raw = localStorage.getItem(FEELINGS_STORAGE_KEY);
    return raw ? cleanFeelingsArray(JSON.parse(raw)) : null;
  } catch (_) { return null; }
}
function loadLegacyStudentsConfig() {
  try {
    const raw = localStorage.getItem(SETUP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch (_) { return null; }
}

// ======================================================
// Cloud-Synced Presets persistence
// ======================================================
function loadFeelingsPresets() {
  try {
    const raw = localStorage.getItem(FEELINGS_PRESETS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.presets)) return null;
    const presets = parsed.presets.slice(0, 4).map(p => cleanFeelingsArray(p) || getDefaultFeelingsConfig());
    while (presets.length < 4) presets.push(getDefaultFeelingsConfig());
    return { active: clamp(parseInt(parsed.active, 10) || 0, 0, 3), presets };
  } catch (_) { return null; }
}

async function saveFeelingsPresets() {
  try { localStorage.setItem(FEELINGS_PRESETS_KEY, JSON.stringify(feelingsPresets)); } catch (_) {}
  if (currentTeacherUid) {
    try {
      const docRef = doc(db, "teachers", currentTeacherUid);
      await setDoc(docRef, { feelingsPresets: feelingsPresets }, { merge: true });
    } catch (e) { console.error("Cloud save error:", e); }
  }
}

function loadClassPresets() {
  try {
    const raw = localStorage.getItem(CLASS_PRESETS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.classes)) return null;
    const classes = parsed.classes.slice(0, 4).map((c) => ({
      studentsConfig: Array.isArray(c.studentsConfig) ? c.studentsConfig : getDefaultStudentsConfig(),
      anonymousCounts: (c.anonymousCounts && typeof c.anonymousCounts === "object") ? c.anonymousCounts : {},
      studentFeeling: (c.studentFeeling && typeof c.studentFeeling === "object") ? c.studentFeeling : {},
      feelingsPresetIndex: clamp(parseInt(c.feelingsPresetIndex, 10) || 0, 0, 3)
    }));
    while (classes.length < 4) {
      classes.push({ studentsConfig: getDefaultStudentsConfig(), anonymousCounts: {}, studentFeeling: {}, feelingsPresetIndex: 0 });
    }
    return { active: clamp(parseInt(parsed.active, 10) || 0, 0, 3), classes };
  } catch (_) { return null; }
}

async function saveClassPresets() {
  try { localStorage.setItem(CLASS_PRESETS_KEY, JSON.stringify(classPresets)); } catch (_) {}
  if (currentTeacherUid) {
    try {
      const docRef = doc(db, "teachers", currentTeacherUid);
      await setDoc(docRef, { classPresets: classPresets }, { merge: true });
    } catch (e) { console.error("Cloud save error:", e); }
  }
}

function ensurePresetsExist() {
  feelingsPresets = loadFeelingsPresets();
  if (!feelingsPresets) {
    feelingsPresets = { active: 0, presets: [loadLegacyFeelingsConfig() || getDefaultFeelingsConfig(), getDefaultFeelingsConfig(), getDefaultFeelingsConfig(), getDefaultFeelingsConfig()] };
    saveFeelingsPresets();
  }
  classPresets = loadClassPresets();
  if (!classPresets) {
    classPresets = { active: 0, classes: [{ studentsConfig: loadLegacyStudentsConfig() || getDefaultStudentsConfig(), anonymousCounts: {}, studentFeeling: {}, feelingsPresetIndex: feelingsPresets.active || 0 }, { studentsConfig: getDefaultStudentsConfig(), anonymousCounts: {}, studentFeeling: {}, feelingsPresetIndex: 0 }, { studentsConfig: getDefaultStudentsConfig(), anonymousCounts: {}, studentFeeling: {}, feelingsPresetIndex: 0 }, { studentsConfig: getDefaultStudentsConfig(), anonymousCounts: {}, studentFeeling: {}, feelingsPresetIndex: 0 }] };
    saveClassPresets();
  }
  activeClassIndex = classPresets.active || 0;
  activeFeelingsPresetIndex = classPresets.classes[activeClassIndex].feelingsPresetIndex || 0;
  feelingsPresets.active = activeFeelingsPresetIndex;
  saveFeelingsPresets();
  saveClassPresets();
}

function applyActiveFeelingsPresetToRuntime() {
  feelingsConfig = deepClone(feelingsPresets.presets[activeFeelingsPresetIndex] || getDefaultFeelingsConfig());
}

function applyActiveClassPresetToRuntime() {
  const cls = classPresets.classes[activeClassIndex];
  studentsConfig = deepClone(cls.studentsConfig || getDefaultStudentsConfig());
  anonymousCounts = deepClone(cls.anonymousCounts || {});
  Object.keys(studentFeeling).forEach(k => delete studentFeeling[k]);
  Object.assign(studentFeeling, deepClone(cls.studentFeeling || {}));
  activeFeelingsPresetIndex = clamp(parseInt(cls.feelingsPresetIndex, 10) || 0, 0, 3);
  feelingsPresets.active = activeFeelingsPresetIndex;
  applyActiveFeelingsPresetToRuntime();
}

function persistRuntimeToActiveClassPreset() {
  const cls = classPresets.classes[activeClassIndex];
  cls.studentsConfig = deepClone(studentsConfig);
  cls.anonymousCounts = deepClone(anonymousCounts);
  cls.studentFeeling = deepClone(studentFeeling);
  cls.feelingsPresetIndex = activeFeelingsPresetIndex;
  classPresets.active = activeClassIndex;
  saveClassPresets();
}

function persistRuntimeToActiveFeelingsPreset() {
  feelingsPresets.presets[activeFeelingsPresetIndex] = deepClone(feelingsConfig);
  feelingsPresets.active = activeFeelingsPresetIndex;
  try { localStorage.setItem(FEELINGS_STORAGE_KEY, JSON.stringify(feelingsConfig)); } catch (_) {}
  saveFeelingsPresets();
}

function ensureCountShapesPreserveExisting() {
  const ids = new Set(getFeelingsOrder());
  const newAnon = {};
  ids.forEach(id => { newAnon[id] = Number((anonymousCounts && anonymousCounts[id]) || 0); });
  anonymousCounts = newAnon;
  const newCounts = {};
  ids.forEach(id => (newCounts[id] = 0));
  counts = newCounts;
}

function pruneStudentFeelingsToExistingIds() {
  const ids = new Set(getFeelingsOrder());
  Object.keys(studentFeeling).forEach(sid => { if (!ids.has(studentFeeling[sid])) delete studentFeeling[sid]; });
}

function recalculateCounts() {
  ensureCountShapesPreserveExisting();
  Object.values(studentFeeling).forEach((feelingId) => { if (counts[feelingId] != null) counts[feelingId] += 1; });
  Object.keys(anonymousCounts || {}).forEach((id) => { if (counts[id] != null) counts[id] += anonymousCounts[id] || 0; });
}

function getTotalVotesFrom(countObj) { return Object.values(countObj).reduce((a, b) => a + b, 0); }
function copyCounts(source) { const out = {}; getFeelingsOrder().forEach(id => { out[id] = source[id] || 0; }); return out; }

// ======================================================
// UI Sounds
// ======================================================
const studentSelectSound = new Audio("assets/select-student.mp3");
const feelingSelectSound = new Audio("assets/select-feeling.mp3");
studentSelectSound.preload = "auto";
feelingSelectSound.preload = "auto";
studentSelectSound.volume = 0.3;
feelingSelectSound.volume = 0.35;

function playSound(sound) {
  try { sound.currentTime = 0; sound.play(); } catch (_) {}
}

// ======================================================
// Students strip
// ======================================================
let activeStudentId = null;
const studentEls = {}; 

function setActiveStudent(sid) {
  activeStudentId = sid;
  Object.values(studentEls).forEach((el) => {
    el.classList.remove("student-active");
    el.classList.remove("student-armed");
  });
  if (sid && studentEls[sid]) {
    studentEls[sid].classList.add("student-active");
    studentEls[sid].classList.add("student-armed");
  }
}

function updateStudentRings() {
  const colours = getColoursMap();
  Object.keys(studentEls).forEach((sid) => {
    const container = studentEls[sid];
    const img = container.querySelector("img");
    if (!img) return;
    const feelingId = studentFeeling[sid];
    if (feelingId && colours[feelingId]) {
      const colour = colours[feelingId];
      img.style.borderColor = colour;
      img.style.boxShadow = "0 0 0 4px " + colour + "55";
    } else {
      img.style.borderColor = "#e5e7eb";
      img.style.boxShadow = "none";
    }
  });
}

function updateStudentsStripInstructions() {
  if (!studentsStripInstructions) return;
  const sample = feelingsConfig.slice(0, 3).map(f => f.label).filter(Boolean);
  const exampleText = sample.length ? (" (e.g. " + sample.join(", ") + ")") : "";
  studentsStripInstructions.textContent = "Tap your photo, then tap a feeling" + exampleText + " – or drag your photo onto a feeling button.";
}

function rebuildStudentsRowFromConfig() {
  if (!studentsRowEl) return;
  studentsRowEl.innerHTML = "";
  Object.keys(studentEls).forEach(k => delete studentEls[k]);

  studentsConfig.forEach((cfg, index) => {
    const sid = cfg.id || ("s" + (index + 1));
    const container = document.createElement("div");
    container.className = "student";
    container.setAttribute("draggable", "true");
    container.setAttribute("data-student-id", sid);

    const img = document.createElement("img");
    img.src = cfg.photoDataUrl ? cfg.photoDataUrl : "assets/Student_avatar.png";
    img.alt = cfg.name || ("Student " + (index + 1));

    const nameDiv = document.createElement("div");
    nameDiv.className = "student-name";
    nameDiv.textContent = cfg.name || ("Student " + (index + 1));

    container.appendChild(img);
    container.appendChild(nameDiv);
    studentsRowEl.appendChild(container);

    studentEls[sid] = container;

    container.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/student-id", sid); });
    container.addEventListener("pointerdown", () => { setActiveStudent(sid); playSound(studentSelectSound); });
  });
  updateStudentRings();
}

function renderSetupRows() {
  if (!studentConfigRows) return;
  studentConfigRows.innerHTML = "";

  studentsConfig.forEach((cfg, index) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "0.5rem";
    row.style.marginBottom = "0.25rem";

    const labelSpan = document.createElement("span");
    labelSpan.textContent = (index + 1) + ".";
    labelSpan.style.minWidth = "1.2rem";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = cfg.name || ("Student " + (index + 1));
    nameInput.placeholder = "Name";
    nameInput.style.flex = "1";
    nameInput.style.fontSize = "0.8rem";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.fontSize = "0.8rem";

    const preview = document.createElement("span");
    preview.style.width = "26px";
    preview.style.height = "26px";
    preview.style.borderRadius = "999px";
    preview.style.display = "inline-block";
    preview.style.backgroundSize = "cover";
    preview.style.backgroundPosition = "center";
    preview.style.border = "1px solid #e5e7eb";
    if (cfg.photoDataUrl) preview.style.backgroundImage = "url('" + cfg.photoDataUrl + "')";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.style.fontSize = "0.7rem";
    removeBtn.style.padding = "0.15rem 0.5rem";
    removeBtn.style.borderRadius = "999px";
    removeBtn.style.border = "1px solid #ef4444";
    removeBtn.style.background = "#fef2f2";
    removeBtn.style.color = "#b91c1c";
    removeBtn.style.cursor = "pointer";

    nameInput.addEventListener("input", () => {
      cfg.name = nameInput.value;
      persistRuntimeToActiveClassPreset();
      rebuildStudentsRowFromConfig();
    });

    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        cfg.photoDataUrl = e.target.result;
        preview.style.backgroundImage = "url('" + cfg.photoDataUrl + "')";
        persistRuntimeToActiveClassPreset();
        rebuildStudentsRowFromConfig();
      };
      reader.readAsDataURL(file);
    });

    removeBtn.addEventListener("click", () => {
      studentsConfig.splice(index, 1);
      if (studentCountInput) studentCountInput.value = studentsConfig.length;
      persistRuntimeToActiveClassPreset();
      renderSetupRows();
      rebuildStudentsRowFromConfig();
    });

    row.appendChild(labelSpan);
    row.appendChild(nameInput);
    row.appendChild(fileInput);
    row.appendChild(preview);
    row.appendChild(removeBtn);
    studentConfigRows.appendChild(row);
  });
}

function resizeStudentsArray(newCount) {
  const current = studentsConfig.length;
  if (newCount > current) {
    for (let i = current; i < newCount; i++) {
      studentsConfig.push({ id: "s" + (i + 1), name: "Student " + (i + 1), photoDataUrl: null });
    }
  } else if (newCount < current) {
    studentsConfig = studentsConfig.slice(0, newCount);
  }
}

// ======================================================
// Feelings grid + editor
// ======================================================
let buttonCountEls = {};   
let feelingButtonEls = {}; 
let isSetupOpen = false;
let editingFeelingId = null;

function clearEditingHighlight() { Object.values(feelingButtonEls).forEach(btn => btn.classList.remove("editing")); }

function renderFeelingsList() {
  if (!feelingsListEl) return;
  feelingsListEl.innerHTML = "";

  feelingsConfig.forEach((f) => {
    const pill = document.createElement("div");
    pill.className = "feelings-pill" + (editingFeelingId === f.id ? " active" : "");
    pill.setAttribute("data-feeling-id", f.id);

    const emoji = document.createElement("div");
    emoji.className = "pill-emoji";
    emoji.textContent = f.emoji || "🙂";

    const labelsWrap = document.createElement("div");
    labelsWrap.className = "pill-labels";

    const main = document.createElement("div");
    main.className = "pill-main";
    main.textContent = f.label || "Feeling";

    const sub = document.createElement("div");
    sub.className = "pill-sub";
    sub.textContent = f.help || "";

    labelsWrap.appendChild(main);
    labelsWrap.appendChild(sub);

    const dot = document.createElement("div");
    dot.className = "pill-dot";
    dot.style.background = f.colour || "#3b82f6";

    pill.appendChild(emoji);
    pill.appendChild(labelsWrap);
    pill.appendChild(dot);
    pill.addEventListener("click", () => setEditingFeeling(f.id));
    feelingsListEl.appendChild(pill);
  });
}

function setEditingFeeling(feelingId) {
  editingFeelingId = feelingId;
  clearEditingHighlight();
  if (feelingId && feelingButtonEls[feelingId]) feelingButtonEls[feelingId].classList.add("editing");
  renderFeelingsList();

  const f = getFeelingById(feelingId);
  if (!f) {
    if (editorEmptyEl) editorEmptyEl.style.display = "block";
    if (editorFormEl) editorFormEl.style.display = "none";
    return;
  }

  if (editorEmptyEl) editorEmptyEl.style.display = "none";
  if (editorFormEl) editorFormEl.style.display = "block";
  if (emojiInput) emojiInput.value = f.emoji || "";
  if (labelInput) labelInput.value = f.label || "";
  if (helpInput) helpInput.value = f.help || "";
  const c = isValidHexColour(f.colour) ? f.colour : "#3b82f6";
  if (colourInput) colourInput.value = c;
  if (colourHexInput) colourHexInput.value = c;
}

function applyEditorInputsToConfig() {
  const f = getFeelingById(editingFeelingId);
  if (!f) return false;

  f.emoji = safeText(emojiInput?.value, "🙂").slice(0, 4);
  f.label = safeText(labelInput?.value, "Feeling").slice(0, 32);
  f.help = safeText(helpInput?.value, "").slice(0, 40);
  let colour = safeText(colourHexInput?.value, colourInput?.value || "#3b82f6");
  if (!isValidHexColour(colour)) colour = colourInput?.value || "#3b82f6";
  if (!isValidHexColour(colour)) colour = "#3b82f6";
  f.colour = colour;

  if (colourInput) colourInput.value = colour;
  if (colourHexInput) colourHexInput.value = colour;
  return true;
}

function refreshUIAfterFeelingsChange() {
  pruneStudentFeelingsToExistingIds();
  ensureCountShapesPreserveExisting();
  recalculateCounts();
  renderFeelingsGrid();
  renderFeelingsList();
  updateAll();
  if (editingFeelingId) setEditingFeeling(editingFeelingId);
  persistRuntimeToActiveFeelingsPreset();
  persistRuntimeToActiveClassPreset();
}

function renderFeelingsGrid() {
  if (!feelingsGridEl) return;
  feelingsGridEl.innerHTML = "";
  buttonCountEls = {};
  feelingButtonEls = {};
  const colours = getColoursMap();

  feelingsConfig.forEach((f) => {
    const btn = document.createElement("button");
    btn.className = "feeling-option";
    btn.type = "button";
    btn.setAttribute("data-feeling-id", f.id);
    btn.setAttribute("aria-pressed", "false");
    btn.style.borderColor = colours[f.id] || "#ddd";

    const emojiDiv = document.createElement("div");
    emojiDiv.className = "feeling-emoji";
    emojiDiv.textContent = f.emoji || "🙂";

    const labelDiv = document.createElement("div");
    labelDiv.className = "feeling-label";
    labelDiv.textContent = f.label || "Feeling";

    const helpDiv = document.createElement("div");
    helpDiv.className = "feeling-help";
    helpDiv.textContent = f.help || "";

    const countDiv = document.createElement("div");
    countDiv.className = "feeling-count";
    countDiv.textContent = String(counts[f.id] || 0);

    btn.appendChild(emojiDiv);
    btn.appendChild(labelDiv);
    btn.appendChild(helpDiv);
    btn.appendChild(countDiv);

    feelingsGridEl.appendChild(btn);
    buttonCountEls[f.id] = countDiv;
    feelingButtonEls[f.id] = btn;

    btn.addEventListener("click", () => {
      if (isSetupOpen) { setEditingFeeling(f.id); return; }
      applyFeeling(f.id, null);
    });
    btn.addEventListener("dragover", (e) => e.preventDefault());
    btn.addEventListener("drop", (e) => {
      e.preventDefault();
      if (isSetupOpen) return;
      const studentId = e.dataTransfer.getData("text/student-id");
      if (!studentId) return;
      applyFeeling(f.id, { studentId });
    });
  });
  if (editingFeelingId) setEditingFeeling(editingFeelingId);
}

// ======================================================
// Voting behaviour
// ======================================================
function setStatusForFeeling(feelingId, meta) {
  if (!statusEl) return;
  const f = getFeelingById(feelingId);
  const label = (f && f.label) ? f.label : feelingId;
  const colour = (f && f.colour) ? f.colour : "#111827";
  const suffix = meta && meta.anonymous ? " (anonymous)" : "";
  statusEl.innerHTML = 'You selected <span class="highlight" style="color:' + colour + ';">' + label + "</span>" + suffix + ".";
}

function clearSelected() {
  Object.values(feelingButtonEls).forEach((btn) => {
    btn.classList.remove("selected");
    btn.setAttribute("aria-pressed", "false");
  });
}

function selectButton(feelingId) {
  clearSelected();
  const btn = feelingButtonEls[feelingId];
  if (btn) {
    btn.classList.add("selected");
    btn.setAttribute("aria-pressed", "true");
  }
}

function applyFeeling(feelingId, opts) {
  if (!feelingId || !getFeelingById(feelingId)) return;
  const studentId = opts && opts.studentId ? opts.studentId : null;
  let didAnonymous = false;

  if (studentId) {
    studentFeeling[studentId] = feelingId;
    setActiveStudent(null);
  } else if (activeStudentId) {
    studentFeeling[activeStudentId] = feelingId;
    setActiveStudent(null);
  } else {
    anonymousCounts[feelingId] = (anonymousCounts[feelingId] || 0) + 1;
    didAnonymous = true;
  }

  recalculateCounts();
  selectButton(feelingId);
  setStatusForFeeling(feelingId, { anonymous: didAnonymous });
  playSound(feelingSelectSound);
  updateAll();
  persistRuntimeToActiveClassPreset();
}

// ======================================================
// Pie chart + legend
// ======================================================
let previousCountsForLegend = {};
let previousCountsForAnimation = {};
let pieAnimationFrameId = null;

function drawPieSlices(countObj) {
  if (!pieCtx || !pieCanvas) return;
  const total = getTotalVotesFrom(countObj);
  pieCtx.clearRect(0, 0, pieCanvas.width, pieCanvas.height);
  if (total === 0) return;

  const colours = getColoursMap();
  const centreX = pieCanvas.width / 2;
  const centreY = pieCanvas.height / 2;
  const radius = Math.min(pieCanvas.width, pieCanvas.height) / 2 - 10;
  let startAngle = -Math.PI / 2;

  getFeelingsOrder().forEach((id) => {
    const value = countObj[id] || 0;
    if (value <= 0) return;
    const sliceAngle = (value / total) * Math.PI * 2;
    const endAngle = startAngle + sliceAngle;
    pieCtx.beginPath();
    pieCtx.moveTo(centreX, centreY);
    pieCtx.arc(centreX, centreY, radius, startAngle, endAngle);
    pieCtx.closePath();
    pieCtx.fillStyle = colours[id] || "#999999";
    pieCtx.fill();
    startAngle = endAngle;
  });
}

function animatePieChart(newCounts) {
  if (!pieCtx || !pieCanvas) return;
  const totalNew = getTotalVotesFrom(newCounts);

  if (totalNew === 0) {
    if (pieAnimationFrameId) { cancelAnimationFrame(pieAnimationFrameId); pieAnimationFrameId = null; }
    pieCtx.clearRect(0, 0, pieCanvas.width, pieCanvas.height);
    pieCtx.fillStyle = "#9ca3af";
    pieCtx.font = "12px system-ui, sans-serif";
    pieCtx.textAlign = "center";
    pieCtx.textBaseline = "middle";
    pieCtx.fillText("No votes yet", pieCanvas.width / 2, pieCanvas.height / 2);
    previousCountsForAnimation = copyCounts(newCounts);
    return;
  }

  const startCounts = copyCounts(previousCountsForAnimation);
  const endCounts = copyCounts(newCounts);
  const duration = 500;
  const startTime = performance.now();

  if (pieAnimationFrameId) cancelAnimationFrame(pieAnimationFrameId);

  function frame(now) {
    const tRaw = (now - startTime) / duration;
    const t = Math.max(0, Math.min(1, tRaw));
    const eased = t * (2 - t);
    const intermediate = {};
    getFeelingsOrder().forEach((id) => {
      const s = startCounts[id] || 0;
      const e = endCounts[id] || 0;
      intermediate[id] = s + (e - s) * eased;
    });

    drawPieSlices(intermediate);
    if (t < 1) pieAnimationFrameId = requestAnimationFrame(frame);
    else {
      previousCountsForAnimation = copyCounts(newCounts);
      pieAnimationFrameId = null;
    }
  }
  pieAnimationFrameId = requestAnimationFrame(frame);
}

function renderLegend(countObj) {
  if (!legendContent) return;
  const totalNew = getTotalVotesFrom(countObj);
  const prevCounts = previousCountsForLegend;
  const totalPrev = getTotalVotesFrom(prevCounts);

  legendContent.innerHTML = "";
  if (totalNew === 0 && totalPrev === 0) {
    legendContent.className = "chart-empty";
    legendContent.textContent = "No votes yet. The chart will appear when someone chooses a feeling.";
    return;
  }

  legendContent.className = "";
  const labels = getLabelsMap();
  const colours = getColoursMap();

  getFeelingsOrder().forEach((id) => {
    const valueNow = countObj[id] || 0;
    const valuePrev = prevCounts[id] || 0;
    if (valueNow <= 0 && valuePrev <= 0) return;

    const percentNow = totalNew ? Math.round((valueNow / totalNew) * 100) : 0;
    const percentPrev = totalPrev ? Math.round((valuePrev / totalPrev) * 100) : 0;

    const row = document.createElement("div");
    row.className = "bar-row";

    const labelEl = document.createElement("div");
    labelEl.className = "bar-label";

    const f = getFeelingById(id);
    const emoji = f?.emoji ? f.emoji : "";
    labelEl.innerHTML = `<span class="bar-emoji">${emoji}</span><span class="bar-text">${labels[id] || id}</span>`;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.backgroundColor = colours[id] || "#999999";
    fill.style.width = percentPrev + "%";
    track.appendChild(fill);

    const valueEl = document.createElement("div");
    valueEl.className = "bar-value";
    valueEl.textContent = valueNow + " (" + percentNow + "%)";

    row.appendChild(labelEl);
    row.appendChild(track);
    row.appendChild(valueEl);
    legendContent.appendChild(row);

    requestAnimationFrame(() => { fill.style.width = percentNow + "%"; });
  });
  previousCountsForLegend = copyCounts(countObj);
}

// ======================================================
// Update everything
// ======================================================
function updateAll() {
  const total = getTotalVotesFrom(counts);
  if (totalVotesEl) totalVotesEl.textContent = total;
  Object.keys(counts).forEach((id) => {
    const el = buttonCountEls[id];
    if (el) el.textContent = String(counts[id] || 0);
  });
  renderLegend(counts);
  animatePieChart(counts);
  updateStudentRings();
  updateStudentsStripInstructions();
}

function hardResetPollRuntime() {
  Object.keys(anonymousCounts).forEach(k => (anonymousCounts[k] = 0));
  Object.keys(studentFeeling).forEach(k => delete studentFeeling[k]);
  clearSelected();
  setActiveStudent(null);
  if (statusEl) statusEl.textContent = "";
  recalculateCounts();
  previousCountsForLegend = copyCounts(counts);
  previousCountsForAnimation = copyCounts(counts);
  updateAll();
}

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    hardResetPollRuntime();
    persistRuntimeToActiveClassPreset();
  });
}

// ======================================================
// Feelings editor wiring
// ======================================================
if (colourInput && colourHexInput) {
  colourInput.addEventListener("input", () => { colourHexInput.value = colourInput.value; });
  colourHexInput.addEventListener("input", () => {
    const v = colourHexInput.value.trim();
    if (isValidHexColour(v)) colourInput.value = v;
  });
}

[emojiInput, labelInput, helpInput, colourInput, colourHexInput].filter(Boolean).forEach((el) => {
  el.addEventListener("input", () => {
    if (!editingFeelingId) return;
    if (!applyEditorInputsToConfig()) return;
    refreshUIAfterFeelingsChange();
    setEditingFeeling(editingFeelingId);
  });
});

if (addFeelingBtn) {
  addFeelingBtn.addEventListener("click", () => {
    if (feelingsConfig.length >= 20) return;
    const newId = createId();
    feelingsConfig.push({ id: newId, emoji: "🙂", label: "New feeling", help: "Edit me", colour: "#3b82f6" });
    refreshUIAfterFeelingsChange();
    setEditingFeeling(newId);
  });
}

if (deleteFeelingBtn) {
  deleteFeelingBtn.addEventListener("click", () => {
    if (!editingFeelingId || feelingsConfig.length <= 1) return;
    const f = getFeelingById(editingFeelingId);
    const name = f ? f.label : "this feeling";
    const ok = confirm("Delete “" + name + "”? This will also clear any student choices using it.");
    if (!ok) return;

    feelingsConfig = feelingsConfig.filter(x => x.id !== editingFeelingId);
    editingFeelingId = null;
    if (editorEmptyEl) editorEmptyEl.style.display = "block";
    if (editorFormEl) editorFormEl.style.display = "none";
    clearEditingHighlight();
    refreshUIAfterFeelingsChange();
  });
}

function moveFeeling(delta) {
  if (!editingFeelingId) return;
  const idx = feelingsConfig.findIndex(f => f.id === editingFeelingId);
  if (idx < 0) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= feelingsConfig.length) return;
  const temp = feelingsConfig[idx];
  feelingsConfig[idx] = feelingsConfig[newIdx];
  feelingsConfig[newIdx] = temp;
  refreshUIAfterFeelingsChange();
  setEditingFeeling(editingFeelingId);
}

if (moveUpBtn) moveUpBtn.addEventListener("click", () => moveFeeling(-1));
if (moveDownBtn) moveDownBtn.addEventListener("click", () => moveFeeling(1));

if (saveFeelingsBtn) {
  saveFeelingsBtn.addEventListener("click", () => {
    if (editingFeelingId) applyEditorInputsToConfig();
    persistRuntimeToActiveFeelingsPreset();
    saveFeelingsBtn.textContent = "Saved ✓";
    setTimeout(() => { saveFeelingsBtn.textContent = "Save feelings"; }, 900);
  });
}

// ======================================================
// Setup open/close
// ======================================================
if (openSetupBtn && setupPanel) {
  openSetupBtn.addEventListener("click", () => {
    setupPanel.style.display = "block";
    isSetupOpen = true;
    refreshSetupPanelUI();
  });
}

if (closeSetupBtn && setupPanel) {
  closeSetupBtn.addEventListener("click", () => {
    setupPanel.style.display = "none";
    isSetupOpen = false;
    editingFeelingId = null;
    if (editorEmptyEl) editorEmptyEl.style.display = "block";
    if (editorFormEl) editorFormEl.style.display = "none";
    clearEditingHighlight();
  });
}

if (studentCountInput) {
  function applyStudentCountFromInput() {
    let n = parseInt(studentCountInput.value, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > 30) n = 30;
    studentCountInput.value = String(n);
    resizeStudentsArray(n);
    renderSetupRows();
  }
  studentCountInput.addEventListener("input", applyStudentCountFromInput);
  studentCountInput.addEventListener("change", applyStudentCountFromInput);
}

if (applySetupBtn) {
  applySetupBtn.addEventListener("click", () => {
    rebuildStudentsRowFromConfig();
    persistRuntimeToActiveClassPreset();
    setupPanel.style.display = "none";
    isSetupOpen = false;
    editingFeelingId = null;
    if (editorEmptyEl) editorEmptyEl.style.display = "block";
    if (editorFormEl) editorFormEl.style.display = "none";
    clearEditingHighlight();
  });
}

if (resetDefaultsBtn) {
  resetDefaultsBtn.addEventListener("click", () => {
    const classIdx = clamp(classPresets?.active ?? activeClassIndex ?? 0, 0, 3);
    const linkedFeelingsIdx = clamp(parseInt(classPresets?.classes?.[classIdx]?.feelingsPresetIndex, 10) || 0, 0, 3);
    const ok = confirm("Reset the selected presets back to defaults?\n\nOther presets will NOT be changed.");
    if (!ok) return;

    classPresets.active = classIdx;
    if (!classPresets.classes) classPresets.classes = [];
    if (!classPresets.classes[classIdx]) classPresets.classes[classIdx] = {};
    classPresets.classes[classIdx].studentsConfig = getDefaultStudentsConfig();
    classPresets.classes[classIdx].anonymousCounts = {};
    classPresets.classes[classIdx].studentFeeling = {};
    classPresets.classes[classIdx].feelingsPresetIndex = linkedFeelingsIdx;

    feelingsPresets.active = linkedFeelingsIdx;
    if (!feelingsPresets.presets) feelingsPresets.presets = [];
    feelingsPresets.presets[linkedFeelingsIdx] = getDefaultFeelingsConfig();

    saveClassPresets();
    saveFeelingsPresets();

    activeClassIndex = classIdx;
    activeFeelingsPresetIndex = linkedFeelingsIdx;
    applyActiveClassPresetToRuntime();
    pruneStudentFeelingsToExistingIds();
    ensureCountShapesPreserveExisting();
    recalculateCounts();
    previousCountsForLegend = copyCounts(counts);
    previousCountsForAnimation = copyCounts(counts);

    editingFeelingId = null;
    if (editorEmptyEl) editorEmptyEl.style.display = "block";
    if (editorFormEl) editorFormEl.style.display = "none";
    clearEditingHighlight();

    rebuildStudentsRowFromConfig();
    renderFeelingsGrid();
    renderFeelingsList();
    updateAll();
    reflectPresetButtons();
    if (isSetupOpen) refreshSetupPanelUI();
  });
}

// ======================================================
// Presets UI
// ======================================================
function setActivePresetButton(container, idx) {
  if (!container) return;
  const btns = container.querySelectorAll(".preset-btn");
  btns.forEach(b => b.classList.remove("active"));
  const target = container.querySelector('.preset-btn[data-class="' + idx + '"], .preset-btn[data-preset="' + idx + '"]');
  if (target) target.classList.add("active");
}

function reflectPresetButtons() {
  setActivePresetButton(classPresetsEl, activeClassIndex);
  setActivePresetButton(feelingsPresetsEl, activeFeelingsPresetIndex);
}

function refreshSetupPanelUI() {
  reflectPresetButtons();
  if (studentCountInput) studentCountInput.value = studentsConfig.length;
  renderSetupRows();
  renderFeelingsList();

  if (editingFeelingId && !getFeelingById(editingFeelingId)) {
    editingFeelingId = null;
    if (editorEmptyEl) editorEmptyEl.style.display = "block";
    if (editorFormEl) editorFormEl.style.display = "none";
    clearEditingHighlight();
  } else if (editingFeelingId) {
    setEditingFeeling(editingFeelingId);
  }
  updateStudentsStripInstructions();
}

function switchFeelingsPreset(newIdx) {
  newIdx = clamp(parseInt(newIdx, 10) || 0, 0, 3);
  if (newIdx === activeFeelingsPresetIndex) return;
  persistRuntimeToActiveFeelingsPreset();
  activeFeelingsPresetIndex = newIdx;
  feelingsPresets.active = newIdx;
  classPresets.classes[activeClassIndex].feelingsPresetIndex = activeFeelingsPresetIndex;
  saveClassPresets();
  applyActiveFeelingsPresetToRuntime();
  hardResetPollRuntime();
  renderFeelingsGrid();
  renderFeelingsList();
  updateStudentsStripInstructions();
  reflectPresetButtons();
  if (isSetupOpen) refreshSetupPanelUI();
  saveFeelingsPresets();
  persistRuntimeToActiveClassPreset();
}

function switchClassPreset(newIdx) {
  newIdx = clamp(parseInt(newIdx, 10) || 0, 0, 3);
  if (newIdx === activeClassIndex) return;
  persistRuntimeToActiveClassPreset();
  activeClassIndex = newIdx;
  classPresets.active = newIdx;
  applyActiveClassPresetToRuntime();
  pruneStudentFeelingsToExistingIds();
  ensureCountShapesPreserveExisting();
  recalculateCounts();
  previousCountsForLegend = copyCounts(counts);
  previousCountsForAnimation = copyCounts(counts);
  rebuildStudentsRowFromConfig();
  renderFeelingsGrid();
  renderFeelingsList();
  updateAll();
  if (isSetupOpen) refreshSetupPanelUI();
  else reflectPresetButtons();
  saveClassPresets();
  saveFeelingsPresets();
}

if (classPresetsEl) {
  classPresetsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".preset-btn");
    if (!btn) return;
    switchClassPreset(btn.getAttribute("data-class"));
  });
}

if (feelingsPresetsEl) {
  feelingsPresetsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".preset-btn");
    if (!btn) return;
    switchFeelingsPreset(btn.getAttribute("data-preset"));
  });
}

// ======================================================
// Export / Import Class Pack
// ======================================================
const exportBtn = document.getElementById("export-class-pack");
const importBtn = document.getElementById("import-class-pack");
const importInput = document.getElementById("import-class-input");

function buildClassPack() {
  return { version: 1, exportedAt: new Date().toISOString(), classPresets: deepClone(classPresets), feelingsPresets: deepClone(feelingsPresets) };
}

function applyClassPack(pack) {
  if (!pack || typeof pack !== "object" || !pack.classPresets || !pack.feelingsPresets) {
    alert("This file doesn’t look like a valid class pack."); return;
  }
  classPresets = pack.classPresets;
  feelingsPresets = pack.feelingsPresets;
  classPresets.active = clamp(classPresets.active || 0, 0, 3);
  feelingsPresets.active = clamp(feelingsPresets.active || 0, 0, 3);
  saveClassPresets();
  saveFeelingsPresets();
  activeClassIndex = classPresets.active;
  activeFeelingsPresetIndex = classPresets.classes[activeClassIndex].feelingsPresetIndex || 0;
  applyActiveClassPresetToRuntime();
  pruneStudentFeelingsToExistingIds();
  ensureCountShapesPreserveExisting();
  recalculateCounts();
  previousCountsForLegend = copyCounts(counts);
  previousCountsForAnimation = copyCounts(counts);
  rebuildStudentsRowFromConfig();
  renderFeelingsGrid();
  renderFeelingsList();
  updateAll();
  reflectPresetButtons();
  if (isSetupOpen) refreshSetupPanelUI();
}

if (exportBtn) {
  exportBtn.addEventListener("click", async () => {
    const pack = buildClassPack();
    const json = JSON.stringify(pack, null, 2);
    const filename = "class-check-in.json";
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "Class Check-in Pack", accept: { "application/json": [".json"] } }] });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        return; 
      } catch (e) {}
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

if (importBtn && importInput) {
  importBtn.addEventListener("click", () => { importInput.value = ""; importInput.click(); });
  importInput.addEventListener("change", () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { applyClassPack(JSON.parse(reader.result)); } 
      catch (e) { alert("Could not read this file. It may be corrupted."); }
    };
    reader.readAsText(file);
  });
}

// ======================================================
// Init
// ======================================================
ensurePresetsExist();
applyActiveClassPresetToRuntime(); 
ensureCountShapesPreserveExisting();
pruneStudentFeelingsToExistingIds();
recalculateCounts();
previousCountsForLegend = copyCounts(counts);
previousCountsForAnimation = copyCounts(counts);
rebuildStudentsRowFromConfig();
renderFeelingsGrid();
renderFeelingsList();
updateAll();
reflectPresetButtons();