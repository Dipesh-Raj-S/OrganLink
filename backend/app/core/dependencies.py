from typing import Callable, List, Optional
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError, PyJWTError
from neo4j import AsyncDriver

from app.core.config import Settings, get_settings
from app.core.db import get_db_driver
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.jwt import decode_access_token
from app.repositories.user_repository import UserRepository
from app.schemas.auth import UserResponse
from app.schemas.enums import UserRoleEnum

http_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    auth_credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer_scheme),
    settings: Settings = Depends(get_settings),
    driver: AsyncDriver = Depends(get_db_driver),
) -> UserResponse:
    """
    Dependency: Extracts and verifies JWT bearer token, then loads active User from Neo4j.
    Returns UserResponse or raises UnauthorizedException (401).
    """
    if not auth_credentials or not auth_credentials.credentials:
        raise UnauthorizedException(
            message="Bearer authentication token missing",
            code="AUTHENTICATION_REQUIRED",
        )

    token = auth_credentials.credentials.strip()

    try:
        payload = decode_access_token(token, settings)
    except ExpiredSignatureError:
        raise UnauthorizedException(
            message="Authentication token has expired",
            code="TOKEN_EXPIRED",
        )
    except PyJWTError as exc:
        raise UnauthorizedException(
            message="Invalid authentication token",
            code="INVALID_TOKEN",
            details=str(exc),
        )

    user_repo = UserRepository(driver)
    user = await user_repo.get_by_id(payload.sub)
    if not user:
        raise UnauthorizedException(
            message="User referenced by token does not exist",
            code="USER_NOT_FOUND",
        )

    if not user.get("is_active", True):
        raise UnauthorizedException(
            message="User account is deactivated or disabled",
            code="USER_INACTIVE",
        )

    return UserResponse(**user)


def require_role(*allowed_roles: UserRoleEnum) -> Callable:
    """
    Role-Based Access Control (RBAC) dependency factory.
    Verifies that the authenticated current user has one of the required roles.
    Raises ForbiddenException (403) if unauthorized.
    """
    allowed_role_values = {role.value if isinstance(role, UserRoleEnum) else role for role in allowed_roles}

    async def role_checker(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
        user_role_val = current_user.role.value if isinstance(current_user.role, UserRoleEnum) else current_user.role
        if user_role_val not in allowed_role_values:
            raise ForbiddenException(
                message=f"Access forbidden: User role '{user_role_val}' is not permitted for this action",
                code="FORBIDDEN_INSUFFICIENT_ROLE",
                details={"required_roles": list(allowed_role_values), "user_role": user_role_val},
            )
        return current_user

    return role_checker
