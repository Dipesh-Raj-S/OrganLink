import uuid
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

    # Clean up any leftover integration test nodes before tests
    async with db.driver.session() as session:
        await session.run("MATCH (d:Donor) WHERE d.donor_id STARTS WITH 'DNR-INTEG' DETACH DELETE d")
        await session.run("MATCH (h:Hospital) WHERE h.hospital_id STARTS WITH 'HOSP-INTEG' DETACH DELETE h")
        await session.run("MATCH (r:Recipient) WHERE r.recipient_id STARTS WITH 'REC-INTEG' DETACH DELETE r")

    app = create_app()
    yield app

    # Clean up after tests
    async with db.driver.session() as session:
        await session.run("MATCH (d:Donor) WHERE d.donor_id STARTS WITH 'DNR-INTEG' DETACH DELETE d")
        await session.run("MATCH (h:Hospital) WHERE h.hospital_id STARTS WITH 'HOSP-INTEG' DETACH DELETE h")
        await session.run("MATCH (r:Recipient) WHERE r.recipient_id STARTS WITH 'REC-INTEG' DETACH DELETE r")

    await db.close()


# -----------------------------------------------------------------------------
# Live Integration Tests
# -----------------------------------------------------------------------------

@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_hospital_crud_flow(live_app):
    transport = ASGITransport(app=live_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create a test hospital
        hosp_payload = {
            "hospital_id": "HOSP-INTEG-01",
            "name": "Integration Test Hospital",
            "location": {"latitude": 13.0827, "longitude": 80.2707},
        }
        res_create = await client.post("/api/v1/hospitals", json=hosp_payload)
        assert res_create.status_code == 201
        data = res_create.json()
        assert data["hospital_id"] == "HOSP-INTEG-01"

        # 2. Duplicate prevention check
        res_dup = await client.post("/api/v1/hospitals", json=hosp_payload)
        assert res_dup.status_code == 409
        assert res_dup.json()["error"]["code"] == "DUPLICATE_HOSPITAL_ID"

        # 3. Retrieve by ID
        res_get = await client.get("/api/v1/hospitals/HOSP-INTEG-01")
        assert res_get.status_code == 200
        assert res_get.json()["name"] == "Integration Test Hospital"

        # 4. PATCH update
        res_patch = await client.patch(
            "/api/v1/hospitals/HOSP-INTEG-01",
            json={"name": "Updated Integration Hospital"},
        )
        assert res_patch.status_code == 200
        assert res_patch.json()["name"] == "Updated Integration Hospital"

        # 5. Delete clean up
        res_del = await client.delete("/api/v1/hospitals/HOSP-INTEG-01")
        assert res_del.status_code == 204

        # 6. Verify deleted
        res_get_del = await client.get("/api/v1/hospitals/HOSP-INTEG-01")
        assert res_get_del.status_code == 404


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_donor_crud_and_conflict(live_app):
    transport = ASGITransport(app=live_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        donor_payload = {
            "donor_id": "DNR-INTEG-01",
            "name": "Integration Donor",
            "blood_type": "O-",
            "organ_type": "Kidney",
            "location": {"latitude": 12.9716, "longitude": 77.5946},
            "status": "Available",
            "expiry_window_hours": 36,
        }
        # 1. Create donor
        res_create = await client.post("/api/v1/donors", json=donor_payload)
        assert res_create.status_code == 201
        d_data = res_create.json()
        assert d_data["donor_id"] == "DNR-INTEG-01"
        assert d_data["version"] == 0

        # 2. Duplicate prevention
        res_dup = await client.post("/api/v1/donors", json=donor_payload)
        assert res_dup.status_code == 409

        # 3. PATCH update and version increment
        res_patch = await client.patch(
            "/api/v1/donors/DNR-INTEG-01",
            json={"expiry_window_hours": 48},
        )
        assert res_patch.status_code == 200
        assert res_patch.json()["version"] == 1
        assert res_patch.json()["expiry_window_hours"] == 48

        # 4. Protected deletion check on seeded donor with allocation (e.g. DNR-004)
        res_seed_del = await client.delete("/api/v1/donors/DNR-004")
        assert res_seed_del.status_code == 409
        assert res_seed_del.json()["error"]["code"] == "DONOR_ALLOCATION_CONFLICT"

        # 5. Clean up integration donor
        res_del = await client.delete("/api/v1/donors/DNR-INTEG-01")
        assert res_del.status_code == 204


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_recipient_crud_and_urgency(live_app):
    transport = ASGITransport(app=live_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        rec_payload = {
            "recipient_id": "REC-INTEG-01",
            "name": "Integration Recipient",
            "blood_type": "B+",
            "organ_needed": "Liver",
            "urgency_score": 6,
            "location": {"latitude": 19.0760, "longitude": 72.8777},
            "hospital_id": "HOSP-001",
        }
        # 1. Create recipient
        res_create = await client.post("/api/v1/recipients", json=rec_payload)
        assert res_create.status_code == 201
        r_data = res_create.json()
        assert r_data["recipient_id"] == "REC-INTEG-01"
        assert r_data["urgency_score"] == 6

        # 2. Update urgency via dedicated endpoint
        res_urg = await client.patch(
            "/api/v1/recipients/REC-INTEG-01/urgency",
            json={"urgency_score": 9},
        )
        assert res_urg.status_code == 200
        assert res_urg.json()["urgency_score"] == 9

        # 3. Protected deletion check on seeded recipient with allocation (e.g. REC-004)
        res_prot_del = await client.delete("/api/v1/recipients/REC-004")
        assert res_prot_del.status_code == 409
        assert res_prot_del.json()["error"]["code"] == "RECIPIENT_ALLOCATION_CONFLICT"

        # 4. Clean up integration recipient
        res_del = await client.delete("/api/v1/recipients/REC-INTEG-01")
        assert res_del.status_code == 204
