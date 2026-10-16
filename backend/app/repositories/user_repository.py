import logging
from typing import Any, Dict, Optional
from neo4j import AsyncDriver

logger = logging.getLogger("organ_network.user_repo")


class UserRepository:
    """
    Neo4j repository for User node retrieval and credential verification.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    async def get_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves user record including password hash and works_at hospital for authentication.
        """
        query = """
        MATCH (u:User {username: $username})
        OPTIONAL MATCH (u)-[:WORKS_AT]->(h:Hospital)
        RETURN u.user_id AS user_id,
               u.username AS username,
               u.password_hash AS password_hash,
               u.role AS role,
               coalesce(u.is_active, true) AS is_active,
               coalesce(h.hospital_id, null) AS hospital_id
        """
        async with self.driver.session() as session:
            result = await session.run(query, username=username)
            record = await result.single()
            if not record:
                return None
            return {
                "user_id": record["user_id"],
                "username": record["username"],
                "password_hash": record["password_hash"],
                "role": record["role"],
                "is_active": record["is_active"],
                "hospital_id": record["hospital_id"],
            }

    async def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves user profile by user_id without exposing password hash.
        """
        query = """
        MATCH (u:User {user_id: $user_id})
        OPTIONAL MATCH (u)-[:WORKS_AT]->(h:Hospital)
        RETURN u.user_id AS user_id,
               u.username AS username,
               u.role AS role,
               coalesce(u.is_active, true) AS is_active,
               coalesce(h.hospital_id, null) AS hospital_id
        """
        async with self.driver.session() as session:
            result = await session.run(query, user_id=user_id)
            record = await result.single()
            if not record:
                return None
            return {
                "user_id": record["user_id"],
                "username": record["username"],
                "role": record["role"],
                "is_active": record["is_active"],
                "hospital_id": record["hospital_id"],
            }
