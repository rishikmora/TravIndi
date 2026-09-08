"""Request correlation — X-Request-ID (API Design §4.1 contract standard).
Generates one if the client didn't send it, echoes it back on the response,
and stores it on request.state so app/core/errors.py can embed it in every
error envelope."""

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
