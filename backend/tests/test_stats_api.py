"""
Phase 6: stats dashboard endpoint tests.

Unit tests run against a mocked driver/service (no live DB required).
Integration tests are skipped automatically when the local Neo4j instance
is not reachable, following the existing test_matching_integration pattern.
"""
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.config import get_settings
from app.core.db import db, get_db_driver
from app.main import create_app
from app.schemas.enums import UserRoleEnum
from app.schemas.stats import DashboardStatsResponse
from app.services.stats_service import APPROACHING_EXPIRY_WINDOW_HOURS, StatsService


@pytest.fixture
def stats_app():
    test_app = create_app()
    mock_driver = MagicMock()
    test_app.dependency_overrides[get_db_driver] = lambda: mock_driver

    from app.core.dependencies import get_current_user
    from app.schemas.auth import UserResponse

    test_app.dependency_overrides[get_current_user] = lambda: UserResponse(
        user_id="USR-001",
        username="admin_sys",
        role=UserRoleEnum.ADMIN,
        is_active=True,
    )
    return test_app


def _dashboard_payload_stub() -> DashboardStatsResponse:
    return DashboardStatsResponse(
        total_donors=4,
        available_donors=2,
        total_recipients_waiting=3,
        confirmed_allocations=1,
        donors_approaching_expiry=1,
        status_breakdown={
            "Available": 2,
            "Reserved": 1,
            "Allocated": 1,
            "Expired": 0,
        },
        organ_breakdown={"Kidney": 3, "Liver": 1},
        blood_type_distribution={"B+": 1, "O-": 2, "O+": 1},
        recent_allocations=[],
        urgent_recipients=[],
    )


@pytest.mark.asyncio
async def test_dashboard_stats_returns_genuine_payload(stats_app):
    """Aggregates are served from the service layer without frontend-side rescaling."""
    with patch.object(
        StatsService,
        "get_dashboard_stats",
        new_callable=AsyncMock,
    ) as mock_stats:
        mock_stats.return_value = _dashboard_payload_stub()

        transport = ASGITransport(app=stats_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/stats/dashboard")

        assert res.status_code == 200
        data = res.json()
        assert data["total_donors"] == 4
        assert data["available_donors"] == 2
        assert data["total_recipients_waiting"] == 3
        assert data["confirmed_allocations"] == 1
        assert data["donors_approaching_expiry"] == 1
        # Reserved donors appear in the breakdown when the graph contains them,
        # so the frontend can render the row conditionally.
        assert data["status_breakdown"]["Reserved"] == 1


@pytest.mark.asyncio
async def test_dashboard_stats_unauthenticated_returns_401():
    test_app = create_app()
    mock_driver = MagicMock()
    test_app.dependency_overrides[get_db_driver] = lambda: mock_driver

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/stats/dashboard")

    assert res.status_code == 401


@pytest.mark.asyncio
async def test_approaching_expiry_threshold_is_backend_defined():
    """The 12-hour window is a backend constant, not communicated by the client."""
    settings = get_settings()
    assert settings is not None
    assert APPROACHING_EXPIRY_WINDOW_HOURS == 12


# --------------------------------------------------------------------------
# Live integration (skipped when Neo4j is unreachable)
# --------------------------------------------------------------------------
@pytest.fixture
async def live_stats_app():
    settings = get_settings()
    try:
        await db.connect(settings)
    except Exception as exc:
        pytest.skip(f"Live Neo4j instance not reachable: {exc}")

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
    await db.close()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_dashboard_stats_coherence(live_stats_app):
    """Counts must be internally coherent over real seeded graph data."""
    transport = ASGITransport(app=live_stats_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/stats/dashboard")

    assert res.status_code == 200
    data = res.json()

    assert data["available_donors"] <= data["total_donors"]
    assert sum(data["status_breakdown"].values()) == data["total_donors"]
    assert sum(data["organ_breakdown"].values()) == data["total_donors"]
    assert sum(data["blood_type_distribution"].values()) == data["total_donors"]
    assert data["confirmed_allocations"] >= 0
    assert data["donors_approaching_expiry"] <= data["available_donors"]

    scores = [r["urgency_score"] for r in data["urgent_recipients"]]
    assert scores == sorted(scores, reverse=True)
    for r in data["urgent_recipients"]:
        assert 1 <= r["urgency_score"] <= 10

    assert len(data["recent_allocations"]) <= 5
    for a in data["recent_allocations"]:
        assert a["allocation_id"]
        # Seed's demonstration allocation (ALC-001) is legitimately linked as
        # Donor-[:ALLOCATED_IN]->Allocation without a MatchRequest, so match_id
        # may be an empty string there. API-created allocations always carry
        # one, as exercised in test_match_reject.py.
        assert isinstance(a["match_id"], str)
