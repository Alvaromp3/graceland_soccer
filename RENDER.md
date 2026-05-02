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

On Render, the API defaults to **`Access-Control-Allow-Origin: *`** (no cookies; `CORS_WILDCARD` unset) so the static site can always call the API. Set `CORS_WILDCARD=0` to use `ALLOWED_ORIGINS` + `*.onrender.com` regex instead. If `DATA_STORE_DIR` is unmounted/unwritable, the app falls back to a writable path so health checks still pass.

### If the browser shows “CORS” but Network says **502 Bad Gateway**

The backend process is not returning a normal response (crash, OOM, or still deploying). Open **backend → Logs / Events** on Render — do not chase CORS on the frontend. On the free tier, loading very large persisted CSVs at startup can run out of memory; use smaller files, `PERSIST_DATA=0`, or clear the disk.

## Data persistence

Web instances often have an **ephemeral filesystem**. For uploads to survive restarts, attach a **Disk** to the backend service, mount it (e.g. `/var/data`), and set `DATA_STORE_DIR` to that path.

## HTTPS & secrets

Render provides HTTPS on `*.onrender.com`. Do not commit `.env`; use Render **Environment** only.
