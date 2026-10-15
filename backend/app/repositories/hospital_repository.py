import logging
from typing import Any, Dict, List, Optional
from neo4j import AsyncDriver

logger = logging.getLogger("organ_network.hospital_repo")


class HospitalRepository:
    """Data access repository for Hospital nodes in Neo4j."""

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    async def get_by_id(self, hospital_id: str) -> Optional[Dict[str, Any]]:
        query = """
        MATCH (h:Hospital {hospital_id: $hospital_id})
        RETURN h.hospital_id AS hospital_id,
               h.name AS name,
               h.location.latitude AS latitude,
               h.location.longitude AS longitude
        """
        async with self.driver.session() as session:
            result = await session.run(query, hospital_id=hospital_id)
            record = await result.single()
            if not record:
                return None
            return {
                "hospital_id": record["hospital_id"],
                "name": record["name"],
                "location": {
                    "latitude": record["latitude"],
                    "longitude": record["longitude"],
                },
            }

    async def exists(self, hospital_id: str) -> bool:
        query = """
        MATCH (h:Hospital {hospital_id: $hospital_id})
        RETURN count(h) > 0 AS exists
        """
        async with self.driver.session() as session:
            result = await session.run(query, hospital_id=hospital_id)
            record = await result.single()
            return bool(record and record["exists"])

    async def create(self, hospital_data: Dict[str, Any]) -> Dict[str, Any]:
        """Creates a Hospital node safely using parameterized Cypher."""
        query = """
        CREATE (h:Hospital {
            hospital_id: $hospital_id,
            name: $name,
            location: point({latitude: $latitude, longitude: $longitude})
        })
        RETURN h.hospital_id AS hospital_id,
               h.name AS name,
               h.location.latitude AS latitude,
               h.location.longitude AS longitude
        """
        loc = hospital_data["location"]
        async with self.driver.session() as session:
            result = await session.run(
                query,
                hospital_id=hospital_data["hospital_id"],
                name=hospital_data["name"],
                latitude=loc["latitude"],
                longitude=loc["longitude"],
            )
            record = await result.single()
            return {
                "hospital_id": record["hospital_id"],
                "name": record["name"],
                "location": {
                    "latitude": record["latitude"],
                    "longitude": record["longitude"],
                },
            }

    async def list_hospitals(
        self,
        name_query: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        skip = (page - 1) * page_size
        where_clauses = []
        params: Dict[str, Any] = {"skip": skip, "limit": page_size}

        if name_query and name_query.strip():
            where_clauses.append("toLower(h.name) CONTAINS toLower($name_query)")
            params["name_query"] = name_query.strip()

        where_stmt = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        count_query = f"""
        MATCH (h:Hospital)
        {where_stmt}
        RETURN count(h) AS total
        """

        data_query = f"""
        MATCH (h:Hospital)
        {where_stmt}
        RETURN h.hospital_id AS hospital_id,
               h.name AS name,
               h.location.latitude AS latitude,
               h.location.longitude AS longitude
        ORDER BY h.hospital_id ASC
        SKIP $skip
        LIMIT $limit
        """

        async with self.driver.session() as session:
            count_res = await session.run(count_query, **params)
            count_rec = await count_res.single()
            total = count_rec["total"] if count_rec else 0

            data_res = await session.run(data_query, **params)
            records = await data_res.data()

            items = [
                {
                    "hospital_id": r["hospital_id"],
                    "name": r["name"],
                    "location": {
                        "latitude": r["latitude"],
                        "longitude": r["longitude"],
                    },
                }
                for r in records
            ]

            return {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
            }

    async def update(self, hospital_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Selectively updates properties without touching relationships."""
        set_clauses = []
        params: Dict[str, Any] = {"hospital_id": hospital_id}

        if "name" in updates:
            set_clauses.append("h.name = $name")
            params["name"] = updates["name"]

        if "location" in updates and updates["location"] is not None:
            set_clauses.append("h.location = point({latitude: $latitude, longitude: $longitude})")
            params["latitude"] = updates["location"]["latitude"]
            params["longitude"] = updates["location"]["longitude"]

        if not set_clauses:
            return await self.get_by_id(hospital_id)

        query = f"""
        MATCH (h:Hospital {{hospital_id: $hospital_id}})
        SET {', '.join(set_clauses)}
        RETURN h.hospital_id AS hospital_id,
               h.name AS name,
               h.location.latitude AS latitude,
               h.location.longitude AS longitude
        """
        async with self.driver.session() as session:
            result = await session.run(query, **params)
            record = await result.single()
            if not record:
                return None
            return {
                "hospital_id": record["hospital_id"],
                "name": record["name"],
                "location": {
                    "latitude": record["latitude"],
                    "longitude": record["longitude"],
                },
            }

    async def get_dependencies_count(self, hospital_id: str) -> Dict[str, int]:
        """Checks whether the hospital has registered recipients, associated users, or allocations."""
        query = """
        MATCH (h:Hospital {hospital_id: $hospital_id})
        OPTIONAL MATCH (r:Recipient)-[:REGISTERED_AT]->(h)
        OPTIONAL MATCH (u:User)-[:WORKS_AT]->(h)
        OPTIONAL MATCH (a:Allocation)-[:CONFIRMED_BY]->(h)
        OPTIONAL MATCH (req:MatchRequest)-[:REQUESTED_BY]->(h)
        RETURN count(DISTINCT r) AS recipients,
               count(DISTINCT u) AS users,
               count(DISTINCT a) AS allocations,
               count(DISTINCT req) AS requests
        """
        async with self.driver.session() as session:
            result = await session.run(query, hospital_id=hospital_id)
            record = await result.single()
            if not record:
                return {"recipients": 0, "users": 0, "allocations": 0, "requests": 0}
            return {
                "recipients": record["recipients"],
                "users": record["users"],
                "allocations": record["allocations"],
                "requests": record["requests"],
            }

    async def delete(self, hospital_id: str) -> bool:
        query = """
        MATCH (h:Hospital {hospital_id: $hospital_id})
        DELETE h
        RETURN count(h) AS deleted_count
        """
        async with self.driver.session() as session:
            result = await session.run(query, hospital_id=hospital_id)
            record = await result.single()
            return bool(record and record["deleted_count"] > 0)
