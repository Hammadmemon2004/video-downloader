from enum import Enum
from typing import Any

from fastapi import HTTPException, status


class ErrorCode(str, Enum):
    INVALID_URL = "invalid_url"
    UNSUPPORTED_PLATFORM = "unsupported_platform"
    PRIVATE_CONTENT = "private_content"
    DOWNLOAD_FAILED = "download_failure"
    NOT_FOUND = "not_found"
    FILE_TOO_LARGE = "file_too_large"
    VALIDATION_ERROR = "validation_error"
    INTERNAL_ERROR = "internal_error"


def error_body(code: ErrorCode, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"error": code.value, "message": message}
    if details:
        body["details"] = details
    return body


class AppError(HTTPException):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        super().__init__(
            status_code=status_code,
            detail=error_body(code, message, details),
        )


def error_response(code: ErrorCode, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return error_body(code, message, details)
