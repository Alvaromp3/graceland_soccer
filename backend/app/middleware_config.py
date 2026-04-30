"""
Production-oriented settings: CORS, optional API key gate.
"""
import os
from typing import List


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


def get_api_key() -> str:
    return (os.environ.get("API_KEY") or "").strip()


def is_training_disabled() -> bool:
    v = (os.environ.get("DISABLE_MODEL_TRAINING") or "").strip().lower()
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
