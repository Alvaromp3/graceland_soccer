# Deploy on Render (Graceland Soccer)

**Repo:** [https://github.com/Alvaromp3/graceland_soccer](https://github.com/Alvaromp3/graceland_soccer)

## Blueprint

1. In Render: **New → Blueprint**
2. Connect **https://github.com/Alvaromp3/graceland_soccer**
3. Render reads **`render.yaml`** from the repository root and creates **two services** (Python API + static frontend).

## Environment variables

| Service | Variable | Notes |
|--------|----------|--------|
| Backend | `ALLOWED_ORIGINS` | Optional. Comma-separated origins. If unset in dev, localhost is used. On Render (`RENDER=true`) or in `production`, HTTPS `*.onrender.com` is also allowed unless `ALLOW_ORIGIN_REGEX=0`. |
| Backend | `DISABLE_MODEL_TRAINING` | `1` in production (already in `render.yaml`) |
| Backend | `ENVIRONMENT` | `production` hides `/docs` |
| Backend | `API_KEY` | Optional; if set, require `X-API-Key` or `Authorization: Bearer …` |
| Backend | `OPEN_ROUTER_API_KEY` | Optional, for AI coaching text |
| Backend | `DATA_STORE_DIR` | Optional path to a **Render Disk** mount for persistent CSV/state |
| Frontend | `VITE_API_BASE_URL` | Backend origin **without** `/api`, e.g. `https://graceland-backend.onrender.com` |
| Frontend | `VITE_API_KEY` | Only if you use `API_KEY` on the API; value is **visible in the JS bundle** |

After changing frontend env vars, **trigger a new deploy** so Vite rebuilds with the new values.

## CORS

Set `ALLOWED_ORIGINS` to your frontend origin(s) for clarity and tighter security. The API also allows HTTPS `*.onrender.com` when Render sets `RENDER=true` (always on web services) or when `ENVIRONMENT=production`, unless `ALLOW_ORIGIN_REGEX=0`. If `DATA_STORE_DIR` points to an unmounted path, the app falls back to a writable directory so the service still starts and health checks pass.

## Data persistence

Web instances often have an **ephemeral filesystem**. For uploads to survive restarts, attach a **Disk** to the backend service, mount it (e.g. `/var/data`), and set `DATA_STORE_DIR` to that path.

## HTTPS & secrets

Render provides HTTPS on `*.onrender.com`. Do not commit `.env`; use Render **Environment** only.
