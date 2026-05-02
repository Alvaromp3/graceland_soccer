"""
Production-oriented settings: CORS, optional API key gate.
"""
import os
from typing import List, Optional


def _is_production_env() -> bool:
    v = (os.environ.get("ENVIRONMENT") or os.environ.get("ENV") or "").strip().lower()
    return v in ("production", "prod")


def _runs_on_render() -> bool:
    """Render injects RENDER=true on web services (do not rely on ENVIRONMENT alone)."""
    return (os.environ.get("RENDER") or "").strip().lower() in ("1", "true", "yes", "on")


def get_allowed_origins() -> List[str]:
    raw = (os.environ.get("ALLOWED_ORIGINS") or "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]


def get_cors_origin_regex() -> Optional[str]:
    """
    On Render (RENDER=true) or when ENVIRONMENT=production, allow HTTPS *.onrender.com
    so the static frontend can call the API even if ALLOWED_ORIGINS was never set.

    Override with ALLOW_ORIGIN_REGEX (full regex string), or set ALLOW_ORIGIN_REGEX=0
    to disable and rely only on ALLOWED_ORIGINS.
    """
    override = (os.environ.get("ALLOW_ORIGIN_REGEX") or "").strip()
    if override.lower() in ("0", "false", "no", "off", "none"):
        return None
    if override:
        return override
    if _runs_on_render() or _is_production_env():
        # Origin header is full URL, e.g. https://graceland-frontend.onrender.com
        return r"https://[a-zA-Z0-9][a-zA-Z0-9\-.]*\.onrender\.com"
    return None


def get_api_key() -> str:
    return (os.environ.get("API_KEY") or "").strip()


def is_training_disabled() -> bool:
    v = (os.environ.get("DISABLE_MODEL_TRAINING") or "").strip().lower()
    return v in ("1", "true", "yes", "on")

def is_destructive_data_disabled() -> bool:
    """
    Guard rails for production when you don't want auth.
    When enabled, endpoints that mutate/erase datasets are disabled.
    """
    v = (os.environ.get("DISABLE_DESTRUCTIVE_DATA_ENDPOINTS") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def is_production_docs_disabled() -> bool:
    v = (os.environ.get("ENVIRONMENT") or os.environ.get("ENV") or "").strip().lower()
    return v in ("production", "prod")


def paths_exempt_from_api_key(path: str) -> bool:
    if path in ("/health", "/", "/favicon.ico"):
        return True
    if path.startswith("/openapi.json") or path.startswith("/docs") or path.startswith("/redoc"):
        return True
    return False
