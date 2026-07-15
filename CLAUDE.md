# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Online multiplayer Blokus (20×20 board, 4 players, 21 polyomino pieces each), played in real time from separate devices. Official rules are in `Blokus_rules_eng.pdf`. Two independent apps:

- `backend/` — Django + DRF (auth, lobby REST API) + Django Channels (real-time gameplay over WebSockets). SQLite locally, Postgres on Render via `DATABASE_URL`.
- `frontend/` — Next.js App Router, TypeScript, no UI libraries.

## Commands

Backend (from `backend/`, needs a venv with `requirements.txt` installed; on Windows the venv python is `venv\Scripts\python`, on POSIX `venv/bin/python`):

```bash
python manage.py migrate
python manage.py runserver 8000     # dev server (ASGI via daphne app)
python manage.py test               # unit/flow tests (game/tests.py)
python manage.py test game.tests.LogicTests            # one test class
python manage.py test game.tests.LogicTests.test_name  # one test
python e2e_check.py                 # full-game E2E over live HTTP+WS — server must be running
```

Frontend (from `frontend/`):

```bash
npm run dev      # port 3000
npm run build
```

There is no linter configured in either app. Trying the game locally requires four accounts (four browser windows / private tabs); the game auto-starts when the 4th player joins.

## Frontend caveat

`frontend/CLAUDE.md` / `AGENTS.md` warn: the installed Next.js (16.x) has breaking changes vs. what you may know. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next.js-specific code, and heed deprecation notices.

## Architecture

The server is the single source of truth for game state; the client never applies moves itself.

**Backend layering** (each layer only calls downward):

- `game/pieces.py` — the 21 piece shapes; all unique rotations/reflections precomputed at import into `ORIENTATIONS` (piece id → list of orientations → list of `(x, y)` cells, normalized to min x = min y = 0). Moves are expressed as `(piece_id, orientation_index, x, y)` everywhere — DB, WebSocket protocol, and frontend alike.
- `game/logic.py` — pure rules engine: placement validation, blocking detection, scoring, `COLORS` (fixed turn order blue → yellow → red → green) and `START_CORNERS`. No DB access.
- `game/state.py` — the service layer: `join_game`, `play_move`, `serialize_game`. Every mutation runs in `transaction.atomic()` with `select_for_update()` on the Game row, so concurrent WebSocket messages can't corrupt state. Rule violations raise `MoveError` with a player-facing message. All game state flowing to clients goes through `serialize_game` (which sets `is_you` per viewer).
- `game/consumers.py` — `GameConsumer` (channel group `game_<id>`). Client sends `{"action": "place", piece, orientation, x, y}`; server broadcasts a `game_state_changed` group event and each consumer re-serializes and sends `{"type": "state", "game": {...}}` to its own client. Errors go only to the sender as `{"type": "error", "message"}`.
- `game/views.py` + `game/urls.py` — REST API under `/api/`: register/login (DRF token auth), games list/create/detail/join, `pieces/` (piece shapes, unauthenticated), leaderboard.

**WebSocket auth**: DRF tokens, passed as `?token=<key>` in the WS URL, resolved by `game/ws_auth.py:TokenAuthMiddleware`. Origins are checked in `blokus/asgi.py` via `OriginValidator` against `WS_ALLOWED_ORIGINS` (derived from `FRONTEND_ORIGIN` + localhost), separate from `ALLOWED_HOSTS`.

**Frontend**: `lib/api.ts` holds the API client, shared types, and localStorage token auth; `API_BASE` comes from `NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`) and the WS URL is derived from it (`http` → `ws`). `lib/rules.ts` duplicates placement rules client-side — but only to power the white/red staged-piece preview; the server re-validates every move. The game board UI lives in `app/game/[id]/page.tsx` (stage → adjust → confirm placement flow, drag/touch/keyboard handling).

**Config via env vars**: everything in `blokus/settings.py` defaults to local-dev values (SQLite, DEBUG, localhost CORS) and is overridden in production by `SECRET_KEY`, `DEBUG`, `DATABASE_URL`, `FRONTEND_ORIGIN`, optional `REDIS_URL` (channel layer is in-memory for a single instance; Redis only needed when scaling out). Deployment specifics are in `DEPLOY.md` (Render). Remember `NEXT_PUBLIC_*` values are baked into the frontend bundle at build time.
