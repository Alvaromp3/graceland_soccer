# Graceland Soccer Analytics

Web application for soccer player performance, injury risk, lineup optimization, and AI-assisted coaching notes.

**Repository:** [github.com/Alvaromp3/graceland_soccer](https://github.com/Alvaromp3/graceland_soccer)

## Structure

```
├── backend/          # FastAPI + ML (scikit-learn, LightGBM)
├── frontend/         # React + TypeScript + Vite
├── start.sh          # Dev: backend + frontend together
├── Makefile          # Dev shortcuts
├── render.yaml       # Render.com Blueprint (API + static site)
└── RENDER.md         # Deploy and environment variables
```

## Quick start (local)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** (Vite proxies `/api` to the backend in dev).

### One command

```bash
./start.sh
```

## Production (Render)

See **[RENDER.md](./RENDER.md)** and use **Blueprint** with `render.yaml`. Set `ALLOWED_ORIGINS` and `VITE_API_BASE_URL` to your deployed URLs.

## Features

- Dashboard KPIs, load history, risk distribution  
- Players, analysis, rankings, lineup, team comparison  
- Injury risk and load prediction (pretrained models under `backend/modelos_graceland/`)  
- Optional OpenRouter-powered coaching text (set `OPEN_ROUTER_API_KEY` on the server)

## Author

**Alvaro Martin-Pena** — Machine Learning Engineer

- GitHub: [@Alvaromp3](https://github.com/Alvaromp3)
