import logging
from typing import Any, Dict, List, Optional
from neo4j import AsyncDriver

logger = logging.getLogger("organ_network.donor_repo")


class DonorRepository:
    """Data access repository for Donor nodes and HAS_BLOOD_TYPE relationship in Neo4j."""

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    def _format_record(self, record: Any) -> Dict[str, Any]:
        reg_at = record["registered_at"]
        # Handle Neo4j DateTime or string
        iso_reg_at = reg_at.isoformat() if hasattr(reg_at, "isoformat") else str(reg_at)
        return {
            "donor_id": record["donor_id"],
            "name": record["name"],
            "blood_type": record["blood_type"],
            "organ_type": record["organ_type"],
            "location": {
                "latitude": record["latitude"],
                "longitude": record["longitude"],
            },
            "status": record["status"],
            "registered_at": iso_reg_at,
            "expiry_window_hours": record["expiry_window_hours"],
            "version": record["version"],
        }

    async def get_by_id(self, donor_id: str) -> Optional[Dict[str, Any]]:
        query = """
        MATCH (d:Donor {donor_id: $donor_id})
        RETURN d.donor_id AS donor_id,
               d.name AS name,
               d.blood_type AS blood_type,
               d.organ_type AS organ_type,
               d.location.latitude AS latitude,
               d.location.longitude AS longitude,
               d.status AS status,
               d.registered_at AS registered_at,
               d.expiry_window_hours AS expiry_window_hours,
               d.version AS version
        """
        async with self.driver.session() as session:
            result = await session.run(query, donor_id=donor_id)
            record = await result.single()
            if not record:
                return None
            return self._format_record(record)

    async def exists(self, donor_id: str) -> bool:
        query = """
        MATCH (d:Donor {donor_id: $donor_id})
        RETURN count(d) > 0 AS exists
        """
        async with self.driver.session() as session:
            result = await session.run(query, donor_id=donor_id)
            record = await result.single()
            return bool(record and record["exists"])

    async def create(self, donor_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Creates a Donor node and links to the appropriate BloodType node.
        Uses CREATE for the donor to avoid overwriting existing data.
        """
        query = """
        CREATE (d:Donor {
            donor_id: $donor_id,
            name: $name,
            blood_type: $blood_type,
            organ_type: $organ_type,
            location: point({latitude: $latitude, longitude: $longitude}),
            status: $status,
            registered_at: datetime($registered_at),
            expiry_window_hours: $expiry_window_hours,
            version: $version
        })
        WITH d
        MERGE (b:BloodType {blood_type: $blood_type})
        ON CREATE SET b.category = 'Blood'
        MERGE (d)-[:HAS_BLOOD_TYPE]->(b)
        RETURN d.donor_id AS donor_id,
               d.name AS name,
               d.blood_type AS blood_type,
               d.organ_type AS organ_type,
               d.location.latitude AS latitude,
               d.location.longitude AS longitude,
               d.status AS status,
               d.registered_at AS registered_at,
               d.expiry_window_hours AS expiry_window_hours,
               d.version AS version
        """
        loc = donor_data["location"]
        async with self.driver.session() as session:
            result = await session.run(
                query,
                donor_id=donor_data["donor_id"],
                name=donor_data["name"],
                blood_type=donor_data["blood_type"],
                organ_type=donor_data["organ_type"],
                latitude=loc["latitude"],
                longitude=loc["longitude"],
                status=donor_data["status"],
                registered_at=donor_data["registered_at"],
                expiry_window_hours=donor_data["expiry_window_hours"],
                version=donor_data.get("version", 0),
            )
            record = await result.single()
            return self._format_record(record)

    async def list_donors(
        self,
        status: Optional[str] = None,
        organ_type: Optional[str] = None,
        blood_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        skip = (page - 1) * page_size
        where_clauses = []
        params: Dict[str, Any] = {"skip": skip, "limit": page_size}

        if status:
            where_clauses.append("d.status = $status")
            params["status"] = status
        if organ_type:
            where_clauses.append("d.organ_type = $organ_type")
            params["organ_type"] = organ_type
        if blood_type:
            where_clauses.append("d.blood_type = $blood_type")
            params["blood_type"] = blood_type

        where_stmt = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        count_query = f"""
        MATCH (d:Donor)
        {where_stmt}
        RETURN count(d) AS total
        """

        data_query = f"""
        MATCH (d:Donor)
        {where_stmt}
        RETURN d.donor_id AS donor_id,
               d.name AS name,
               d.blood_type AS blood_type,
               d.organ_type AS organ_type,
               d.location.latitude AS latitude,
               d.location.longitude AS longitude,
               d.status AS status,
               d.registered_at AS registered_at,
               d.expiry_window_hours AS expiry_window_hours,
               d.version AS version
        ORDER BY d.registered_at DESC, d.donor_id ASC
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

    async def update(self, donor_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Selectively updates donor properties and increments version.
        If blood_type changed, rewires HAS_BLOOD_TYPE relationship.
        """
        set_clauses = ["d.version = coalesce(d.version, 0) + 1"]
        params: Dict[str, Any] = {"donor_id": donor_id}

        if "name" in updates:
            set_clauses.append("d.name = $name")
            params["name"] = updates["name"]

        if "organ_type" in updates:
            set_clauses.append("d.organ_type = $organ_type")
            params["organ_type"] = updates["organ_type"]

        if "status" in updates:
            set_clauses.append("d.status = $status")
            params["status"] = updates["status"]

        if "expiry_window_hours" in updates:
            set_clauses.append("d.expiry_window_hours = $expiry_window_hours")
            params["expiry_window_hours"] = updates["expiry_window_hours"]

        if "location" in updates and updates["location"] is not None:
            set_clauses.append("d.location = point({latitude: $latitude, longitude: $longitude})")
            params["latitude"] = updates["location"]["latitude"]
            params["longitude"] = updates["location"]["longitude"]

        blood_type_changed = "blood_type" in updates
        if blood_type_changed:
            set_clauses.append("d.blood_type = $blood_type")
            params["blood_type"] = updates["blood_type"]

        set_stmt = ", ".join(set_clauses)

        if blood_type_changed:
            query = f"""
            MATCH (d:Donor {{donor_id: $donor_id}})
            SET {set_stmt}
            WITH d
            OPTIONAL MATCH (d)-[old_rel:HAS_BLOOD_TYPE]->(:BloodType)
            DELETE old_rel
            WITH d
            MERGE (b:BloodType {{blood_type: $blood_type}})
            ON CREATE SET b.category = 'Blood'
            MERGE (d)-[:HAS_BLOOD_TYPE]->(b)
            RETURN d.donor_id AS donor_id,
                   d.name AS name,
                   d.blood_type AS blood_type,
                   d.organ_type AS organ_type,
                   d.location.latitude AS latitude,
                   d.location.longitude AS longitude,
                   d.status AS status,
                   d.registered_at AS registered_at,
                   d.expiry_window_hours AS expiry_window_hours,
                   d.version AS version
            """
        else:
            query = f"""
            MATCH (d:Donor {{donor_id: $donor_id}})
            SET {set_stmt}
            RETURN d.donor_id AS donor_id,
                   d.name AS name,
                   d.blood_type AS blood_type,
                   d.organ_type AS organ_type,
                   d.location.latitude AS latitude,
                   d.location.longitude AS longitude,
                   d.status AS status,
                   d.registered_at AS registered_at,
                   d.expiry_window_hours AS expiry_window_hours,
                   d.version AS version
            """

        async with self.driver.session() as session:
            result = await session.run(query, **params)
            record = await result.single()
            if not record:
                return None
            return self._format_record(record)

    async def get_allocation_count(self, donor_id: str) -> int:
        """Counts allocations or match proposals involving this donor."""
        query = """
        MATCH (d:Donor {donor_id: $donor_id})
        OPTIONAL MATCH (d)-[:ALLOCATED_IN]->(a:Allocation)
        OPTIONAL MATCH (d)-[:PROPOSED_IN]->(m:MatchRequest)
        RETURN count(DISTINCT a) + count(DISTINCT m) AS allocation_history_count
        """
        async with self.driver.session() as session:
            result = await session.run(query, donor_id=donor_id)
            record = await result.single()
            return record["allocation_history_count"] if record else 0

    async def delete(self, donor_id: str) -> bool:
        """Deletes Donor and incidental HAS_BLOOD_TYPE relationship."""
        query = """
        MATCH (d:Donor {donor_id: $donor_id})
        DETACH DELETE d
        RETURN count(d) AS deleted_count
        """
        async with self.driver.session() as session:
            result = await session.run(query, donor_id=donor_id)
            record = await result.single()
            return bool(record and record["deleted_count"] > 0)
