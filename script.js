"use strict";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* Storage keys — data is namespaced per user so no one sees anyone else's list. */
const PROFILES_KEY = "wc-profiles";     // { key: {name, pass} }
const CURRENT_KEY = "wc-current";       // key of the signed-in user
const dataKeyFor = (k) => "wc-data-" + k;
const recipientKeyFor = (k) => "wc-recipient-" + k;

/* ===========================================================
   EMAIL SETUP — paste your 3 EmailJS keys between the quotes.
   (Free signup at https://www.emailjs.com)
   While these say "PASTE_...", the button opens your mail app instead.
   =========================================================== */
const EMAILJS = {
  publicKey: "PASTE_PUBLIC_KEY",
  serviceId: "PASTE_SERVICE_ID",
  templateId: "PASTE_TEMPLATE_ID",
};
const EMAIL_READY =
  EMAILJS.publicKey.indexOf("PASTE_") !== 0 &&
  EMAILJS.serviceId.indexOf("PASTE_") !== 0 &&
  EMAILJS.templateId.indexOf("PASTE_") !== 0;
if (EMAIL_READY && window.emailjs) {
  emailjs.init({ publicKey: EMAILJS.publicKey });
}

// --- App state ---
let currentKey = null;   // storage key for the current user
let currentName = "";    // display name
let data = {};           // { Monday: [...], ... } for the current user
let idCounter = 0;

// --- DOM refs ---
const signinEl = document.getElementById("signin");
const nameInput = document.getElementById("nameInput");
const passInput = document.getElementById("passInput");
const recoveryInput = document.getElementById("recoveryInput");
const signinBtn = document.getElementById("signinBtn");
const signinHint = document.getElementById("signinHint");
const forgotBtn = document.getElementById("forgotBtn");
const resetAllBtn = document.getElementById("resetAllBtn");

const appEl = document.getElementById("app");
const whoEl = document.getElementById("who");
const boardEl = document.getElementById("board");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const resetBtn = document.getElementById("resetBtn");
const signoutBtn = document.getElementById("signoutBtn");
const recipientEl = document.getElementById("recipient");
const sendBtn = document.getElementById("sendBtn");

// --- Tiny non-secure hash so passcodes aren't stored in plain text ---
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return String(h);
}

// --- Profiles ---
function loadProfiles() {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function saveProfiles(p) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch (e) {}
}

// --- Per-user checklist data ---
function loadData(key) {
  try {
    const raw = localStorage.getItem(dataKeyFor(key));
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const fresh = {};
  DAYS.forEach((d) => (fresh[d] = []));
  return fresh;
}
function save() {
  if (!currentKey) return;
  try { localStorage.setItem(dataKeyFor(currentKey), JSON.stringify(data)); } catch (e) {}
}

// --- Sign in / out ---
function showHint(msg, ok) {
  signinHint.textContent = msg;
  signinHint.className = "signin__hint" + (ok ? " signin__hint--ok" : "");
}

function signIn() {
  const name = nameInput.value.trim();
  const pass = passInput.value;
  const recovery = recoveryInput.value.trim();
  if (!name) {
    showHint("Please type your name.");
    nameInput.focus();
    return;
  }
  const key = "u_" + hash(name.toLowerCase());
  const profiles = loadProfiles();
  const existing = profiles[key];

  if (existing) {
    // Returning user: check passcode if they set one.
    if (existing.pass && existing.pass !== hash(pass)) {
      showHint("Wrong passcode. Forgot it? Type your backup answer above, then click “Forgot passcode?”");
      passInput.focus();
      return;
    }
  } else {
    // New user: create the profile with optional passcode + backup answer.
    profiles[key] = {
      name: name,
      pass: pass ? hash(pass) : "",
      recovery: recovery ? hash(recovery.toLowerCase()) : "",
    };
    saveProfiles(profiles);
  }

  currentKey = key;
  currentName = existing ? existing.name : name;
  try { localStorage.setItem(CURRENT_KEY, key); } catch (e) {}

  startApp();
}

// Recover access using the backup answer, then set a new passcode.
function recoverAccess() {
  const name = nameInput.value.trim();
  const answer = recoveryInput.value.trim();
  if (!name) {
    showHint("Type your name first, then your backup answer.");
    nameInput.focus();
    return;
  }
  const key = "u_" + hash(name.toLowerCase());
  const profiles = loadProfiles();
  const prof = profiles[key];
  if (!prof) {
    showHint("No account with that name on this device.");
    return;
  }
  if (!prof.recovery) {
    showHint("No backup answer was set for this account. Use “Reset all accounts” if you're locked out.");
    return;
  }
  if (!answer || prof.recovery !== hash(answer.toLowerCase())) {
    showHint("Backup answer doesn't match. Try again.");
    recoveryInput.focus();
    return;
  }
  // Correct! Let them set a fresh passcode.
  const np = prompt("Backup answer correct! Set a NEW passcode (or leave blank for none):");
  if (np === null) return; // cancelled
  prof.pass = np ? hash(np) : "";
  saveProfiles(profiles);
  currentKey = key;
  currentName = prof.name;
  try { localStorage.setItem(CURRENT_KEY, key); } catch (e) {}
  startApp();
}

// Wipe every account + checklist saved in this browser.
function resetAllAccounts() {
  if (!confirm("This deletes ALL accounts and checklists saved on this device. This cannot be undone. Continue?")) return;
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("wc-") === 0) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
  currentKey = null;
  currentName = "";
  data = {};
  appEl.hidden = true;
  signinEl.hidden = false;
  nameInput.value = "";
  passInput.value = "";
  recoveryInput.value = "";
  showHint("All accounts on this device were reset. You can start fresh.", true);
  nameInput.focus();
}

function signOut() {
  try { localStorage.removeItem(CURRENT_KEY); } catch (e) {}
  currentKey = null;
  currentName = "";
  data = {};
  appEl.hidden = true;
  signinEl.hidden = false;
  nameInput.value = "";
  passInput.value = "";
  recoveryInput.value = "";
  showHint("");
  nameInput.focus();
}

function startApp() {
  data = loadData(currentKey);
  showHint("");
  signinEl.hidden = true;
  appEl.hidden = false;
  whoEl.textContent = "Signed in as " + currentName;

  const savedRecipient = localStorage.getItem(recipientKeyFor(currentKey));
  recipientEl.value = savedRecipient || "";

  render();
}

// --- Tasks ---
function nextId() {
  idCounter += 1;
  return "t" + idCounter + "-" + boardEl.childElementCount;
}
function todayName() {
  const jsDay = new Date().getDay(); // 0=Sun..6=Sat
  return DAYS[(jsDay + 6) % 7];
}
function addTask(day, text) {
  const clean = text.trim();
  if (!clean) return;
  data[day].push({ id: nextId(), text: clean, done: false });
  save();
  render();
}
function toggleTask(day, id) {
  const t = data[day].find((x) => x.id === id);
  if (t) { t.done = !t.done; save(); render(); }
}
function deleteTask(day, id) {
  data[day] = data[day].filter((x) => x.id !== id);
  save();
  render();
}
function clearAll() {
  if (!confirm("Clear your whole week? This cannot be undone.")) return;
  DAYS.forEach((d) => (data[d] = []));
  save();
  render();
}

function updateProgress() {
  let total = 0, done = 0;
  DAYS.forEach((d) => {
    total += data[d].length;
    done += data[d].filter((t) => t.done).length;
  });
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent =
    total === 0 ? "Add some tasks to get started" : `${done} of ${total} done · ${pct}%`;
}

function render() {
  const today = todayName();
  boardEl.innerHTML = "";

  DAYS.forEach((day) => {
    const tasks = data[day];
    const doneCount = tasks.filter((t) => t.done).length;

    const col = document.createElement("section");
    col.className = "day" + (day === today ? " day--today" : "");

    const name = document.createElement("div");
    name.className = "day__name";
    name.innerHTML =
      `<span>${day}</span>` + (day === today ? `<span class="day__today-tag">TODAY</span>` : "");
    col.appendChild(name);

    const count = document.createElement("div");
    count.className = "day__count";
    count.textContent = tasks.length ? `${doneCount}/${tasks.length} done` : "No tasks yet";
    col.appendChild(count);

    const ul = document.createElement("ul");
    ul.className = "tasks";

    if (tasks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "Nothing here — add a task!";
      ul.appendChild(empty);
    }

    tasks.forEach((t) => {
      const li = document.createElement("li");
      li.className = "task" + (t.done ? " task--done" : "");

      const check = document.createElement("span");
      check.className = "task__check";
      check.textContent = "✓";

      const text = document.createElement("span");
      text.className = "task__text";
      text.textContent = t.text;

      const del = document.createElement("button");
      del.className = "task__del";
      del.type = "button";
      del.textContent = "✕";
      del.title = "Delete";
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteTask(day, t.id); });

      li.addEventListener("click", () => toggleTask(day, t.id));
      li.appendChild(check);
      li.appendChild(text);
      li.appendChild(del);
      ul.appendChild(li);
    });

    col.appendChild(ul);

    const add = document.createElement("div");
    add.className = "add";
    const input = document.createElement("input");
    input.className = "add__input";
    input.type = "text";
    input.placeholder = "Add a task…";
    input.setAttribute("aria-label", "Add a task to " + day);
    const btn = document.createElement("button");
    btn.className = "add__btn";
    btn.type = "button";
    btn.textContent = "+";
    btn.title = "Add";

    const commit = () => addTask(day, input.value);
    btn.addEventListener("click", commit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });

    add.appendChild(input);
    add.appendChild(btn);
    col.appendChild(add);

    boardEl.appendChild(col);
  });

  updateProgress();
}

// --- Email progress ---
function buildEmailBody() {
  let total = 0, done = 0;
  const lines = [];
  DAYS.forEach((day) => {
    const tasks = data[day];
    if (tasks.length === 0) return;
    lines.push(day + ":");
    tasks.forEach((t) => {
      total += 1;
      if (t.done) done += 1;
      lines.push("  " + (t.done ? "[x] " : "[ ] ") + t.text);
    });
    lines.push("");
  });
  const header = total === 0
    ? "I haven't added any tasks yet."
    : `Here's my week — ${done} of ${total} done (${Math.round((done / total) * 100)}%):`;
  return "Hi!\n\n" + header + "\n\n" + lines.join("\n") + "\nSent from " + currentName + "'s Weekly Checklist.";
}

function openMailApp(to, subject, body) {
  window.location.href =
    "mailto:" + encodeURIComponent(to) +
    "?subject=" + encodeURIComponent(subject) +
    "&body=" + encodeURIComponent(body);
}

function sendEmail() {
  const to = recipientEl.value.trim();
  if (!to) {
    recipientEl.focus();
    alert("Please type the email address to send to first.");
    return;
  }
  try { localStorage.setItem(recipientKeyFor(currentKey), to); } catch (e) {}
  const subject = currentName + "'s Weekly Checklist progress";
  const body = buildEmailBody();

  if (!EMAIL_READY || !window.emailjs) {
    openMailApp(to, subject, body);
    return;
  }

  const original = sendBtn.textContent;
  sendBtn.textContent = "Sending…";
  sendBtn.disabled = true;
  emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, { to_email: to, subject: subject, message: body })
    .then(function () {
      sendBtn.textContent = "✅ Sent!";
      setTimeout(function () { sendBtn.textContent = original; sendBtn.disabled = false; }, 2000);
    })
    .catch(function (err) {
      sendBtn.textContent = original;
      sendBtn.disabled = false;
      alert("Couldn't send automatically. Opening your mail app instead.\n\n(" + (err && err.text ? err.text : err) + ")");
      openMailApp(to, subject, body);
    });
}

// --- Wire up events ---
signinBtn.addEventListener("click", signIn);
forgotBtn.addEventListener("click", recoverAccess);
resetAllBtn.addEventListener("click", resetAllAccounts);
passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") signIn(); });
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") passInput.focus(); });
signoutBtn.addEventListener("click", signOut);
resetBtn.addEventListener("click", clearAll);
sendBtn.addEventListener("click", sendEmail);

// --- Start: auto-resume last signed-in user on this device ---
(function init() {
  const saved = localStorage.getItem(CURRENT_KEY);
  if (saved) {
    const profiles = loadProfiles();
    if (profiles[saved]) {
      currentKey = saved;
      currentName = profiles[saved].name;
      startApp();
      return;
    }
  }
  signinEl.hidden = false;
  appEl.hidden = true;
  nameInput.focus();
})();
