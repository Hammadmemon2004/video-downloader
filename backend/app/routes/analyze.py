from fastapi import APIRouter, Depends

from app.dependencies import get_ytdlp_service
from app.models.schemas import AnalyzeRequest, AnalyzeResponse
from app.services.ytdlp_service import YtDlpService
from app.utils import AppError, ErrorCode, detect_platform, is_supported_url, normalize_url, validate_http_url
from app.utils.platform import Platform

router = APIRouter()


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={
        200: {"description": "Metadata extracted; `status` is `complete` for successful loads."},
        422: {"description": "Invalid URL, unsupported host, or playlist / validation error."},
        403: {"description": "Private or login-gated content."},
        404: {"description": "Media removed or unavailable."},
        502: {"description": "Extractor or network failure."},
    },
)
async def analyze(
    body: AnalyzeRequest,
    service: YtDlpService = Depends(get_ytdlp_service),
) -> AnalyzeResponse:
    """
    Analyze a social URL with yt-dlp (async worker thread).
    Use HTTP status + JSON `status` for frontend loading / error UI.
    """
    url = normalize_url(body.url)
    url = validate_http_url(url)

    platform = detect_platform(url)
    if platform == Platform.UNKNOWN or not is_supported_url(url):
        raise AppError(
            ErrorCode.UNSUPPORTED_PLATFORM,
            "This domain is not in the supported platform list.",
            status_code=422,
            details={"supported": [p.value for p in Platform if p != Platform.UNKNOWN]},
        )

    return await service.build_analyze_response_async(url, platform)
