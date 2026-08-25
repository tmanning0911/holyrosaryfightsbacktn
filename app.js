/* Petition + letter */
const SITE = "https://holyrosaryfightsbacktn.com";
const PETITION_URL = "https://c.org/2LMccZY9dk";
const PETITION_COUNT_URL = "/api/petition-count";
const CAMPAIGN_URL = "/data/campaign.json";
const MATCH_PER_SIGNATURE = 100;
/* Paste your Page URL here when you have it (e.g. https://www.facebook.com/YourPage) */
const FACEBOOK_PAGE = "https://www.facebook.com/holyrosaryfightsbacktn";
const PETITION_ENDPOINT = "";
const KEY = "hrfb_petition";

const SEED = [];
let changeSigners = [];

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
  "rick.ouellette@cc.cdom.org",
].join(",");

const LETTER_BODY = (name, role) => `The Very Reverend James M. Clark, J.C.D.
The Most Reverend David P. Talley
Dr. Chris Fay

I am a ${role} writing in my own name, in communion with the Holy Father and with the Bishop of Memphis.

I respectfully request that Darren Mullis be restored as principal of Holy Rosary Catholic School.

He has belonged to this parish from childhood and has served as principal since 2003. On 19 August a letter announced his “departure” without a public cause. On 21 August Holy Rosary Parish and Catholic Schools of Memphis called the matter confidential. Confidentiality may protect a man’s good name (can. 220). It does not relieve a pastor of the duty to care for the flock.

Father Clark has been pastor four months and retains the offices of chancellor and judicial vicar. We honor those offices. We ask that the man who knows this community be returned to the hallway.

Until that is done I will fulfill the Sunday obligation (can. 1247) at another Catholic parish, and I will direct my free-will offerings there. I do not omit Mass. I do not leave the Church.

The petition of the faithful: https://c.org/2LMccZY9dk

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
  if (!wall) return;
  wall.innerHTML = "";

  const fromChange = changeSigners.map((s) => ({
    name: s.name,
    role: formatSignerWhen(s),
    note: "",
    comment: s.comment || "",
    at: s.at || "",
    source: "change",
  }));
  const local = mergeList(list).map((r) => ({
    ...r,
    role: r.role ? `${r.role} · this site` : "this site",
    source: "local",
  }));
  const seen = new Set(fromChange.map((r) => (r.name || "").trim().toLowerCase()));
  const combined = fromChange.concat(
    local.filter((r) => !seen.has((r.name || "").trim().toLowerCase()))
  );

  if (!combined.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Loading names from Change.org…";
    wall.appendChild(li);
    return;
  }

  combined.forEach((row) => {
    const li = document.createElement("li");
    if (row.source === "change") li.classList.add("from-change");
    const note = row.note ? ` — ${row.note}` : "";
    const comment = row.comment
      ? `<span class="wall-comment">${escapeHtml(row.comment)}</span>`
      : "";
    li.innerHTML = `${escapeHtml(row.name)} <span>${escapeHtml(row.role)}${escapeHtml(note)}</span>${comment}`;
    wall.appendChild(li);
  });
}

function formatSignerWhen(s) {
  if (s && s.at) {
    const rel = relativeTime(s.at);
    if (rel) return rel;
  }
  return (s && s.relative) || "Change.org";
}

function relativeTime(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))} min ago`;
  if (sec < 86400) {
    const h = Math.round(sec / 3600);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  const d = Math.round(sec / 86400);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

function setWallUpdated(iso) {
  const el = document.getElementById("wallUpdated");
  if (!el || !iso) return;
  const rel = relativeTime(iso);
  el.textContent = rel ? `Updated ${rel}` : "Live names";
  el.title = "";
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

/* Entry popup removed — hero + dock carry the Sign CTA */

if (FACEBOOK_PAGE) {
  document.querySelectorAll("#fbPage, #fbPageFoot").forEach((a) => {
    a.href = FACEBOOK_PAGE;
  });
}

let campaignBoards = {
  perSignature: MATCH_PER_SIGNATURE,
  match: true,
  goal: 1000000,
  note: "$100 matched per Change.org signature · up to $1 million · capital gift in Darren’s honor",
  funder:
    "We are no longer moving forward with the billboards. A Ram alum still matches $100 for every Change.org signature, up to $1 million — and those funds will now be donated in honor of Darren Mullis toward Holy Rosary’s capital improvement campaign. We continue collecting signatures for the petition. This is not a donation through Change.org.",
};
let lastPetitionTotal = null;
let lastPetitionGoal = null;

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function syncBoardsFromSignatures() {
  const per = Number(campaignBoards.perSignature) || MATCH_PER_SIGNATURE;
  if (lastPetitionTotal == null || Number.isNaN(lastPetitionTotal)) {
    renderBoardsFund(campaignBoards);
    return;
  }
  const raised = lastPetitionTotal * per;
  const goal =
    lastPetitionGoal != null && !Number.isNaN(lastPetitionGoal)
      ? lastPetitionGoal * per
      : campaignBoards.goal != null
        ? Number(campaignBoards.goal)
        : null;
  renderBoardsFund({
    ...campaignBoards,
    raised,
    goal,
    signatures: lastPetitionTotal,
    perSignature: per,
    updatedAt: campaignBoards.updatedAt || new Date().toISOString(),
  });
}

function renderBoardsFund(boards) {
  if (!boards || typeof boards !== "object") return;
  const raised = boards.raised != null ? Number(boards.raised) : null;
  const goal = boards.goal != null ? Number(boards.goal) : null;
  const per = Number(boards.perSignature) || MATCH_PER_SIGNATURE;
  const sigs = boards.signatures != null ? Number(boards.signatures) : null;
  const raisedLabel = money(raised);
  const goalLabel = money(goal);
  const hasTotal = raisedLabel != null;

  const raisedEl = document.getElementById("boardsRaised");
  const subEl = document.getElementById("boardsSub");
  const barEl = document.getElementById("boardsBar");
  const goalLine = document.getElementById("boardsGoalLine");
  const noteEl = document.getElementById("boardsNote");
  const updatedEl = document.getElementById("boardsUpdated");
  const miniRaised = document.getElementById("boardsRaisedMini");
  const miniGoal = document.getElementById("boardsGoalMini");

  if (subEl) {
    subEl.textContent =
      boards.note ||
      `Every signature = ${money(per) || "$100"} matched toward capital improvement in Darren’s honor`;
  }
  if (noteEl) {
    noteEl.textContent =
      boards.funder ||
      "We are no longer moving forward with the billboards. A Ram alum still matches $100 for every Change.org signature, up to $1 million — and those funds will now be donated in honor of Darren Mullis toward Holy Rosary’s capital improvement campaign. We continue collecting signatures for the petition. This is not a donation through Change.org.";
  }
  if (updatedEl) {
    if (sigs != null) {
      updatedEl.textContent = `Live with ${new Intl.NumberFormat("en-US").format(sigs)} signatures`;
    } else if (boards.updatedAt) {
      const rel = relativeTime(boards.updatedAt);
      updatedEl.textContent = rel ? `Updated ${rel}` : "Live";
    } else {
      updatedEl.textContent = hasTotal ? "Live" : "Standing";
    }
  }

  if (raisedEl) {
    raisedEl.textContent = hasTotal ? raisedLabel : "—";
  }
  if (goalLine) {
    if (hasTotal && goalLabel) {
      goalLine.textContent =
        raised >= goal
          ? `Match goal met — ${money(per)} per signature keeps going.`
          : `Toward ${goalLabel} · ${money(per)} matched per signature`;
    } else if (hasTotal && sigs != null) {
      goalLine.textContent = `${new Intl.NumberFormat("en-US").format(sigs)} signatures × ${money(per)} = ${raisedLabel} matched`;
    } else if (hasTotal) {
      goalLine.textContent = "Matched toward capital improvement in Darren’s honor";
    } else {
      goalLine.textContent = "Signs unlock the match.";
    }
  }
  if (barEl) {
    if (hasTotal && goal && goal > 0) {
      const pct = Math.max(3, Math.min(100, Math.round((raised / goal) * 100)));
      barEl.style.width = pct + "%";
    } else if (hasTotal) {
      barEl.style.width = "100%";
    } else {
      barEl.style.width = "8%";
    }
  }

  if (miniRaised && hasTotal) {
    miniRaised.textContent = raisedLabel;
  }
  if (miniGoal) {
    miniGoal.textContent =
      "A Ram alum matches $100 per Change.org signature toward Holy Rosary’s capital improvement campaign, up to $1 million — donated in honor of Darren Mullis. We are no longer moving forward with the billboards. We continue collecting signatures. Not a donation through Change.org.";
  }
}

async function loadCampaign() {
  try {
    const res = await fetch(`${CAMPAIGN_URL}?t=${Date.now()}`, { credentials: "omit" });
    if (!res.ok) {
      syncBoardsFromSignatures();
      return;
    }
    const data = await res.json();
    if (data && data.boards) {
      campaignBoards = { ...campaignBoards, ...data.boards };
    }
    syncBoardsFromSignatures();
  } catch {
    syncBoardsFromSignatures();
  }
}

async function loadPetitionCount() {
  const box = document.getElementById("petitionTally");
  const num = document.getElementById("petitionCount");
  const bar = document.getElementById("petitionBar");
  const goalEl = document.getElementById("petitionGoal");
  try {
    const res = await fetch(PETITION_COUNT_URL, { credentials: "omit" });
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.ok) return;

    /* Count + board match only (names wall removed from the site) */
    if (box && num && data.total != null) {
      const total = Number(data.total);
      const goal = data.goal ? Number(data.goal) : null;
      lastPetitionTotal = total;
      lastPetitionGoal = goal && goal > 0 ? goal : null;
      num.textContent = new Intl.NumberFormat("en-US").format(total);
      box.hidden = false;
      if (goal && goal > 0 && bar) {
        const pct = Math.max(2, Math.min(100, Math.round((total / goal) * 100)));
        bar.style.width = pct + "%";
        if (goalEl) {
          goalEl.textContent =
            total >= goal
              ? "Next goal coming — keep signing."
              : `Toward ${new Intl.NumberFormat("en-US").format(goal)} on Change.org`;
        }
      } else if (goalEl) {
        goalEl.textContent = "Live from Change.org";
      }
      syncBoardsFromSignatures();
    }
  } catch {
    /* tally stays as-is */
  }
}
loadPetitionCount();
loadCampaign();
setInterval(() => {
  loadPetitionCount();
  loadCampaign();
}, 60_000);

const dock = document.querySelector(".dock");
if (dock) {
  const syncDock = () => {
    const show = window.scrollY > Math.min(window.innerHeight * 0.55, 420);
    dock.classList.toggle("show", show);
  };
  syncDock();
  window.addEventListener("scroll", syncDock, { passive: true });
}

window.exportPetition = function () {
  const rows = [["name", "role", "note", "at"], ...loadLocal().map((r) => [r.name, r.role, r.note, r.at])];
  const csv = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "holy-rosary-petition.csv";
  a.click();
};

function openFoldFromHash() {
  const id = (location.hash || "").replace(/^#/, "");
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  const fold = el.matches("details.fold") ? el : el.closest("details.fold");
  if (fold) fold.open = true;
}
openFoldFromHash();
window.addEventListener("hashchange", openFoldFromHash);
