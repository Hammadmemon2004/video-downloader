from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEXDL_",
        env_file=".env",
        extra="ignore",
    )

    app_name: str = "NexDL API"
    debug: bool = False

    # Max bytes for a single download (default 500 MiB)
    max_download_bytes: int = 500 * 1024 * 1024

    # yt-dlp socket timeout (seconds)
    socket_timeout: int = 30

    # Temp directory (empty = system default)
    temp_dir: str | None = None

    # CORS — include null for file:// HTML, localhost for dev
    cors_origins: list[str] = [
        "http://localhost",
        "http://localhost:80",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "null",
    ]
    cors_allow_origin_regex: str | None = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    # When True, allows any origin (good for local file:// + dev; disable in production).
    cors_allow_all: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
