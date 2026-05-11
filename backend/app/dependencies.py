from functools import lru_cache

from app.services.ytdlp_service import YtDlpService


@lru_cache
def get_ytdlp_service() -> YtDlpService:
    """Single shared service instance (stateless; thread-pool work in routes)."""
    return YtDlpService()
