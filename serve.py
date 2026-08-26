#!/usr/bin/env python3
"""Local preview server with live Change.org signature count.

  python3 serve.py

Serves the site on http://127.0.0.1:5173 and exposes:
  GET /api/petition-count  →  { total, displayed, goal, updatedAt, source }
  GET /api/tts             →  { enabled, voiceConfigured, localPreview }
  POST /api/tts              →  audio/mpeg (ElevenLabs text-to-speech)
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 5173
PETITION_URL = (
    "https://www.change.org/p/"
    "reinstate-darren-mullis-as-principal-at-holy-rosary-catholic-school"
)
CACHE_PATH = ROOT / "data" / "petition-count.json"
POLL_SECONDS = 90
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
ENV_PATH = ROOT / ".env"
DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"  # Sarah — mature, reassuring, confident
DEFAULT_VOICE_NAME = "Sarah"
DEFAULT_MODEL = "eleven_v3"
OUTPUT_FORMAT = "mp3_44100_128"
TTS_MAX_CHARS = 3200

_lock = threading.Lock()
_cache: dict = {
    "total": None,
    "displayed": None,
    "goal": 25000,
    "updatedAt": None,
    "source": "pending",
    "error": None,
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_count(html: str) -> dict | None:
    m = re.search(
        r'"signatureCount":\{"displayed":(\d+),"total":(\d+),"goal":(\d+)\}',
        html,
    )
    if m:
        out = {
            "displayed": int(m.group(1)),
            "total": int(m.group(2)),
            "goal": int(m.group(3)),
        }
    else:
        m = re.search(
            r'"signatureState":\{"signatureCount":\{"total":(\d+),"displayed":(\d+)',
            html,
        )
        if m:
            out = {
                "total": int(m.group(1)),
                "displayed": int(m.group(2)),
                "goal": 25000,
            }
        else:
            m = re.search(r'"signatureCount":\{"total":(\d+)', html)
            if not m:
                return None
            n = int(m.group(1))
            out = {"total": n, "displayed": n, "goal": 25000}

    # Momentum Change.org publishes (share totals are not public)
    daily = re.search(r'"dailySignatureCount":(\d+)', html)
    weekly = re.search(r'"weeklySignatureCount":(\d+)', html)
    if daily:
        out["daily"] = int(daily.group(1))
    if weekly:
        out["weekly"] = int(weekly.group(1))
    return out


def fetch_petition_count() -> dict:
    req = urllib.request.Request(
        PETITION_URL,
        headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    parsed = _parse_count(html)
    if not parsed:
        raise RuntimeError("Could not parse signature count from Change.org page")
    data = {
        "total": parsed["total"],
        "displayed": parsed.get("displayed", parsed["total"]),
        "goal": parsed.get("goal", 25000),
        "updatedAt": _now(),
        "source": "change.org",
        "error": None,
        "petitionUrl": "https://c.org/2LMccZY9dk",
    }
    if "daily" in parsed:
        data["daily"] = parsed["daily"]
    if "weekly" in parsed:
        data["weekly"] = parsed["weekly"]
    return data


def _load_disk_cache() -> dict | None:
    try:
        if CACHE_PATH.exists():
            return json.loads(CACHE_PATH.read_text())
    except Exception:
        return None
    return None


def _save_disk_cache(data: dict) -> None:
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(data, indent=2))
    except Exception:
        pass


def _cache_is_fresh(data: dict, max_age: int = 60) -> bool:
    updated = data.get("updatedAt")
    if not updated or data.get("total") is None:
        return False
    try:
        ts = datetime.strptime(updated, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds() < max_age
    except Exception:
        return False


def refresh_cache(force: bool = False) -> dict:
    global _cache
    with _lock:
        if not force and _cache_is_fresh(_cache):
            return dict(_cache)
        try:
            data = fetch_petition_count()
            _cache = data
            _save_disk_cache(data)
            return dict(_cache)
        except Exception as exc:
            disk = _load_disk_cache()
            if disk and disk.get("total") is not None:
                disk = dict(disk)
                disk["error"] = str(exc)
                disk["source"] = disk.get("source") or "cache"
                _cache = disk
                return dict(_cache)
            _cache = {
                "total": None,
                "displayed": None,
                "goal": 25000,
                "updatedAt": _now(),
                "source": "error",
                "error": str(exc),
                "petitionUrl": "https://c.org/2LMccZY9dk",
            }
            return dict(_cache)


def _load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        if "=" not in trimmed:
            continue
        key, val = trimmed.split("=", 1)
        key = key.strip()
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        if key:
            os.environ[key] = val


def _tts_enabled() -> bool:
    _load_env()
    if os.environ.get("ELEVENLABS_ENABLED") == "false":
        return False
    return bool(os.environ.get("ELEVENLABS_API_KEY"))


def _tts_config() -> dict:
    _load_env()
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE
    return {
        "enabled": _tts_enabled(),
        "voiceId": voice_id,
        "voiceName": os.environ.get("ELEVENLABS_VOICE_NAME") or DEFAULT_VOICE_NAME,
        "modelId": os.environ.get("ELEVENLABS_MODEL_ID") or DEFAULT_MODEL,
    }


def _normalize_tts_text(text: str) -> str:
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    return clean[:TTS_MAX_CHARS]


def _synthesize_tts(text: str) -> tuple[bytes, int]:
    _load_env()
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise RuntimeError("elevenlabs_not_configured")
    clean = _normalize_tts_text(text)
    if len(clean) < 8:
        raise ValueError("text_too_short")
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE
    primary_model = os.environ.get("ELEVENLABS_MODEL_ID") or DEFAULT_MODEL
    models = list(dict.fromkeys([primary_model, "eleven_multilingual_v2"]))
    audio = None
    last_err = None
    for model_id in models:
        payload = json.dumps(
            {
                "text": clean,
                "model_id": model_id,
                "apply_text_normalization": "on",
                "language_code": "en",
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format={urllib.parse.quote(OUTPUT_FORMAT)}",
            data=payload,
            headers={
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": api_key,
                "User-Agent": "rams-fight-back-tts/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                audio = resp.read()
            break
        except urllib.error.HTTPError as exc:
            last_err = exc
            detail = ""
            try:
                detail = exc.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            if "model" not in detail.lower() and "invalid" not in detail.lower():
                raise
    if audio is None:
        if last_err:
            raise last_err
        raise RuntimeError("elevenlabs_request_failed")
    return audio, len(clean)


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    }


def poll_loop() -> None:
    # initial + periodic refresh
    refresh_cache(force=True)
    while True:
        time.sleep(POLL_SECONDS)
        try:
            refresh_cache(force=True)
        except Exception:
            pass


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        path = self.path.split("?", 1)[0]
        if path in ("/api/tts", "/api/tts/"):
            self.send_response(204)
            for key, val in _cors_headers().items():
                self.send_header(key, val)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path in ("/api/tts", "/api/tts/"):
            if not _tts_enabled():
                body = json.dumps(
                    {"ok": False, "error": "elevenlabs_not_configured"}
                ).encode("utf-8")
                self.send_response(503)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                for key, val in _cors_headers().items():
                    self.send_header(key, val)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length).decode("utf-8", errors="ignore")
                data = json.loads(raw or "{}")
                audio, chars = _synthesize_tts(data.get("text", ""))
                cfg = _tts_config()
                self.send_response(200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("X-TTS-Chars", str(chars))
                self.send_header("X-TTS-Voice-Id", cfg["voiceId"])
                self.send_header("X-TTS-Voice-Name", cfg["voiceName"])
                for key, val in _cors_headers().items():
                    self.send_header(key, val)
                self.send_header("Content-Length", str(len(audio)))
                self.end_headers()
                self.wfile.write(audio)
            except ValueError as exc:
                body = json.dumps(
                    {"ok": False, "error": str(exc) or "text_too_short"}
                ).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                for key, val in _cors_headers().items():
                    self.send_header(key, val)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except urllib.error.HTTPError as exc:
                detail = ""
                try:
                    detail = exc.read().decode("utf-8", errors="ignore")[:400]
                except Exception:
                    pass
                body = json.dumps(
                    {
                        "ok": False,
                        "error": "elevenlabs_request_failed",
                        "detail": detail or None,
                    }
                ).encode("utf-8")
                self.send_response(exc.code if 400 <= exc.code < 600 else 502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                for key, val in _cors_headers().items():
                    self.send_header(key, val)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as exc:
                body = json.dumps(
                    {"ok": False, "error": "tts_failed", "detail": str(exc)[:400]}
                ).encode("utf-8")
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                for key, val in _cors_headers().items():
                    self.send_header(key, val)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/api/tts", "/api/tts/"):
            cfg = _tts_config()
            body = json.dumps(
                {
                    "ok": True,
                    "enabled": cfg["enabled"],
                    "voiceConfigured": bool(cfg["voiceId"]),
                    "voiceId": cfg["voiceId"],
                    "voiceName": cfg["voiceName"],
                    "modelId": cfg["modelId"],
                    "localPreview": os.environ.get("ELEVENLABS_LOCAL_ONLY") == "true",
                }
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            for key, val in _cors_headers().items():
                self.send_header(key, val)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path in ("/api/petition-count", "/api/petition-count/"):
            data = refresh_cache(force=False)
            # if never successfully fetched, try once now
            if data.get("total") is None:
                data = refresh_cache(force=True)
            body = json.dumps(data).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path in ("/ramsfightback", "/ramsfightback/", "/sign", "/sign/"):
            self.send_response(302)
            self.send_header("Location", "https://c.org/2LMccZY9dk")
            self.end_headers()
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        # quieter local logs
        if args and str(args[0]).startswith("GET /api/"):
            super().log_message(fmt, *args)


def main() -> None:
    disk = _load_disk_cache()
    if disk:
        with _lock:
            global _cache
            _cache = disk

    threading.Thread(target=poll_loop, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Rams Fight Back local server → http://{HOST}:{PORT}/")
    print(f"Live petition count API → http://{HOST}:{PORT}/api/petition-count")
    print(f"Listen-aloud TTS API → http://{HOST}:{PORT}/api/tts")
    if _tts_enabled():
        print("ElevenLabs TTS: configured (.env)")
    else:
        print("ElevenLabs TTS: add ELEVENLABS_API_KEY to .env to enable listen-aloud")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
