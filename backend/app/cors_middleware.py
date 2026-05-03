"""
Explicit CORS for /api — complements Starlette CORSMiddleware edge cases.

Starlette CORSMiddleware skips all CORS handling when the Origin header is missing
(see starlette.middleware.cors: if origin is None: pass-through). Some proxies and
clients also surface preflight failures as "no ACAO". This middleware:

- Answers OPTIONS /api* with 204 + permissive headers (preflight never hits a 405).
- Ensures Access-Control-Allow-Origin: * is present on /api responses when absent.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class ApiCorsPatchMiddleware(BaseHTTPMiddleware):
    """Outer middleware: run with add_middleware last so it sees the request first."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if request.method == "OPTIONS" and path.startswith("/api"):
            requested = request.headers.get("access-control-request-headers")
            headers = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Max-Age": "86400",
            }
            if requested:
                headers["Access-Control-Allow-Headers"] = requested
            else:
                headers["Access-Control-Allow-Headers"] = (
                    "Authorization, Content-Type, X-API-Key, Accept, Accept-Language"
                )
            return Response(status_code=204, headers=headers)

        response = await call_next(request)

        if path.startswith("/api") and response.headers.get("access-control-allow-origin") is None:
            response.headers["Access-Control-Allow-Origin"] = "*"

        return response
