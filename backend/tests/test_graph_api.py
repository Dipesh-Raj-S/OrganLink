"""
Phase 6: /graph/matches/{match_id} visualization endpoint tests.

Unit tests run against mocked service methods (no live DB required);
integration tests skip automatically when the local Neo4j is unreachable.
"""
import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.db import db, get_db_driver
from app.core.exceptions import NotFoundException
from app.main import create_app
from app.schemas.enums import UserRoleEnum
from app.schemas.graph import GraphEdgeData, GraphNodeData, MatchGraphResponse
from app.services.graph_service import GraphService


@pytest.fixture
def graph_app():
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


def _graph_stub() -> MatchGraphResponse:
    return MatchGraphResponse(
        match_id="MTR-TEST-01",
        nodes=[
            GraphNodeData(
                id="DNR-001",
                label="Test Donor",
                type="DONOR",
                properties={"donor_id": "DNR-001", "status": "Available", "blood_type": "O-"},
            ),
            GraphNodeData(
                id="REC-001",
                label="Test Recipient",
                type="RECIPIENT",
                properties={"recipient_id": "REC-001", "status": "Waiting", "urgency_score": 8},
            ),
            GraphNodeData(
                id="MTR-TEST-01",
                label="Match Request MTR-TEST-01",
                type="MATCH_REQUEST",
                properties={"match_id": "MTR-TEST-01", "match_score": 87.5, "status": "Pending"},
            ),
        ],
        edges=[
            GraphEdgeData(
                id="DNR-001->MTR-TEST-01:PROPOSED_IN",
                source="DNR-001",
                target="MTR-TEST-01",
                relationship="PROPOSED_IN",
            ),
            GraphEdgeData(
                id="MTR-TEST-01->REC-001:FOR_RECIPIENT",
                source="MTR-TEST-01",
                target="REC-001",
                relationship="FOR_RECIPIENT",
            ),
        ],
    )


@pytest.mark.asyncio
async def test_graph_matches_returns_nodes_and_real_relationships(graph_app):
    """Edge relationship names are actual Neo4j relationship types."""
    with patch.object(
        GraphService,
        "get_match_graph",
        new_callable=AsyncMock,
    ) as mock_graph:
        mock_graph.return_value = _graph_stub()

        transport = ASGITransport(app=graph_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/graph/matches/MTR-TEST-01")

        assert res.status_code == 200
        data = res.json()
        assert data["match_id"] == "MTR-TEST-01"
        assert {n["type"] for n in data["nodes"]} == {"DONOR", "RECIPIENT", "MATCH_REQUEST"}
        rel_names = {e["relationship"] for e in data["edges"]}
        assert rel_names == {"PROPOSED_IN", "FOR_RECIPIENT"}
        for e in data["edges"]:
            assert e["source"] and e["target"]
            assert ":" in e["id"]


@pytest.mark.asyncio
async def test_graph_matches_unknown_match_returns_404(graph_app):
    with patch.object(
        GraphService,
        "get_match_graph",
        new_callable=AsyncMock,
    ) as mock_graph:
        mock_graph.side_effect = NotFoundException(
            message="MatchRequest with ID 'MTR-MISSING' not found.",
            code="MATCH_REQUEST_NOT_FOUND",
        )

        transport = ASGITransport(app=graph_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/v1/graph/matches/MTR-MISSING")

        assert res.status_code == 404
        data = res.json()
        assert data["error"]["code"] == "MATCH_REQUEST_NOT_FOUND"


@pytest.mark.asyncio
async def test_graph_matches_unauthenticated_returns_401():
    test_app = create_app()
    mock_driver = MagicMock()
    test_app.dependency_overrides[get_db_driver] = lambda: mock_driver

    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/graph/matches/MTR-TEST-01")

    assert res.status_code == 401


# --------------------------------------------------------------------------
# Live integration (skipped when Neo4j is unreachable)
# --------------------------------------------------------------------------
@pytest.fixture
async def live_graph_app():
    from app.core.config import get_settings
    from app.core.dependencies import get_current_user
    from app.schemas.auth import UserResponse

    settings = get_settings()
    try:
        await db.connect(settings)
    except Exception as exc:
        pytest.skip(f"Live Neo4j instance not reachable: {exc}")

    app = create_app()
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
async def test_live_graph_subgraph_for_existing_match(live_graph_app):
    """
    Reads a real seeded MatchRequest subgraph: every node is one of the known
    entity types and every edge relationship is a real Neo4j type present in
    this project (no invented labels).
    """
    transport = ASGITransport(app=live_graph_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        async with db.driver.session() as session:
            read_res = await session.run("MATCH (m:MatchRequest) RETURN m.match_id AS id LIMIT 5")
            match_ids = [rec["id"] for rec in await read_res.data()]

        if not match_ids:
            pytest.skip("No MatchRequest nodes present in live data.")

        res = await client.get(f"/api/v1/graph/matches/{match_ids[0]}")

    assert res.status_code == 200
    data = res.json()
    assert data["match_id"] == match_ids[0]
    assert len(data["nodes"]) >= 1

    known_types = {"DONOR", "RECIPIENT", "HOSPITAL", "MATCH_REQUEST", "ALLOCATION"}
    known_rels = {"PROPOSED_IN", "FOR_RECIPIENT", "REQUESTED_BY", "RESOLVED_IN", "ALLOCATED_IN", "REGISTERED_AT"}
    assert {n["type"] for n in data["nodes"]} <= known_types
    assert {e["relationship"] for e in data["edges"]} <= known_rels

    # MATCH_REQUEST node must always be present; match_score must survive intact.
    mr = next(n for n in data["nodes"] if n["type"] == "MATCH_REQUEST")
    assert "match_score" in mr["properties"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_graph_missing_match_returns_404(live_graph_app):
    transport = ASGITransport(app=live_graph_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/graph/matches/MTR-NONEXISTENT-999")

    assert res.status_code == 404
    assert res.json()["error"]["code"] == "MATCH_REQUEST_NOT_FOUND"
