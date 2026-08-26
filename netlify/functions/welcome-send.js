/**
 * POST /api/welcome-send
 *
 * Client JSON: { "email": "…", "email_ok": true }
 * Netlify Form notification webhook: { form_name, email, data: { email, email_ok } }
 */
const { isValidEmail, sendWelcomeEmail } = require("../lib/welcome-email");

function json(status, data) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(data),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  const ct =
    (event.headers &&
      (event.headers["content-type"] || event.headers["Content-Type"])) ||
    "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const out = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
  }
  try {
    const parsed = JSON.parse(raw);
    // Netlify form notifications sometimes wrap as { payload: submission }
    if (parsed && parsed.payload && typeof parsed.payload === "object") {
      return parsed.payload;
    }
    return parsed;
  } catch (_) {
    return {};
  }
}

function truthyOptIn(value) {
  return (
    value === true ||
    value === "true" ||
    value === "on" ||
    value === "1" ||
    value === "yes" ||
    value === undefined ||
    value === null ||
    value === ""
  );
}

function normalizePayload(body) {
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const email = String(
    body.email || data.email || data.Email || ""
  ).trim();
  const formName = body.form_name || body.formName || data["form-name"] || "";
  const bot =
    body["bot-field"] ||
    body.bot_field ||
    data["bot-field"] ||
    data.bot_field ||
    "";

  // Footer has no checkbox — always treat as opt-in.
  // Hero uses email_ok; Netlify stores checkbox as "on".
  let emailOkRaw = body.email_ok;
  if (emailOkRaw === undefined || emailOkRaw === null) {
    emailOkRaw = data.email_ok;
  }
  if (
    String(formName).includes("mobilize-footer") &&
    (emailOkRaw === undefined || emailOkRaw === null)
  ) {
    emailOkRaw = true;
  }

  return {
    email,
    emailOk: truthyOptIn(emailOkRaw),
    bot: Boolean(bot && String(bot).trim()),
    formName: String(formName),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const body = parseBody(event);
  const { email, emailOk, bot, formName } = normalizePayload(body);

  if (bot) {
    return json(200, { ok: true, skipped: "bot" });
  }

  // Only auto-send for mobilize forms (or bare client posts with no form name)
  if (
    formName &&
    !formName.includes("mobilize") &&
    formName !== "newsletter"
  ) {
    return json(200, { ok: true, skipped: "wrong_form", formName });
  }

  if (!emailOk) {
    return json(200, { ok: true, skipped: "email_opt_out" });
  }

  if (!isValidEmail(email)) {
    return json(400, { ok: false, error: "invalid_email" });
  }

  try {
    const result = await sendWelcomeEmail({ email });
    if (result.skipped) {
      return json(200, { ok: true, skipped: result.skipped, to: result.to });
    }
    console.log("welcome-send ok", result.to, result.id, formName || "client");
    return json(200, { ok: true, id: result.id, to: result.to });
  } catch (err) {
    const code = err && err.code ? err.code : "send_failed";
    if (code === "resend_not_configured") {
      return json(503, { ok: false, error: code });
    }
    console.error("welcome-send", code, err && err.message, err && err.detail);
    return json(502, {
      ok: false,
      error: code,
      message: String(err && err.message ? err.message : err),
    });
  }
};
