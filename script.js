"use strict";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAKEUP_COL = "Makeup";
const COLUMNS = DAYS.concat([MAKEUP_COL]);

/* Local-only fallback keys (used when the cloud isn't set up) */
const PROFILES_KEY = "wc-profiles";     // { username: account }
const SESSION_KEY = "wc-session";       // username logged in on THIS device
const LAST_USER_KEY = "wc-last-user";   // pre-fill the login box

/* ===========================================================
   CLOUD SETUP (Supabase) — paste your 2 keys to sync accounts
   across every device. Free signup at https://supabase.com
   While these say "PASTE_...", accounts are saved on this device only.
   =========================================================== */
const SUPABASE = {
  url: "PASTE_SUPABASE_URL",
  anonKey: "PASTE_SUPABASE_ANON_KEY",
};
const CLOUD_READY =
  SUPABASE.url.indexOf("PASTE_") !== 0 &&
  SUPABASE.anonKey.indexOf("PASTE_") !== 0 &&
  !!window.supabase;
const sb = CLOUD_READY ? window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey) : null;

/* ===========================================================
   EMAIL SETUP (EmailJS) — paste your 3 keys to auto-send.
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
let currentUser = "";   // lowercased username (the key)
let currentName = "";
let data = {};
let idCounter = 0;

// --- Sign-in DOM refs ---
const signinEl = document.getElementById("signin");
const viewLogin = document.getElementById("viewLogin");
const viewSignup = document.getElementById("viewSignup");
const viewForgot = document.getElementById("viewForgot");
const viewManage = document.getElementById("viewManage");

const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginBtn = document.getElementById("loginBtn");
const loginHint = document.getElementById("loginHint");
const toForgot = document.getElementById("toForgot");
const toSignup = document.getElementById("toSignup");
const toManage = document.getElementById("toManage");

const suName = document.getElementById("suName");
const suUser = document.getElementById("suUser");
const suPass = document.getElementById("suPass");
const suPass2 = document.getElementById("suPass2");
const suBackup = document.getElementById("suBackup");
const signupBtn = document.getElementById("signupBtn");
const signupHint = document.getElementById("signupHint");
const toLoginFromSignup = document.getElementById("toLoginFromSignup");

const fgUser = document.getElementById("fgUser");
const fgBackup = document.getElementById("fgBackup");
const fgPass = document.getElementById("fgPass");
const fgPass2 = document.getElementById("fgPass2");
const forgotResetBtn = document.getElementById("forgotResetBtn");
const forgotHint = document.getElementById("forgotHint");
const toLoginFromForgot = document.getElementById("toLoginFromForgot");

const accountsList = document.getElementById("accountsList");
const manageHint = document.getElementById("manageHint");
const toLoginFromManage = document.getElementById("toLoginFromManage");

// --- App DOM refs ---
const appEl = document.getElementById("app");
const whoEl = document.getElementById("who");
const boardEl = document.getElementById("board");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const resetBtn = document.getElementById("resetBtn");
const signoutBtn = document.getElementById("signoutBtn");
const recipientEl = document.getElementById("recipient");
const sendBtn = document.getElementById("sendBtn");

// --- Helpers ---
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return String(h);
}
function freshData() {
  const d = {};
  COLUMNS.forEach((c) => (d[c] = []));
  return d;
}
function normalize(obj) {
  const out = obj && typeof obj === "object" ? obj : {};
  COLUMNS.forEach((c) => {
    if (!Array.isArray(out[c])) out[c] = [];
    out[c].forEach((t) => { if (!Array.isArray(t.subs)) t.subs = []; });
  });
  return out;
}

// ===========================================================
// STORAGE LAYER — cloud (Supabase) if configured, else this device.
// An "account" = { username, name, pass, recovery, data, recipient }
// ===========================================================
function loadProfilesLocal() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveProfilesLocal(p) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch (e) {}
}

// Find the real storage key for a username, tolerating older key schemes.
function findLocalKey(p, username) {
  const u = (username || "").toLowerCase();
  if (p[username]) return username;              // exact key
  if (p[u]) return u;                            // lowercase key
  for (const k in p) {                           // match by stored username field
    if (p[k] && (p[k].username || "").toLowerCase() === u) return k;
  }
  return null;
}

const store = {
  async getAccount(username) {
    if (sb) {
      const res = await sb.from("accounts").select("*").eq("username", username).maybeSingle();
      if (res.error) throw res.error;
      return res.data || null;
    }
    const p = loadProfilesLocal();
    const k = findLocalKey(p, username);
    return k ? p[k] : null;
  },
  async listAccounts() {
    if (sb) {
      const res = await sb.from("accounts").select("name,username");
      if (res.error) throw res.error;
      return res.data || [];
    }
    return Object.values(loadProfilesLocal()).map((a) => ({ name: a.name, username: a.username }));
  },
  async createAccount(acc) {
    if (sb) {
      const res = await sb.from("accounts").insert(acc);
      if (res.error) throw res.error;
      return;
    }
    const p = loadProfilesLocal();
    p[acc.username] = acc;
    saveProfilesLocal(p);
  },
  async updateAccount(username, changes) {
    if (sb) {
      const res = await sb.from("accounts").update(changes).eq("username", username);
      if (res.error) throw res.error;
      return;
    }
    const p = loadProfilesLocal();
    const k = findLocalKey(p, username);
    if (k) { Object.assign(p[k], changes); saveProfilesLocal(p); }
  },
  async deleteAccount(username) {
    if (sb) {
      const res = await sb.from("accounts").delete().eq("username", username);
      if (res.error) throw res.error;
      return;
    }
    const p = loadProfilesLocal();
    const k = findLocalKey(p, username);
    if (k) { delete p[k]; saveProfilesLocal(p); }
  },
};

// --- Hints & views ---
function setHint(el, msg, ok) {
  el.textContent = msg;
  el.className = "signin__hint" + (ok ? " signin__hint--ok" : "");
}
function showView(which) {
  viewLogin.hidden = which !== "login";
  viewSignup.hidden = which !== "signup";
  viewForgot.hidden = which !== "forgot";
  viewManage.hidden = which !== "manage";
  setHint(loginHint, "");
  setHint(signupHint, "");
  setHint(forgotHint, "");
  setHint(manageHint, "");
  if (which === "manage") renderAccounts();
}

// --- Enter the app with a loaded account ---
function enterApp(acc) {
  currentUser = acc.username;
  currentName = acc.name;
  data = normalize(acc.data || {});
  try {
    localStorage.setItem(SESSION_KEY, currentUser);
    localStorage.setItem(LAST_USER_KEY, currentUser);
  } catch (e) {}
  recipientEl.value = acc.recipient || "";
  signinEl.hidden = true;
  appEl.hidden = false;
  whoEl.textContent = "Signed in as " + currentName;
  render();
}

// --- Log in ---
async function login() {
  const username = loginUser.value.trim().toLowerCase();
  const pass = loginPass.value;
  if (!username || !pass) { setHint(loginHint, "Enter your username and password."); return; }
  setHint(loginHint, "Checking…");
  let acc;
  try { acc = await store.getAccount(username); }
  catch (e) { setHint(loginHint, "Network problem — try again."); return; }
  if (!acc) { setHint(loginHint, "No account with that username. Try “Create account.”"); return; }
  if (acc.pass !== hash(pass)) { setHint(loginHint, "Wrong password. Try again or “Forgot password?”"); return; }
  enterApp(acc);
}

// --- Create account ---
async function signup() {
  const name = suName.value.trim();
  const username = suUser.value.trim().toLowerCase();
  const pass = suPass.value;
  const pass2 = suPass2.value;
  const backup = suBackup.value.trim();

  if (!name || !username || !pass || !backup) {
    setHint(signupHint, "Please fill in your name, username, password, and backup answer."); return;
  }
  if (pass.length < 4) { setHint(signupHint, "Password should be at least 4 characters."); return; }
  if (pass !== pass2) { setHint(signupHint, "The two passwords don't match."); return; }

  setHint(signupHint, "Creating…");
  let existing;
  try { existing = await store.getAccount(username); }
  catch (e) { setHint(signupHint, "Network problem — try again."); return; }
  if (existing) { setHint(signupHint, "That username is taken. Pick another."); return; }

  const acc = {
    username: username,
    name: name,
    pass: hash(pass),
    recovery: hash(backup.toLowerCase()),
    data: freshData(),
    recipient: "",
  };
  try { await store.createAccount(acc); }
  catch (e) { setHint(signupHint, "Couldn't create account — try again."); return; }
  enterApp(acc);
}

// --- Forgot / reset password ---
async function resetPassword() {
  const username = fgUser.value.trim().toLowerCase();
  const backup = fgBackup.value.trim();
  const pass = fgPass.value;
  const pass2 = fgPass2.value;

  if (!username || !backup || !pass) {
    setHint(forgotHint, "Fill in your username, backup answer, and a new password."); return;
  }
  setHint(forgotHint, "Checking…");
  let acc;
  try { acc = await store.getAccount(username); }
  catch (e) { setHint(forgotHint, "Network problem — try again."); return; }
  if (!acc) { setHint(forgotHint, "No account with that username."); return; }
  if (acc.recovery !== hash(backup.toLowerCase())) { setHint(forgotHint, "Backup answer doesn't match."); return; }
  if (pass.length < 4) { setHint(forgotHint, "New password should be at least 4 characters."); return; }
  if (pass !== pass2) { setHint(forgotHint, "The two passwords don't match."); return; }

  try { await store.updateAccount(username, { pass: hash(pass) }); }
  catch (e) { setHint(forgotHint, "Couldn't save — try again."); return; }
  acc.pass = hash(pass);
  enterApp(acc);
}

// --- Manage accounts ---
async function renderAccounts() {
  accountsList.innerHTML = "";
  setHint(manageHint, "Loading…");
  let list;
  try { list = await store.listAccounts(); }
  catch (e) { setHint(manageHint, "Couldn't load accounts."); return; }
  setHint(manageHint, "");

  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "accounts__empty";
    empty.textContent = "No accounts yet.";
    accountsList.appendChild(empty);
    return;
  }
  list.forEach((prof) => {
    const row = document.createElement("div");
    row.className = "account";
    const info = document.createElement("div");
    info.className = "account__info";
    const nm = document.createElement("div");
    nm.className = "account__name";
    nm.textContent = prof.name;
    const un = document.createElement("div");
    un.className = "account__user";
    un.textContent = "@" + prof.username;
    info.appendChild(nm);
    info.appendChild(un);

    const del = document.createElement("button");
    del.className = "account__del";
    del.type = "button";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteAccount(prof));

    row.appendChild(info);
    row.appendChild(del);
    accountsList.appendChild(row);
  });
}

async function deleteAccount(prof) {
  const entered = prompt('Enter the password for "@' + prof.username + '" to delete it.\nThis erases the checklist and cannot be undone.');
  if (entered === null) return; // cancelled

  // Re-fetch the full account so we can verify the password.
  let full;
  try { full = await store.getAccount(prof.username); }
  catch (e) { setHint(manageHint, "Couldn't check password — try again."); return; }
  if (!full) { setHint(manageHint, "That account no longer exists."); renderAccounts(); return; }
  if (full.pass !== hash(entered)) {
    setHint(manageHint, "Wrong password — “" + prof.name + "” was NOT deleted.");
    return;
  }

  try { await store.deleteAccount(prof.username); }
  catch (e) { setHint(manageHint, "Couldn't delete — try again."); return; }
  try {
    if (localStorage.getItem(SESSION_KEY) === prof.username) localStorage.removeItem(SESSION_KEY);
    if (localStorage.getItem(LAST_USER_KEY) === prof.username) localStorage.removeItem(LAST_USER_KEY);
  } catch (e) {}
  setHint(manageHint, "Deleted “" + prof.name + ".”", true);
  renderAccounts();
}

// --- Sign out (with confirm) ---
function signOut() {
  if (!confirm("Sign out? Your checklist is saved and will be here when you log back in.")) return;
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  currentUser = "";
  currentName = "";
  data = {};
  appEl.hidden = true;
  signinEl.hidden = false;
  showView("login");
  prefillLogin();
}

function prefillLogin() {
  const last = localStorage.getItem(LAST_USER_KEY);
  if (last) { loginUser.value = last; loginPass.value = ""; loginPass.focus(); }
  else { loginUser.focus(); }
}

// --- Save the current user's checklist (fire-and-forget) ---
function save() {
  if (!currentUser) return;
  store.updateAccount(currentUser, { data: data }).catch(function () {});
}

// --- Tasks ---
function nextId() { idCounter += 1; return "t" + idCounter + "-" + boardEl.childElementCount; }
function todayName() { const j = new Date().getDay(); return DAYS[(j + 6) % 7]; }
function addTask(day, text) {
  const clean = text.trim();
  if (!clean) return;
  data[day].push({ id: nextId(), text: clean, done: false, subs: [] });
  save(); render();
}
function toggleTask(day, id) {
  const t = data[day].find((x) => x.id === id);
  if (t) { t.done = !t.done; save(); render(); }
}
function deleteTask(day, id) {
  data[day] = data[day].filter((x) => x.id !== id);
  save(); render();
}
function addSub(col, taskId, text) {
  const clean = text.trim();
  if (!clean) return;
  const t = data[col].find((x) => x.id === taskId);
  if (!t) return;
  if (!Array.isArray(t.subs)) t.subs = [];
  t.subs.push({ id: nextId(), text: clean, done: false });
  save(); render();
}
function toggleSub(col, taskId, subId) {
  const t = data[col].find((x) => x.id === taskId);
  if (!t) return;
  const s = t.subs.find((x) => x.id === subId);
  if (s) { s.done = !s.done; save(); render(); }
}
function deleteSub(col, taskId, subId) {
  const t = data[col].find((x) => x.id === taskId);
  if (!t) return;
  t.subs = t.subs.filter((x) => x.id !== subId);
  save(); render();
}
function clearAll() {
  if (!confirm("Clear your whole week? This cannot be undone.")) return;
  COLUMNS.forEach((d) => (data[d] = []));
  save(); render();
}

function updateProgress() {
  const today = todayName();
  const tasks = data[today] || [];
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  progressFill.style.width = pct + "%";
  progressLabel.textContent =
    total === 0 ? `No tasks for ${today} yet` : `${today}: ${done} of ${total} done · ${pct}%`;
}

function render() {
  const today = todayName();
  boardEl.innerHTML = "";

  COLUMNS.forEach((day) => {
    const tasks = data[day];
    const doneCount = tasks.filter((t) => t.done).length;
    const isMakeup = day === MAKEUP_COL;
    const isToday = !isMakeup && day === today;

    const col = document.createElement("section");
    col.className = "day" + (isToday ? " day--today" : "") + (isMakeup ? " day--makeup" : "");

    const name = document.createElement("div");
    name.className = "day__name";
    let tag = "";
    if (isToday) tag = `<span class="day__today-tag">TODAY</span>`;
    if (isMakeup) tag = `<span class="day__makeup-tag">CATCH-UP</span>`;
    name.innerHTML = `<span>${day}</span>` + tag;
    col.appendChild(name);

    const count = document.createElement("div");
    count.className = "day__count";
    if (isMakeup) count.textContent = tasks.length ? `${doneCount}/${tasks.length} done` : "Stuff you didn't get to";
    else count.textContent = tasks.length ? `${doneCount}/${tasks.length} done` : "No tasks yet";
    col.appendChild(count);

    const ul = document.createElement("ul");
    ul.className = "tasks";

    if (tasks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = isMakeup ? "Nothing to make up 🎉" : "Nothing here — add a task!";
      ul.appendChild(empty);
    }

    tasks.forEach((t) => {
      const li = document.createElement("li");
      li.className = "task" + (t.done ? " task--done" : "");

      const main = document.createElement("div");
      main.className = "task__main";
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
      main.addEventListener("click", () => toggleTask(day, t.id));
      main.appendChild(check); main.appendChild(text); main.appendChild(del);
      li.appendChild(main);

      if (t.subs && t.subs.length) {
        const sul = document.createElement("ul");
        sul.className = "subs";
        t.subs.forEach((s) => {
          const sli = document.createElement("li");
          sli.className = "subtask" + (s.done ? " subtask--done" : "");
          const sc = document.createElement("span");
          sc.className = "subtask__check";
          sc.textContent = "✓";
          const st = document.createElement("span");
          st.className = "subtask__text";
          st.textContent = s.text;
          const sd = document.createElement("button");
          sd.className = "subtask__del";
          sd.type = "button";
          sd.textContent = "✕";
          sd.title = "Delete step";
          sd.addEventListener("click", (e) => { e.stopPropagation(); deleteSub(day, t.id, s.id); });
          sli.addEventListener("click", (e) => { e.stopPropagation(); toggleSub(day, t.id, s.id); });
          sli.appendChild(sc); sli.appendChild(st); sli.appendChild(sd);
          sul.appendChild(sli);
        });
        li.appendChild(sul);
      }

      const sadd = document.createElement("div");
      sadd.className = "subadd";
      const sinput = document.createElement("input");
      sinput.className = "subadd__input";
      sinput.type = "text";
      sinput.placeholder = "＋ step";
      sinput.setAttribute("aria-label", "Add a step to " + t.text);
      sinput.addEventListener("click", (e) => e.stopPropagation());
      sinput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.stopPropagation(); addSub(day, t.id, sinput.value); }
      });
      sadd.appendChild(sinput);
      li.appendChild(sadd);

      ul.appendChild(li);
    });

    col.appendChild(ul);

    const add = document.createElement("div");
    add.className = "add";
    const input = document.createElement("input");
    input.className = "add__input";
    input.type = "text";
    input.placeholder = isMakeup ? "Add a make-up task…" : "Add a task…";
    input.setAttribute("aria-label", "Add a task to " + day);
    const btn = document.createElement("button");
    btn.className = "add__btn";
    btn.type = "button";
    btn.textContent = "+";
    btn.title = "Add";
    const commit = () => addTask(day, input.value);
    btn.addEventListener("click", commit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    add.appendChild(input); add.appendChild(btn);
    col.appendChild(add);

    boardEl.appendChild(col);
  });

  updateProgress();
}

// --- Email progress ---
function buildEmailBody() {
  let total = 0, done = 0;
  const lines = [];
  COLUMNS.forEach((day) => {
    const tasks = data[day];
    if (tasks.length === 0) return;
    lines.push(day + ":");
    tasks.forEach((t) => {
      total += 1;
      if (t.done) done += 1;
      lines.push("  " + (t.done ? "[x] " : "[ ] ") + t.text);
      (t.subs || []).forEach((s) => lines.push("      - " + (s.done ? "[x] " : "[ ] ") + s.text));
    });
    lines.push("");
  });
  const header = total === 0
    ? "I haven't added any tasks yet."
    : `Here's my week — ${done} of ${total} done (${Math.round((done / total) * 100)}%):`;
  return "Hi!\n\n" + header + "\n\n" + lines.join("\n") + "\nSent from " + currentName + "'s Weekly Checklist.";
}
function openMailApp(to, subject, body) {
  window.location.href = "mailto:" + encodeURIComponent(to) +
    "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
}
function sendEmail() {
  const to = recipientEl.value.trim();
  if (!to) { recipientEl.focus(); alert("Please type the email address to send to first."); return; }
  store.updateAccount(currentUser, { recipient: to }).catch(function () {});
  const subject = currentName + "'s Weekly Checklist progress";
  const body = buildEmailBody();
  if (!EMAIL_READY || !window.emailjs) { openMailApp(to, subject, body); return; }
  const original = sendBtn.textContent;
  sendBtn.textContent = "Sending…";
  sendBtn.disabled = true;
  emailjs.send(EMAILJS.serviceId, EMAILJS.templateId, { to_email: to, subject: subject, message: body })
    .then(function () {
      sendBtn.textContent = "✅ Sent!";
      setTimeout(function () { sendBtn.textContent = original; sendBtn.disabled = false; }, 2000);
    })
    .catch(function (err) {
      sendBtn.textContent = original; sendBtn.disabled = false;
      alert("Couldn't send automatically. Opening your mail app instead.\n\n(" + (err && err.text ? err.text : err) + ")");
      openMailApp(to, subject, body);
    });
}

// --- Wire up events ---
loginBtn.addEventListener("click", login);
loginPass.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
loginUser.addEventListener("keydown", (e) => { if (e.key === "Enter") loginPass.focus(); });

toSignup.addEventListener("click", () => showView("signup"));
toForgot.addEventListener("click", () => showView("forgot"));
toManage.addEventListener("click", () => showView("manage"));
toLoginFromSignup.addEventListener("click", () => showView("login"));
toLoginFromForgot.addEventListener("click", () => showView("login"));
toLoginFromManage.addEventListener("click", () => { showView("login"); prefillLogin(); });

signupBtn.addEventListener("click", signup);
suBackup.addEventListener("keydown", (e) => { if (e.key === "Enter") signup(); });
forgotResetBtn.addEventListener("click", resetPassword);
fgPass2.addEventListener("keydown", (e) => { if (e.key === "Enter") resetPassword(); });

signoutBtn.addEventListener("click", signOut);
resetBtn.addEventListener("click", clearAll);
sendBtn.addEventListener("click", sendEmail);

// --- Start: resume the last session on this device ---
(async function init() {
  showView("login");
  const sess = localStorage.getItem(SESSION_KEY);
  if (sess) {
    try {
      const acc = await store.getAccount(sess);
      if (acc) { enterApp(acc); return; }
    } catch (e) { /* fall through to login */ }
  }
  signinEl.hidden = false;
  appEl.hidden = true;
  showView("login");
  prefillLogin();
})();
