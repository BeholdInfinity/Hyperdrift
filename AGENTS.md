# AGENTS.md

Project-specific notes for AI agents. See `PROJECT.md` for architecture, `GDD.md` for prototype design, and `.cursor/rules/hyperdrift.mdc` for the session-resume / commit workflow.

## Cursor Cloud specific instructions

Hyperdrift is a single browser-based service: a static 2D spaceflight game (vanilla ES modules + HTML5 Canvas) served over HTTP. There is **no build step, no npm/pip dependencies, and no lint or automated test tooling** — the only runtime requirement is Python 3 (stdlib only).

### Run the app (the only service)

- `python3 dev-server.py 8080`, then open `http://localhost:8080` and click **LAUNCH** to fly (or **VIEW SHIP** for the hangar). Controls are listed in `PROJECT.md` / the title screen.
- The `start-game.bat` / `start-game.ps1` / `stop-game.bat` launchers are **Windows-only**; on the Linux cloud VM ignore them and run `dev-server.py` directly.
- `dev-server.py` binds to `127.0.0.1` only and sends no-cache headers, so code edits show up on a plain browser refresh (no rebuild). It also serves a dynamic `/build-info.json` (version from `src/version.js` + newest source mtime) used for the title-screen version stamp.

### Lint / test / build

- No lint, test, or build commands exist. "Verifying" a change means loading the page and exercising it in the browser.

### Gotchas

- ES modules are loaded via `<script type="module">`, so the app must be served over HTTP — opening `index.html` via `file://` will fail on module CORS.
