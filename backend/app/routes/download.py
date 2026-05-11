import asyncio
import mimetypes
import os
from typing import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.dependencies import get_ytdlp_service
from app.models.schemas import DownloadRequest
from app.services.ytdlp_service import YtDlpService
from app.utils import normalize_url, validate_http_url
from app.utils.errors import AppError, ErrorCode
from app.utils.platform import Platform, detect_platform, is_supported_url

router = APIRouter()

CHUNK = 512 * 1024


@router.post(
    "/download",
    responses={
        200: {"content": {"application/octet-stream": {}}},
        422: {"description": "Invalid URL or unsupported platform."},
        413: {"description": "File exceeds size limit."},
        502: {"description": "Download failed."},
    },
)
async def download_media(
    body: DownloadRequest,
    service: YtDlpService = Depends(get_ytdlp_service),
) -> StreamingResponse:
    url = normalize_url(body.url)
    url = validate_http_url(url)

    platform = detect_platform(url)
    if platform == Platform.UNKNOWN or not is_supported_url(url):
        raise AppError(
            ErrorCode.UNSUPPORTED_PLATFORM,
            "This domain is not in the supported platform list.",
            status_code=422,
        )

    filepath, suggested_name = await service.download_to_filepath_async(url, body.format_id)

    media_type, _ = mimetypes.guess_type(filepath)
    if not media_type:
        media_type = "application/octet-stream"

    async def stream_file() -> AsyncIterator[bytes]:
        try:
            with open(filepath, "rb") as f:
                while True:
                    chunk = await asyncio.to_thread(f.read, CHUNK)
                    if not chunk:
                        break
                    yield chunk
        finally:
            await asyncio.to_thread(_safe_unlink, filepath)

    ascii_name = suggested_name or "download.bin"
    headers = {
        "Content-Disposition": f'attachment; filename="{ascii_name}"',
        "Cache-Control": "no-store",
    }

    return StreamingResponse(
        stream_file(),
        media_type=media_type,
        headers=headers,
    )


def _safe_unlink(path: str) -> None:
    try:
        if path and os.path.isfile(path):
            os.unlink(path)
    except OSError:
        pass
