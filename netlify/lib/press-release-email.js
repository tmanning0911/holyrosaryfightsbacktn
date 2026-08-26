/**
 * Build + send Rams Fight Back media pitch email via Resend.
 */
const fs = require("fs");
const path = require("path");

const SUBJECT = "Holy Rosary petition hits 25,000 signatures in 5 days";
const PETITION_URL = "https://c.org/2LMccZY9dk";

const PDF_FILENAME = "Rams-Fight-Back-Press-Release-25000-Signatures.pdf";
const TXT_FILENAME = "rams-fight-back-press-release-20000-signatures.txt";
const PITCH_NOTES_FILENAME = "rams-fight-back-press-release-20000-signatures-pitch-notes.txt";

const ROOT = path.join(__dirname, "../..");
const TEMPLATE = path.join(ROOT, "email-previews/press-release-media-pitch.html");
const PDF_PATH = path.join(ROOT, "press/rams-fight-back-press-release-25000-signatures.pdf");
const TXT_PATH = path.join(ROOT, "press", TXT_FILENAME);
const PITCH_NOTES_PATH = path.join(ROOT, "press", PITCH_NOTES_FILENAME);

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function formatCount(n) {
  return Number(n).toLocaleString("en-US");
}

async function fetchPetitionCount() {
  try {
    const base =
      process.env.URL || process.env.DEPLOY_PRIME_URL || "https://holyrosaryfightsbacktn.com";
    const res = await fetch(`${base.replace(/\/$/, "")}/api/petition-count`, {
      headers: { Accept: "application/json", "User-Agent": "rams-press-release/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const n = data.displayed != null ? data.displayed : data.total;
    return Number.isFinite(Number(n)) ? Number(n) : null;
  } catch (_) {
    return null;
  }
}

function loadTemplate() {
  if (!fs.existsSync(TEMPLATE)) throw new Error("press_release_template_missing");
  return fs.readFileSync(TEMPLATE, "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function fillTemplate(html, { countFormatted, reporterName }) {
  const name = reporterName && String(reporterName).trim() ? String(reporterName).trim() : "there";
  return html
    .split("[[PETITION_COUNT]]")
    .join(countFormatted)
    .split("[[REPORTER_NAME]]")
    .join(name);
}

function loadPdfBase64() {
  if (!fs.existsSync(PDF_PATH)) throw new Error("press_release_pdf_missing");
  return fs.readFileSync(PDF_PATH).toString("base64");
}

function buildPlainText({ countFormatted, reporterName }) {
  const name = reporterName && String(reporterName).trim() ? String(reporterName).trim() : "there";

  return [
    `Hi ${name} —`,
    "",
    "Quick follow-up to your Aug. 21 coverage: the Change.org petition to reinstate Holy Rosary principal Darren Mullis surpassed 25,000 signatures — five days after launch.",
    "",
    `Petition (live): ${PETITION_URL}`,
    "",
    "Full release attached (PDF). Interview available on background with an organizer (Ram alum). Protest photos on request (credit: Mark Weber / Daily Memphian).",
    "",
    "Reply to this email or contact hello@holyrosaryfightsbacktn.com for same-day callback.",
    "",
    "We Are Rams!",
    "Rams Fight Back",
    "hello@holyrosaryfightsbacktn.com",
    "https://holyrosaryfightsbacktn.com",
    "",
    "Attached: Rams-Fight-Back-Press-Release-25000-Signatures.pdf",
  ].join("\n");
}

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const e = email.trim();
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isPressReleaseSendEnabled() {
  return process.env.PRESS_RELEASE_SEND_ENABLED === "true";
}

/**
 * @param {{ to: string, test?: boolean, reporterName?: string, count?: number|null, approved?: boolean }} opts
 */
async function sendPressReleaseEmail({
  to,
  test = false,
  reporterName = "",
  count = null,
  approved = false,
}) {
  loadEnv();

  if (!isPressReleaseSendEnabled()) {
    const err = new Error("press_release_local_only");
    err.code = "press_release_local_only";
    err.message =
      "Press release is local-only until the PDF is fixed. Preview in press/ or run python3 serve.py → /press/. To send later: set PRESS_RELEASE_SEND_ENABLED=true after triple-confirm.";
    throw err;
  }

  const gateOpen =
    approved === true || process.env.PRESS_RELEASE_SEND_APPROVED === "true";
  if (!gateOpen) {
    const err = new Error("press_release_locked");
    err.code = "press_release_locked";
    err.message =
      "Press release send is locked. Triple-confirm in chat, then pass approved: true or set PRESS_RELEASE_SEND_APPROVED=true.";
    throw err;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const err = new Error("resend_not_configured");
    err.code = "resend_not_configured";
    throw err;
  }

  const recipient = String(to).trim().toLowerCase();
  if (!isValidEmail(recipient)) {
    const err = new Error("invalid_email");
    err.code = "invalid_email";
    throw err;
  }

  let total = count;
  if (total == null) total = await fetchPetitionCount();
  if (total == null) total = 25000;
  const countFormatted = formatCount(total);

  const from =
    process.env.RESEND_FROM || "Rams Fight Back <hello@holyrosaryfightsbacktn.com>";
  const replyTo = process.env.RESEND_REPLY_TO || "hello@holyrosaryfightsbacktn.com";
  const html = fillTemplate(loadTemplate(), { countFormatted, reporterName });
  const text = buildPlainText({ countFormatted, reporterName });
  const pdf = loadPdfBase64();

  const subject = test ? `[TEST] ${SUBJECT}` : SUBJECT;

  const payload = {
    from,
    to: [recipient],
    reply_to: replyTo,
    subject,
    html,
    text,
    attachments: [
      {
        filename: PDF_FILENAME,
        content: pdf,
      },
    ],
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "rams-press-release/1.0",
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

  return { id: body.id, to: recipient, subject, count: total };
}

module.exports = {
  SUBJECT,
  PETITION_URL,
  PDF_FILENAME,
  isPressReleaseSendEnabled,
  sendPressReleaseEmail,
  isValidEmail,
  fetchPetitionCount,
};
