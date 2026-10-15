import logging
from typing import List, Dict, Any
from neo4j import AsyncDriver

logger = logging.getLogger("organ_network.repository.schema")

# Canonical constraints and indexes definition for Neo4j 5
SCHEMA_STATEMENTS = [
    # Constraints
    "CREATE CONSTRAINT constraint_donor_id IF NOT EXISTS FOR (d:Donor) REQUIRE d.donor_id IS UNIQUE",
    "CREATE CONSTRAINT constraint_recipient_id IF NOT EXISTS FOR (r:Recipient) REQUIRE r.recipient_id IS UNIQUE",
    "CREATE CONSTRAINT constraint_hospital_id IF NOT EXISTS FOR (h:Hospital) REQUIRE h.hospital_id IS UNIQUE",
    "CREATE CONSTRAINT constraint_blood_type IF NOT EXISTS FOR (b:BloodType) REQUIRE b.blood_type IS UNIQUE",
    "CREATE CONSTRAINT constraint_match_id IF NOT EXISTS FOR (m:MatchRequest) REQUIRE m.match_id IS UNIQUE",
    "CREATE CONSTRAINT constraint_allocation_id IF NOT EXISTS FOR (a:Allocation) REQUIRE a.allocation_id IS UNIQUE",
    "CREATE CONSTRAINT constraint_user_id IF NOT EXISTS FOR (u:User) REQUIRE u.user_id IS UNIQUE",
    "CREATE CONSTRAINT constraint_user_username IF NOT EXISTS FOR (u:User) REQUIRE u.username IS UNIQUE",

    # Indexes
    "CREATE INDEX index_donor_status IF NOT EXISTS FOR (d:Donor) ON (d.status)",
    "CREATE INDEX index_donor_organ_type IF NOT EXISTS FOR (d:Donor) ON (d.organ_type)",
    "CREATE INDEX index_donor_blood_type IF NOT EXISTS FOR (d:Donor) ON (d.blood_type)",
    "CREATE INDEX index_recipient_status IF NOT EXISTS FOR (r:Recipient) ON (r.status)",
    "CREATE INDEX index_recipient_organ_needed IF NOT EXISTS FOR (r:Recipient) ON (r.organ_needed)",
    "CREATE INDEX index_recipient_urgency_score IF NOT EXISTS FOR (r:Recipient) ON (r.urgency_score)",
    "CREATE INDEX index_recipient_blood_type IF NOT EXISTS FOR (r:Recipient) ON (r.blood_type)",
    "CREATE INDEX index_match_status IF NOT EXISTS FOR (m:MatchRequest) ON (m.status)",
]


class SchemaRepository:
    """
    Manages schema DDL operations, constraint enforcement, and index management
    for the Neo4j database graph layer.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    async def apply_schema(self) -> List[str]:
        """
        Executes all idempotently declared constraints and indexes.
        Returns a list of executed DDL statements.
        """
        applied: List[str] = []
        async with self.driver.session() as session:
            for statement in SCHEMA_STATEMENTS:
                logger.info("Applying schema statement: %s", statement)
                await session.run(statement)
                applied.append(statement)
        return applied

    async def get_constraints(self) -> List[Dict[str, Any]]:
        """
        Retrieves all currently active database constraints from Neo4j 5.
        """
        async with self.driver.session() as session:
            result = await session.run("SHOW CONSTRAINTS")
            records = await result.data()
            return records

    async def get_indexes(self) -> List[Dict[str, Any]]:
        """
        Retrieves all currently active database indexes from Neo4j 5.
        """
        async with self.driver.session() as session:
            result = await session.run("SHOW INDEXES")
            records = await result.data()
            return records
