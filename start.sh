#!/bin/bash

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
if [ "${DEV_RELOAD:-0}" = "1" ]; then
  uvicorn app.main:app --reload --reload-dir app --port 8000 &
else
  uvicorn app.main:app --port 8000 &
fi
BACKEND_PID=$!

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
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
