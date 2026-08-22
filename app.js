/* Petition + letter */
const SITE = "https://holyrosaryfightsbacktn.com";
const PETITION_ENDPOINT = "";
const KEY = "hrfb_petition";

const TO = [
  "hrpastor@holyrosarymemphis.org",
  "chancellor@cc.cdom.org",
  "churchoffice@holyrosarymemphis.org",
  "chris.fay@cc.cdom.org",
  "nic.antoine@cc.cdom.org",
  "rick.ouellette@cc.cdom.org",
].join(",");

const LETTER_BODY = (name, role) => `Father Clark, Bishop Talley, Dr. Fay, Mr. Antoine:

I am a ${role}. Put Darren Mullis back as principal of Holy Rosary.

He has been ours since he was a little boy. Principal since 2003. On August 19 you sent a letter with no reason. On August 21 you hid behind “confidential.” That is not good enough.

Father Clark has been pastor four months and still works downtown as chancellor. He does not know this community. Darren does.

Until Darren is back I am done tithing here and done attending here. I will take my family to a parish where the priest knows the people.

Bring him home.

${name}
${role}`;

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocal(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

function renderWall(list) {
  const wall = document.getElementById("wall");
  const count = document.getElementById("signCount");
  if (count) count.textContent = String(list.length);
  if (!wall) return;
  wall.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Line 1 is empty. That’s you.";
    wall.appendChild(li);
    return;
  }
  const show = list.slice().reverse();
  show.forEach((row) => {
    const li = document.createElement("li");
    const note = row.note ? ` — ${row.note}` : "";
    li.innerHTML = `${escapeHtml(row.name)} <span>${escapeHtml(row.role)}${escapeHtml(note)}</span>`;
    wall.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function alreadySigned(name) {
  const n = name.trim().toLowerCase();
  return loadLocal().some((r) => (r.name || "").trim().toLowerCase() === n);
}

async function pullRemote() {
  if (!PETITION_ENDPOINT) return loadLocal();
  try {
    const res = await fetch(`${PETITION_ENDPOINT}?t=${Date.now()}`);
    const data = await res.json();
    if (Array.isArray(data.signatures)) {
      saveLocal(data.signatures);
      return data.signatures;
    }
  } catch {
    /* stay on local */
  }
  return loadLocal();
}

document.getElementById("petitionForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("pName").value.trim();
  const role = document.getElementById("pRole").value;
  const note = document.getElementById("pNote").value.trim();
  const ok = document.getElementById("pOk").checked;
  const msg = document.getElementById("pMsg");
  const btn = e.target.querySelector("button[type=submit]");
  if (!name || !ok) {
    msg.textContent = "Name and the checkbox.";
    return;
  }
  if (alreadySigned(name)) {
    msg.textContent = "That name is already on this sheet.";
    return;
  }
  const row = { name, role, note, at: new Date().toISOString() };
  btn.disabled = true;
  if (PETITION_ENDPOINT) {
    try {
      await fetch(PETITION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(row),
      });
    } catch {
      msg.textContent = "Couldn’t reach the shared list. Saved on this computer anyway.";
    }
  }
  try {
    await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "form-name": "petition",
        name: row.name,
        role: row.role,
        note: row.note,
      }).toString(),
    });
  } catch {
    /* local / GitHub Pages — Netlify form is a bonus when that host is live */
  }
  const list = loadLocal();
  list.push(row);
  saveLocal(list);
  renderWall(list);
  e.target.reset();
  document.getElementById("pOk").checked = false;
  msg.className = "msg ok";
  msg.textContent = PETITION_ENDPOINT
    ? `You’re on the sheet. ${list.length} name${list.length === 1 ? "" : "s"}. Text this page to five Rams.`
    : `You’re on this computer’s sheet (${list.length}). Hook the Google Sheet in app.js so names from every phone land in one place.`;
  btn.disabled = false;
});

function letterText() {
  const name = document.getElementById("fromName")?.value.trim() || "[Your name]";
  const role = document.getElementById("fromRole")?.value || "supporter";
  return LETTER_BODY(name, role);
}

function refreshLetter() {
  const el = document.getElementById("letterPreview");
  if (el) el.textContent = letterText();
}

document.getElementById("fromName")?.addEventListener("input", refreshLetter);
document.getElementById("fromRole")?.addEventListener("change", refreshLetter);
refreshLetter();

document.getElementById("sendEmail")?.addEventListener("click", () => {
  const subject = encodeURIComponent("Put Darren Mullis back — signed the petition");
  window.location.href = `mailto:${TO}?subject=${subject}&body=${encodeURIComponent(letterText())}`;
});

document.getElementById("copyLetter")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(letterText());
    document.getElementById("copyLetter").textContent = "Copied";
    setTimeout(() => (document.getElementById("copyLetter").textContent = "Copy it"), 1600);
  } catch {
    prompt("Copy:", letterText());
  }
});

document.getElementById("shareBtn")?.addEventListener("click", async () => {
  const data = {
    title: "Put Darren Mullis back",
    text: "Sign the petition. Stop tithing. Stop attending Holy Rosary until they bring Darren home.",
    url: SITE + "/#petition",
  };
  if (navigator.share) {
    try { await navigator.share(data); } catch { /* cancelled */ }
  } else {
    await navigator.clipboard.writeText(`${data.text} ${data.url}`);
    alert("Copied. Paste it in a text.");
  }
});

const menuBtn = document.getElementById("menuBtn");
const navLinks = document.getElementById("navLinks");
menuBtn?.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});

pullRemote().then(renderWall);
renderWall(loadLocal());

window.exportPetition = function () {
  const rows = [["name", "role", "note", "at"], ...loadLocal().map((r) => [r.name, r.role, r.note, r.at])];
  const csv = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "holy-rosary-petition.csv";
  a.click();
};
