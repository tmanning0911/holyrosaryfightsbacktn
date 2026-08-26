/**
 * Alert when the petition crosses the press-release milestone (20,000 signatures).
 * Heads-up only — does not send the release to media (triple-confirm gate).
 */
const THRESHOLD = 20000;
const BLOB_KEY = "notified-20k";
const STORE_NAME = "press-milestones";

async function claimNotifySlot() {
  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const existing = await store.get(BLOB_KEY);
    if (existing) return false;
    await store.setJSON(BLOB_KEY, {
      at: new Date().toISOString(),
      threshold: THRESHOLD,
    });
    return true;
  } catch (_) {
    // Blobs unavailable locally — allow one notify attempt
    return true;
  }
}

async function sendMilestoneAlert({ total, displayed }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { skipped: "resend_not_configured" };
  }

  const to =
    process.env.PRESS_RELEASE_NOTIFY_EMAIL ||
    process.env.PRESS_RELEASE_ALERT_TO ||
    "taylormanning33@gmail.com";
  const from =
    process.env.RESEND_FROM || "Rams Fight Back <hello@holyrosaryfightsbacktn.com>";
  const replyTo = process.env.RESEND_REPLY_TO || "hello@holyrosaryfightsbacktn.com";
  const count = displayed != null ? displayed : total;

  const subject = `20,000 signatures — press release ready (now at ${Number(count).toLocaleString("en-US")})`;
  const text = [
    "The Change.org petition has crossed 20,000 signatures.",
    "",
    `Live count: ${Number(count).toLocaleString("en-US")}`,
    `Threshold: ${THRESHOLD.toLocaleString("en-US")}`,
    `At: ${new Date().toISOString()}`,
    "",
    "Press release is written for this milestone. Triple-confirm in chat before sending to media.",
    "",
    "Local send (per reporter):",
    "  node scripts/send-press-release-test.js reporter@outlet.com FirstName",
    "",
    "Files: press/rams-fight-back-press-release-20000-signatures.pdf",
    "Petition: https://c.org/2LMccZY9dk",
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "rams-press-milestone/1.0",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: replyTo,
      subject,
      text,
    }),
  });

  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (_) {
    body = { raw: bodyText };
  }

  if (!res.ok) {
    const err = new Error(body.message || body.name || "milestone_alert_failed");
    err.detail = body;
    throw err;
  }

  return { id: body.id, to, total: count, threshold: THRESHOLD };
}

/**
 * @param {{ total?: number, displayed?: number }} feed
 */
async function maybeNotifyPressReleaseMilestone(feed) {
  const displayed = feed && feed.displayed != null ? Number(feed.displayed) : null;
  const total = feed && feed.total != null ? Number(feed.total) : null;
  const count = displayed != null && !Number.isNaN(displayed) ? displayed : total;

  if (process.env.PRESS_RELEASE_MILESTONE_ALERTS !== "true") {
    return {
      ok: true,
      triggered: false,
      count,
      threshold: THRESHOLD,
      skipped: "alerts_disabled",
    };
  }

  if (count == null || Number.isNaN(count) || count < THRESHOLD) {
    return { ok: true, triggered: false, count, threshold: THRESHOLD };
  }

  const claimed = await claimNotifySlot();
  if (!claimed) {
    return { ok: true, triggered: false, count, threshold: THRESHOLD, skipped: "already_notified" };
  }

  const alert = await sendMilestoneAlert({ total, displayed: count });
  return { ok: true, triggered: true, count, threshold: THRESHOLD, alert };
}

module.exports = {
  THRESHOLD,
  maybeNotifyPressReleaseMilestone,
};
