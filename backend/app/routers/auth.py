from typing import Optional
from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from neo4j import AsyncDriver

from app.core.config import Settings, get_settings
from app.core.db import get_db_driver
from app.core.dependencies import get_current_user
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


def get_auth_service(
    driver: AsyncDriver = Depends(get_db_driver),
    settings: Settings = Depends(get_settings),
) -> AuthService:
    return AuthService(driver, settings)


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="User login with credentials",
    description=(
        "Authenticates a registered system user using their username and password. "
        "Verifies credentials against PBKDF2-HMAC-SHA256 salted password hashes and "
        "issues a signed JWT bearer token. Accepts JSON payload or form."
    ),
)
async def login(
    payload: LoginRequest,
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    return await service.authenticate_user(payload.username, payload.password)


@router.post(
    "/token",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="OAuth2 compatible token login",
    description="OAuth2-compatible password form endpoint for Swagger UI Authorization.",
    include_in_schema=True,
)
async def login_oauth2_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    return await service.authenticate_user(form_data.username, form_data.password)


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Current authenticated user profile",
    description="Retrieves the authenticated user's profile and active role from the database. Password hashes are never exposed.",
)
async def get_me(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    return current_user
