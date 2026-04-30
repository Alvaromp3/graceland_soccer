.DEFAULT_GOAL := help

.PHONY: help run kill up down status

PORTS ?= 8000 5173 5174

help:
	@echo "Targets:"
	@echo "  make run   - Kill then start backend (8000) + frontend (5173)"
	@echo "  make kill  - Stop/kill servers on ports: $(PORTS)"
	@echo "  make up    - Alias for run"
	@echo "  make down  - Alias for kill"
	@echo "  make status- Show which PIDs hold ports"

run:
	@$(MAKE) --no-print-directory kill
	@bash ./start.sh

up: run

kill:
	@command -v lsof >/dev/null 2>&1 || { echo "ERROR: lsof is required for make kill"; exit 1; }
	@echo "Stopping processes on ports: $(PORTS)..."
	@PIDS="$$(for p in $(PORTS); do lsof -ti tcp:$$p 2>/dev/null; done | tr '\n' ' ' )"; \
	if [ -n "$$PIDS" ]; then \
		echo "Killing PIDs: $$PIDS"; \
		kill $$PIDS 2>/dev/null || true; \
		sleep 0.5; \
		kill -9 $$PIDS 2>/dev/null || true; \
	else \
		echo "No processes found on those ports."; \
	fi
	@# Best-effort: stop common dev servers even if ports changed
	@pkill -f "uvicorn app.main:app" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@pkill -f "npm run dev" 2>/dev/null || true
	@pkill -f "node.*vite" 2>/dev/null || true
	@# Verify ports are free
	@for p in $(PORTS); do \
		if lsof -ti tcp:$$p >/dev/null 2>&1; then \
			echo "WARNING: port $$p is still in use (PID(s): $$(lsof -ti tcp:$$p | tr '\n' ' '))"; \
		fi; \
	done
	@echo "Done."

status:
	@command -v lsof >/dev/null 2>&1 || { echo "ERROR: lsof is required for make status"; exit 1; }
	@for p in $(PORTS); do \
		PIDS="$$(lsof -ti tcp:$$p 2>/dev/null | tr '\n' ' ')"; \
		if [ -n "$$PIDS" ]; then \
			echo "port $$p -> $$PIDS"; \
		else \
			echo "port $$p -> (free)"; \
		fi; \
	done

down: kill
