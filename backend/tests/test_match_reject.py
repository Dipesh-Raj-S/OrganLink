"""
Phase 6: match-request rejection and reverse candidate discovery tests.

- Unit tests use mocked repositories/services (no live DB required).
- RBAC tests use real signed JWTs via create_access_token (existing pattern).
- Integration tests skip automatically when the local Neo4j is unreachable.
  Integration workflows create their own purpose-built MTR-INTEG-RJ match
  requests and delete them afterwards; seeded records are never mutated.
"""
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.config import get_settings
from app.core.db import db, get_db_driver
from app.core.jwt import create_access_token
from app.main import create_app
from app.repositories.matching_repository import MatchingRepository
from app.repositories.user_repository import UserRepository
from app.services.matching_service import MatchingService


def get_token_for(role: str, user_id: str = "USR-TEST", username: str = "testuser") -> str:
    return create_access_token(user_id=user_id, username=username, role=role, settings=get_settings())


@pytest.fixture
def matching_app():
    test_app = create_app()
    mock_driver = MagicMock()
    test_app.dependency_overrides[get_db_driver] = lambda: mock_driver
    return test_app


def _pending_record() -> dict:
    return {
        "match_id": "MTR-TEST-01",
        "match_score": 87.5,
        "requested_at": "2026-10-19T10:00:00+00:00",
        "status": "Pending",
        "donor_id": "DNR-TEST-01",
        "recipient_id": "REC-TEST-01",
        "hospital_id": "HOSP-TEST-01",
    }


def _rejected_record() -> dict:
    return {**_pending_record(), "status": "Rejected"}


def _available_donor_record() -> dict:
    return {
        "donor_id": "DNR-TEST-01",
        "name": "Reverse Test Donor",
        "blood_type": "O-",
        "organ_type": "Kidney",
        "location": {"latitude": 12.97, "longitude": 77.59},
        "status": "Available",
        "registered_at": "2026-10-19T08:00:00+00:00",
        "expiry_window_hours": 720,
        "version": 0,
    }


def _raw_reverse_candidates() -> list:
    return [
        {
            "recipient_id": "REC-HIGH",
            "name": "Urgent Recipient",
            "blood_type": "A+",
            "organ_needed": "Kidney",
            "urgency_score": 9,
            "hospital_id": "HOSP-TEST-02",
            "location": {"latitude": 12.98, "longitude": 77.60},
        },
        {
            "recipient_id": "REC-LOW",
            "name": "Stable Recipient",
            "blood_type": "O-",
            "organ_needed": "Kidney",
            "urgency_score": 3,
            "hospital_id": "HOSP-TEST-03",
            "location": {"latitude": 15.00, "longitude": 80.00},
        },
    ]


# --------------------------------------------------------------------------
# Reverse candidate discovery
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_reverse_candidates_rank_and_paginate(matching_app):
    token = get_token_for("ADMIN")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(MatchingRepository, "find_candidate_recipients_for_donor", new_callable=AsyncMock) as mock_find, \
         patch("app.services.matching_service.DonorRepository.get_by_id", new_callable=AsyncMock) as mock_donor_get:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "ADMIN", "is_active": True}
        mock_donor_get.return_value = _available_donor_record()
        mock_find.return_value = _raw_reverse_candidates()

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/matches/donors/DNR-TEST-01/candidate-recipients?page=1&page_size=1",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200
        data = res.json()
        assert data["donor_id"] == "DNR-TEST-01"
        assert data["organ_type"] == "Kidney"
        assert data["total"] == 2
        assert data["page_size"] == 1
        assert len(data["items"]) == 1

        # Full ranked ordering verified separately below; score bounds hold.
        top = data["items"][0]
        assert 0.0 <= top["score"] <= 100.0
        assert top["explanation"]["factors"]["distance_km"] >= 0.0
        assert "weights" in top["explanation"]["factors"]


@pytest.mark.asyncio
async def test_reverse_candidates_ordered_descending_by_score(matching_app):
    token = get_token_for("COORDINATOR")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(MatchingRepository, "find_candidate_recipients_for_donor", new_callable=AsyncMock) as mock_find, \
         patch("app.services.matching_service.DonorRepository.get_by_id", new_callable=AsyncMock) as mock_donor_get:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "COORDINATOR", "is_active": True}
        mock_donor_get.return_value = _available_donor_record()
        mock_find.return_value = _raw_reverse_candidates()

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/matches/donors/DNR-TEST-01/candidate-recipients",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200
        data = res.json()
        scores = [item["score"] for item in data["items"]]
        assert scores == sorted(scores, reverse=True)
        # Distinct-but-nearby locations + same blood compatibility group: the
        # urgency-9 recipient must outrank the urgency-3 recipient, and the
        # backend-computed transit distance must be a real positive quantity.
        assert data["items"][0]["recipient_id"] == "REC-HIGH"
        assert data["items"][0]["urgency_score"] == 9
        assert 0.0 < data["items"][0]["explanation"]["factors"]["distance_km"] < 10.0


@pytest.mark.asyncio
async def test_reverse_candidates_donor_not_found(matching_app):
    token = get_token_for("ADMIN")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch("app.services.matching_service.DonorRepository.get_by_id", new_callable=AsyncMock) as mock_donor_get:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "ADMIN", "is_active": True}
        mock_donor_get.return_value = None

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/matches/donors/DNR-MISSING/candidate-recipients",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 404
        assert res.json()["error"]["code"] == "DONOR_NOT_FOUND"


@pytest.mark.asyncio
async def test_reverse_candidates_rejects_non_available_donor(matching_app):
    token = get_token_for("ADMIN")
    donor = _available_donor_record()
    donor["status"] = "Allocated"
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch("app.services.matching_service.DonorRepository.get_by_id", new_callable=AsyncMock) as mock_donor_get:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "ADMIN", "is_active": True}
        mock_donor_get.return_value = donor

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/matches/donors/DNR-TEST-01/candidate-recipients",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 400
        assert res.json()["error"]["code"] == "DONOR_NOT_AVAILABLE"


# --------------------------------------------------------------------------
# Negative-valence status readback: patching the repository directly covers both
# the first rejection and the "repeat reject" conflict.
# --------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_reject_pending_succeeds_and_records_reason(matching_app):
    token = get_token_for("ADMIN")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(MatchingRepository, "get_match_request", new_callable=AsyncMock) as mock_get, \
         patch.object(MatchingRepository, "update_match_request_status", new_callable=AsyncMock) as mock_update:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "ADMIN", "is_active": True}
        mock_get.return_value = _pending_record()
        mock_update.return_value = _rejected_record()

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                "/api/v1/matches/requests/MTR-TEST-01/reject",
                json={"reason": "Recipient switched centers"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "Rejected"
        assert data["match_id"] == "MTR-TEST-01"
        mock_update.assert_awaited_once()
        update_kwargs = mock_update.await_args.kwargs
        assert update_kwargs["new_status"] == "Rejected"
        assert update_kwargs["reject_reason"] == "Recipient switched centers"


@pytest.mark.asyncio
async def test_reject_empty_reason_body_allowed(matching_app):
    """PATCH body may omit reason entirely; empty payload {} also accepted."""
    token = get_token_for("COORDINATOR")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(MatchingRepository, "get_match_request", new_callable=AsyncMock) as mock_get, \
         patch.object(MatchingRepository, "update_match_request_status", new_callable=AsyncMock) as mock_update:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "COORDINATOR", "is_active": True}
        mock_get.return_value = _pending_record()
        mock_update.return_value = _rejected_record()

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                "/api/v1/matches/requests/MTR-TEST-01/reject",
                json={},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200
        assert res.json()["status"] == "Rejected"
        assert mock_update.await_args.kwargs["reject_reason"] is None


@pytest.mark.asyncio
async def test_reject_confirmed_returns_409_invalid_match_status(matching_app):
    token = get_token_for("ADMIN")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(MatchingRepository, "get_match_request", new_callable=AsyncMock) as mock_get:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "ADMIN", "is_active": True}
        mock_get.return_value = {**_pending_record(), "status": "Confirmed"}

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                "/api/v1/matches/requests/MTR-TEST-01/reject",
                json={"reason": "late attempt"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 409
        data = res.json()
        assert data["error"]["code"] == "INVALID_MATCH_STATUS"


@pytest.mark.asyncio
async def test_reject_repeated_returns_409_invalid_match_status(matching_app):
    """Rejection is idempotent-hostile: a second reject hits 409, not 200."""
    token = get_token_for("COORDINATOR")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(MatchingRepository, "get_match_request", new_callable=AsyncMock) as mock_get:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "COORDINATOR", "is_active": True}
        mock_get.return_value = _rejected_record()

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                "/api/v1/matches/requests/MTR-TEST-01/reject",
                json={"reason": "again"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 409
        assert res.json()["error"]["code"] == "INVALID_MATCH_STATUS"


@pytest.mark.asyncio
async def test_reject_unknown_match_returns_404(matching_app):
    token = get_token_for("ADMIN")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(MatchingRepository, "get_match_request", new_callable=AsyncMock) as mock_get:
        mock_user_get.return_value = {"user_id": "USR-TEST", "username": "testuser", "role": "ADMIN", "is_active": True}
        mock_get.return_value = None

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                "/api/v1/matches/requests/MTR-MISSING/reject",
                json={"reason": "n/a"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 404
        assert res.json()["error"]["code"] == "MATCH_REQUEST_NOT_FOUND"


# --------------------------------------------------------------------------
# RBAC: only ADMIN / COORDINATOR may reject (PER_TASK7 contract)
# --------------------------------------------------------------------------
@pytest.mark.parametrize("role", ["ADMIN", "COORDINATOR"])
@pytest.mark.asyncio
async def test_reject_permitted_roles(matching_app, role):
    token = get_token_for(role, user_id=f"USR-{role}")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get, \
         patch.object(MatchingService, "reject_match_request", new_callable=AsyncMock) as mock_reject:
        mock_user_get.return_value = {"user_id": f"USR-{role}", "username": "testuser", "role": role, "is_active": True}
        mock_reject.return_value = _rejected_record()

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                "/api/v1/matches/requests/MTR-TEST-01/reject",
                json={"reason": "rbac allowed"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 200


@pytest.mark.parametrize("role", ["DOCTOR", "AUDITOR"])
@pytest.mark.asyncio
async def test_reject_forbidden_roles(matching_app, role):
    token = get_token_for(role, user_id=f"USR-{role}")
    with patch.object(UserRepository, "get_by_id", new_callable=AsyncMock) as mock_user_get:
        mock_user_get.return_value = {"user_id": f"USR-{role}", "username": "testuser", "role": role, "is_active": True}

        transport = ASGITransport(app=matching_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                "/api/v1/matches/requests/MTR-TEST-01/reject",
                json={"reason": "should not reach"},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN_INSUFFICIENT_ROLE"


# --------------------------------------------------------------------------
# Live integration (skipped when Neo4j is unreachable)
# --------------------------------------------------------------------------
@pytest.fixture
async def live_reject_app():
    settings = get_settings()
    try:
        await db.connect(settings)
    except Exception as exc:
        pytest.skip(f"Live Neo4j instance not reachable: {exc}")

    async with db.driver.session() as session:
        await session.run("MATCH (m:MatchRequest) WHERE m.match_id STARTS WITH 'MTR-INTEG' DETACH DELETE m")

    app = create_app()
    from app.core.dependencies import get_current_user
    from app.schemas.auth import UserResponse

    app.dependency_overrides[get_current_user] = lambda: UserResponse(
        user_id="USR-001",
        username="admin_sys",
        role=UserRoleEnum.ADMIN,
        is_active=True,
    )
    yield app

    async with db.driver.session() as session:
        await session.run("MATCH (m:MatchRequest) WHERE m.match_id STARTS WITH 'MTR-INTEG' DETACH DELETE m")
    await db.close()


from app.schemas.enums import UserRoleEnum  # noqa: E402  (used by live fixture)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_reject_lifecycle_keeps_donor_available(live_reject_app):
    """
    Full live loop, following the existing match lifecycle test pattern:
    1. Create proposal from a real candidate pair (purpose-built MTR-INTEG-RJ id).
    2. Reject it -> 200, status Rejected.
    3. Donor stays 'Available' (rejection must not mutate donor graph state).
    4. Second reject -> 409 INVALID_MATCH_STATUS (repeat rejected).
    5. Confirm after reject -> 409 INVALID_MATCH_STATUS as well.
    """
    transport = ASGITransport(app=live_reject_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res_cand = await client.get("/api/v1/matches/recipients/REC-002/candidates")
        assert res_cand.status_code == 200
        cand_data = res_cand.json()
        if cand_data["total"] == 0:
            pytest.skip("No available candidate donors found for REC-002 in seed data.")

        donor_id = cand_data["items"][0]["donor_id"]
        payload = {"match_id": "MTR-INTEG-RJ-01", "donor_id": donor_id, "recipient_id": "REC-002"}

        res_create = await client.post("/api/v1/matches/requests", json=payload)
        assert res_create.status_code == 201

        res_reject = await client.patch(
            "/api/v1/matches/requests/MTR-INTEG-RJ-01/reject",
            json={"reason": "Seeded organs diverted to MTR-INTEG-RJ study"},
        )
        assert res_reject.status_code == 200
        assert res_reject.json()["status"] == "Rejected"

        res_donor = await client.get(f"/api/v1/donors/{donor_id}")
        assert res_donor.status_code == 200
        assert res_donor.json()["status"] == "Available"

        res_repeat = await client.patch(
            "/api/v1/matches/requests/MTR-INTEG-RJ-01/reject",
            json={"reason": "duplicate"},
        )
        assert res_repeat.status_code == 409
        assert res_repeat.json()["error"]["code"] == "INVALID_MATCH_STATUS"

        res_confirm = await client.post("/api/v1/matches/requests/MTR-INTEG-RJ-01/allocate", json={})
        assert res_confirm.status_code == 409
        assert res_confirm.json()["error"]["code"] == "INVALID_MATCH_STATUS"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_reverse_candidates_for_available_donor(live_reject_app):
    transport = ASGITransport(app=live_reject_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Find any seeded Available kidney donor via the existing REST read.
        res_donors = await client.get("/api/v1/donors", params={"page_size": 100})
        assert res_donors.status_code == 200
        items = res_donors.json().get("items", [])
        available = [d for d in items if d["status"] == "Available"]
        if not available:
            pytest.skip("No Available donors in seed data.")

        donor_id = available[0]["donor_id"]
        res = await client.get(f"/api/v1/matches/donors/{donor_id}/candidate-recipients")

        assert res.status_code == 200
        data = res.json()
        assert data["donor_id"] == donor_id
        assert data["page"] == 1
        scores = [item["score"] for item in data["items"]]
        assert scores == sorted(scores, reverse=True)
        for item in data["items"]:
            assert 1 <= item["urgency_score"] <= 10
            assert item["explanation"]["factors"]["distance_km"] >= 0.0

        res_missing = await client.get("/api/v1/matches/donors/DNR-NONEXISTENT-999/candidate-recipients")
        assert res_missing.status_code == 404
        assert res_missing.json()["error"]["code"] == "DONOR_NOT_FOUND"
