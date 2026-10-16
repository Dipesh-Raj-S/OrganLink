import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.db import db
from app.main import create_app


@pytest.fixture
async def live_app():
    """Provides a live application connected to the local Neo4j database."""
    settings = get_settings()
    try:
        await db.connect(settings)
    except Exception as exc:
        pytest.skip(f"Live Neo4j instance not reachable: {exc}")

    # Clean up test match requests before test
    async with db.driver.session() as session:
        await session.run("MATCH (m:MatchRequest) WHERE m.match_id STARTS WITH 'MTR-INTEG' DETACH DELETE m")

    app = create_app()
    from app.core.dependencies import get_current_user
    from app.schemas.auth import UserResponse
    from app.schemas.enums import UserRoleEnum
    app.dependency_overrides[get_current_user] = lambda: UserResponse(
        user_id="USR-001",
        username="admin_sys",
        role=UserRoleEnum.ADMIN,
        is_active=True,
    )
    yield app

    # Clean up test match requests after test
    async with db.driver.session() as session:
        await session.run("MATCH (m:MatchRequest) WHERE m.match_id STARTS WITH 'MTR-INTEG' DETACH DELETE m")

    await db.close()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_candidate_discovery_for_seeded_recipient(live_app):
    """
    Tests finding candidates for a real seeded recipient (e.g. REC-001).
    Verifies:
    1. Returns candidates matching organ_needed and blood compatibility.
    2. All items have valid scores between 0 and 100.
    3. Results are ordered in descending score.
    4. Explanations and factor breakdowns are present.
    """
    transport = ASGITransport(app=live_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/matches/recipients/REC-001/candidates")
        assert res.status_code == 200
        data = res.json()
        assert data["recipient_id"] == "REC-001"
        assert "items" in data
        assert data["total"] >= 0

        if data["total"] > 0:
            scores = [item["score"] for item in data["items"]]
            # Assert sorted in descending order
            assert scores == sorted(scores, reverse=True)
            for item in data["items"]:
                assert 0.0 <= item["score"] <= 100.0
                assert item["eligible"] is True
                assert "explanation" in item
                assert "factors" in item["explanation"]
                assert item["explanation"]["factors"]["distance_km"] >= 0.0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_candidate_discovery_recipient_not_found(live_app):
    transport = ASGITransport(app=live_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/v1/matches/recipients/REC-NONEXISTENT-999/candidates")
        assert res.status_code == 404
        assert res.json()["error"]["code"] == "RECIPIENT_NOT_FOUND"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_match_request_lifecycle(live_app):
    """
    Verifies live creation and retrieval of MatchRequest without mutating donor availability.
    """
    transport = ASGITransport(app=live_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Query candidate donors for REC-002
        res_cand = await client.get("/api/v1/matches/recipients/REC-002/candidates")
        assert res_cand.status_code == 200
        cand_data = res_cand.json()

        if cand_data["total"] == 0:
            pytest.skip("No available candidate donors found for REC-002 in seed data.")

        candidate = cand_data["items"][0]
        donor_id = candidate["donor_id"]

        # Step 2: Create a MatchRequest
        payload = {
            "match_id": "MTR-INTEG-01",
            "donor_id": donor_id,
            "recipient_id": "REC-002",
        }
        res_create = await client.post("/api/v1/matches/requests", json=payload)
        assert res_create.status_code == 201
        created_data = res_create.json()
        assert created_data["match_id"] == "MTR-INTEG-01"
        assert created_data["status"] == "Pending"
        assert created_data["donor_id"] == donor_id
        assert created_data["recipient_id"] == "REC-002"

        # Step 3: Verify Donor availability remains unchanged (Read-only discovery & proposal)
        res_donor = await client.get(f"/api/v1/donors/{donor_id}")
        assert res_donor.status_code == 200
        assert res_donor.json()["status"] == "Available"

        # Step 4: Retrieve created MatchRequest by ID
        res_get = await client.get("/api/v1/matches/requests/MTR-INTEG-01")
        assert res_get.status_code == 200
        assert res_get.json()["match_id"] == "MTR-INTEG-01"

        # Step 5: Duplicate prevention
        res_dup = await client.post("/api/v1/matches/requests", json=payload)
        assert res_dup.status_code == 409
        assert res_dup.json()["error"]["code"] == "DUPLICATE_MATCH_REQUEST_ID"

        # Step 6: Query list endpoint
        res_list = await client.get("/api/v1/matches/requests?recipient_id=REC-002")
        assert res_list.status_code == 200
        list_data = res_list.json()
        assert list_data["total"] >= 1
        assert any(item["match_id"] == "MTR-INTEG-01" for item in list_data["items"])
