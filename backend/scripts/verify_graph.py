import asyncio
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.core.db import db
from app.repositories.schema_repository import SchemaRepository


async def verify():
    settings = get_settings()
    await db.connect(settings)
    driver = db.driver
    repo = SchemaRepository(driver)

    print("=================== 1. CONSTRAINTS ===================")
    constraints = await repo.get_constraints()
    for c in sorted(constraints, key=lambda x: x.get("name", "")):
        print(f"Constraint: {c.get('name')} | Type: {c.get('type')} | Target: {c.get('labelsOrTypes')}{c.get('properties')}")

    print("\n=================== 2. INDEXES ===================")
    indexes = await repo.get_indexes()
    for idx in sorted(indexes, key=lambda x: x.get("name", "")):
        print(f"Index: {idx.get('name')} | Type: {idx.get('type')} | Target: {idx.get('labelsOrTypes')}{idx.get('properties')}")

    async with driver.session() as s:
        print("\n=================== 3. NODE COUNTS ===================")
        labels = ["Donor", "Recipient", "Hospital", "BloodType", "User", "MatchRequest", "Allocation"]
        for l in labels:
            cr = await s.run(f"MATCH (n:{l}) RETURN count(n) AS c")
            cnt = (await cr.single())["c"]
            print(f"Node Label (:{l}): {cnt}")

        total_nodes = (await (await s.run("MATCH (n) RETURN count(n) AS c")).single())["c"]
        print(f"TOTAL NODES: {total_nodes}")

        print("\n=================== 4. RELATIONSHIP COUNTS ===================")
        r_rel = await s.run("MATCH ()-[r]->() RETURN type(r) AS rel_type, count(r) AS count ORDER BY count DESC")
        records = await r_rel.data()
        for rec in records:
            print(f"Relationship [:{rec['rel_type']}]: {rec['count']}")

        total_rels = (await (await s.run("MATCH ()-[r]->() RETURN count(r) AS c")).single())["c"]
        print(f"TOTAL RELATIONSHIPS: {total_rels}")

        print("\n=================== 5. SAMPLE TRAVERSAL QUERY ===================")
        print("Query: Find Available Kidney Donors compatible with Waiting Recipient REC-001")
        query = """
        MATCH (rec:Recipient {recipient_id: 'REC-001'})-[:HAS_BLOOD_TYPE]->(rec_bt:BloodType)
        MATCH (donor_bt:BloodType)-[:CAN_DONATE_TO]->(rec_bt)
        MATCH (donor:Donor {organ_type: rec.organ_needed, status: 'Available'})-[:HAS_BLOOD_TYPE]->(donor_bt)
        MATCH (rec)-[:REGISTERED_AT]->(hosp:Hospital)
        RETURN 
            rec.recipient_id AS recipient_id,
            rec.name AS recipient_name,
            rec.blood_type AS recipient_blood,
            rec.organ_needed AS organ_needed,
            hosp.name AS registered_hospital,
            donor.donor_id AS donor_id,
            donor.name AS donor_name,
            donor.blood_type AS donor_blood,
            donor.status AS donor_status,
            point.distance(donor.location, hosp.location) / 1000.0 AS distance_km
        ORDER BY distance_km ASC
        LIMIT 5
        """
        res_traversal = await s.run(query)
        candidates = await res_traversal.data()
        for idx, cand in enumerate(candidates, 1):
            print(f"Candidate #{idx}: Donor {cand['donor_id']} ({cand['donor_name']}) | Blood: {cand['donor_blood']} -> {cand['recipient_blood']} | Distance to {cand['registered_hospital']}: {cand['distance_km']:.2f} km")

        print("\n=================== 6. SAMPLE ALLOCATION GRAPH QUERY ===================")
        query_alloc = """
        MATCH (d:Donor)-[:ALLOCATED_IN]->(alc:Allocation)-[:TO_RECIPIENT]->(r:Recipient)
        MATCH (alc)-[:CONFIRMED_BY]->(h:Hospital)
        RETURN 
            alc.allocation_id AS allocation_id,
            alc.confirmed_at AS confirmed_at,
            d.donor_id AS donor_id,
            d.name AS donor_name,
            r.recipient_id AS recipient_id,
            r.name AS recipient_name,
            h.name AS confirming_hospital
        """
        res_alloc = await s.run(query_alloc)
        alloc_records = await res_alloc.data()
        for item in alloc_records:
            print(f"Allocation {item['allocation_id']} at {item['confirming_hospital']}: Donor {item['donor_id']} -> Recipient {item['recipient_id']} (Confirmed at: {item['confirmed_at']})")

    await db.close()


if __name__ == "__main__":
    asyncio.run(verify())
