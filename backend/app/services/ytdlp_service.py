from __future__ import annotations

import asyncio
import glob
import os
import re
import shutil
import tempfile
from typing import Any

import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError, UnsupportedError

from app.config import Settings, get_settings
from app.models.schemas import AnalyzeResponse, FormatInfo, QualityTier
from app.utils.errors import AppError, ErrorCode
from app.utils.platform import Platform
from app.utils.security import safe_filename_fragment, unique_temp_basename


def _ffmpeg_exists() -> bool:
    return shutil.which("ffmpeg") is not None


def _map_ytdlp_exception(exc: BaseException, url: str) -> AppError:
    msg = str(exc).lower()
    raw = str(exc)

    if "private" in msg or "login required" in msg or "sign in" in msg or "auth" in msg:
        return AppError(
            ErrorCode.PRIVATE_CONTENT,
            "This content is private or requires authentication.",
            status_code=403,
            details={"hint": raw[:300]},
        )
    if "unsupported url" in msg or "no suitable extractors" in msg:
        return AppError(
            ErrorCode.UNSUPPORTED_PLATFORM,
            "yt-dlp could not handle this URL.",
            status_code=422,
            details={"hint": raw[:300]},
        )
    if "video unavailable" in msg or "not available" in msg:
        return AppError(
            ErrorCode.NOT_FOUND,
            "Media not found or removed.",
            status_code=404,
            details={"hint": raw[:300]},
        )
    return AppError(
        ErrorCode.DOWNLOAD_FAILED,
        "Download or extraction failed.",
        status_code=502,
        details={"hint": raw[:400]},
    )


def _base_ydl_opts(settings: Settings, quiet: bool = True) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": quiet,
        "no_warnings": quiet,
        "socket_timeout": settings.socket_timeout,
        "noplaylist": True,
        "max_filesize": settings.max_download_bytes,
        "retries": 2,
        "fragment_retries": 2,
        "nocheckcertificate": False,
    }
    if settings.temp_dir:
        opts["tmpdir"] = settings.temp_dir
    return opts


def _max_video_height(formats: list[dict[str, Any]] | None) -> int | None:
    if not formats:
        return None
    heights = [f.get("height") for f in formats if f.get("height")]
    return max(heights) if heights else None


def _is_video_format(f: dict[str, Any]) -> bool:
    vcodec = (f.get("vcodec") or "none").lower()
    return vcodec not in ("none", "", "null")


def _is_audio_only_info(info: dict[str, Any], formats: list[dict[str, Any]]) -> bool:
    if info.get("vcodec") in (None, "none") and not any(_is_video_format(f) for f in formats):
        return True
    return info.get("_type") == "playlist" and False  # handled elsewhere


def _simplify_formats(formats: list[dict[str, Any]], cap: int = 24) -> list[FormatInfo]:
    out: list[FormatInfo] = []
    for f in formats:
        if not _is_video_format(f) and f.get("acodec") not in (None, "none"):
            # audio-only row
            out.append(
                FormatInfo(
                    format_id=str(f.get("format_id", "")) or None,
                    ext=f.get("ext"),
                    height=f.get("height"),
                    width=f.get("width"),
                    vcodec=f.get("vcodec"),
                    acodec=f.get("acodec"),
                    filesize=f.get("filesize") or f.get("filesize_approx"),
                    tbr=f.get("tbr"),
                    format_note=f.get("format_note"),
                )
            )
        elif _is_video_format(f):
            out.append(
                FormatInfo(
                    format_id=str(f.get("format_id", "")) or None,
                    ext=f.get("ext"),
                    height=f.get("height"),
                    width=f.get("width"),
                    vcodec=f.get("vcodec"),
                    acodec=f.get("acodec"),
                    filesize=f.get("filesize") or f.get("filesize_approx"),
                    tbr=f.get("tbr"),
                    format_note=f.get("format_note"),
                )
            )
    # prefer higher resolution first
    out.sort(key=lambda x: (x.height or 0), reverse=True)
    return out[:cap]


def _unique_video_heights(formats: list[dict[str, Any]]) -> list[int]:
    heights: set[int] = set()
    for f in formats:
        if _is_video_format(f) and f.get("height"):
            heights.add(int(f["height"]))
    return sorted(heights, reverse=True)


def _merge_similar_heights(heights: list[int], min_gap: int = 64) -> list[int]:
    """Keep one representative per cluster so the UI is not spammed (e.g. 1072 vs 1080)."""
    if not heights:
        return []
    merged: list[int] = []
    for h in heights:
        if not merged or abs(h - merged[-1]) >= min_gap:
            merged.append(h)
        else:
            merged[-1] = max(merged[-1], h)
    return merged


def _format_selector_for_height(h: int) -> str:
    return (
        f"bestvideo[height<={h}]+bestaudio/bestvideo[height<={h}]+bestaudio/"
        f"best[height<={h}]/bestvideo+bestaudio/best"
    )


def _unique_audio_abrs(formats: list[dict[str, Any]]) -> list[int]:
    abrs: set[int] = set()
    for f in formats:
        ac = (f.get("acodec") or "none").lower()
        vc = (f.get("vcodec") or "none").lower()
        if ac in ("none", "", "null"):
            continue
        if vc not in ("none", "", "null"):
            continue
        ab = f.get("abr") or f.get("tbr")
        if ab is not None:
            abrs.add(int(float(ab)))
    return sorted(abrs, reverse=True)


def _qualities_from_formats(
    formats_raw: list[dict[str, Any]],
    media_type: str,
    max_h: int | None,
) -> list[QualityTier]:
    """
    Build one menu entry per distinct resolution (video) or sensible audio tiers,
    using only what yt-dlp reported for this URL.
    """
    if media_type == "audio":
        abrs = _unique_audio_abrs(formats_raw)
        peak = abrs[0] if abrs else None
        best_label = "Best audio"
        if peak:
            best_label = f"Best audio (~{peak} kb/s peak)"
        return [
            QualityTier(
                name="audio_best",
                label=best_label,
                format_id=f"{NEXDL_MP3}:best",
                max_height=None,
                note="Highest bitrate stream (MP3)",
            ),
            QualityTier(
                name="audio_mid",
                label="Medium (~160 kb/s cap)",
                format_id=f"{NEXDL_MP3}:mid",
                max_height=None,
                note="Lower bitrate when available (MP3)",
            ),
            QualityTier(
                name="audio_low",
                label="Smallest file",
                format_id=f"{NEXDL_MP3}:low",
                max_height=None,
                note="Lowest bitrate (MP3)",
            ),
        ]

    heights = _merge_similar_heights(_unique_video_heights(formats_raw))
    if not heights and max_h and max_h > 0:
        heights = [int(max_h)]
    if not heights:
        return [
            QualityTier(
                name="video_best",
                label="Best available",
                format_id="bestvideo+bestaudio/best",
                max_height=None,
                note="No discrete heights reported",
            ),
            QualityTier(
                name="audio_mp3",
                label="Best",
                format_id=NEXDL_MP3,
                max_height=None,
                note="Audio only (MP3)",
            ),
        ]

    out: list[QualityTier] = []
    seen_sel: set[str] = set()
    for h in heights[:8]:
        sel = _format_selector_for_height(h)
        if sel in seen_sel:
            continue
        seen_sel.add(sel)
        label = f"{h}p" if h >= 144 else f"{h}px"
        out.append(
            QualityTier(
                name=f"video_{h}p",
                label=label,
                format_id=sel,
                max_height=h,
                note=None,
            )
        )
    out.append(
        QualityTier(
            name="audio_mp3",
            label="Best",
            format_id=NEXDL_MP3,
            max_height=None,
            note="Audio only (MP3)",
        )
    )
    return out


def _thumbnail_url(info: dict[str, Any]) -> str | None:
    if info.get("thumbnail"):
        return str(info["thumbnail"])
    thumbs = info.get("thumbnails") or []
    if thumbs:
        last = thumbs[-1]
        return last.get("url")
    return None


def _media_type(info: dict[str, Any], formats: list[dict[str, Any]]) -> str:
    if _is_audio_only_info(info, formats):
        return "audio"
    if any(_is_video_format(f) for f in formats) or _is_video_format(info):
        return "video"
    return "unknown"


def _sanitize_format_id(raw: str) -> str:
    s = raw.strip()
    if not s or len(s) > 512:
        raise AppError(ErrorCode.VALIDATION_ERROR, "Invalid format_id.", status_code=422)
    if re.search(r"[\r\n\x00]", s):
        raise AppError(ErrorCode.VALIDATION_ERROR, "Invalid format_id.", status_code=422)
    return s


NEXDL_MP3 = "nexdl:mp3"


def _nexdl_mp3_audio_selector(format_id: str) -> str | None:
    """
    Map internal MP3 tokens to yt-dlp audio-only format selectors.
    FFmpegExtractAudio is applied in download_to_filepath.
    """
    if format_id == NEXDL_MP3:
        return "bestaudio/best"
    prefix = NEXDL_MP3 + ":"
    if not format_id.startswith(prefix):
        return None
    key = format_id[len(prefix) :]
    return {
        "best": "bestaudio/best",
        "mid": "bestaudio[abr<=160]/bestaudio",
        "low": "worstaudio/worst",
    }.get(key, "bestaudio/best")


class YtDlpService:
    """Reusable yt-dlp wrapper: metadata extraction and file download."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def extract_flat_info(self, url: str) -> dict[str, Any]:
        opts = _base_ydl_opts(self.settings)
        opts["extract_flat"] = False
        opts["skip_download"] = True
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False)
        except UnsupportedError as e:
            raise AppError(
                ErrorCode.UNSUPPORTED_PLATFORM,
                "Unsupported or unrecognized URL for extraction.",
                status_code=422,
                details={"hint": str(e)[:300]},
            ) from e
        except ExtractorError as e:
            raise _map_ytdlp_exception(e, url) from e
        except DownloadError as e:
            raise _map_ytdlp_exception(e, url) from e
        except AppError:
            raise
        except Exception as e:
            raise AppError(
                ErrorCode.DOWNLOAD_FAILED,
                "Unexpected error during metadata extraction.",
                status_code=502,
                details={"hint": str(e)[:400]},
            ) from e

    def build_analyze_response(self, url: str, platform: Platform) -> AnalyzeResponse:
        info = self.extract_flat_info(url)
        if info.get("_type") == "playlist":
            entries = [e for e in (info.get("entries") or []) if e]
            if len(entries) > 1:
                raise AppError(
                    ErrorCode.VALIDATION_ERROR,
                    "Playlist URLs are not supported. Use a single video or post URL.",
                    status_code=422,
                )
        formats_raw: list[dict[str, Any]] = list(info.get("formats") or [])
        title = info.get("title")
        duration = info.get("duration")
        if isinstance(duration, int):
            duration = float(duration)
        thumb = _thumbnail_url(info)
        formats_simplified = _simplify_formats(formats_raw)
        media_type = _media_type(info, formats_raw)
        max_h = _max_video_height(formats_raw)
        audio_only = media_type == "audio"
        qualities = _qualities_from_formats(formats_raw, media_type, max_h)

        preview = thumb or info.get("url") or info.get("webpage_url")

        return AnalyzeResponse(
            status="complete",
            platform=platform.value,
            title=title,
            thumbnail=thumb,
            duration=duration,
            media_type=media_type if media_type in ("video", "audio") else "unknown",
            preview_url=preview,
            qualities=qualities,
            formats=formats_simplified,
            webpage_url=info.get("webpage_url") or url,
            extractor=info.get("extractor"),
            id=info.get("id"),
        )

    def download_to_filepath(self, url: str, format_id: str) -> tuple[str, str | None]:
        """
        Download media to a temp file. Returns (filepath, suggested_filename_base).
        Caller must delete filepath when done.
        """
        format_id = _sanitize_format_id(format_id)
        tmp_root = self.settings.temp_dir or tempfile.gettempdir()
        os.makedirs(tmp_root, exist_ok=True)
        base = unique_temp_basename()
        outtmpl = os.path.join(tmp_root, base + ".%(ext)s")

        opts = _base_ydl_opts(self.settings)
        opts["outtmpl"] = outtmpl
        opts["noplaylist"] = True
        opts["max_filesize"] = self.settings.max_download_bytes

        mp3_audio_fmt = _nexdl_mp3_audio_selector(format_id)
        if mp3_audio_fmt is not None:
            if not _ffmpeg_exists():
                raise AppError(
                    ErrorCode.DOWNLOAD_FAILED,
                    "MP3 downloads require ffmpeg on the server.",
                    status_code=503,
                    details={"hint": "Install ffmpeg and ensure it is on PATH."},
                )
            opts["format"] = mp3_audio_fmt
            opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ]
        else:
            opts["format"] = format_id
            opts["merge_output_format"] = "mp4"

        if _ffmpeg_exists():
            opts["ffmpeg_location"] = shutil.which("ffmpeg")

        info: dict[str, Any] = {}

        def _cleanup_partial() -> None:
            for m in glob.glob(os.path.join(tmp_root, base + ".*")):
                try:
                    os.unlink(m)
                except OSError:
                    pass

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except UnsupportedError as e:
            _cleanup_partial()
            raise AppError(
                ErrorCode.UNSUPPORTED_PLATFORM,
                "Unsupported URL for download.",
                status_code=422,
                details={"hint": str(e)[:300]},
            ) from e
        except ExtractorError as e:
            _cleanup_partial()
            raise _map_ytdlp_exception(e, url) from e
        except DownloadError as e:
            _cleanup_partial()
            if "file is larger than max-filesize" in str(e).lower():
                raise AppError(
                    ErrorCode.FILE_TOO_LARGE,
                    "File exceeds configured maximum size.",
                    status_code=413,
                ) from e
            raise _map_ytdlp_exception(e, url) from e
        except AppError:
            _cleanup_partial()
            raise
        except Exception as e:
            _cleanup_partial()
            raise AppError(
                ErrorCode.DOWNLOAD_FAILED,
                "Unexpected error during download.",
                status_code=502,
                details={"hint": str(e)[:400]},
            ) from e

        filepath: str | None = None
        if info.get("requested_downloads"):
            filepath = info["requested_downloads"][-1].get("filepath")
        if not filepath:
            filepath = info.get("filepath")
        if not filepath or not os.path.isfile(filepath):
            # resolve glob on base
            matches = sorted(glob.glob(os.path.join(tmp_root, base + ".*")))
            candidates = [m for m in matches if os.path.isfile(m)]
            filepath = candidates[-1] if candidates else None

        if not filepath or not os.path.isfile(filepath):
            raise AppError(
                ErrorCode.DOWNLOAD_FAILED,
                "Download finished but output file was not found.",
                status_code=502,
            )

        size = os.path.getsize(filepath)
        if size > self.settings.max_download_bytes:
            try:
                os.unlink(filepath)
            except OSError:
                pass
            raise AppError(
                ErrorCode.FILE_TOO_LARGE,
                "Downloaded file exceeded maximum allowed size.",
                status_code=413,
            )

        title = info.get("title") or "media"
        ext = os.path.splitext(filepath)[1].lstrip(".") or "bin"
        suggested = f"{safe_filename_fragment(title)}.{ext}"

        return filepath, suggested

    async def extract_flat_info_async(self, url: str) -> dict[str, Any]:
        return await asyncio.to_thread(self.extract_flat_info, url)

    async def build_analyze_response_async(self, url: str, platform: Platform) -> AnalyzeResponse:
        return await asyncio.to_thread(self.build_analyze_response, url, platform)

    async def download_to_filepath_async(
        self, url: str, format_id: str
    ) -> tuple[str, str | None]:
        return await asyncio.to_thread(self.download_to_filepath, url, format_id)


def ytdlp_version() -> str | None:
    try:
        from yt_dlp.version import __version__ as v

        return v
    except Exception:
        pass
    try:
        import importlib.metadata as m

        return m.version("yt-dlp")
    except Exception:
        return None
