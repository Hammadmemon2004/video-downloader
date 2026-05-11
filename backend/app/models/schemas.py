from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=4, max_length=2048, description="Social media page URL")


class QualityTier(BaseModel):
    """One downloadable option derived from formats available for this URL."""

    name: str = Field(..., description="Stable key, e.g. height tier or audio tier")
    label: str = Field(..., description="Human-readable label for UI pickers")
    format_id: str = Field(..., description="Pass to POST /download as format_id (yt-dlp selector)")
    max_height: int | None = Field(None, description="Approximate vertical resolution cap when video")
    note: str | None = None


class FormatInfo(BaseModel):
    format_id: str | None = None
    ext: str | None = None
    height: int | None = None
    width: int | None = None
    vcodec: str | None = None
    acodec: str | None = None
    filesize: int | None = None
    tbr: float | None = None
    format_note: str | None = None


class AnalyzeResponse(BaseModel):
    status: Literal["complete", "error"] = "complete"
    platform: str
    title: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    media_type: Literal["video", "audio", "unknown"] = "unknown"
    preview_url: str | None = None
    qualities: list[QualityTier] = Field(default_factory=list)
    formats: list[FormatInfo] = Field(default_factory=list, description="Simplified raw formats (capped)")
    webpage_url: str | None = None
    extractor: str | None = None
    id: str | None = Field(None, description="Platform media id when available")


class DownloadRequest(BaseModel):
    url: str = Field(..., min_length=4, max_length=2048)
    format_id: str = Field(..., min_length=1, max_length=512, description="yt-dlp format selector from analyze")


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str = "1.0.0"
    yt_dlp: str | None = None
    ffmpeg_available: bool = False


class ErrorJSON(BaseModel):
    error: str
    message: str
    details: dict[str, Any] | None = None
