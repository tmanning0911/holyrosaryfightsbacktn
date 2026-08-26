/**
 * Build + send the Rams Fight Back welcome email via Resend.
 */
const fs = require("fs");
const path = require("path");

const SUBJECT = "You’re on the Rams Fight Back list — next, sign if you haven’t";
const TEMPLATE_CANDIDATES = [
  path.join(__dirname, "../../email-previews/welcome.html"),
  path.join(process.cwd(), "email-previews/welcome.html"),
];

function loadTemplate() {
  for (const file of TEMPLATE_CANDIDATES) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    } catch (_) {}
  }
  throw new Error("welcome_template_missing");
}

/** Strip preview-only scripts before send. */
function stripScripts(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function formatCount(n) {
  return Number(n).toLocaleString("en-US");
}

function buildPlainText(countFormatted) {
  return [
    "You’re on the Rams Fight Back list.",
    "",
    `${countFormatted} Rams have signed for Darren. Parent, alum, friend — if you stand with him, you’re a Ram.`,
    "",
    "If you haven’t signed yet:",
    "https://holyrosaryfightsbacktn.com/ramsfightback",
    "",
    "When you’re ready to call:",
    "Pastor James Clark — 901-767-6949",
    "Bishop David Talley — 901-373-1200",
    "Dr. Chris Fay (Catholic Schools) — 901-373-1221",
    "",
    "We’ll email you when we hit 25,000 and when the gathering is planned.",
    "",
    "— Rams Fight Back",
    "https://holyrosaryfightsbacktn.com/",
    "",
    "To stop these emails, reply with unsubscribe.",
  ].join("\n");
}

async function fetchPetitionCount() {
  try {
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "https://holyrosaryfightsbacktn.com";
    const res = await fetch(`${base.replace(/\/$/, "")}/api/petition-count`, {
      headers: { Accept: "application/json", "User-Agent": "rams-welcome/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const n = data.displayed != null ? data.displayed : data.total;
    return Number.isFinite(Number(n)) ? Number(n) : null;
  } catch (_) {
    return null;
  }
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const e = email.trim();
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/**
 * @param {{ email: string, count?: number|null }} opts
 */
async function sendWelcomeEmail({ email, count = null }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const err = new Error("resend_not_configured");
    err.code = "resend_not_configured";
    throw err;
  }

  const to = String(email).trim().toLowerCase();
  if (!isValidEmail(to)) {
    const err = new Error("invalid_email");
    err.code = "invalid_email";
    throw err;
  }

  // Dedup: client + form hook can both fire for one signup
  const claimed = await claimWelcomeSlot(to);
  if (!claimed) {
    return { id: null, to, subject: SUBJECT, count: null, skipped: "already_sent" };
  }

  let total = count;
  if (total == null) total = await fetchPetitionCount();
  if (total == null) total = 0;
  const countFormatted = formatCount(total);

  let html = stripScripts(loadTemplate());
  html = html.split("[[PETITION_COUNT]]").join(countFormatted);

  const from =
    process.env.RESEND_FROM || "Rams Fight Back <hello@holyrosaryfightsbacktn.com>";
  const replyTo = process.env.RESEND_REPLY_TO || "hello@holyrosaryfightsbacktn.com";

  const payload = {
    from,
    to: [to],
    reply_to: replyTo,
    subject: SUBJECT,
    html,
    text: buildPlainText(countFormatted),
    headers: {
      "List-Unsubscribe": `<mailto:${replyTo}?subject=unsubscribe>`,
    },
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "rams-welcome/1.0",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (_) {
    body = { raw: bodyText };
  }

  if (!res.ok) {
    const err = new Error(body.message || body.name || "resend_send_failed");
    err.code = "resend_send_failed";
    err.status = res.status;
    err.detail = body;
    throw err;
  }

  return { id: body.id, to, subject: SUBJECT, count: total };
}

async function claimWelcomeSlot(email) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${email}`;
  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: "welcome-sends", consistency: "strong" });
    const existing = await store.get(key);
    if (existing) return false;
    await store.setJSON(key, { at: new Date().toISOString(), email });
    return true;
  } catch (_) {
    // Blobs unavailable (local) — allow send
    return true;
  }
}

module.exports = {
  SUBJECT,
  isValidEmail,
  sendWelcomeEmail,
  fetchPetitionCount,
};
