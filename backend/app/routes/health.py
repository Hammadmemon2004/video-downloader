import shutil

from fastapi import APIRouter

from app.models.schemas import HealthResponse
from app.services.ytdlp_service import ytdlp_version

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        yt_dlp=ytdlp_version(),
        ffmpeg_available=shutil.which("ffmpeg") is not None,
    )
