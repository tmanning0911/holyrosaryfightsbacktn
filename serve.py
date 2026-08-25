#!/usr/bin/env python3
"""Local preview server with live Change.org signature count.

  python3 serve.py

Serves the site on http://127.0.0.1:5173 and exposes:
  GET /api/petition-count  →  { total, displayed, goal, updatedAt, source }
"""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
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

    def do_GET(self):
        if self.path.split("?", 1)[0] in ("/api/petition-count", "/api/petition-count/"):
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
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
