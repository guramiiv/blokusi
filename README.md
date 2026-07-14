# Blokus Online

Online multiplayer implementation of the Blokus board game (see
`Blokus_rules_eng.pdf`): 20×20 board, 4 players, 21 polyomino pieces each,
played in real time from separate devices.

## Stack

- **Backend** — Django + Django REST Framework (auth, lobby) +
  Django Channels (real-time gameplay over WebSockets). SQLite database.
- **Frontend** — Next.js (App Router, TypeScript), no UI libraries.

## Running locally

Backend (port 8000):

```bash
cd backend
python3 -m venv venv                # first time only
venv/bin/pip install -r requirements.txt
venv/bin/python manage.py migrate
venv/bin/python manage.py runserver 8000
```

Frontend (port 3000):

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>, register four accounts (use four browser
windows / private tabs to try it alone), create a game from the lobby and
have the others join it. The game starts automatically when the 4th
player sits down.

## Rules implemented

- Fixed turn order **blue → yellow → red → green**; each color starts
  from its own marked corner.
- First piece must cover the starting corner; every later piece must
  touch a same-color piece **corner-to-corner** and may never share an
  edge with the same color. Different colors may touch freely.
- Players with no legal move are automatically skipped ("blocked");
  the game ends when nobody can move.
- Scoring: −1 per unit square left in hand; **+15** for placing all 21
  pieces, **+20** if the last piece placed was the single square.

All moves are validated server-side; the client-side check only powers
the white/red placement preview.

## Project layout

```text
backend/
  blokus/            Django project (settings, ASGI with WebSocket routing)
  game/
    pieces.py        the 21 polyominoes + precomputed orientations
    logic.py         placement validation, blocking detection, scoring
    state.py         move/join transactions, game serialization
    consumers.py     WebSocket game channel
    views.py         auth + lobby REST API
    tests.py         rules-engine and game-flow tests
  e2e_check.py       full-game check over live HTTP + WebSockets
frontend/
  lib/api.ts         API client, types, auth storage
  lib/rules.ts       client-side placement preview rules
  app/login, app/register, app/ (lobby), app/game/[id] (board)
```

## Tests

```bash
cd backend
venv/bin/python manage.py test          # 13 unit/flow tests
venv/bin/python e2e_check.py            # needs the server running
```

## Controls

Placement is a **stage → adjust → confirm** flow on every device:

1. Tap/click a piece in your tray, then tap a board cell — or drag the
   piece straight onto the board (a grid-snapped preview follows it).
2. The staged piece sits on the board outlined **white when legal, red
   when not**. Drag it around to fine-tune, rotate/flip it freely.
3. Press **✓ Place** to commit, **✕** to put it back.

On touch screens the dragged piece **floats above your finger** so it is
never hidden, the action bar (⟲ ⟳ flip ✕ ✓) is pinned within thumb
reach at the bottom, and pinch-zoom/pull-to-refresh are disabled during
play. On desktop the keyboard works too: **R** rotate, **F** flip,
**arrow keys** nudge, **Enter** place, **Esc** cancel.
