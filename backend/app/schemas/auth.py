from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.enums import UserRoleEnum


class TokenResponse(BaseModel):
    access_token: str = Field(..., description="Signed JWT Bearer access token")
    token_type: str = Field(default="bearer", description="Token type, always 'bearer'")
    expires_in: int = Field(..., description="Access token lifetime in seconds")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100, description="Username")
    password: str = Field(..., min_length=1, max_length=256, description="User password")


class UserResponse(BaseModel):
    user_id: str = Field(..., description="Unique user identifier (e.g., USR-001)")
    username: str = Field(..., description="User unique username")
    role: UserRoleEnum = Field(..., description="RBAC system role")
    is_active: bool = Field(default=True, description="Account active status")
    hospital_id: Optional[str] = Field(default=None, description="Associated hospital ID")


class TokenPayload(BaseModel):
    sub: str = Field(..., description="User ID (subject)")
    username: str = Field(..., description="Username")
    role: UserRoleEnum = Field(..., description="User role")
    exp: int = Field(..., description="Expiration timestamp (epoch)")
    iat: int = Field(..., description="Issued at timestamp (epoch)")
    iss: Optional[str] = Field(default=None, description="Issuer")
    aud: Optional[str] = Field(default=None, description="Audience")
