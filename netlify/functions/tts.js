/**
 * POST /api/tts — ElevenLabs speech (local preview / gated deploy).
 * Body JSON: { "text": "…" }
 */
const { getConfig, isEnabled, synthesizeSpeech } = require("../lib/elevenlabs-tts");

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(status, data) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors(),
    },
    body: JSON.stringify(data),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }

  if (event.httpMethod === "GET") {
    const cfg = getConfig();
    return json(200, {
      ok: true,
      enabled: cfg.enabled,
      voiceConfigured: Boolean(cfg.voiceId),
      voiceId: cfg.voiceId,
      voiceName: cfg.voiceName,
      modelId: cfg.modelId,
      localPreview: process.env.ELEVENLABS_LOCAL_ONLY === "true",
    });
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  if (!isEnabled()) {
    return json(503, { ok: false, error: "elevenlabs_not_configured" });
  }

  let body = {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body || "{}";
    body = JSON.parse(raw);
  } catch (_) {
    return json(400, { ok: false, error: "invalid_json" });
  }

  try {
    const { buffer, contentType, chars } = await synthesizeSpeech(body.text);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-TTS-Chars": String(chars),
        ...cors(),
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return json(err.status || 500, {
      ok: false,
      error: err.code || err.message || "tts_failed",
      detail: err.detail || undefined,
    });
  }
};
