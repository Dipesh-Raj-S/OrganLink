import asyncio
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.db import db
from app.core.jwt import create_access_token
from app.main import create_app


@pytest.fixture
async def live_app():
    """Provides a live application connected to the local Neo4j database."""
    settings = get_settings()
    try:
        await db.connect(settings)
    except Exception as exc:
        pytest.skip(f"Live Neo4j instance not reachable: {exc}")

    # Clean up test nodes before test
    async with db.driver.session() as session:
        await session.run("MATCH (a:Allocation) WHERE a.allocation_id STARTS WITH 'ALC-INTEG' DETACH DELETE a")
        await session.run("MATCH (m:MatchRequest) WHERE m.match_id STARTS WITH 'MTR-INTEG-ALC' DETACH DELETE m")
        await session.run("MATCH (d:Donor) WHERE d.donor_id STARTS WITH 'DNR-INTEG-ALC' DETACH DELETE d")
        await session.run("MATCH (r:Recipient) WHERE r.recipient_id STARTS WITH 'REC-INTEG-ALC' DETACH DELETE r")

    app = create_app()
    yield app

    # Clean up test nodes after test
    async with db.driver.session() as session:
        await session.run("MATCH (a:Allocation) WHERE a.allocation_id STARTS WITH 'ALC-INTEG' DETACH DELETE a")
        await session.run("MATCH (m:MatchRequest) WHERE m.match_id STARTS WITH 'MTR-INTEG-ALC' DETACH DELETE m")
        await session.run("MATCH (d:Donor) WHERE d.donor_id STARTS WITH 'DNR-INTEG-ALC' DETACH DELETE d")
        await session.run("MATCH (r:Recipient) WHERE r.recipient_id STARTS WITH 'REC-INTEG-ALC' DETACH DELETE r")

    await db.close()


def get_coord_token() -> str:
    settings = get_settings()
    return create_access_token(
        user_id="USR-002",
        username="coordinator_sarah",
        role="COORDINATOR",
        settings=settings,
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_atomic_allocation_flow(live_app):
    """
    Verifies live atomic allocation:
    1. Creates an isolated Donor and Recipient in Neo4j.
    2. Creates a MatchRequest linking them.
    3. Calls POST /matches/requests/{match_id}/allocate with COORDINATOR token.
    4. Confirms Allocation node, relationships, and status updates (Donor -> Allocated, Recipient -> Allocated, MatchRequest -> Confirmed).
    5. Confirms idempotency on repeat allocation.
    """
    token = get_coord_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Setup isolated test nodes
    async with db.driver.session() as session:
        await session.run(
            """
            MERGE (b:BloodType {blood_type: 'O+'})
            CREATE (d:Donor {
                donor_id: 'DNR-INTEG-ALC-01',
                name: 'Integ Test Donor',
                blood_type: 'O+',
                organ_type: 'Kidney',
                status: 'Available',
                location: point({latitude: 12.9716, longitude: 77.5946}),
                registered_at: datetime()
            })
            CREATE (d)-[:HAS_BLOOD_TYPE]->(b)
            CREATE (r:Recipient {
                recipient_id: 'REC-INTEG-ALC-01',
                name: 'Integ Test Recipient',
                blood_type: 'O+',
                organ_needed: 'Kidney',
                status: 'Waiting',
                urgency_score: 8,
                location: point({latitude: 12.9716, longitude: 77.5946}),
                waitlist_since: datetime()
            })
            CREATE (r)-[:HAS_BLOOD_TYPE]->(b)
            WITH d, r
            MATCH (h:Hospital {hospital_id: 'HOSP-001'})
            CREATE (r)-[:REGISTERED_AT]->(h)
            CREATE (m:MatchRequest {
                match_id: 'MTR-INTEG-ALC-01',
                match_score: 95.0,
                status: 'Pending',
                requested_at: datetime()
            })
            CREATE (d)-[:PROPOSED_IN]->(m)
            CREATE (m)-[:FOR_RECIPIENT]->(r)
            CREATE (m)-[:REQUESTED_BY]->(h)
            """
        )

    transport = ASGITransport(app=live_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Allocate
        res = await client.post("/api/v1/matches/requests/MTR-INTEG-ALC-01/allocate", headers=headers)
        assert res.status_code == 201
        data = res.json()
        assert data["match_id"] == "MTR-INTEG-ALC-01"
        assert data["donor_id"] == "DNR-INTEG-ALC-01"
        assert data["recipient_id"] == "REC-INTEG-ALC-01"
        assert data["status"] == "Confirmed"
        allocation_id = data["allocation_id"]

        # Step 2: Verify database state directly
        async with db.driver.session() as session:
            check_res = await session.run(
                """
                MATCH (d:Donor {donor_id: 'DNR-INTEG-ALC-01'})
                MATCH (r:Recipient {recipient_id: 'REC-INTEG-ALC-01'})
                MATCH (m:MatchRequest {match_id: 'MTR-INTEG-ALC-01'})
                MATCH (a:Allocation {allocation_id: $alc_id})
                RETURN d.status AS donor_status,
                       r.status AS recipient_status,
                       m.status AS match_status,
                       exists((d)-[:ALLOCATED_IN]->(a)) AS donor_allocated,
                       exists((a)-[:TO_RECIPIENT]->(r)) AS recipient_allocated,
                       exists((m)-[:RESOLVED_IN]->(a)) AS match_resolved
                """,
                alc_id=allocation_id,
            )
            rec = await check_res.single()
            assert rec["donor_status"] == "Allocated"
            assert rec["recipient_status"] == "Allocated"
            assert rec["match_status"] == "Confirmed"
            assert rec["donor_allocated"] is True
            assert rec["recipient_allocated"] is True
            assert rec["match_resolved"] is True

        # Step 3: Idempotency check - repeat request should return existing allocation without error
        res_repeat = await client.post("/api/v1/matches/requests/MTR-INTEG-ALC-01/allocate", headers=headers)
        assert res_repeat.status_code == 200 or res_repeat.status_code == 201
        assert res_repeat.json()["allocation_id"] == allocation_id


@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_concurrent_allocation_prevention(live_app):
    """
    Tests concurrency safety against real Neo4j:
    Creates 1 Donor and 2 distinct MatchRequests with 2 different Recipients.
    Launches simultaneous concurrent allocation requests for the SAME donor.
    Guarantees: Exactly ONE succeeds, the second is safely rejected (409 Conflict).
    """
    token = get_coord_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Setup isolated test graph
    async with db.driver.session() as session:
        await session.run(
            """
            MERGE (b:BloodType {blood_type: 'O+'})
            CREATE (d:Donor {
                donor_id: 'DNR-INTEG-ALC-CONCUR',
                name: 'Concurrent Donor',
                blood_type: 'O+',
                organ_type: 'Kidney',
                status: 'Available',
                location: point({latitude: 12.9716, longitude: 77.5946}),
                registered_at: datetime()
            })
            CREATE (d)-[:HAS_BLOOD_TYPE]->(b)

            CREATE (r1:Recipient {
                recipient_id: 'REC-INTEG-ALC-C1',
                name: 'Recipient One',
                blood_type: 'O+',
                organ_needed: 'Kidney',
                status: 'Waiting',
                urgency_score: 9,
                location: point({latitude: 12.9716, longitude: 77.5946}),
                waitlist_since: datetime()
            })
            CREATE (r1)-[:HAS_BLOOD_TYPE]->(b)

            CREATE (r2:Recipient {
                recipient_id: 'REC-INTEG-ALC-C2',
                name: 'Recipient Two',
                blood_type: 'O+',
                organ_needed: 'Kidney',
                status: 'Waiting',
                urgency_score: 7,
                location: point({latitude: 12.9716, longitude: 77.5946}),
                waitlist_since: datetime()
            })
            CREATE (r2)-[:HAS_BLOOD_TYPE]->(b)
            WITH d, r1, r2
            MATCH (h:Hospital {hospital_id: 'HOSP-001'})
            CREATE (r1)-[:REGISTERED_AT]->(h)
            CREATE (r2)-[:REGISTERED_AT]->(h)

            CREATE (m1:MatchRequest {
                match_id: 'MTR-INTEG-ALC-C1',
                match_score: 95.0,
                status: 'Pending',
                requested_at: datetime()
            })
            CREATE (d)-[:PROPOSED_IN]->(m1)
            CREATE (m1)-[:FOR_RECIPIENT]->(r1)
            CREATE (m1)-[:REQUESTED_BY]->(h)

            CREATE (m2:MatchRequest {
                match_id: 'MTR-INTEG-ALC-C2',
                match_score: 90.0,
                status: 'Pending',
                requested_at: datetime()
            })
            CREATE (d)-[:PROPOSED_IN]->(m2)
            CREATE (m2)-[:FOR_RECIPIENT]->(r2)
            CREATE (m2)-[:REQUESTED_BY]->(h)
            """
        )

    transport = ASGITransport(app=live_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Launch concurrent requests
        req1 = client.post("/api/v1/matches/requests/MTR-INTEG-ALC-C1/allocate", headers=headers)
        req2 = client.post("/api/v1/matches/requests/MTR-INTEG-ALC-C2/allocate", headers=headers)

        res1, res2 = await asyncio.gather(req1, req2)

        status_codes = [res1.status_code, res2.status_code]
        # Exactly one must succeed (201) and the other must fail (409 Conflict)
        assert 201 in status_codes
        assert 409 in status_codes

        # In Neo4j, verify only one Allocation node was created for the Donor
        async with db.driver.session() as session:
            check = await session.run(
                """
                MATCH (d:Donor {donor_id: 'DNR-INTEG-ALC-CONCUR'})-[:ALLOCATED_IN]->(a:Allocation)
                RETURN count(a) AS allocation_count
                """
            )
            count_rec = await check.single()
            assert count_rec["allocation_count"] == 1
