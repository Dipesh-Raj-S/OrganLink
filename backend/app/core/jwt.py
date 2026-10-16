from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import jwt
from jwt.exceptions import PyJWTError

from app.core.config import Settings
from app.schemas.auth import TokenPayload


def create_access_token(
    user_id: str,
    username: str,
    role: str,
    settings: Settings,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Creates a signed JWT access token.
    Claims included: sub (user_id), username, role, exp, iat, iss, aud.
    """
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: Dict[str, Any] = {
        "sub": user_id,
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }

    if settings.JWT_ISSUER:
        payload["iss"] = settings.JWT_ISSUER
    if settings.JWT_AUDIENCE:
        payload["aud"] = settings.JWT_AUDIENCE

    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token


def decode_access_token(token: str, settings: Settings) -> TokenPayload:
    """
    Decodes and validates a JWT token.
    Enforces secret, algorithm, expiration, issuer and audience validation.
    Raises PyJWTError subclasses on invalid tokens.
    """
    decode_kwargs: Dict[str, Any] = {
        "algorithms": [settings.JWT_ALGORITHM],
        "options": {
            "require": ["sub", "exp", "iat"],
            "verify_exp": True,
            "verify_iat": True,
        },
    }

    if settings.JWT_ISSUER:
        decode_kwargs["issuer"] = settings.JWT_ISSUER
        decode_kwargs["options"]["verify_iss"] = True
    else:
        decode_kwargs["options"]["verify_iss"] = False

    if settings.JWT_AUDIENCE:
        decode_kwargs["audience"] = settings.JWT_AUDIENCE
        decode_kwargs["options"]["verify_aud"] = True
    else:
        decode_kwargs["options"]["verify_aud"] = False

    decoded = jwt.decode(token, settings.JWT_SECRET, **decode_kwargs)
    return TokenPayload(**decoded)
