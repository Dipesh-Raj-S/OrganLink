import pytest
from app.core.config import get_settings
from app.core.db import db
from app.repositories.schema_repository import SchemaRepository


@pytest.mark.integration
@pytest.mark.asyncio
async def test_schema_constraints_and_indexes():
    """
    Verifies that all required uniqueness constraints and performance indexes
    exist in the live Neo4j database.
    """
    settings = get_settings()
    try:
        await db.connect(settings)
    except Exception as exc:
        pytest.skip(f"Neo4j database not reachable: {exc}")

    try:
        repo = SchemaRepository(db.driver)
        constraints = await repo.get_constraints()
        constraint_names = {c.get("name") for c in constraints}

        expected_constraints = {
            "constraint_donor_id",
            "constraint_recipient_id",
            "constraint_hospital_id",
            "constraint_blood_type",
            "constraint_match_id",
            "constraint_allocation_id",
            "constraint_user_id",
            "constraint_user_username",
        }
        for expected in expected_constraints:
            assert expected in constraint_names, f"Missing constraint: {expected}"

        indexes = await repo.get_indexes()
        index_names = {idx.get("name") for idx in indexes}

        expected_indexes = {
            "index_donor_status",
            "index_donor_organ_type",
            "index_donor_blood_type",
            "index_recipient_status",
            "index_recipient_organ_needed",
            "index_recipient_urgency_score",
            "index_recipient_blood_type",
            "index_match_status",
        }
        for expected in expected_indexes:
            assert expected in index_names, f"Missing index: {expected}"

    finally:
        await db.close()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_graph_seed_counts():
    """
    Verifies that seed data is populated with exact node labels and counts.
    """
    settings = get_settings()
    try:
        await db.connect(settings)
    except Exception as exc:
        pytest.skip(f"Neo4j database not reachable: {exc}")

    try:
        async with db.driver.session() as session:
            # Check node counts
            counts = {}
            for label in ["Donor", "Recipient", "Hospital", "BloodType", "User"]:
                res = await session.run(f"MATCH (n:{label}) RETURN count(n) AS c")
                counts[label] = (await res.single())["c"]

            assert counts["Donor"] == 50, f"Expected 50 Donors, got {counts['Donor']}"
            assert counts["Recipient"] == 50, f"Expected 50 Recipients, got {counts['Recipient']}"
            assert counts["Hospital"] == 6, f"Expected 6 Hospitals, got {counts['Hospital']}"
            assert counts["BloodType"] == 8, f"Expected 8 BloodTypes, got {counts['BloodType']}"
            assert counts["User"] == 4, f"Expected 4 Users, got {counts['User']}"

            # Check relationship counts
            rel_res = await session.run("MATCH (d:BloodType)-[r:CAN_DONATE_TO]->(rec:BloodType) RETURN count(r) AS c")
            can_donate_count = (await rel_res.single())["c"]
            assert can_donate_count == 27, f"Expected 27 blood compatibility edges, got {can_donate_count}"
    finally:
        await db.close()
