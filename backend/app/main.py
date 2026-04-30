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

try:
    from sklearn.exceptions import InconsistentVersionWarning  # type: ignore
    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
except Exception:
    pass

# LightGBM / sklearn: predicting with ndarray when model was trained with feature names
warnings.filterwarnings(
    "ignore",
    message=r"X does not have valid feature names, but .* was fitted with feature names",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .middleware_config import (
    get_allowed_origins,
    get_api_key,
    is_production_docs_disabled,
    paths_exempt_from_api_key,
)
from .routers import dashboard, players, analysis, training, data, settings

_show_docs = not is_production_docs_disabled()

app = FastAPI(
    title="Elite Sports Performance Analytics API",
    description="Backend API for sports analytics dashboard",
    version="1.0.0",
    docs_url="/docs" if _show_docs else None,
    redoc_url="/redoc" if _show_docs else None,
    openapi_url="/openapi.json" if _show_docs else None,
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


# API key runs inside CORS so error responses still pass through CORSMiddleware.
app.add_middleware(APIKeyMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(data.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "Elite Sports Performance Analytics API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
