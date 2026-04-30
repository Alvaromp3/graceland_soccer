#!/bin/bash
set -euo pipefail

echo "Starting Elite Sports Performance Analytics..."

# Start backend
echo "Starting backend on port 8000..."
cd backend
if [ ! -d "venv" ]; then
    if command -v python3.11 >/dev/null 2>&1; then
      python3.11 -m venv venv
    else
      python3 -m venv venv
    fi
fi
source venv/bin/activate
pip install -r requirements.txt -q

# Stable default: do NOT auto-reload (watchers can reload on venv changes).
# Enable reload explicitly with: DEV_RELOAD=1 make run
BACKEND_LOG="${BACKEND_LOG:-/tmp/graceland-backend.log}"
if [ "${DEV_RELOAD:-0}" = "1" ]; then
  uvicorn app.main:app --host 127.0.0.1 --reload --reload-dir app --port 8000 >"$BACKEND_LOG" 2>&1 &
else
  uvicorn app.main:app --host 127.0.0.1 --port 8000 >"$BACKEND_LOG" 2>&1 &
fi
BACKEND_PID=$!

# Wait until backend is actually reachable (avoid Vite proxy ECONNREFUSED spam)
echo "Waiting for backend to be healthy..."
for i in {1..40}; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend process exited. Last logs:"
    tail -n 120 "$BACKEND_LOG" || true
    exit 1
  fi
  if curl -sSf "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -sSf "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
  echo "Backend did not become healthy in time. Last logs:"
  tail -n 120 "$BACKEND_LOG" || true
  exit 1
fi

# Start frontend
echo "Starting frontend on port 5173..."
cd ../frontend
if [ -f package-lock.json ]; then
  npm ci -q
else
  npm install -q
fi
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Application started!"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8000"
echo "Backend logs: $BACKEND_LOG"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
