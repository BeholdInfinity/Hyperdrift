#!/usr/bin/env python3
"""Local Hyperdrift server with no-cache headers so ES module edits show up on refresh."""

from __future__ import annotations

import functools
import http.server
import json
import os
import re
import socketserver
import sys
from datetime import datetime, timezone
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = Path(__file__).resolve().parent

SCAN_GLOBS = (
    "index.html",
    "styles.css",
    "dev-server.py",
    "src/**/*.js",
)


def read_version() -> str:
    path = ROOT / "src" / "version.js"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return "0.0.0"
    match = re.search(r"VERSION\s*=\s*['\"]([^'\"]+)['\"]", text)
    return match.group(1) if match else "0.0.0"


def newest_edit_info() -> dict:
    newest_mtime = 0.0
    newest_path = ""
    for pattern in SCAN_GLOBS:
        for path in ROOT.glob(pattern):
            if not path.is_file():
                continue
            mtime = path.stat().st_mtime
            if mtime > newest_mtime:
                newest_mtime = mtime
                newest_path = str(path.relative_to(ROOT)).replace("\\", "/")
    iso = datetime.fromtimestamp(newest_mtime, tz=timezone.utc).isoformat()
    return {
        "version": read_version(),
        "mtime": newest_mtime,
        "iso": iso,
        "file": newest_path,
        "servedAt": datetime.now(timezone.utc).isoformat(),
    }


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **getattr(http.server.SimpleHTTPRequestHandler, "extensions_map", {}),
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".wasm": "application/wasm",
    }

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] in ("/build-info.json", "/build-info"):
            payload = json.dumps(newest_edit_info()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main() -> int:
    os.chdir(ROOT)
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        print(f"Serving Hyperdrift at http://127.0.0.1:{PORT}/ (no-cache)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
