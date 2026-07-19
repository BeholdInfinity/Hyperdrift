# Hyperdrift

Browser-based 2D spaceflight prototype — top-down semi-Newtonian physics, procedural infinite universe, HTML5 Canvas. **No build step**: ES modules served over HTTP. Prototype for the long-term *Stranger in the Galaxy* vision.

## Run

**Easiest:** double-click [`StartStopGame/start-game.bat`](StartStopGame/start-game.bat). It starts a local server, waits until the page is ready, then opens your browser. Stop with [`StartStopGame/stop-game.bat`](StartStopGame/stop-game.bat).

**Manual:**

```powershell
python dev-server.py 8080
```

Then open http://localhost:8080 and click **LAUNCH**. (`dev-server.py` disables browser caching of JS modules so edits show up on refresh — prefer it over `python -m http.server`.)

## Docs

All handoff/design docs live in [`docs/`](docs/). Start with `PROJECT.md`, then read others as the task requires:

| Doc | Scope |
|-----|-------|
| [`docs/PROJECT.md`](docs/PROJECT.md) | Dev handoff — architecture, run, repository layout, status, next steps |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Version history of user-visible changes (newest first) |
| [`docs/GDD.md`](docs/GDD.md) | Prototype game design — mechanics, controls, scope of *what we're building now* |
| [`docs/VISION.md`](docs/VISION.md) | Long-term north star — *Stranger in the Galaxy* (space-life RPG / station builder) |
| [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md) | Unresolved design decisions — for conversation sessions |

**Resuming in a new chat:** say `Let's continue` — the project rule points the agent at `docs/PROJECT.md`, recent `docs/CHANGELOG.md`, and the design docs as needed.
