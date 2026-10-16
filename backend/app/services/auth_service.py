import logging
from typing import Any, Dict, Optional
from neo4j import AsyncDriver

from app.core.config import Settings
from app.core.exceptions import UnauthorizedException
from app.core.jwt import create_access_token
from app.core.security import verify_password
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenResponse, UserResponse

logger = logging.getLogger("organ_network.auth_service")


class AuthService:
    """
    Business service for user authentication and current user retrieval.
    """

    def __init__(self, driver: AsyncDriver, settings: Settings) -> None:
        self.driver = driver
        self.settings = settings
        self.repo = UserRepository(driver)

    async def authenticate_user(self, username: str, password: str) -> TokenResponse:
        """
        Authenticates user with username & password, verifies PBKDF2 hash, and returns JWT.
        """
        user = await self.repo.get_by_username(username)
        if not user:
            logger.warning("Authentication failed: User '%s' not found", username)
            raise UnauthorizedException(
                message="Invalid username or password",
                code="INVALID_CREDENTIALS",
            )

        if not user.get("is_active", True):
            logger.warning("Authentication rejected: User '%s' is disabled/inactive", username)
            raise UnauthorizedException(
                message="User account is inactive or disabled",
                code="USER_INACTIVE",
            )

        stored_hash = user.get("password_hash")
        if not stored_hash or not verify_password(password, stored_hash):
            logger.warning("Authentication failed: Invalid password for user '%s'", username)
            raise UnauthorizedException(
                message="Invalid username or password",
                code="INVALID_CREDENTIALS",
            )

        token = create_access_token(
            user_id=user["user_id"],
            username=user["username"],
            role=user["role"],
            settings=self.settings,
        )

        return TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in=self.settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def get_current_user_profile(self, user_id: str) -> UserResponse:
        """
        Retrieves safe profile for authenticated user.
        """
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise UnauthorizedException(
                message="User referenced by token no longer exists",
                code="USER_NOT_FOUND",
            )
        if not user.get("is_active", True):
            raise UnauthorizedException(
                message="User account is inactive or disabled",
                code="USER_INACTIVE",
            )
        return UserResponse(**user)
