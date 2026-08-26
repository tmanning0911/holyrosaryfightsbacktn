/**
 * ElevenLabs text-to-speech — server-side only (never expose API key to browser).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../..");
const MAX_CHARS = 3200;
const DEFAULT_MODEL = "eleven_v3";
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah — mature, reassuring, confident
const DEFAULT_VOICE_NAME = "Sarah";
const OUTPUT_FORMAT = "mp3_44100_128";

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

function isEnabled() {
  loadEnv();
  if (process.env.ELEVENLABS_ENABLED === "false") return false;
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function getConfig() {
  loadEnv();
  return {
    enabled: isEnabled(),
    voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE,
    voiceName: process.env.ELEVENLABS_VOICE_NAME || DEFAULT_VOICE_NAME,
    modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL,
  };
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

async function synthesizeSpeech(text) {
  loadEnv();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    const err = new Error("elevenlabs_not_configured");
    err.code = "elevenlabs_not_configured";
    throw err;
  }

  const clean = normalizeText(text);
  if (!clean || clean.length < 8) {
    const err = new Error("text_too_short");
    err.code = "text_too_short";
    throw err;
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const primaryModel = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL;
  const models = [...new Set([primaryModel, "eleven_multilingual_v2"].filter(Boolean))];

  let res = null;
  let detail = "";
  for (const modelId of models) {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(OUTPUT_FORMAT)}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
          "User-Agent": "rams-fight-back-tts/1.0",
        },
        body: JSON.stringify({
          text: clean,
          model_id: modelId,
          apply_text_normalization: "on",
          language_code: "en",
        }),
      }
    );
    if (res.ok) break;
    try {
      detail = await res.text();
    } catch (_) {}
    if (!/model|invalid/i.test(detail)) break;
  }

  if (!res.ok) {
    const err = new Error("elevenlabs_request_failed");
    err.code = "elevenlabs_request_failed";
    err.status = res.status;
    err.detail = detail.slice(0, 400);
    throw err;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType: "audio/mpeg", chars: clean.length };
}

module.exports = {
  MAX_CHARS,
  getConfig,
  isEnabled,
  normalizeText,
  synthesizeSpeech,
};
