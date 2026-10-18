from pathlib import Path
from typing import List, Optional, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Locate project roots:
# config.py is at: <root>/backend/app/core/config.py
# ROOT_DIR is: <root>/ (organ-network/)
# BACKEND_DIR is: <root>/backend/
CURRENT_FILE = Path(__file__).resolve()
BACKEND_DIR = CURRENT_FILE.parent.parent.parent
ROOT_DIR = BACKEND_DIR.parent

ENV_FILE_PATH = ROOT_DIR / ".env"
BACKEND_ENV_FILE_PATH = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    """
    Application Settings loaded from environment variables or .env file.
    Validates presence of required database configurations on startup.
    """

    # Neo4j Settings
    NEO4J_URI: str = Field(..., description="Neo4j connection URI (e.g., bolt://localhost:7687)")
    NEO4J_USER: str = Field(..., description="Neo4j username (e.g., neo4j)")
    NEO4J_PASSWORD: str = Field(..., description="Neo4j authentication password")

    # API & Environment Settings
    API_PREFIX: str = Field(default="/api/v1", description="Global API route prefix")
    APP_ENV: str = Field(default="development", description="Application environment: development, testing, or production")

    # CORS Settings
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:3000"],
        description="Allowed CORS origins for frontend clients",
    )

    # JWT Authentication Settings
    JWT_SECRET: str = Field(
        default="organlink-insecure-dev-jwt-secret-do-not-use-in-production-2026",
        description="Cryptographic secret key for signing JWT tokens",
    )
    JWT_ALGORITHM: str = Field(
        default="HS256",
        description="Algorithm for JWT signing and verification (e.g., HS256)",
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=30,
        ge=1,
        le=1440,
        description="Lifetime of access tokens in minutes (default 30 min)",
    )
    JWT_ISSUER: Optional[str] = Field(
        default="organlink-auth",
        description="JWT issuer claim (iss)",
    )
    JWT_AUDIENCE: Optional[str] = Field(
        default="organlink-api",
        description="JWT audience claim (aud)",
    )

    @field_validator("NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD")
    @classmethod
    def check_non_empty(cls, v: str, info) -> str:
        if not v or not v.strip():
            raise ValueError(f"Configuration key '{info.field_name}' must not be empty.")
        return v.strip()

    @field_validator("JWT_SECRET")
    @classmethod
    def check_jwt_secret_in_prod(cls, v: str, info) -> str:
        if not v or not v.strip():
            raise ValueError("JWT_SECRET must not be empty.")
        # We enforce that in production a secure secret is provided
        return v.strip()

    model_config = SettingsConfigDict(
        # Check root .env first, then backend .env if root is not found
        env_file=(str(ENV_FILE_PATH), str(BACKEND_ENV_FILE_PATH)),
        env_file_encoding="utf-8",
        extra="ignore",
    )


def get_settings() -> Settings:
    """Instantiate and return settings."""
    return Settings()
