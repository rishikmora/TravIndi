"""Canonical error envelope — API Design §4.1 / NFR "stable machine-readable
error envelope" requirement (docs/00-planning/01-project-master-model.md §L):

{"error": {"code", "message", "details", "request_id", "timestamp", "retryable"}}

`AppError` is what application/route code raises. `install_exception_handlers`
wires it (plus validation errors and any uncaught exception) to always
produce this exact shape — including for cases FastAPI would otherwise
render differently (422 validation errors) — so clients never see a second
error format, and, per the security error-handling rule, never see a stack
trace, SQL error, or other internal detail.
"""

from datetime import UTC, datetime

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict | None = None,
        retryable: bool = False,
    ) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.retryable = retryable


class NotImplementedYet(AppError):
    """Marks a contract-complete-but-unimplemented endpoint (Phase 8) —
    distinguishes an honest "not built yet" from a real server error. Never
    use this for anything the app is actually expected to do."""

    def __init__(self, phase: str) -> None:
        super().__init__(
            code="NOT_IMPLEMENTED_YET",
            message=f"This endpoint's contract is defined; implementation lands in {phase}.",
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            details={"planned_phase": phase},
            retryable=False,
        )


def _envelope(request: Request, *, code: str, message: str, details: dict, retryable: bool) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": getattr(request.state, "request_id", None),
            "timestamp": datetime.now(UTC).isoformat(),
            "retryable": retryable,
        }
    }


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(
                request, code=exc.code, message=exc.message, details=exc.details, retryable=exc.retryable
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=_envelope(
                request,
                code="VALIDATION_ERROR",
                message="Request failed schema validation.",
                details={"fields": exc.errors()},
                retryable=False,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(
                request, code="HTTP_ERROR", message=str(exc.detail), details={}, retryable=False
            ),
        )

    @app.exception_handler(Exception)
    async def handle_uncaught(request: Request, exc: Exception) -> JSONResponse:
        # Never leak internals (stack traces, SQL errors) — security error
        # handling rule (docs/00-planning/01-project-master-model.md §M).
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope(
                request,
                code="INTERNAL_ERROR",
                message="An unexpected error occurred.",
                details={},
                retryable=True,
            ),
        )
