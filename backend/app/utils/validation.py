from urllib.parse import urlparse

from app.utils.errors import AppError, ErrorCode


def normalize_url(raw: str) -> str:
    return (raw or "").strip()


def validate_http_url(url: str) -> str:
    if not url:
        raise AppError(ErrorCode.INVALID_URL, "URL is required.", status_code=422)

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise AppError(
            ErrorCode.INVALID_URL,
            "Only http and https URLs are allowed.",
            status_code=422,
        )
    if not parsed.netloc:
        raise AppError(ErrorCode.INVALID_URL, "URL is missing a host.", status_code=422)

    host = (parsed.hostname or "").lower()

    # Minimal SSRF guard (link-local / metadata services)
    if host.endswith(".local") or host in ("metadata.google.internal",):
        raise AppError(ErrorCode.INVALID_URL, "This URL is not allowed.", status_code=422)

    path = parsed.path or ""
    if ".." in path or ".." in parsed.netloc:
        raise AppError(ErrorCode.INVALID_URL, "Malformed URL.", status_code=422)

    return url
