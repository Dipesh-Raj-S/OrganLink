import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.core.config import get_settings
from app.core.jwt import create_access_token
from app.main import create_app
from app.repositories.user_repository import UserRepository
from app.schemas.enums import BloodTypeEnum, DonorStatusEnum, OrganTypeEnum, UserRoleEnum
from app.services.donor_service import DonorService


from unittest.mock import AsyncMock, MagicMock, patch
from app.core.db import get_db_driver


@pytest.fixture
def rbac_app():
    test_app = create_app()
    mock_driver = MagicMock()
    test_app.dependency_overrides[get_db_driver] = lambda: mock_driver
    return test_app



def get_token_for(role: str, user_id: str = "USR-TEST", username: str = "testuser") -> str:
    settings = get_settings()
    return create_access_token(user_id=user_id, username=username, role=role, settings=settings)


@pytest.mark.parametrize("role", ["ADMIN", "COORDINATOR"])
@pytest.mark.asyncio
async def test_donor_create_permitted_roles(rbac_app, role):
    token = get_token_for(role)
    mock_user = {"user_id": "USR-TEST", "username": "testuser", "role": role, "is_active": True}
    mock_created = {
        "donor_id": "DNR-RBAC-01",
        "name": "Test Donor",
        "blood_type": BloodTypeEnum.O_POS,
        "organ_type": OrganTypeEnum.KIDNEY,
        "location": {"latitude": 12.0, "longitude": 77.0},
        "status": DonorStatusEnum.AVAILABLE,
        "registered_at": "2026-10-15T12:00:00Z",
        "expiry_window_hours": 36,
        "version": 0,
    }

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(DonorService, "create_donor", new_callable=AsyncMock) as mock_donor_create:
        mock_user_get.return_value = mock_user
        mock_donor_create.return_value = mock_created

        transport = ASGITransport(app=rbac_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/donors",
                json={
                    "donor_id": "DNR-RBAC-01",
                    "name": "Test Donor",
                    "blood_type": "O+",
                    "organ_type": "Kidney",
                    "location": {"latitude": 12.0, "longitude": 77.0},
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 201


@pytest.mark.parametrize("role", ["DOCTOR", "AUDITOR"])
@pytest.mark.asyncio
async def test_donor_create_forbidden_roles(rbac_app, role):
    token = get_token_for(role)
    mock_user = {"user_id": "USR-TEST", "username": "testuser", "role": role, "is_active": True}

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get:
        mock_user_get.return_value = mock_user

        transport = ASGITransport(app=rbac_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/donors",
                json={
                    "donor_id": "DNR-RBAC-01",
                    "name": "Test Donor",
                    "blood_type": "O+",
                    "organ_type": "Kidney",
                    "location": {"latitude": 12.0, "longitude": 77.0},
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 403
        data = res.json()
        assert data["error"]["code"] == "FORBIDDEN_INSUFFICIENT_ROLE"


@pytest.mark.asyncio
async def test_donor_delete_requires_admin(rbac_app):
    coord_token = get_token_for("COORDINATOR")
    coord_user = {"user_id": "USR-COORD", "username": "coord", "role": "COORDINATOR", "is_active": True}

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get:
        mock_user_get.return_value = coord_user

        transport = ASGITransport(app=rbac_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.delete(
                "/api/v1/donors/DNR-001",
                headers={"Authorization": f"Bearer {coord_token}"},
            )

        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN_INSUFFICIENT_ROLE"


@pytest.mark.asyncio
async def test_donor_delete_admin_allowed(rbac_app):
    admin_token = get_token_for("ADMIN")
    admin_user = {"user_id": "USR-ADMIN", "username": "admin", "role": "ADMIN", "is_active": True}

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(DonorService, "delete_donor", new_callable=AsyncMock) as mock_del:
        mock_user_get.return_value = admin_user
        mock_del.return_value = None

        transport = ASGITransport(app=rbac_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.delete(
                "/api/v1/donors/DNR-001",
                headers={"Authorization": f"Bearer {admin_token}"},
            )

        assert res.status_code == 204


@pytest.mark.parametrize("role", ["ADMIN", "COORDINATOR", "DOCTOR", "AUDITOR"])
@pytest.mark.asyncio
async def test_read_endpoints_accessible_to_all_authenticated_roles(rbac_app, role):
    token = get_token_for(role)
    mock_user = {"user_id": "USR-TEST", "username": "testuser", "role": role, "is_active": True}

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(DonorService, "get_donor", new_callable=AsyncMock) as mock_get_donor:
        mock_user_get.return_value = mock_user
        mock_get_donor.return_value = {
            "donor_id": "DNR-001",
            "name": "Donor",
            "blood_type": BloodTypeEnum.O_POS,
            "organ_type": OrganTypeEnum.KIDNEY,
            "location": {"latitude": 12.0, "longitude": 77.0},
            "status": DonorStatusEnum.AVAILABLE,
            "registered_at": "2026-10-15T12:00:00Z",
            "expiry_window_hours": 36,
            "version": 0,
        }

        transport = ASGITransport(app=rbac_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/donors/DNR-001", headers={"Authorization": f"Bearer {token}"})

        assert res.status_code == 200


@pytest.mark.asyncio
async def test_public_health_and_root_endpoints_remain_unauthenticated(rbac_app):
    transport = ASGITransport(app=rbac_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res_root = await client.get("/")
        assert res_root.status_code == 200

        with patch("app.core.db.db.verify_connectivity", new_callable=AsyncMock) as mock_verify:
            mock_verify.return_value = True
            res_health = await client.get("/health")
            assert res_health.status_code == 200
            res_api_health = await client.get("/api/v1/health")
            assert res_api_health.status_code == 200
