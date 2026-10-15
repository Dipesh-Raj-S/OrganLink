import logging
from typing import Any, Dict, List, Optional
from neo4j import AsyncDriver

logger = logging.getLogger("organ_network.recipient_repo")


class RecipientRepository:
    """Data access repository for Recipient nodes and relationships in Neo4j."""

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    def _format_record(self, record: Any) -> Dict[str, Any]:
        wl_since = record["waitlist_since"]
        iso_wl_since = wl_since.isoformat() if hasattr(wl_since, "isoformat") else str(wl_since)
        return {
            "recipient_id": record["recipient_id"],
            "name": record["name"],
            "blood_type": record["blood_type"],
            "organ_needed": record["organ_needed"],
            "urgency_score": record["urgency_score"],
            "location": {
                "latitude": record["latitude"],
                "longitude": record["longitude"],
            },
            "waitlist_since": iso_wl_since,
            "status": record["status"],
            "hospital_id": record["hospital_id"],
        }

    async def get_by_id(self, recipient_id: str) -> Optional[Dict[str, Any]]:
        query = """
        MATCH (r:Recipient {recipient_id: $recipient_id})
        OPTIONAL MATCH (r)-[:REGISTERED_AT]->(h:Hospital)
        RETURN r.recipient_id AS recipient_id,
               r.name AS name,
               r.blood_type AS blood_type,
               r.organ_needed AS organ_needed,
               r.urgency_score AS urgency_score,
               r.location.latitude AS latitude,
               r.location.longitude AS longitude,
               r.waitlist_since AS waitlist_since,
               r.status AS status,
               coalesce(h.hospital_id, '') AS hospital_id
        """
        async with self.driver.session() as session:
            result = await session.run(query, recipient_id=recipient_id)
            record = await result.single()
            if not record:
                return None
            return self._format_record(record)

    async def exists(self, recipient_id: str) -> bool:
        query = """
        MATCH (r:Recipient {recipient_id: $recipient_id})
        RETURN count(r) > 0 AS exists
        """
        async with self.driver.session() as session:
            result = await session.run(query, recipient_id=recipient_id)
            record = await result.single()
            return bool(record and record["exists"])

    async def create(self, recipient_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Creates a Recipient node, links HAS_BLOOD_TYPE, and REGISTERED_AT hospital.
        """
        query = """
        MATCH (h:Hospital {hospital_id: $hospital_id})
        CREATE (r:Recipient {
            recipient_id: $recipient_id,
            name: $name,
            blood_type: $blood_type,
            organ_needed: $organ_needed,
            urgency_score: $urgency_score,
            location: point({latitude: $latitude, longitude: $longitude}),
            waitlist_since: datetime($waitlist_since),
            status: $status
        })
        CREATE (r)-[:REGISTERED_AT]->(h)
        WITH r, h
        MERGE (b:BloodType {blood_type: $blood_type})
        ON CREATE SET b.category = 'Blood'
        MERGE (r)-[:HAS_BLOOD_TYPE]->(b)
        RETURN r.recipient_id AS recipient_id,
               r.name AS name,
               r.blood_type AS blood_type,
               r.organ_needed AS organ_needed,
               r.urgency_score AS urgency_score,
               r.location.latitude AS latitude,
               r.location.longitude AS longitude,
               r.waitlist_since AS waitlist_since,
               r.status AS status,
               h.hospital_id AS hospital_id
        """
        loc = recipient_data["location"]
        async with self.driver.session() as session:
            result = await session.run(
                query,
                recipient_id=recipient_data["recipient_id"],
                name=recipient_data["name"],
                blood_type=recipient_data["blood_type"],
                organ_needed=recipient_data["organ_needed"],
                urgency_score=recipient_data["urgency_score"],
                latitude=loc["latitude"],
                longitude=loc["longitude"],
                waitlist_since=recipient_data["waitlist_since"],
                status=recipient_data["status"],
                hospital_id=recipient_data["hospital_id"],
            )
            record = await result.single()
            return self._format_record(record)

    async def list_recipients(
        self,
        organ_needed: Optional[str] = None,
        blood_type: Optional[str] = None,
        hospital_id: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        skip = (page - 1) * page_size
        where_clauses = []
        params: Dict[str, Any] = {"skip": skip, "limit": page_size}

        if organ_needed:
            where_clauses.append("r.organ_needed = $organ_needed")
            params["organ_needed"] = organ_needed
        if blood_type:
            where_clauses.append("r.blood_type = $blood_type")
            params["blood_type"] = blood_type
        if status:
            where_clauses.append("r.status = $status")
            params["status"] = status
        if hospital_id:
            where_clauses.append("h.hospital_id = $hospital_id")
            params["hospital_id"] = hospital_id

        where_stmt = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        count_query = f"""
        MATCH (r:Recipient)
        OPTIONAL MATCH (r)-[:REGISTERED_AT]->(h:Hospital)
        {where_stmt}
        RETURN count(DISTINCT r) AS total
        """

        data_query = f"""
        MATCH (r:Recipient)
        OPTIONAL MATCH (r)-[:REGISTERED_AT]->(h:Hospital)
        {where_stmt}
        RETURN r.recipient_id AS recipient_id,
               r.name AS name,
               r.blood_type AS blood_type,
               r.organ_needed AS organ_needed,
               r.urgency_score AS urgency_score,
               r.location.latitude AS latitude,
               r.location.longitude AS longitude,
               r.waitlist_since AS waitlist_since,
               r.status AS status,
               coalesce(h.hospital_id, '') AS hospital_id
        ORDER BY r.urgency_score DESC, r.waitlist_since ASC
        SKIP $skip
        LIMIT $limit
        """

        async with self.driver.session() as session:
            count_res = await session.run(count_query, **params)
            count_rec = await count_res.single()
            total = count_rec["total"] if count_rec else 0

            data_res = await session.run(data_query, **params)
            records = await data_res.data()

            items = [self._format_record(r) for r in records]

            return {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
            }

    async def update(self, recipient_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Updates recipient fields, handling relationship rewiring if blood_type or hospital_id changes.
        """
        set_clauses = []
        params: Dict[str, Any] = {"recipient_id": recipient_id}

        if "name" in updates:
            set_clauses.append("r.name = $name")
            params["name"] = updates["name"]

        if "organ_needed" in updates:
            set_clauses.append("r.organ_needed = $organ_needed")
            params["organ_needed"] = updates["organ_needed"]

        if "urgency_score" in updates:
            set_clauses.append("r.urgency_score = $urgency_score")
            params["urgency_score"] = updates["urgency_score"]

        if "location" in updates and updates["location"] is not None:
            set_clauses.append("r.location = point({latitude: $latitude, longitude: $longitude})")
            params["latitude"] = updates["location"]["latitude"]
            params["longitude"] = updates["location"]["longitude"]

        blood_changed = "blood_type" in updates
        if blood_changed:
            set_clauses.append("r.blood_type = $blood_type")
            params["blood_type"] = updates["blood_type"]

        hosp_changed = "hospital_id" in updates
        if hosp_changed:
            params["new_hospital_id"] = updates["hospital_id"]

        set_stmt = f"SET {', '.join(set_clauses)}" if set_clauses else ""

        # Cypher query with optional rewiring
        query = f"""
        MATCH (r:Recipient {{recipient_id: $recipient_id}})
        {set_stmt}
        WITH r
        """

        if blood_changed:
            query += """
            OPTIONAL MATCH (r)-[old_bt:HAS_BLOOD_TYPE]->(:BloodType)
            DELETE old_bt
            WITH r
            MERGE (b:BloodType {blood_type: $blood_type})
            ON CREATE SET b.category = 'Blood'
            MERGE (r)-[:HAS_BLOOD_TYPE]->(b)
            WITH r
            """

        if hosp_changed:
            query += """
            OPTIONAL MATCH (r)-[old_reg:REGISTERED_AT]->(:Hospital)
            DELETE old_reg
            WITH r
            MATCH (new_h:Hospital {hospital_id: $new_hospital_id})
            MERGE (r)-[:REGISTERED_AT]->(new_h)
            WITH r
            """

        query += """
        OPTIONAL MATCH (r)-[:REGISTERED_AT]->(final_h:Hospital)
        RETURN r.recipient_id AS recipient_id,
               r.name AS name,
               r.blood_type AS blood_type,
               r.organ_needed AS organ_needed,
               r.urgency_score AS urgency_score,
               r.location.latitude AS latitude,
               r.location.longitude AS longitude,
               r.waitlist_since AS waitlist_since,
               r.status AS status,
               coalesce(final_h.hospital_id, '') AS hospital_id
        """

        async with self.driver.session() as session:
            result = await session.run(query, **params)
            record = await result.single()
            if not record:
                return None
            return self._format_record(record)

    async def update_urgency(self, recipient_id: str, urgency_score: int) -> Optional[Dict[str, Any]]:
        query = """
        MATCH (r:Recipient {recipient_id: $recipient_id})
        SET r.urgency_score = $urgency_score
        WITH r
        OPTIONAL MATCH (r)-[:REGISTERED_AT]->(h:Hospital)
        RETURN r.recipient_id AS recipient_id,
               r.name AS name,
               r.blood_type AS blood_type,
               r.organ_needed AS organ_needed,
               r.urgency_score AS urgency_score,
               r.location.latitude AS latitude,
               r.location.longitude AS longitude,
               r.waitlist_since AS waitlist_since,
               r.status AS status,
               coalesce(h.hospital_id, '') AS hospital_id
        """
        async with self.driver.session() as session:
            result = await session.run(query, recipient_id=recipient_id, urgency_score=urgency_score)
            record = await result.single()
            if not record:
                return None
            return self._format_record(record)

    async def get_allocation_count(self, recipient_id: str) -> int:
        query = """
        MATCH (r:Recipient {recipient_id: $recipient_id})
        OPTIONAL MATCH (a:Allocation)-[:TO_RECIPIENT]->(r)
        OPTIONAL MATCH (req:MatchRequest)-[:FOR_RECIPIENT]->(r)
        RETURN count(DISTINCT a) + count(DISTINCT req) AS history_count
        """
        async with self.driver.session() as session:
            result = await session.run(query, recipient_id=recipient_id)
            record = await result.single()
            return record["history_count"] if record else 0

    async def delete(self, recipient_id: str) -> bool:
        query = """
        MATCH (r:Recipient {recipient_id: $recipient_id})
        DETACH DELETE r
        RETURN count(r) AS deleted_count
        """
        async with self.driver.session() as session:
            result = await session.run(query, recipient_id=recipient_id)
            record = await result.single()
            return bool(record and record["deleted_count"] > 0)
