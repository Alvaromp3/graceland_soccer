import warnings

# Load environment variables from backend/.env (if present).
# Do not fail if python-dotenv is missing.
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
except Exception:
    pass

# Keep startup logs clean: ignore known non-fatal dependency/model warnings
# (Filter by message so it applies even during the initial `requests` import.)
warnings.filterwarnings(
    "ignore",
    message=r"urllib3 .* doesn't match a supported version!",
)

# Avoid importing sklearn here — it adds seconds to cold start on small Render instances.
warnings.filterwarnings(
    "ignore",
    message=r"Trying to unpickle estimator.*",
)
warnings.filterwarnings(
    "ignore",
    message=r"X does not have valid feature names, but .* was fitted with feature names",
    category=UserWarning,
)

import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from .cors_middleware import ApiCorsPatchMiddleware
from .middleware_config import (
    get_allowed_origins,
    get_api_key,
    get_cors_origin_regex,
    is_production_docs_disabled,
    paths_exempt_from_api_key,
    should_use_cors_wildcard,
)
from .routers import dashboard, players, analysis, training, data, settings
from .services.data_service import data_service

_show_docs = not is_production_docs_disabled()

logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """
    Load persisted CSV/state in the background so the process binds quickly.
    Render's HTTP health check times out after 5s if the app import + startup blocks too long.
    """
    async def _persist_bg() -> None:
        try:
            await asyncio.to_thread(data_service.load_persisted_deferred_from_env)
        except Exception:
            logger.exception("Background persisted data load failed")

    asyncio.create_task(_persist_bg())
    yield


app = FastAPI(
    title="Elite Sports Performance Analytics API",
    description="Backend API for sports analytics dashboard",
    version="1.0.0",
    docs_url="/docs" if _show_docs else None,
    redoc_url="/redoc" if _show_docs else None,
    openapi_url="/openapi.json" if _show_docs else None,
    lifespan=lifespan,
)

class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        expected = get_api_key()
        if not expected:
            return await call_next(request)
        path = request.url.path
        if paths_exempt_from_api_key(path):
            return await call_next(request)
        xkey = request.headers.get("X-API-Key", "")
        auth = request.headers.get("Authorization", "")
        bearer = auth[7:].strip() if auth.startswith("Bearer ") else ""
        if xkey == expected or bearer == expected:
            return await call_next(request)
        return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)


class RequestTimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
            return response
        finally:
            try:
                ms = (time.perf_counter() - start) * 1000.0
                path = request.url.path
                if path.startswith("/api"):
                    logger.info(
                        "request path=%s method=%s ms=%.1f",
                        path,
                        request.method,
                        ms,
                    )
            except Exception:
                pass


# CORS must be outermost (add last) so OPTIONS and error bodies still get CORS headers.
_cors_wildcard = should_use_cors_wildcard()
_cors_params = {
    "allow_origins": ["*"] if _cors_wildcard else get_allowed_origins(),
    # API auth uses X-API-Key / Bearer headers, not cookies — required for wildcard CORS.
    "allow_credentials": False,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if not _cors_wildcard:
    _cors_rx = get_cors_origin_regex()
    if _cors_rx:
        _cors_params["allow_origin_regex"] = _cors_rx

app.add_middleware(APIKeyMiddleware)
app.add_middleware(RequestTimingMiddleware)
app.add_middleware(CORSMiddleware, **_cors_params)
# Outermost: explicit /api OPTIONS + ACAO patch (Starlette CORS skips entirely when Origin is absent).
app.add_middleware(ApiCorsPatchMiddleware)

app.include_router(dashboard.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(data.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "Elite Sports Performance Analytics API", "status": "running"}


@app.head("/")
async def root_head():
    """Render and some proxies probe with HEAD; avoid 405 on cold paths."""
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.head("/health")
async def health_head():
    return Response(status_code=200)
