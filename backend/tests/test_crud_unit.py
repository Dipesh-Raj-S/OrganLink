import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.main import create_app
from app.core.db import db, get_db_driver
from app.core.exceptions import ConflictException, NotFoundException, BadRequestException
from app.schemas.enums import BloodTypeEnum, DonorStatusEnum, OrganTypeEnum, RecipientStatusEnum
from app.services.donor_service import DonorService
from app.services.recipient_service import RecipientService
from app.services.hospital_service import HospitalService


from app.core.dependencies import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.enums import UserRoleEnum


@pytest.fixture
def app():
    test_app = create_app()
    mock_driver = MagicMock()
    test_app.dependency_overrides[get_db_driver] = lambda: mock_driver
    test_app.dependency_overrides[get_current_user] = lambda: UserResponse(
        user_id="USR-MOCK-ADMIN",
        username="admin_test",
        role=UserRoleEnum.ADMIN,
        is_active=True,
    )
    return test_app



# -----------------------------------------------------------------------------
# 1. DONOR TESTS
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_donor_success(app):
    payload = {
        "donor_id": "DNR-UNIT-01",
        "name": "John Doe",
        "blood_type": "O-",
        "organ_type": "Kidney",
        "location": {"latitude": 12.9716, "longitude": 77.5946},
        "status": "Available",
        "expiry_window_hours": 36,
    }

    mock_resp = {
        "donor_id": "DNR-UNIT-01",
        "name": "John Doe",
        "blood_type": BloodTypeEnum.O_NEG,
        "organ_type": OrganTypeEnum.KIDNEY,
        "location": {"latitude": 12.9716, "longitude": 77.5946},
        "status": DonorStatusEnum.AVAILABLE,
        "registered_at": "2026-10-15T12:00:00Z",
        "expiry_window_hours": 36,
        "version": 0,
    }

    with patch.object(DonorService, "create_donor", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/donors", json=payload)

        assert res.status_code == 201
        data = res.json()
        assert data["donor_id"] == "DNR-UNIT-01"
        assert data["version"] == 0
        assert data["location"] == {"latitude": 12.9716, "longitude": 77.5946}


@pytest.mark.asyncio
async def test_create_donor_duplicate_id_409(app):
    payload = {
        "donor_id": "DNR-DUP",
        "name": "Duplicate Donor",
        "blood_type": "A+",
        "organ_type": "Liver",
        "location": {"latitude": 13.0, "longitude": 80.0},
    }

    with patch.object(DonorService, "create_donor", new_callable=AsyncMock) as mock_create:
        mock_create.side_effect = ConflictException("Donor already exists", code="DUPLICATE_DONOR_ID")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/donors", json=payload)

        assert res.status_code == 409
        data = res.json()
        assert data["error"]["code"] == "DUPLICATE_DONOR_ID"


@pytest.mark.asyncio
async def test_get_donor_not_found_404(app):
    with patch.object(DonorService, "get_donor", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = NotFoundException("Donor not found", code="DONOR_NOT_FOUND")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/donors/DNR-NONEXISTENT")

        assert res.status_code == 404
        data = res.json()
        assert data["error"]["code"] == "DONOR_NOT_FOUND"


@pytest.mark.asyncio
async def test_patch_donor_semantics(app):
    updates = {"name": "Updated Name"}
    mock_resp = {
        "donor_id": "DNR-001",
        "name": "Updated Name",
        "blood_type": BloodTypeEnum.O_POS,
        "organ_type": OrganTypeEnum.KIDNEY,
        "location": {"latitude": 12.0, "longitude": 77.0},
        "status": DonorStatusEnum.AVAILABLE,
        "registered_at": "2026-10-15T12:00:00Z",
        "expiry_window_hours": 24,
        "version": 1,
    }

    with patch.object(DonorService, "update_donor", new_callable=AsyncMock) as mock_update:
        mock_update.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch("/api/v1/donors/DNR-001", json=updates)

        assert res.status_code == 200
        data = res.json()
        assert data["name"] == "Updated Name"
        assert data["version"] == 1


@pytest.mark.asyncio
async def test_donor_filters_and_pagination(app):
    mock_list_resp = {
        "items": [
            {
                "donor_id": "DNR-001",
                "name": "Donor 1",
                "blood_type": "O-",
                "organ_type": "Kidney",
                "location": {"latitude": 12.0, "longitude": 77.0},
                "status": "Available",
                "registered_at": "2026-10-15T12:00:00Z",
                "expiry_window_hours": 24,
                "version": 0,
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 20,
    }

    with patch.object(DonorService, "list_donors", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = mock_list_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/donors?status=Available&organ_type=Kidney&blood_type=O-&page=1&page_size=20")

        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["donor_id"] == "DNR-001"


@pytest.mark.asyncio
async def test_delete_donor_with_allocation_history_409(app):
    with patch.object(DonorService, "delete_donor", new_callable=AsyncMock) as mock_delete:
        mock_delete.side_effect = ConflictException("Cannot delete donor involved in allocations", code="DONOR_ALLOCATION_CONFLICT")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.delete("/api/v1/donors/DNR-004")

        assert res.status_code == 409
        data = res.json()
        assert data["error"]["code"] == "DONOR_ALLOCATION_CONFLICT"


# -----------------------------------------------------------------------------
# 2. RECIPIENT TESTS
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_recipient_success(app):
    payload = {
        "recipient_id": "REC-UNIT-01",
        "name": "Jane Patient",
        "blood_type": "A+",
        "organ_needed": "Heart",
        "urgency_score": 8,
        "location": {"latitude": 13.0827, "longitude": 80.2707},
        "hospital_id": "HOSP-002",
    }

    mock_resp = {
        "recipient_id": "REC-UNIT-01",
        "name": "Jane Patient",
        "blood_type": BloodTypeEnum.A_POS,
        "organ_needed": OrganTypeEnum.HEART,
        "urgency_score": 8,
        "location": {"latitude": 13.0827, "longitude": 80.2707},
        "waitlist_since": "2026-10-15T12:00:00Z",
        "status": RecipientStatusEnum.WAITING,
        "hospital_id": "HOSP-002",
    }

    with patch.object(RecipientService, "create_recipient", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/recipients", json=payload)

        assert res.status_code == 201
        data = res.json()
        assert data["recipient_id"] == "REC-UNIT-01"
        assert data["hospital_id"] == "HOSP-002"
        assert data["urgency_score"] == 8


@pytest.mark.asyncio
async def test_create_recipient_invalid_urgency_score_422(app):
    payload = {
        "recipient_id": "REC-ERR",
        "name": "Invalid Urgency",
        "blood_type": "A+",
        "organ_needed": "Heart",
        "urgency_score": 15,  # Exceeds max 10
        "location": {"latitude": 13.0, "longitude": 80.0},
        "hospital_id": "HOSP-001",
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/v1/recipients", json=payload)

    assert res.status_code == 422
    data = res.json()
    assert data["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_create_recipient_unknown_hospital_404(app):
    payload = {
        "recipient_id": "REC-ERR-2",
        "name": "Unknown Hospital Recipient",
        "blood_type": "B+",
        "organ_needed": "Liver",
        "urgency_score": 5,
        "location": {"latitude": 13.0, "longitude": 80.0},
        "hospital_id": "HOSP-NONEXISTENT",
    }

    with patch.object(RecipientService, "create_recipient", new_callable=AsyncMock) as mock_create:
        mock_create.side_effect = NotFoundException("Hospital not found", code="HOSPITAL_NOT_FOUND")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/recipients", json=payload)

        assert res.status_code == 404
        data = res.json()
        assert data["error"]["code"] == "HOSPITAL_NOT_FOUND"


@pytest.mark.asyncio
async def test_update_recipient_urgency_endpoint(app):
    mock_resp = {
        "recipient_id": "REC-001",
        "name": "Jane Patient",
        "blood_type": BloodTypeEnum.A_POS,
        "organ_needed": OrganTypeEnum.HEART,
        "urgency_score": 9,
        "location": {"latitude": 13.0, "longitude": 80.0},
        "waitlist_since": "2026-10-15T12:00:00Z",
        "status": RecipientStatusEnum.WAITING,
        "hospital_id": "HOSP-001",
    }

    with patch.object(RecipientService, "update_urgency", new_callable=AsyncMock) as mock_urg:
        mock_urg.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch("/api/v1/recipients/REC-001/urgency", json={"urgency_score": 9})

        assert res.status_code == 200
        data = res.json()
        assert data["urgency_score"] == 9


# -----------------------------------------------------------------------------
# 3. HOSPITAL TESTS
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_hospital_success(app):
    payload = {
        "hospital_id": "HOSP-NEW",
        "name": "General Health Center",
        "location": {"latitude": 28.7041, "longitude": 77.1025},
    }

    mock_resp = {
        "hospital_id": "HOSP-NEW",
        "name": "General Health Center",
        "location": {"latitude": 28.7041, "longitude": 77.1025},
    }

    with patch.object(HospitalService, "create_hospital", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/hospitals", json=payload)

        assert res.status_code == 201
        data = res.json()
        assert data["hospital_id"] == "HOSP-NEW"
        assert data["location"]["latitude"] == 28.7041


@pytest.mark.asyncio
async def test_get_hospital_by_id(app):
    mock_resp = {
        "hospital_id": "HOSP-001",
        "name": "Metro Apex Multi-Specialty Hospital",
        "location": {"latitude": 12.9716, "longitude": 77.5946},
    }

    with patch.object(HospitalService, "get_hospital", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/hospitals/HOSP-001")

        assert res.status_code == 200
        data = res.json()
        assert data["hospital_id"] == "HOSP-001"


@pytest.mark.asyncio
async def test_delete_hospital_conflicts_409(app):
    with patch.object(HospitalService, "delete_hospital", new_callable=AsyncMock) as mock_delete:
        mock_delete.side_effect = ConflictException("Cannot delete hospital with registered recipients", code="HOSPITAL_CONFLICT")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.delete("/api/v1/hospitals/HOSP-001")

        assert res.status_code == 409
        data = res.json()
        assert data["error"]["code"] == "HOSPITAL_CONFLICT"
