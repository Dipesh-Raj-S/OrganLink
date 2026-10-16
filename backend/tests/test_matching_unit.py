import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.db import get_db_driver
from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.main import create_app
from app.schemas.enums import BloodTypeEnum, MatchRequestStatusEnum, OrganTypeEnum
from app.schemas.matching import (
    CandidateDonorResponse,
    CandidateListResponse,
    MatchExplanation,
    MatchRequestResponse,
    ScoreFactorBreakdown,
)
from app.services.matching_service import MatchingService
from app.services.scorer import MatchScorer


# -----------------------------------------------------------------------------
# 1. SCORER UNIT TESTS
# -----------------------------------------------------------------------------

def test_haversine_distance_calculation():
    # Distance between Bangalore (12.9716, 77.5946) and Chennai (13.0827, 80.2707) is ~290 km
    dist = MatchScorer.haversine_distance_km(12.9716, 77.5946, 13.0827, 80.2707)
    assert 280.0 <= dist <= 310.0


def test_scorer_deterministic_and_range():
    # Identical inputs must produce identical scores
    score1, b1 = MatchScorer.calculate_score("O-", "O-", urgency_score=10, distance_km=100.0)
    score2, b2 = MatchScorer.calculate_score("O-", "O-", urgency_score=10, distance_km=100.0)

    assert score1 == score2
    assert 0.0 <= score1 <= 100.0
    assert b1["blood_compatibility_score"] == 100.0
    assert b1["urgency_score_component"] == 100.0
    assert b1["distance_km"] == 100.0


def test_scorer_blood_identical_vs_compatible():
    # Identical blood type gets 100 on blood factor, compatible gets 80
    score_identical, b_id = MatchScorer.calculate_score("O+", "O+", urgency_score=5, distance_km=50.0)
    score_compat, b_comp = MatchScorer.calculate_score("O-", "O+", urgency_score=5, distance_km=50.0)

    assert score_identical > score_compat
    assert b_id["blood_compatibility_score"] == 100.0
    assert b_comp["blood_compatibility_score"] == 80.0


def test_scorer_distance_decay_and_clamp():
    # Distance exceeding MAX_DISTANCE_KM produces 0 distance score component
    score_far, b_far = MatchScorer.calculate_score("O-", "O-", urgency_score=5, distance_km=3000.0)
    assert b_far["distance_score_component"] == 0.0

    # Negative distance is safely clamped
    score_neg, b_neg = MatchScorer.calculate_score("O-", "O-", urgency_score=5, distance_km=-50.0)
    assert b_neg["distance_km"] == 0.0
    assert b_neg["distance_score_component"] == 100.0


def test_scorer_urgency_clamping():
    # Urgency clamped to [1, 10]
    _, b_high = MatchScorer.calculate_score("O-", "O-", urgency_score=999, distance_km=100.0)
    assert b_high["urgency_score_component"] == 100.0

    _, b_low = MatchScorer.calculate_score("O-", "O-", urgency_score=-5, distance_km=100.0)
    assert b_low["urgency_score_component"] == 10.0


def test_scorer_exact_weighted_score_reconciliation():
    """
    Tests exact weighted score calculation for the authoritative example:
    - Blood compatibility: 80.0 * 0.40 = 32.00
    - Urgency: 80.0 * 0.35 = 28.00
    - Distance component: 56.83 * 0.25 = 14.2075
    Total unrounded = 74.2075, rounded to 2 decimals = 74.21.
    """
    w = {"blood_compatibility": 0.40, "urgency": 0.35, "distance": 0.25}
    # Distance that produces exactly 56.83: 100 * (1 - 1079.25 / 2500) = 56.83
    distance_comp_target = 56.83
    # If distance component is directly 56.83:
    unrounded_expected = (80.0 * 0.40) + (80.0 * 0.35) + (56.83 * 0.25)
    assert pytest.approx(unrounded_expected, abs=1e-5) == 74.2075
    assert round(unrounded_expected, 2) == 74.21

    # End-to-end score with distance_km = 1079.18 (as documented)
    score, breakdown = MatchScorer.calculate_score(
        donor_blood_type="O-",
        recipient_blood_type="A-",
        urgency_score=8,
        distance_km=1079.18,
    )
    assert breakdown["blood_compatibility_score"] == 80.0
    assert breakdown["urgency_score_component"] == 80.0
    assert breakdown["distance_score_component"] == 56.83
    assert score == 74.21


def test_scorer_component_mappings():
    """
    Verify individual component edge mappings:
    - Urgency 1 -> 10, Urgency 10 -> 100
    - Distance 0 -> 100, Distance 1250 -> 50, Distance 2500 -> 0, Distance > 2500 -> 0
    """
    # Urgency 1 -> 10
    _, b_u1 = MatchScorer.calculate_score("O-", "O-", urgency_score=1, distance_km=0.0)
    assert b_u1["urgency_score_component"] == 10.0

    # Urgency 10 -> 100
    _, b_u10 = MatchScorer.calculate_score("O-", "O-", urgency_score=10, distance_km=0.0)
    assert b_u10["urgency_score_component"] == 100.0

    # Distance 0 -> 100
    _, b_d0 = MatchScorer.calculate_score("O-", "O-", urgency_score=10, distance_km=0.0)
    assert b_d0["distance_score_component"] == 100.0

    # Distance 1250 -> 50
    _, b_d1250 = MatchScorer.calculate_score("O-", "O-", urgency_score=10, distance_km=1250.0)
    assert b_d1250["distance_score_component"] == 50.0

    # Distance 2500 -> 0
    _, b_d2500 = MatchScorer.calculate_score("O-", "O-", urgency_score=10, distance_km=2500.0)
    assert b_d2500["distance_score_component"] == 0.0

    # Distance 3500 -> 0
    _, b_d3500 = MatchScorer.calculate_score("O-", "O-", urgency_score=10, distance_km=3500.0)
    assert b_d3500["distance_score_component"] == 0.0


def test_scorer_weights_sum_to_one():
    weights = MatchScorer.DEFAULT_WEIGHTS
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-6)


# -----------------------------------------------------------------------------
# 2. MATCHING API UNIT TESTS (Mocked Dependencies)
# -----------------------------------------------------------------------------

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



@pytest.mark.asyncio
async def test_get_candidates_success(app):
    mock_candidates = CandidateListResponse(
        recipient_id="REC-001",
        recipient_name="John Doe",
        organ_needed=OrganTypeEnum.KIDNEY,
        recipient_blood_type=BloodTypeEnum.O_POS,
        urgency_score=8,
        hospital_id="HOSP-001",
        items=[
            CandidateDonorResponse(
                donor_id="DNR-001",
                name="Donor One",
                blood_type=BloodTypeEnum.O_POS,
                organ_type=OrganTypeEnum.KIDNEY,
                donor_location={"latitude": 12.9716, "longitude": 77.5946},
                expiry_window_hours=48,
                score=92.5,
                eligible=True,
                explanation=MatchExplanation(
                    summary="Identical match",
                    factors=ScoreFactorBreakdown(
                        blood_compatibility_score=100.0,
                        urgency_score_component=80.0,
                        distance_score_component=90.0,
                        distance_km=25.0,
                        weights={"blood_compatibility": 0.4, "urgency": 0.35, "distance": 0.25},
                    ),
                ),
            )
        ],
        total=1,
        page=1,
        page_size=20,
    )

    with patch.object(MatchingService, "get_candidate_donors", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_candidates

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/matches/recipients/REC-001/candidates")

        assert res.status_code == 200
        data = res.json()
        assert data["recipient_id"] == "REC-001"
        assert len(data["items"]) == 1
        assert data["items"][0]["donor_id"] == "DNR-001"
        assert data["items"][0]["score"] == 92.5
        assert "explanation" in data["items"][0]


@pytest.mark.asyncio
async def test_get_candidates_recipient_not_found(app):
    with patch.object(MatchingService, "get_candidate_donors", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = NotFoundException("Recipient not found", code="RECIPIENT_NOT_FOUND")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/matches/recipients/REC-NONEXISTENT/candidates")

        assert res.status_code == 404
        assert res.json()["error"]["code"] == "RECIPIENT_NOT_FOUND"


@pytest.mark.asyncio
async def test_get_candidates_empty_list_returns_200(app):
    mock_empty = CandidateListResponse(
        recipient_id="REC-002",
        recipient_name="Jane Doe",
        organ_needed=OrganTypeEnum.HEART,
        recipient_blood_type=BloodTypeEnum.AB_NEG,
        urgency_score=4,
        hospital_id="HOSP-002",
        items=[],
        total=0,
        page=1,
        page_size=20,
    )

    with patch.object(MatchingService, "get_candidate_donors", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_empty

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/matches/recipients/REC-002/candidates")

        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 0
        assert data["items"] == []


@pytest.mark.asyncio
async def test_create_match_request_success(app):
    payload = {
        "match_id": "MTR-UNIT-01",
        "donor_id": "DNR-001",
        "recipient_id": "REC-001",
        "hospital_id": "HOSP-001",
    }
    mock_resp = MatchRequestResponse(
        match_id="MTR-UNIT-01",
        match_score=89.5,
        requested_at="2026-10-15T19:00:00Z",
        status=MatchRequestStatusEnum.PENDING,
        donor_id="DNR-001",
        recipient_id="REC-001",
        hospital_id="HOSP-001",
    )

    with patch.object(MatchingService, "create_match_request", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/matches/requests", json=payload)

        assert res.status_code == 201
        data = res.json()
        assert data["match_id"] == "MTR-UNIT-01"
        assert data["status"] == "Pending"
        assert data["match_score"] == 89.5


@pytest.mark.asyncio
async def test_create_match_request_organ_mismatch_400(app):
    payload = {
        "donor_id": "DNR-001",
        "recipient_id": "REC-001",
    }

    with patch.object(MatchingService, "create_match_request", new_callable=AsyncMock) as mock_create:
        mock_create.side_effect = BadRequestException(
            "Organ mismatch: Donor has Kidney but recipient needs Heart",
            code="ORGAN_TYPE_MISMATCH",
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/v1/matches/requests", json=payload)

        assert res.status_code == 400
        assert res.json()["error"]["code"] == "ORGAN_TYPE_MISMATCH"


@pytest.mark.asyncio
async def test_get_match_request_by_id(app):
    mock_resp = MatchRequestResponse(
        match_id="MTR-001",
        match_score=92.5,
        requested_at="2026-06-15T10:00:00Z",
        status=MatchRequestStatusEnum.PENDING,
        donor_id="DNR-001",
        recipient_id="REC-001",
        hospital_id="HOSP-001",
    )

    with patch.object(MatchingService, "get_match_request", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/matches/requests/MTR-001")

        assert res.status_code == 200
        data = res.json()
        assert data["match_id"] == "MTR-001"
        assert data["donor_id"] == "DNR-001"


@pytest.mark.asyncio
async def test_get_match_request_not_found(app):
    with patch.object(MatchingService, "get_match_request", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = NotFoundException("MatchRequest not found", code="MATCH_REQUEST_NOT_FOUND")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/matches/requests/MTR-NONEXISTENT")

        assert res.status_code == 404
        assert res.json()["error"]["code"] == "MATCH_REQUEST_NOT_FOUND"


@pytest.mark.asyncio
async def test_list_match_requests_paginated(app):
    mock_list = {
        "items": [
            MatchRequestResponse(
                match_id="MTR-001",
                match_score=92.5,
                requested_at="2026-06-15T10:00:00Z",
                status=MatchRequestStatusEnum.PENDING,
                donor_id="DNR-001",
                recipient_id="REC-001",
                hospital_id="HOSP-001",
            )
        ],
        "total": 1,
        "page": 1,
        "page_size": 20,
    }

    with patch.object(MatchingService, "list_match_requests", new_callable=AsyncMock) as mock_list_svc:
        mock_list_svc.return_value = mock_list

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/matches/requests?status=Pending&page=1&page_size=20")

        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
