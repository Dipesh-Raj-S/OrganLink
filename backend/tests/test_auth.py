from datetime import timedelta
import pytest
from httpx import ASGITransport, AsyncClient
import jwt
from unittest.mock import AsyncMock, patch

from app.core.config import get_settings
from app.core.jwt import create_access_token
from app.core.security import hash_password, verify_password
from app.main import create_app
from app.repositories.user_repository import UserRepository
from app.schemas.enums import UserRoleEnum


# -----------------------------------------------------------------------------
# 1. SECURITY & PASSWORD HASHING UNIT TESTS
# -----------------------------------------------------------------------------

def test_password_hashing_and_verification():
    plain = "MySecretPassword!2026"
    hashed = hash_password(plain)
    assert hashed.startswith("pbkdf2_sha256$100000$")
    assert verify_password(plain, hashed) is True
    assert verify_password("WrongPassword", hashed) is False
    assert verify_password("", hashed) is False
    assert verify_password(plain, "invalid_hash_string") is False


def test_seed_user_passwords_verification():
    # Verify deterministic hashes generated with the project seed salt
    salt = "organ_network_seed_salt_2026"
    admin_hash = hash_password("AdminSecurePass!2026", salt=salt)
    assert verify_password("AdminSecurePass!2026", admin_hash) is True
    assert verify_password("Wrong", admin_hash) is False


# -----------------------------------------------------------------------------
# 2. JWT TOKEN CREATION & VALIDATION TESTS
# -----------------------------------------------------------------------------

def test_jwt_token_claims_and_roundtrip():
    settings = get_settings()
    token = create_access_token(
        user_id="USR-999",
        username="test_jwt_user",
        role=UserRoleEnum.DOCTOR.value,
        settings=settings,
        expires_delta=timedelta(minutes=15),
    )

    from app.core.jwt import decode_access_token
    payload = decode_access_token(token, settings)
    assert payload.sub == "USR-999"
    assert payload.username == "test_jwt_user"
    assert payload.role == UserRoleEnum.DOCTOR
    assert payload.iss == settings.JWT_ISSUER
    assert payload.aud == settings.JWT_AUDIENCE
    assert payload.exp > payload.iat


def test_jwt_token_expired():
    settings = get_settings()
    token = create_access_token(
        user_id="USR-999",
        username="expired_user",
        role=UserRoleEnum.DOCTOR.value,
        settings=settings,
        expires_delta=timedelta(seconds=-10),  # expired
    )

    from app.core.jwt import decode_access_token
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token, settings)


def test_jwt_token_invalid_signature():
    settings = get_settings()
    token = create_access_token(
        user_id="USR-999",
        username="user",
        role=UserRoleEnum.DOCTOR.value,
        settings=settings,
    )

    # Decode with a different secret
    from app.core.config import Settings
    wrong_settings = settings.model_copy(update={"JWT_SECRET": "different-wrong-secret-key-12345"})
    from app.core.jwt import decode_access_token
    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(token, wrong_settings)


def test_jwt_token_wrong_algorithm():
    settings = get_settings()
    # Create token with 'none' or different alg
    header = {"alg": "none", "typ": "JWT"}
    fake_token = jwt.encode({"sub": "USR-1", "exp": 9999999999, "iat": 1000}, key="", algorithm="none")
    from app.core.jwt import decode_access_token
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(fake_token, settings)


# -----------------------------------------------------------------------------
# 3. AUTH API ENDPOINT TESTS (Mocked User Repository)
# -----------------------------------------------------------------------------

from unittest.mock import AsyncMock, MagicMock, patch
from app.core.db import get_db_driver


@pytest.fixture
def auth_app():
    test_app = create_app()
    mock_driver = MagicMock()
    test_app.dependency_overrides[get_db_driver] = lambda: mock_driver
    return test_app



@pytest.mark.asyncio
async def test_login_success(auth_app):
    mock_user = {
        "user_id": "USR-001",
        "username": "admin_sys",
        "password_hash": hash_password("ValidPassword!2026"),
        "role": "ADMIN",
        "is_active": True,
        "hospital_id": "HOSP-001",
    }

    with patch.object(UserRepository, "get_by_username", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_user

        transport = ASGITransport(app=auth_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin_sys", "password": "ValidPassword!2026"},
            )

        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 1800
        # Password hash must NEVER appear in responses
        assert "password" not in str(data)
        assert "password_hash" not in str(data)


@pytest.mark.asyncio
async def test_login_wrong_password(auth_app):
    mock_user = {
        "user_id": "USR-001",
        "username": "admin_sys",
        "password_hash": hash_password("ValidPassword!2026"),
        "role": "ADMIN",
        "is_active": True,
        "hospital_id": "HOSP-001",
    }

    with patch.object(UserRepository, "get_by_username", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_user

        transport = ASGITransport(app=auth_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin_sys", "password": "WrongPassword!"},
            )

        assert res.status_code == 401
        data = res.json()
        assert data["error"]["code"] == "INVALID_CREDENTIALS"
        assert "password_hash" not in str(data)
        assert "WrongPassword!" not in str(data)



@pytest.mark.asyncio
async def test_login_unknown_username(auth_app):
    with patch.object(UserRepository, "get_by_username", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = None

        transport = ASGITransport(app=auth_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/auth/login",
                json={"username": "nonexistent_user", "password": "AnyPassword!"},
            )

        assert res.status_code == 401
        data = res.json()
        assert data["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_login_inactive_user(auth_app):
    mock_user = {
        "user_id": "USR-002",
        "username": "disabled_user",
        "password_hash": hash_password("ValidPassword!2026"),
        "role": "COORDINATOR",
        "is_active": False,
        "hospital_id": "HOSP-002",
    }

    with patch.object(UserRepository, "get_by_username", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_user

        transport = ASGITransport(app=auth_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/auth/login",
                json={"username": "disabled_user", "password": "ValidPassword!2026"},
            )

        assert res.status_code == 401
        data = res.json()
        assert data["error"]["code"] == "USER_INACTIVE"


@pytest.mark.asyncio
async def test_get_me_success(auth_app):
    settings = get_settings()
    token = create_access_token("USR-001", "admin_sys", "ADMIN", settings)

    mock_profile = {
        "user_id": "USR-001",
        "username": "admin_sys",
        "role": "ADMIN",
        "is_active": True,
        "hospital_id": "HOSP-001",
    }

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_get_id:
        mock_get_id.return_value = mock_profile

        transport = ASGITransport(app=auth_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200
        data = res.json()
        assert data["user_id"] == "USR-001"
        assert data["username"] == "admin_sys"
        assert data["role"] == "ADMIN"
        assert data["is_active"] is True
        assert data["hospital_id"] == "HOSP-001"
        assert "password" not in str(data)


@pytest.mark.asyncio
async def test_get_me_missing_token_401(auth_app):
    transport = ASGITransport(app=auth_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/auth/me")

    assert res.status_code == 401
    assert res.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


@pytest.mark.asyncio
async def test_get_me_malformed_token_401(auth_app):
    transport = ASGITransport(app=auth_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-valid-jwt"})

    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_TOKEN"


@pytest.mark.asyncio
async def test_get_me_user_no_longer_exists_401(auth_app):
    settings = get_settings()
    token = create_access_token("USR-DELETED", "deleted_user", "DOCTOR", settings)

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_get_id:
        mock_get_id.return_value = None

        transport = ASGITransport(app=auth_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 401
        assert res.json()["error"]["code"] == "USER_NOT_FOUND"
