"use strict";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAKEUP_COL = "Makeup";
const COLUMNS = DAYS.concat([MAKEUP_COL]); // days + a catch-up column

/* Storage keys — data is namespaced per user so no one sees anyone else's list. */
const PROFILES_KEY = "wc-profiles";     // { userKey: {name, username, pass, recovery} }
const CURRENT_KEY = "wc-current";       // userKey of the signed-in user
const LAST_USER_KEY = "wc-last-user";   // last username, to pre-fill the login box
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
let currentKey = null;
let currentName = "";
let data = {};
let idCounter = 0;

// --- Sign-in DOM refs ---
const signinEl = document.getElementById("signin");
const viewLogin = document.getElementById("viewLogin");
const viewSignup = document.getElementById("viewSignup");
const viewForgot = document.getElementById("viewForgot");

const loginUser = document.getElementById("loginUser");
const loginPass = document.getElementById("loginPass");
const loginBtn = document.getElementById("loginBtn");
const loginHint = document.getElementById("loginHint");
const toForgot = document.getElementById("toForgot");
const toSignup = document.getElementById("toSignup");

const suName = document.getElementById("suName");
const suUser = document.getElementById("suUser");
const suPass = document.getElementById("suPass");
const suPass2 = document.getElementById("suPass2");
const suBackup = document.getElementById("suBackup");
const signupBtn = document.getElementById("signupBtn");
const signupHint = document.getElementById("signupHint");
const toLoginFromSignup = document.getElementById("toLoginFromSignup");

const toManage = document.getElementById("toManage");
const viewManage = document.getElementById("viewManage");
const accountsList = document.getElementById("accountsList");
const manageHint = document.getElementById("manageHint");
const toLoginFromManage = document.getElementById("toLoginFromManage");

const fgUser = document.getElementById("fgUser");
const fgBackup = document.getElementById("fgBackup");
const fgPass = document.getElementById("fgPass");
const fgPass2 = document.getElementById("fgPass2");
const forgotResetBtn = document.getElementById("forgotResetBtn");
const forgotHint = document.getElementById("forgotHint");
const toLoginFromForgot = document.getElementById("toLoginFromForgot");

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

// --- Tiny non-secure hash so passwords aren't stored in plain text ---
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return String(h);
}
function keyForUsername(username) {
  return "u_" + hash(username.toLowerCase());
}

// --- Profiles storage ---
function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveProfiles(p) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); } catch (e) {}
}

// --- Per-user checklist data ---
// Make sure every column exists and every task has a subs array (also upgrades old saved data).
function normalize(obj) {
  const out = obj && typeof obj === "object" ? obj : {};
  COLUMNS.forEach((c) => {
    if (!Array.isArray(out[c])) out[c] = [];
    out[c].forEach((t) => { if (!Array.isArray(t.subs)) t.subs = []; });
  });
  return out;
}
function loadData(key) {
  try {
    const raw = localStorage.getItem(dataKeyFor(key));
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {}
  return normalize({});
}
function save() {
  if (!currentKey) return;
  try { localStorage.setItem(dataKeyFor(currentKey), JSON.stringify(data)); } catch (e) {}
}

// --- Hint helpers ---
function setHint(el, msg, ok) {
  el.textContent = msg;
  el.className = "signin__hint" + (ok ? " signin__hint--ok" : "");
}

// --- View switching ---
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

// --- Manage accounts (delete the ones you choose) ---
function renderAccounts() {
  const profiles = loadProfiles();
  const keys = Object.keys(profiles);
  accountsList.innerHTML = "";

  if (keys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "accounts__empty";
    empty.textContent = "No accounts saved on this device yet.";
    accountsList.appendChild(empty);
    return;
  }

  keys.forEach((key) => {
    const prof = profiles[key];
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
    del.addEventListener("click", () => deleteAccount(key, prof));

    row.appendChild(info);
    row.appendChild(del);
    accountsList.appendChild(row);
  });
}

function deleteAccount(key, prof) {
  if (!confirm('Delete "' + prof.name + '" (@' + prof.username + ')?\nThis erases their checklist on this device and cannot be undone.')) return;

  const profiles = loadProfiles();
  delete profiles[key];
  saveProfiles(profiles);
  try {
    localStorage.removeItem(dataKeyFor(key));
    localStorage.removeItem(recipientKeyFor(key));
    if (localStorage.getItem(CURRENT_KEY) === key) localStorage.removeItem(CURRENT_KEY);
    if (localStorage.getItem(LAST_USER_KEY) === prof.username) localStorage.removeItem(LAST_USER_KEY);
  } catch (e) {}

  setHint(manageHint, "Deleted “" + prof.name + ".”", true);
  renderAccounts();
}

// --- Log in ---
function doLogin(userKey, profile) {
  currentKey = userKey;
  currentName = profile.name;
  try {
    localStorage.setItem(CURRENT_KEY, userKey);
    localStorage.setItem(LAST_USER_KEY, profile.username);
  } catch (e) {}
  startApp();
}

// Pre-fill the login username from last time; focus the password if we have it.
function prefillLogin() {
  const last = localStorage.getItem(LAST_USER_KEY);
  if (last) {
    loginUser.value = last;
    loginPass.value = "";
    loginPass.focus();
  } else {
    loginUser.focus();
  }
}

function login() {
  const username = loginUser.value.trim();
  const pass = loginPass.value;
  if (!username || !pass) {
    setHint(loginHint, "Enter your username and password.");
    return;
  }
  const key = keyForUsername(username);
  const profiles = loadProfiles();
  const prof = profiles[key];
  if (!prof) {
    setHint(loginHint, "No account with that username. Try “Create account.”");
    return;
  }
  if (prof.pass !== hash(pass)) {
    setHint(loginHint, "Wrong password. Try again or “Forgot password?”");
    return;
  }
  doLogin(key, prof);
}

// --- Create account ---
function signup() {
  const name = suName.value.trim();
  const username = suUser.value.trim();
  const pass = suPass.value;
  const pass2 = suPass2.value;
  const backup = suBackup.value.trim();

  if (!name || !username || !pass || !backup) {
    setHint(signupHint, "Please fill in your name, username, password, and backup answer.");
    return;
  }
  if (pass.length < 4) {
    setHint(signupHint, "Password should be at least 4 characters.");
    return;
  }
  if (pass !== pass2) {
    setHint(signupHint, "The two passwords don't match.");
    return;
  }
  const key = keyForUsername(username);
  const profiles = loadProfiles();
  if (profiles[key]) {
    setHint(signupHint, "That username is taken. Pick another.");
    return;
  }
  profiles[key] = {
    name: name,
    username: username,
    pass: hash(pass),
    recovery: hash(backup.toLowerCase()),
  };
  saveProfiles(profiles);
  doLogin(key, profiles[key]);
}

// --- Forgot / reset password ---
function resetPassword() {
  const username = fgUser.value.trim();
  const backup = fgBackup.value.trim();
  const pass = fgPass.value;
  const pass2 = fgPass2.value;

  if (!username || !backup || !pass) {
    setHint(forgotHint, "Fill in your username, backup answer, and a new password.");
    return;
  }
  const key = keyForUsername(username);
  const profiles = loadProfiles();
  const prof = profiles[key];
  if (!prof) {
    setHint(forgotHint, "No account with that username.");
    return;
  }
  if (prof.recovery !== hash(backup.toLowerCase())) {
    setHint(forgotHint, "Backup answer doesn't match.");
    return;
  }
  if (pass.length < 4) {
    setHint(forgotHint, "New password should be at least 4 characters.");
    return;
  }
  if (pass !== pass2) {
    setHint(forgotHint, "The two passwords don't match.");
    return;
  }
  prof.pass = hash(pass);
  saveProfiles(profiles);
  doLogin(key, prof);
}

// --- Sign out (with confirm) ---
function signOut() {
  if (!confirm("Sign out? Your checklist is saved and will be here when you log back in.")) return;
  try { localStorage.removeItem(CURRENT_KEY); } catch (e) {}
  currentKey = null;
  currentName = "";
  data = {};
  appEl.hidden = true;
  signinEl.hidden = false;
  showView("login");
  prefillLogin();
}

// --- Start app after login ---
function startApp() {
  data = loadData(currentKey);
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
  data[day].push({ id: nextId(), text: clean, done: false, subs: [] });
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

// Sub-steps under a task
function addSub(col, taskId, text) {
  const clean = text.trim();
  if (!clean) return;
  const t = data[col].find((x) => x.id === taskId);
  if (!t) return;
  if (!Array.isArray(t.subs)) t.subs = [];
  t.subs.push({ id: nextId(), text: clean, done: false });
  save();
  render();
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
  save();
  render();
}

function clearAll() {
  if (!confirm("Clear your whole week? This cannot be undone.")) return;
  COLUMNS.forEach((d) => (data[d] = []));
  save();
  render();
}

function updateProgress() {
  let total = 0, done = 0;
  COLUMNS.forEach((d) => {
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
    if (isMakeup) {
      count.textContent = tasks.length ? `${doneCount}/${tasks.length} done` : "Stuff you didn't get to";
    } else {
      count.textContent = tasks.length ? `${doneCount}/${tasks.length} done` : "No tasks yet";
    }
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

      // main clickable row
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
      main.appendChild(check);
      main.appendChild(text);
      main.appendChild(del);
      li.appendChild(main);

      // sub-steps
      if (t.subs && t.subs.length) {
        const sul = document.createElement("ul");
        sul.className = "subs";
        t.subs.forEach((s) => {
          const sli = document.createElement("li");
          sli.className = "subtask" + (s.done ? " subtask--done" : "");

          const scheck = document.createElement("span");
          scheck.className = "subtask__check";
          scheck.textContent = "✓";

          const stext = document.createElement("span");
          stext.className = "subtask__text";
          stext.textContent = s.text;

          const sdel = document.createElement("button");
          sdel.className = "subtask__del";
          sdel.type = "button";
          sdel.textContent = "✕";
          sdel.title = "Delete step";
          sdel.addEventListener("click", (e) => { e.stopPropagation(); deleteSub(day, t.id, s.id); });

          sli.addEventListener("click", (e) => { e.stopPropagation(); toggleSub(day, t.id, s.id); });
          sli.appendChild(scheck);
          sli.appendChild(stext);
          sli.appendChild(sdel);
          sul.appendChild(sli);
        });
        li.appendChild(sul);
      }

      // add sub-step box
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
  COLUMNS.forEach((day) => {
    const tasks = data[day];
    if (tasks.length === 0) return;
    lines.push(day + ":");
    tasks.forEach((t) => {
      total += 1;
      if (t.done) done += 1;
      lines.push("  " + (t.done ? "[x] " : "[ ] ") + t.text);
      (t.subs || []).forEach((s) => {
        lines.push("      - " + (s.done ? "[x] " : "[ ] ") + s.text);
      });
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

// --- Wire up sign-in events ---
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

// --- App events ---
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
  showView("login");
  prefillLogin();
})();
