from typing import Any, Optional


class AppException(Exception):
    """Base application exception for standardized error contracts."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[Any] = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


class NotFoundException(AppException):
    def __init__(self, message: str, code: str = "RESOURCE_NOT_FOUND", details: Optional[Any] = None) -> None:
        super().__init__(status_code=404, code=code, message=message, details=details)


class ConflictException(AppException):
    def __init__(self, message: str, code: str = "CONFLICT_ERROR", details: Optional[Any] = None) -> None:
        super().__init__(status_code=409, code=code, message=message, details=details)


class BadRequestException(AppException):
    def __init__(self, message: str, code: str = "BAD_REQUEST", details: Optional[Any] = None) -> None:
        super().__init__(status_code=400, code=code, message=message, details=details)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Authentication required", code: str = "UNAUTHORIZED", details: Optional[Any] = None) -> None:
        super().__init__(status_code=401, code=code, message=message, details=details)


class ForbiddenException(AppException):
    def __init__(self, message: str = "Access forbidden", code: str = "FORBIDDEN", details: Optional[Any] = None) -> None:
        super().__init__(status_code=403, code=code, message=message, details=details)

