import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.exceptions import ConflictException, NotFoundException
from app.main import create_app
from app.repositories.allocation_repository import AllocationRepository
from app.repositories.matching_repository import MatchingRepository
from app.repositories.user_repository import UserRepository
from app.schemas.allocation import AllocationResponse
from app.schemas.enums import AllocationStatusEnum, UserRoleEnum
from app.services.allocation_service import AllocationService


from app.core.db import get_db_driver


@pytest.fixture
def allocation_app():
    test_app = create_app()
    mock_driver = MagicMock()
    test_app.dependency_overrides[get_db_driver] = lambda: mock_driver
    return test_app



def get_token(role: str = "COORDINATOR", user_id: str = "USR-002", username: str = "coordinator_sarah") -> str:
    from app.core.config import get_settings
    from app.core.jwt import create_access_token
    return create_access_token(user_id=user_id, username=username, role=role, settings=get_settings())


@pytest.mark.asyncio
async def test_allocate_match_success(allocation_app):
    token = get_token("COORDINATOR")
    mock_user = {"user_id": "USR-002", "username": "coordinator_sarah", "role": "COORDINATOR", "is_active": True}

    mock_resp = AllocationResponse(
        allocation_id="ALC-TEST-001",
        match_id="MTR-001",
        donor_id="DNR-001",
        recipient_id="REC-001",
        hospital_id="HOSP-001",
        allocated_by="USR-002",
        confirmed_at="2026-10-16T12:00:00Z",
        status=AllocationStatusEnum.CONFIRMED,
    )

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(AllocationService, "allocate_match", new_callable=AsyncMock) as mock_allocate:
        mock_user_get.return_value = mock_user
        mock_allocate.return_value = mock_resp

        transport = ASGITransport(app=allocation_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/matches/requests/MTR-001/allocate",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 201
        data = res.json()
        assert data["allocation_id"] == "ALC-TEST-001"
        assert data["match_id"] == "MTR-001"
        assert data["donor_id"] == "DNR-001"
        assert data["recipient_id"] == "REC-001"
        assert data["allocated_by"] == "USR-002"
        assert data["status"] == "Confirmed"


@pytest.mark.asyncio
async def test_allocate_match_unauthorized_role_403(allocation_app):
    token = get_token("DOCTOR")  # DOCTOR cannot allocate
    mock_user = {"user_id": "USR-003", "username": "dr_chen", "role": "DOCTOR", "is_active": True}

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get:
        mock_user_get.return_value = mock_user

        transport = ASGITransport(app=allocation_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/matches/requests/MTR-001/allocate",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN_INSUFFICIENT_ROLE"


@pytest.mark.asyncio
async def test_allocate_match_not_found_404(allocation_app):
    token = get_token("ADMIN")
    mock_user = {"user_id": "USR-001", "username": "admin", "role": "ADMIN", "is_active": True}

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(AllocationService, "allocate_match", new_callable=AsyncMock) as mock_allocate:
        mock_user_get.return_value = mock_user
        mock_allocate.side_effect = NotFoundException("MatchRequest not found", code="MATCH_REQUEST_NOT_FOUND")

        transport = ASGITransport(app=allocation_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/matches/requests/MTR-UNKNOWN/allocate",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 404
        assert res.json()["error"]["code"] == "MATCH_REQUEST_NOT_FOUND"


@pytest.mark.asyncio
async def test_allocate_match_donor_unavailable_409(allocation_app):
    token = get_token("COORDINATOR")
    mock_user = {"user_id": "USR-002", "username": "coord", "role": "COORDINATOR", "is_active": True}

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(AllocationService, "allocate_match", new_callable=AsyncMock) as mock_allocate:
        mock_user_get.return_value = mock_user
        mock_allocate.side_effect = ConflictException("Donor is no longer available", code="DONOR_UNAVAILABLE")

        transport = ASGITransport(app=allocation_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/matches/requests/MTR-001/allocate",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 409
        assert res.json()["error"]["code"] == "DONOR_UNAVAILABLE"


@pytest.mark.asyncio
async def test_get_allocation_by_id(allocation_app):
    token = get_token("AUDITOR")
    mock_user = {"user_id": "USR-004", "username": "auditor", "role": "AUDITOR", "is_active": True}

    mock_resp = AllocationResponse(
        allocation_id="ALC-001",
        match_id="MTR-001",
        donor_id="DNR-001",
        recipient_id="REC-001",
        hospital_id="HOSP-001",
        allocated_by="USR-002",
        confirmed_at="2026-10-16T12:00:00Z",
        status=AllocationStatusEnum.CONFIRMED,
    )

    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(AllocationService, "get_allocation", new_callable=AsyncMock) as mock_get_alc:
        mock_user_get.return_value = mock_user
        mock_get_alc.return_value = mock_resp

        transport = ASGITransport(app=allocation_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/allocations/ALC-001",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200
        assert res.json()["allocation_id"] == "ALC-001"
