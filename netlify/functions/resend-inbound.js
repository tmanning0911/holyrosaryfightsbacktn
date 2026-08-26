/**
 * POST /api/resend-inbound
 *
 * Resend webhook for inbound mail (email.received).
 * Verifies Svix signature, fetches the message, forwards to Gmail.
 */
const {
  verifySvixWebhook,
  forwardReceivedEmail,
} = require("../lib/resend-inbound-forward");

function json(status, data) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(data),
  };
}

function getRawBody(event) {
  if (!event.body) return "";
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
}

function getHeaders(event) {
  return event.headers || {};
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const rawBody = getRawBody(event);
  const headers = getHeaders(event);
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (secret) {
    const valid = verifySvixWebhook(rawBody, headers, secret);
    if (!valid) {
      console.error("resend-inbound invalid_signature");
      return json(401, { ok: false, error: "invalid_signature" });
    }
  } else {
    console.warn("resend-inbound: RESEND_WEBHOOK_SECRET not set — accepting webhook");
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch (_) {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const type = payload.type;
  if (type !== "email.received") {
    return json(200, { ok: true, skipped: "ignored_event", type });
  }

  const emailId =
    payload.data && payload.data.email_id
      ? String(payload.data.email_id)
      : payload.data && payload.data.id
        ? String(payload.data.id)
        : "";

  if (!emailId) {
    return json(400, { ok: false, error: "missing_email_id" });
  }

  try {
    const result = await forwardReceivedEmail({ emailId });
    console.log("resend-inbound ok", result.emailId, result.forwardId, result.to);
    return json(200, { ok: true, ...result });
  } catch (err) {
    const code = err && err.code ? err.code : "forward_failed";
    console.error("resend-inbound", code, err && err.message, err && err.detail);
    return json(502, {
      ok: false,
      error: code,
      message: String(err && err.message ? err.message : err),
    });
  }
};
