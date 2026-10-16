import logging
from typing import Any, Dict, List, Optional
from neo4j import AsyncDriver, AsyncTransaction

from app.core.exceptions import ConflictException, NotFoundException
from app.schemas.enums import AllocationStatusEnum

logger = logging.getLogger("organ_network.allocation_repo")


class AllocationRepository:
    """
    Neo4j repository for transactional allocation operations, locking, and queries.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    async def get_allocation_by_id(self, allocation_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves allocation details by ID with linked entities.
        """
        query = """
        MATCH (a:Allocation {allocation_id: $allocation_id})
        OPTIONAL MATCH (d:Donor)-[:ALLOCATED_IN]->(a)
        OPTIONAL MATCH (a)-[:TO_RECIPIENT]->(r:Recipient)
        OPTIONAL MATCH (a)-[:CONFIRMED_BY]->(h:Hospital)
        OPTIONAL MATCH (m:MatchRequest)-[:RESOLVED_IN]->(a)
        RETURN a.allocation_id AS allocation_id,
               coalesce(a.match_id, m.match_id, '') AS match_id,
               d.donor_id AS donor_id,
               r.recipient_id AS recipient_id,
               coalesce(h.hospital_id, '') AS hospital_id,
               coalesce(a.allocated_by, '') AS allocated_by,
               toString(a.confirmed_at) AS confirmed_at,
               coalesce(a.status, 'Confirmed') AS status
        """
        async with self.driver.session() as session:
            res = await session.run(query, allocation_id=allocation_id)
            record = await res.single()
            if not record:
                return None
            return {
                "allocation_id": record["allocation_id"],
                "match_id": record["match_id"],
                "donor_id": record["donor_id"],
                "recipient_id": record["recipient_id"],
                "hospital_id": record["hospital_id"],
                "allocated_by": record["allocated_by"],
                "confirmed_at": record["confirmed_at"],
                "status": record["status"],
            }

    async def get_allocation_by_match_id(self, match_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves existing allocation associated with a MatchRequest.
        """
        query = """
        MATCH (m:MatchRequest {match_id: $match_id})
        MATCH (m)-[:RESOLVED_IN]->(a:Allocation)
        OPTIONAL MATCH (d:Donor)-[:ALLOCATED_IN]->(a)
        OPTIONAL MATCH (a)-[:TO_RECIPIENT]->(r:Recipient)
        OPTIONAL MATCH (a)-[:CONFIRMED_BY]->(h:Hospital)
        RETURN a.allocation_id AS allocation_id,
               m.match_id AS match_id,
               d.donor_id AS donor_id,
               r.recipient_id AS recipient_id,
               coalesce(h.hospital_id, '') AS hospital_id,
               coalesce(a.allocated_by, '') AS allocated_by,
               toString(a.confirmed_at) AS confirmed_at,
               coalesce(a.status, 'Confirmed') AS status
        """
        async with self.driver.session() as session:
            res = await session.run(query, match_id=match_id)
            record = await res.single()
            if not record:
                return None
            return {
                "allocation_id": record["allocation_id"],
                "match_id": record["match_id"],
                "donor_id": record["donor_id"],
                "recipient_id": record["recipient_id"],
                "hospital_id": record["hospital_id"],
                "allocated_by": record["allocated_by"],
                "confirmed_at": record["confirmed_at"],
                "status": record["status"],
            }

    async def list_allocations(
        self,
        recipient_id: Optional[str] = None,
        donor_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        Lists allocations with pagination.
        """
        skip = (page - 1) * page_size
        where_clauses = []
        params: Dict[str, Any] = {"skip": skip, "limit": page_size}

        if recipient_id:
            where_clauses.append("r.recipient_id = $recipient_id")
            params["recipient_id"] = recipient_id
        if donor_id:
            where_clauses.append("d.donor_id = $donor_id")
            params["donor_id"] = donor_id

        where_stmt = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        count_query = f"""
        MATCH (a:Allocation)
        OPTIONAL MATCH (d:Donor)-[:ALLOCATED_IN]->(a)
        OPTIONAL MATCH (a)-[:TO_RECIPIENT]->(r:Recipient)
        {where_stmt}
        RETURN count(DISTINCT a) AS total
        """

        data_query = f"""
        MATCH (a:Allocation)
        OPTIONAL MATCH (d:Donor)-[:ALLOCATED_IN]->(a)
        OPTIONAL MATCH (a)-[:TO_RECIPIENT]->(r:Recipient)
        OPTIONAL MATCH (a)-[:CONFIRMED_BY]->(h:Hospital)
        OPTIONAL MATCH (m:MatchRequest)-[:RESOLVED_IN]->(a)
        {where_stmt}
        RETURN a.allocation_id AS allocation_id,
               coalesce(a.match_id, m.match_id, '') AS match_id,
               coalesce(d.donor_id, '') AS donor_id,
               coalesce(r.recipient_id, '') AS recipient_id,
               coalesce(h.hospital_id, '') AS hospital_id,
               coalesce(a.allocated_by, '') AS allocated_by,
               toString(a.confirmed_at) AS confirmed_at,
               coalesce(a.status, 'Confirmed') AS status
        ORDER BY a.confirmed_at DESC, a.allocation_id ASC
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
                    "allocation_id": r["allocation_id"],
                    "match_id": r["match_id"],
                    "donor_id": r["donor_id"],
                    "recipient_id": r["recipient_id"],
                    "hospital_id": r["hospital_id"],
                    "allocated_by": r["allocated_by"],
                    "confirmed_at": r["confirmed_at"],
                    "status": r["status"],
                }
                for r in records
            ]

            return {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
            }

    async def execute_allocation_transaction(
        self,
        allocation_id: str,
        match_id: str,
        donor_id: str,
        recipient_id: str,
        hospital_id: str,
        allocated_by: str,
        confirmed_at_iso: str,
    ) -> Dict[str, Any]:
        """
        Executes atomic allocation in an explicit asynchronous transaction.
        Guarantees concurrency safety in Neo4j 5 Community Edition via write locks
        and conditional verification.
        """
        async with self.driver.session() as session:
            tx = await session.begin_transaction()
            try:
                # 1. Acquire write locks on Donor and Recipient in deterministic order
                # to prevent deadlocks and serialize concurrent allocation transactions.
                # In Neo4j Community Edition, setting a property on a node acquires an exclusive write lock.
                first_id, second_id = sorted([donor_id, recipient_id])
                await tx.run(
                    """
                    MATCH (n) WHERE n.donor_id = $first_id OR n.recipient_id = $first_id
                    SET n._tx_lock = timestamp()
                    """,
                    first_id=first_id,
                )
                await tx.run(
                    """
                    MATCH (n) WHERE n.donor_id = $second_id OR n.recipient_id = $second_id
                    SET n._tx_lock = timestamp()
                    """,
                    second_id=second_id,
                )

                # 2. Check current state under lock:
                # - MatchRequest must exist, have status 'Pending', and NOT already be resolved in an Allocation
                # - Donor must have status 'Available' and NOT have an [:ALLOCATED_IN] edge
                # - Recipient must have status 'Waiting' and NOT have a incoming [:TO_RECIPIENT] edge
                check_query = """
                MATCH (m:MatchRequest {match_id: $match_id})
                MATCH (d:Donor {donor_id: $donor_id})
                MATCH (r:Recipient {recipient_id: $recipient_id})
                MATCH (h:Hospital {hospital_id: $hospital_id})
                OPTIONAL MATCH (m)-[:RESOLVED_IN]->(existing_m_alc:Allocation)
                OPTIONAL MATCH (d)-[:ALLOCATED_IN]->(existing_d_alc:Allocation)
                OPTIONAL MATCH (existing_r_alc:Allocation)-[:TO_RECIPIENT]->(r)
                RETURN m.status AS match_status,
                       d.status AS donor_status,
                       r.status AS recipient_status,
                       d.organ_type AS donor_organ,
                       r.organ_needed AS recipient_organ,
                       existing_m_alc.allocation_id AS existing_m_alc_id,
                       existing_d_alc.allocation_id AS existing_d_alc_id,
                       existing_r_alc.allocation_id AS existing_r_alc_id
                """
                check_res = await tx.run(
                    check_query,
                    match_id=match_id,
                    donor_id=donor_id,
                    recipient_id=recipient_id,
                    hospital_id=hospital_id,
                )
                check_rec = await check_res.single()

                if not check_rec:
                    raise NotFoundException(
                        message="Required entities (MatchRequest, Donor, Recipient, or Hospital) not found",
                        code="ENTITIES_NOT_FOUND",
                    )

                if check_rec["existing_m_alc_id"]:
                    raise ConflictException(
                        message=f"MatchRequest '{match_id}' is already allocated in allocation '{check_rec['existing_m_alc_id']}'",
                        code="MATCH_ALREADY_ALLOCATED",
                        details={"allocation_id": check_rec["existing_m_alc_id"]},
                    )

                if check_rec["match_status"] != "Pending":
                    raise ConflictException(
                        message=f"MatchRequest status is '{check_rec['match_status']}', expected 'Pending'",
                        code="INVALID_MATCH_STATUS",
                    )

                if check_rec["existing_d_alc_id"] or check_rec["donor_status"] != "Available":
                    raise ConflictException(
                        message=f"Donor '{donor_id}' is no longer available (current status: '{check_rec['donor_status']}')",
                        code="DONOR_UNAVAILABLE",
                    )

                if check_rec["existing_r_alc_id"] or check_rec["recipient_status"] != "Waiting":
                    raise ConflictException(
                        message=f"Recipient '{recipient_id}' is no longer waiting or already allocated",
                        code="RECIPIENT_NOT_ELIGIBLE",
                    )

                if check_rec["donor_organ"] != check_rec["recipient_organ"]:
                    raise ConflictException(
                        message=f"Organ mismatch: Donor provides {check_rec['donor_organ']}, Recipient needs {check_rec['recipient_organ']}",
                        code="ORGAN_TYPE_MISMATCH",
                    )

                # 3. Create Allocation node, wire relationships, update statuses, and clean _tx_lock
                commit_query = """
                MATCH (m:MatchRequest {match_id: $match_id})
                MATCH (d:Donor {donor_id: $donor_id, status: 'Available'})
                MATCH (r:Recipient {recipient_id: $recipient_id, status: 'Waiting'})
                MATCH (h:Hospital {hospital_id: $hospital_id})
                WHERE NOT (d)-[:ALLOCATED_IN]->(:Allocation)
                  AND NOT (:Allocation)-[:TO_RECIPIENT]->(r)

                CREATE (a:Allocation {
                    allocation_id: $allocation_id,
                    match_id: $match_id,
                    donor_id: $donor_id,
                    recipient_id: $recipient_id,
                    hospital_id: $hospital_id,
                    allocated_by: $allocated_by,
                    confirmed_at: datetime($confirmed_at_iso),
                    status: 'Confirmed'
                })

                // Create core graph relationships
                CREATE (d)-[:ALLOCATED_IN]->(a)
                CREATE (a)-[:TO_RECIPIENT]->(r)
                CREATE (a)-[:CONFIRMED_BY]->(h)
                CREATE (m)-[:RESOLVED_IN]->(a)

                // If user node exists, create confirmed by user relationship
                WITH a, d, r, m, h
                OPTIONAL MATCH (u:User {user_id: $allocated_by})
                FOREACH (_ IN CASE WHEN u IS NOT NULL THEN [1] ELSE [] END |
                    CREATE (a)-[:ALLOCATED_BY_USER]->(u)
                )

                // Update node statuses atomically
                SET d.status = 'Allocated',
                    r.status = 'Allocated',
                    m.status = 'Confirmed'

                // Remove temporary lock properties
                REMOVE d._tx_lock, r._tx_lock

                RETURN a.allocation_id AS allocation_id,
                       a.match_id AS match_id,
                       d.donor_id AS donor_id,
                       r.recipient_id AS recipient_id,
                       h.hospital_id AS hospital_id,
                       a.allocated_by AS allocated_by,
                       toString(a.confirmed_at) AS confirmed_at,
                       a.status AS status
                """
                commit_res = await tx.run(
                    commit_query,
                    allocation_id=allocation_id,
                    match_id=match_id,
                    donor_id=donor_id,
                    recipient_id=recipient_id,
                    hospital_id=hospital_id,
                    allocated_by=allocated_by,
                    confirmed_at_iso=confirmed_at_iso,
                )
                commit_rec = await commit_res.single()

                if not commit_rec:
                    raise ConflictException(
                        message="Atomic allocation conditional claim failed due to competing concurrent update",
                        code="CONCURRENT_ALLOCATION_CONFLICT",
                    )

                # Commit transaction
                await tx.commit()
                logger.info(
                    "Successfully committed allocation %s for match %s (Donor %s -> Recipient %s)",
                    allocation_id,
                    match_id,
                    donor_id,
                    recipient_id,
                )

                return {
                    "allocation_id": commit_rec["allocation_id"],
                    "match_id": commit_rec["match_id"],
                    "donor_id": commit_rec["donor_id"],
                    "recipient_id": commit_rec["recipient_id"],
                    "hospital_id": commit_rec["hospital_id"],
                    "allocated_by": commit_rec["allocated_by"],
                    "confirmed_at": commit_rec["confirmed_at"],
                    "status": commit_rec["status"],
                }

            except Exception as e:
                # Ensure rollback on any exception
                try:
                    await tx.rollback()
                except Exception:
                    pass
                raise
