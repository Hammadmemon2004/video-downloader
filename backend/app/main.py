from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routes import api_router
from app.utils.errors import AppError, ErrorCode, error_response

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Universal social media downloader API (yt-dlp + FFmpeg).",
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.detail)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=error_response(
            ErrorCode.VALIDATION_ERROR,
            "Request validation failed.",
            details={"errors": exc.errors()},
        ),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc, AppError):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    detail = exc.detail
    if isinstance(detail, dict):
        body = detail
    else:
        body = {"error": "http_error", "message": str(detail)}
    return JSONResponse(status_code=exc.status_code, content=body)


def _configure_cors(application: FastAPI) -> None:
    if settings.cors_allow_all:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["Content-Disposition"],
        )
    else:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_origin_regex=settings.cors_allow_origin_regex,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=["Content-Disposition"],
        )


_configure_cors(app)
app.include_router(api_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "docs": "/docs", "health": "/health"}
