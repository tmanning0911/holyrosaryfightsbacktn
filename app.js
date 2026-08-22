/* Petition + letter */
const SITE = "https://holyrosaryfightsbacktn.com";
const PETITION_URL = "https://c.org/QLChJDQdbz";
const PETITION_ENDPOINT = "";
const KEY = "hrfb_petition";

const SEED = [];

function mergeList(list) {
  const extra = Array.isArray(list) ? list : loadLocal();
  const taken = new Set(SEED.map((s) => s.name.trim().toLowerCase()));
  const rest = extra.filter((r) => !taken.has((r.name || "").trim().toLowerCase()));
  return SEED.concat(rest);
}

const TO = [
  "hrpastor@holyrosarymemphis.org",
  "chancellor@cc.cdom.org",
  "churchoffice@holyrosarymemphis.org",
  "chris.fay@cc.cdom.org",
  "nic.antoine@cc.cdom.org",
  "rick.ouellette@cc.cdom.org",
].join(",");

const LETTER_BODY = (name, role) => `The Very Reverend James M. Clark, J.C.D.
The Most Reverend David P. Talley
Dr. Chris Fay
Mr. Pierre Nic Antoine

I am a ${role} writing in my own name, in communion with the Holy Father and with the Bishop of Memphis.

I respectfully request that Darren Mullis be restored as principal of Holy Rosary Catholic School.

He has belonged to this parish from childhood and has served as principal since 2003. On 19 August a letter announced his “departure” without a public cause. On 21 August Holy Rosary Parish and Catholic Schools of Memphis called the matter confidential. Confidentiality may protect a man’s good name (can. 220). It does not relieve a pastor of the duty to care for the flock.

Father Clark has been pastor four months and retains the offices of chancellor and judicial vicar. We honor those offices. We ask that the man who knows this community be returned to the hallway.

Until that is done I will fulfill the Sunday obligation (can. 1247) at another Catholic parish, and I will direct my free-will offerings there. I do not omit Mass. I do not leave the Church.

The petition of the faithful: https://c.org/QLChJDQdbz

Respectfully in Christ,

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
  const combined = mergeList(list);
  if (!wall) return;
  wall.innerHTML = "";
  const show = combined.slice().reverse();
  if (!show.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No names on this sheet yet.";
    wall.appendChild(li);
    return;
  }
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
  return mergeList().some((r) => (r.name || "").trim().toLowerCase() === n);
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
  msg.textContent = `Your name is with the petition. Share this page with the faithful who know this school.`;
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
  const subject = encodeURIComponent("Respectful petition: restoration of Principal Darren Mullis");
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

const CAPITAL_TO = [
  "hrpastor@holyrosarymemphis.org",
  "churchoffice@holyrosarymemphis.org",
].join(",");

function capitalText() {
  return (document.getElementById("capitalPreview")?.innerText || "").trim();
}

document.getElementById("sendCapital")?.addEventListener("click", () => {
  const subject = encodeURIComponent("Request to return my Holy Rosary capital improvement gift");
  window.location.href = `mailto:${CAPITAL_TO}?subject=${subject}&body=${encodeURIComponent(capitalText())}`;
});

document.getElementById("copyCapital")?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(capitalText());
    document.getElementById("copyCapital").textContent = "Copied";
    setTimeout(() => (document.getElementById("copyCapital").textContent = "Copy it"), 1600);
  } catch {
    prompt("Copy:", capitalText());
  }
});

document.getElementById("shareBtn")?.addEventListener("click", async () => {
  const data = {
    title: "Petition to restore Principal Darren Mullis",
    text: "The faithful of Holy Rosary are petitioning to restore Principal Darren Mullis. Sign: ",
    url: PETITION_URL,
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
  menuBtn.textContent = open ? "Close" : "Menu";
});
navLinks?.querySelectorAll("a").forEach((a) => {
  a.addEventListener("click", () => {
    navLinks.classList.remove("open");
    menuBtn?.setAttribute("aria-expanded", "false");
    if (menuBtn) menuBtn.textContent = "Menu";
  });
});

const flip = document.getElementById("flip");
if (flip && !sessionStorage.getItem("hrfb_flip_v2")) {
  const seen = () => sessionStorage.setItem("hrfb_flip_v2", "1");
  const shut = () => {
    flip.close();
    seen();
  };
  const open = () => {
    if (typeof flip.showModal === "function") flip.showModal();
  };
  const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = () => (quiet ? open() : setTimeout(open, 650));
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
  document.getElementById("flipClose")?.addEventListener("click", shut);
  document.getElementById("flipSkip")?.addEventListener("click", shut);
  document.getElementById("flipSign")?.addEventListener("click", seen);
  flip.addEventListener("cancel", seen);
  flip.addEventListener("click", (e) => {
    if (e.target === flip) shut();
  });
}

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
