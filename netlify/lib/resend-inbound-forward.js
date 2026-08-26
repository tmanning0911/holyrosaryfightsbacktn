/**
 * Fetch inbound mail from Resend and forward a notification to Gmail.
 */
const crypto = require("crypto");

const DEFAULT_FORWARD_TO = "taylormanning33@gmail.com";
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function getForwardTo() {
  return (
    process.env.INBOUND_FORWARD_TO ||
    process.env.PRESS_RELEASE_NOTIFY_EMAIL ||
    DEFAULT_FORWARD_TO
  ).trim();
}

function getFromAddress() {
  return (
    process.env.INBOUND_FROM ||
    process.env.RESEND_FROM ||
    "Rams Fight Back <hello@holyrosaryfightsbacktn.com>"
  );
}

function normalizeHeader(headers, name) {
  if (!headers) return "";
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return String(value);
  }
  return "";
}

function verifySvixWebhook(payload, headers, secret, toleranceSeconds = 300) {
  const msgId =
    normalizeHeader(headers, "svix-id") || normalizeHeader(headers, "webhook-id");
  const msgTimestamp =
    normalizeHeader(headers, "svix-timestamp") ||
    normalizeHeader(headers, "webhook-timestamp");
  const msgSignature =
    normalizeHeader(headers, "svix-signature") ||
    normalizeHeader(headers, "webhook-signature");

  if (!msgId || !msgTimestamp || !msgSignature || !secret) return false;

  const now = Math.floor(Date.now() / 1000);
  const timestamp = parseInt(msgTimestamp, 10);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  const secretKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, "base64");
  const signedContent = `${msgId}.${msgTimestamp}.${payload}`;
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(signedContent)
    .digest("base64");

  for (const versionedSig of String(msgSignature).split(" ")) {
    const comma = versionedSig.indexOf(",");
    if (comma === -1) continue;
    const version = versionedSig.slice(0, comma);
    const sig = versionedSig.slice(comma + 1);
    if (version !== "v1" || !sig) continue;
    try {
      const expectedBuf = Buffer.from(expected, "base64");
      const sigBuf = Buffer.from(sig, "base64");
      if (
        expectedBuf.length === sigBuf.length &&
        crypto.timingSafeEqual(expectedBuf, sigBuf)
      ) {
        return true;
      }
    } catch (_) {}
  }
  return false;
}

async function claimForwardSlot(emailId) {
  try {
    const { getStore } = require("@netlify/blobs");
    const store = getStore({ name: "inbound-forwards", consistency: "strong" });
    const existing = await store.get(emailId);
    if (existing) return false;
    await store.setJSON(emailId, { at: new Date().toISOString() });
    return true;
  } catch (_) {
    return true;
  }
}

async function resendApi(apiKey, path, options = {}) {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "rams-inbound/1.0",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(body.message || body.name || "resend_api_failed");
    err.code = "resend_api_failed";
    err.status = res.status;
    err.detail = body;
    throw err;
  }
  return body;
}

async function fetchReceivedEmail(apiKey, emailId) {
  return resendApi(apiKey, `/emails/receiving/${emailId}`);
}

async function fetchAttachmentMeta(apiKey, emailId, attachmentId) {
  return resendApi(
    apiKey,
    `/emails/receiving/${emailId}/attachments/${attachmentId}`
  );
}

async function downloadAttachmentBase64(downloadUrl, maxBytes) {
  const res = await fetch(downloadUrl, {
    headers: { "User-Agent": "rams-inbound/1.0" },
  });
  if (!res.ok) {
    throw new Error(`attachment_download_failed:${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) {
    return { skipped: true, reason: "too_large", size: buf.length };
  }
  return { content: buf.toString("base64"), size: buf.length };
}

function formatAddressList(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function buildForwardSubject(subject) {
  const clean = String(subject || "(no subject)").trim();
  return `[hello@] ${clean}`;
}

function buildForwardHtml(email) {
  const from = formatAddressList(email.from);
  const to = formatAddressList(email.to);
  const cc = formatAddressList(email.cc);
  const receivedAt = email.created_at || "";
  const subject = email.subject || "(no subject)";
  const bodyHtml =
    email.html ||
    (email.text
      ? `<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(
          email.text
        )}</pre>`
      : "<p><em>No body content.</em></p>");

  return [
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#151210;">',
    '<p style="margin:0 0 12px;padding:10px 12px;background:#f6f3ea;border-left:4px solid #ffc72a;">',
    "<strong>New mail at hello@holyrosaryfightsbacktn.com</strong>",
    "</p>",
    "<table style=\"border-collapse:collapse;width:100%;margin:0 0 16px;\">",
    `<tr><td style="padding:4px 8px 4px 0;color:#666;">From</td><td>${escapeHtml(
      from
    )}</td></tr>`,
    `<tr><td style="padding:4px 8px 4px 0;color:#666;">To</td><td>${escapeHtml(
      to
    )}</td></tr>`,
  ]
    .concat(
      cc
        ? [
            `<tr><td style="padding:4px 8px 4px 0;color:#666;">Cc</td><td>${escapeHtml(
              cc
            )}</td></tr>`,
          ]
        : []
    )
    .concat([
      `<tr><td style="padding:4px 8px 4px 0;color:#666;">Subject</td><td>${escapeHtml(
        subject
      )}</td></tr>`,
      `<tr><td style="padding:4px 8px 4px 0;color:#666;">Received</td><td>${escapeHtml(
        receivedAt
      )}</td></tr>`,
      "</table>",
      '<hr style="border:none;border-top:1px solid #ddd;margin:16px 0;" />',
      bodyHtml,
      "</div>",
    ])
    .join("");
}

function buildForwardText(email) {
  const lines = [
    "New mail at hello@holyrosaryfightsbacktn.com",
    "",
    `From: ${formatAddressList(email.from)}`,
    `To: ${formatAddressList(email.to)}`,
  ];
  const cc = formatAddressList(email.cc);
  if (cc) lines.push(`Cc: ${cc}`);
  lines.push(
    `Subject: ${email.subject || "(no subject)"}`,
    `Received: ${email.created_at || ""}`,
    "",
    email.text || "(HTML-only message — open in a mail client that supports HTML.)"
  );
  return lines.join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractReplyTo(email) {
  const replyTo = email.reply_to;
  if (Array.isArray(replyTo) && replyTo.length) return replyTo[0];
  if (typeof replyTo === "string" && replyTo.trim()) return replyTo.trim();
  return formatAddressList(email.from);
}

async function loadAttachments(apiKey, email) {
  const items = Array.isArray(email.attachments) ? email.attachments : [];
  const attachments = [];
  const notes = [];

  for (const item of items.slice(0, MAX_ATTACHMENTS)) {
    if (!item || !item.id) continue;
    if (item.content_disposition === "inline" && item.content_id) continue;
    try {
      const meta = await fetchAttachmentMeta(apiKey, email.id, item.id);
      if (!meta.download_url) {
        notes.push(`${item.filename || item.id}: no download URL`);
        continue;
      }
      const downloaded = await downloadAttachmentBase64(
        meta.download_url,
        MAX_ATTACHMENT_BYTES
      );
      if (downloaded.skipped) {
        notes.push(
          `${item.filename || item.id}: skipped (${downloaded.reason}, ${
            downloaded.size
          } bytes)`
        );
        continue;
      }
      attachments.push({
        filename: item.filename || "attachment",
        content: downloaded.content,
      });
    } catch (err) {
      notes.push(`${item.filename || item.id}: ${err.message}`);
    }
  }

  return { attachments, notes };
}

/**
 * @param {{ emailId: string }} opts
 */
async function forwardReceivedEmail({ emailId }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const err = new Error("resend_not_configured");
    err.code = "resend_not_configured";
    throw err;
  }

  const claimed = await claimForwardSlot(emailId);
  if (!claimed) {
    return { skipped: "already_forwarded", emailId };
  }

  const email = await fetchReceivedEmail(apiKey, emailId);
  const to = getForwardTo();
  const from = getFromAddress();
  const replyTo = extractReplyTo(email);
  const { attachments, notes } = await loadAttachments(apiKey, email);

  let html = buildForwardHtml(email);
  if (notes.length) {
    html += `<p style="font-size:12px;color:#666;margin-top:16px;">Attachments: ${escapeHtml(
      notes.join("; ")
    )}</p>`;
  }

  const payload = {
    from,
    to: [to],
    reply_to: replyTo,
    subject: buildForwardSubject(email.subject),
    html,
    text: buildForwardText(email),
    headers: {
      "X-Rams-Inbound-Id": emailId,
    },
  };

  if (attachments.length) {
    payload.attachments = attachments;
  }

  const sent = await resendApi(apiKey, "/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return {
    emailId,
    forwardId: sent.id,
    to,
    subject: payload.subject,
    attachmentCount: attachments.length,
  };
}

module.exports = {
  verifySvixWebhook,
  forwardReceivedEmail,
  getForwardTo,
};
