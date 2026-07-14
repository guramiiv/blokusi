# Deploying to Render (free plan, manual setup)

Three things to create, in this order: **Postgres → backend → frontend**.
All from <https://dashboard.render.com>.

## 1. Postgres database

In the dashboard choose **New → PostgreSQL**:

| Setting | Value |
| --- | --- |
| Name | `blokus-db` |
| Plan | Free |

After it's created, open it and copy the **Internal Database URL**
(starts with `postgresql://…`) — you'll paste it into the backend's env
vars in the next step.

## 2. Backend (Django + Channels)

**New → Web Service** → connect the `blokusi` GitHub repo.

| Setting | Value |
| --- | --- |
| Name | `blokus-backend` (any name works) |
| Root Directory | `backend` |
| Language / Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate` |
| Start Command | `daphne -b 0.0.0.0 -p $PORT blokus.asgi:application` |
| Instance Type | Free |

Environment variables (Advanced → Add Environment Variable):

| Key | Value |
| --- | --- |
| `PYTHON_VERSION` | `3.13.4` |
| `SECRET_KEY` | a long random string (e.g. run `openssl rand -hex 40`) |
| `DEBUG` | `false` |
| `DATABASE_URL` | the Internal Database URL from step 1 |
| `FRONTEND_ORIGIN` | *(leave empty for now — you'll fill it in step 4)* |

Optional: set **Health Check Path** to `/api/pieces/`.

Create the service and wait for the first deploy to finish. Note the
public URL, e.g. `https://blokus-backend.onrender.com`.

Quick check: open `https://<backend-url>/api/pieces/` — you should see
JSON with the piece shapes.

## 3. Frontend (Next.js)

**New → Web Service** → same repo.

| Setting | Value |
| --- | --- |
| Name | `blokus-frontend` (any name works) |
| Root Directory | `frontend` |
| Language / Runtime | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Instance Type | Free |

Environment variables:

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `24.6.0` |
| `NEXT_PUBLIC_API_BASE` | the backend URL from step 2, e.g. `https://blokus-backend.onrender.com` (no trailing slash) |

Important: `NEXT_PUBLIC_*` values are **baked into the JS bundle at
build time**. If you ever change this variable, you must trigger a new
deploy (Manual Deploy → Deploy latest commit) for it to take effect.

The WebSocket URL is derived automatically from `NEXT_PUBLIC_API_BASE`
(`https://…` → `wss://…`), so no separate WS variable is needed.

Create the service, wait for deploy, note its URL, e.g.
`https://blokus-frontend.onrender.com`.

## 4. Connect them

Go back to **blokus-backend → Environment** and set:

| Key | Value |
| --- | --- |
| `FRONTEND_ORIGIN` | the frontend URL from step 3, e.g. `https://blokus-frontend.onrender.com` (no trailing slash) |

Save — Render redeploys the backend automatically. This value is what
allows the frontend's cross-domain REST calls (CORS) and WebSocket
connections (origin check).

## 5. Play

Open the frontend URL, register four accounts (four browsers/devices),
create a game, join, play. Later code changes deploy automatically on
every `git push` (auto-deploy is on by default).

## Troubleshooting

- **Login/API calls fail (CORS error in console)** — `FRONTEND_ORIGIN`
  on the backend doesn't exactly match the frontend URL (check scheme
  and no trailing slash).
- **"reconnecting…" forever in a game** — same cause: the WebSocket
  origin check uses `FRONTEND_ORIGIN` too. Also confirm the frontend was
  rebuilt after `NEXT_PUBLIC_API_BASE` was set.
- **First request takes ~a minute** — free services spin down after
  ~15 min of inactivity and cold-start on the next request. An open
  game keeps the backend awake via its WebSocket.
- **Database expires** — the free Postgres instance is deleted after
  30 days unless upgraded; back up or upgrade before then.
- **Scaling note** — the in-memory channel layer is correct for the
  single free instance. If you ever run more than one backend instance,
  add a Redis and set `REDIS_URL` (channels-redis is already installed).

## Local development (unchanged)

```bash
cd backend && venv/bin/python manage.py runserver 8000
cd frontend && npm run dev
```

Without env vars set, the backend falls back to SQLite/DEBUG and the
frontend talks to `http://localhost:8000`.
