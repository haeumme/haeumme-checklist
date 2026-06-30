"use strict";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STORAGE_KEY = "weekly-checklist-v1";
const RECIPIENT_KEY = "weekly-checklist-recipient";

/* ===========================================================
   EMAIL SETUP — paste your 3 EmailJS keys between the quotes.
   (Free signup at https://www.emailjs.com — see the steps Claude gave you.)
   While these say "PASTE_...", the button just opens your mail app instead.
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

// data shape: { Monday: [{id, text, done}], ... }
let data = load();

const boardEl = document.getElementById("board");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const resetBtn = document.getElementById("resetBtn");
const recipientEl = document.getElementById("recipient");
const sendBtn = document.getElementById("sendBtn");

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* ignore corrupt storage */
  }
  const fresh = {};
  DAYS.forEach((d) => (fresh[d] = []));
  return fresh;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    /* storage may be unavailable; app still works for the session */
  }
}

// A simple unique-ish id without Date.now/Math.random reliance
let idCounter = 0;
function nextId() {
  idCounter += 1;
  return "t" + idCounter + "-" + boardEl.childElementCount;
}

function todayName() {
  // 0 = Sunday ... 6 = Saturday  ->  map to our Monday-first list
  const jsDay = new Date().getDay();
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
  if (t) {
    t.done = !t.done;
    save();
    render();
  }
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
  let total = 0;
  let done = 0;
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

    // header
    const name = document.createElement("div");
    name.className = "day__name";
    name.innerHTML =
      `<span>${day}</span>` +
      (day === today ? `<span class="day__today-tag">TODAY</span>` : "");
    col.appendChild(name);

    const count = document.createElement("div");
    count.className = "day__count";
    count.textContent = tasks.length ? `${doneCount}/${tasks.length} done` : "No tasks yet";
    col.appendChild(count);

    // task list
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
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteTask(day, t.id);
      });

      li.addEventListener("click", () => toggleTask(day, t.id));
      li.appendChild(check);
      li.appendChild(text);
      li.appendChild(del);
      ul.appendChild(li);
    });

    col.appendChild(ul);

    // add box
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

    const commit = () => {
      addTask(day, input.value);
      // keep focus convenient: re-find the input after re-render
    };
    btn.addEventListener("click", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
    });

    add.appendChild(input);
    add.appendChild(btn);
    col.appendChild(add);

    boardEl.appendChild(col);
  });

  updateProgress();
}

// --- Email progress ---
function buildEmailBody() {
  let total = 0;
  let done = 0;
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
    lines.push(""); // blank line between days
  });

  const header =
    total === 0
      ? "I haven't added any tasks yet."
      : `Here's my week — ${done} of ${total} done (${Math.round((done / total) * 100)}%):`;

  return "Hi!\n\n" + header + "\n\n" + lines.join("\n") + "\nSent from my Weekly Checklist.";
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
  localStorage.setItem(RECIPIENT_KEY, to);
  const subject = "My Weekly Checklist progress";
  const body = buildEmailBody();

  // Not set up yet → fall back to opening the mail app.
  if (!EMAIL_READY || !window.emailjs) {
    openMailApp(to, subject, body);
    return;
  }

  // Actually send via EmailJS — no mail app needed.
  const original = sendBtn.textContent;
  sendBtn.textContent = "Sending…";
  sendBtn.disabled = true;

  emailjs
    .send(EMAILJS.serviceId, EMAILJS.templateId, {
      to_email: to,
      subject: subject,
      message: body,
    })
    .then(function () {
      sendBtn.textContent = "✅ Sent!";
      setTimeout(function () {
        sendBtn.textContent = original;
        sendBtn.disabled = false;
      }, 2000);
    })
    .catch(function (err) {
      sendBtn.textContent = original;
      sendBtn.disabled = false;
      alert("Couldn't send automatically. Opening your mail app instead.\n\n(" + (err && err.text ? err.text : err) + ")");
      openMailApp(to, subject, body);
    });
}

// restore saved recipient
const savedRecipient = localStorage.getItem(RECIPIENT_KEY);
if (savedRecipient) recipientEl.value = savedRecipient;

sendBtn.addEventListener("click", sendEmail);
resetBtn.addEventListener("click", clearAll);

render();
