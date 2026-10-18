import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from neo4j import AsyncDriver

logger = logging.getLogger("organ_network.matching_repo")


class MatchingRepository:
    """
    Data access repository for graph matching queries and MatchRequest nodes in Neo4j.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    async def get_recipient_context(self, recipient_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves recipient profile, hospital location, and blood type context.
        """
        query = """
        MATCH (r:Recipient {recipient_id: $recipient_id})
        OPTIONAL MATCH (r)-[:REGISTERED_AT]->(h:Hospital)
        RETURN r.recipient_id AS recipient_id,
               r.name AS name,
               r.blood_type AS blood_type,
               r.organ_needed AS organ_needed,
               r.urgency_score AS urgency_score,
               r.status AS status,
               coalesce(h.hospital_id, '') AS hospital_id,
               h.name AS hospital_name,
               h.location.latitude AS hospital_latitude,
               h.location.longitude AS hospital_longitude,
               r.location.latitude AS recipient_latitude,
               r.location.longitude AS recipient_longitude
        """
        async with self.driver.session() as session:
            res = await session.run(query, recipient_id=recipient_id)
            record = await res.single()
            if not record:
                return None
            return {
                "recipient_id": record["recipient_id"],
                "name": record["name"],
                "blood_type": record["blood_type"],
                "organ_needed": record["organ_needed"],
                "urgency_score": record["urgency_score"],
                "status": record["status"],
                "hospital_id": record["hospital_id"],
                "hospital_name": record["hospital_name"],
                "hospital_location": {
                    "latitude": record["hospital_latitude"] or record["recipient_latitude"],
                    "longitude": record["hospital_longitude"] or record["recipient_longitude"],
                },
            }

    async def find_candidate_donors_for_recipient(
        self,
        recipient_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Graph Traversal Query:
        Discovers potential donors who:
        1. Have status == 'Available'
        2. Have organ_type matching recipient.organ_needed
        3. Have a BloodType node connected via [:CAN_DONATE_TO] to recipient's BloodType
        4. Excludes donors with existing allocations
        """
        query = """
        MATCH (r:Recipient {recipient_id: $recipient_id})-[:HAS_BLOOD_TYPE]->(rb:BloodType)
        MATCH (db:BloodType)-[:CAN_DONATE_TO]->(rb)
        MATCH (d:Donor {status: 'Available', organ_type: r.organ_needed})-[:HAS_BLOOD_TYPE]->(db)
        WHERE NOT (d)-[:ALLOCATED_IN]->(:Allocation)
        RETURN DISTINCT d.donor_id AS donor_id,
                        d.name AS name,
                        d.blood_type AS blood_type,
                        d.organ_type AS organ_type,
                        d.location.latitude AS latitude,
                        d.location.longitude AS longitude,
                        d.expiry_window_hours AS expiry_window_hours
        """
        async with self.driver.session() as session:
            res = await session.run(query, recipient_id=recipient_id)
            records = await res.data()
            return [
                {
                    "donor_id": rec["donor_id"],
                    "name": rec["name"],
                    "blood_type": rec["blood_type"],
                    "organ_type": rec["organ_type"],
                    "location": {
                        "latitude": rec["latitude"],
                        "longitude": rec["longitude"],
                    },
                    "expiry_window_hours": rec["expiry_window_hours"],
                }
                for rec in records
            ]

    async def get_match_request(self, match_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a MatchRequest node with its linked Donor, Recipient, and Hospital.
        """
        query = """
        MATCH (m:MatchRequest {match_id: $match_id})
        OPTIONAL MATCH (d:Donor)-[:PROPOSED_IN]->(m)
        OPTIONAL MATCH (m)-[:FOR_RECIPIENT]->(r:Recipient)
        OPTIONAL MATCH (m)-[:REQUESTED_BY]->(h:Hospital)
        RETURN m.match_id AS match_id,
               m.match_score AS match_score,
               m.requested_at AS requested_at,
               m.status AS status,
               coalesce(d.donor_id, '') AS donor_id,
               coalesce(r.recipient_id, '') AS recipient_id,
               coalesce(h.hospital_id, '') AS hospital_id
        """
        async with self.driver.session() as session:
            res = await session.run(query, match_id=match_id)
            record = await res.single()
            if not record:
                return None

            req_at = record["requested_at"]
            iso_req_at = req_at.isoformat() if hasattr(req_at, "isoformat") else str(req_at)
            return {
                "match_id": record["match_id"],
                "match_score": record["match_score"],
                "requested_at": iso_req_at,
                "status": record["status"],
                "donor_id": record["donor_id"],
                "recipient_id": record["recipient_id"],
                "hospital_id": record["hospital_id"],
            }

    async def match_request_exists(self, match_id: str) -> bool:
        query = """
        MATCH (m:MatchRequest {match_id: $match_id})
        RETURN count(m) > 0 AS exists
        """
        async with self.driver.session() as session:
            res = await session.run(query, match_id=match_id)
            rec = await res.single()
            return bool(rec and rec["exists"])

    async def create_match_request(
        self,
        match_id: str,
        match_score: float,
        requested_at: str,
        status: str,
        donor_id: str,
        recipient_id: str,
        hospital_id: str,
    ) -> Dict[str, Any]:
        """
        Creates MatchRequest node and establishes:
        - (d:Donor)-[:PROPOSED_IN]->(m)
        - (m)-[:FOR_RECIPIENT]->(r)
        - (m)-[:REQUESTED_BY]->(h)
        Atomic graph write without mutating donor availability or recipient status.
        """
        query = """
        MATCH (d:Donor {donor_id: $donor_id})
        MATCH (r:Recipient {recipient_id: $recipient_id})
        MATCH (h:Hospital {hospital_id: $hospital_id})
        CREATE (m:MatchRequest {
            match_id: $match_id,
            match_score: $match_score,
            requested_at: datetime($requested_at),
            status: $status
        })
        CREATE (d)-[:PROPOSED_IN]->(m)
        CREATE (m)-[:FOR_RECIPIENT]->(r)
        CREATE (m)-[:REQUESTED_BY]->(h)
        RETURN m.match_id AS match_id,
               m.match_score AS match_score,
               m.requested_at AS requested_at,
               m.status AS status,
               d.donor_id AS donor_id,
               r.recipient_id AS recipient_id,
               h.hospital_id AS hospital_id
        """
        async with self.driver.session() as session:
            res = await session.run(
                query,
                match_id=match_id,
                match_score=match_score,
                requested_at=requested_at,
                status=status,
                donor_id=donor_id,
                recipient_id=recipient_id,
                hospital_id=hospital_id,
            )
            record = await res.single()
            if not record:
                raise RuntimeError("Failed to create MatchRequest; verify entities exist.")

            req_at = record["requested_at"]
            iso_req_at = req_at.isoformat() if hasattr(req_at, "isoformat") else str(req_at)
            return {
                "match_id": record["match_id"],
                "match_score": record["match_score"],
                "requested_at": iso_req_at,
                "status": record["status"],
                "donor_id": record["donor_id"],
                "recipient_id": record["recipient_id"],
                "hospital_id": record["hospital_id"],
            }

    async def list_match_requests(
        self,
        status: Optional[str] = None,
        recipient_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        Lists match requests with pagination and optional filters.
        """
        skip = (page - 1) * page_size
        where_clauses = []
        params: Dict[str, Any] = {"skip": skip, "limit": page_size}

        if status:
            where_clauses.append("m.status = $status")
            params["status"] = status
        if recipient_id:
            where_clauses.append("r.recipient_id = $recipient_id")
            params["recipient_id"] = recipient_id

        where_stmt = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        count_query = f"""
        MATCH (m:MatchRequest)
        OPTIONAL MATCH (m)-[:FOR_RECIPIENT]->(r:Recipient)
        {where_stmt}
        RETURN count(DISTINCT m) AS total
        """

        data_query = f"""
        MATCH (m:MatchRequest)
        OPTIONAL MATCH (d:Donor)-[:PROPOSED_IN]->(m)
        OPTIONAL MATCH (m)-[:FOR_RECIPIENT]->(r:Recipient)
        OPTIONAL MATCH (m)-[:REQUESTED_BY]->(h:Hospital)
        {where_stmt}
        RETURN m.match_id AS match_id,
               m.match_score AS match_score,
               m.requested_at AS requested_at,
               m.status AS status,
               coalesce(d.donor_id, '') AS donor_id,
               coalesce(r.recipient_id, '') AS recipient_id,
               coalesce(h.hospital_id, '') AS hospital_id
        ORDER BY m.requested_at DESC, m.match_id ASC
        SKIP $skip
        LIMIT $limit
        """

        async with self.driver.session() as session:
            count_res = await session.run(count_query, **params)
            count_rec = await count_res.single()
            total = count_rec["total"] if count_rec else 0

            data_res = await session.run(data_query, **params)
            records = await data_res.data()

            items = []
            for rec in records:
                req_at = rec["requested_at"]
                iso_req = req_at.isoformat() if hasattr(req_at, "isoformat") else str(req_at)
                items.append({
                    "match_id": rec["match_id"],
                    "match_score": rec["match_score"],
                    "requested_at": iso_req,
                    "status": rec["status"],
                    "donor_id": rec["donor_id"],
                    "recipient_id": rec["recipient_id"],
                    "hospital_id": rec["hospital_id"],
                })

            return {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size,
            }

    async def find_candidate_recipients_for_donor(
        self,
        donor_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Reverse candidate discovery (Phase 6):
        Finds Waiting recipients who could receive this donor's organ.
        Reuses the SAME eligibility model as forward matching:
        1. Donor exists with status 'Available' and matching organ availability.
        2. Recipient is Waiting and needs the donor's organ_type.
        3. Blood compatibility via (db:BloodType {blood_type: donor})-[:CAN_DONATE_TO]->(rb).
        Returns recipient identifiers with the registered-hospital location used for scoring.
        """
        query = """
        MATCH (d:Donor {donor_id: $donor_id})
        MATCH (db:BloodType {blood_type: d.blood_type})-[:CAN_DONATE_TO]->(rb:BloodType)
        MATCH (r:Recipient {status: 'Waiting', organ_needed: d.organ_type})-[:HAS_BLOOD_TYPE]->(rb)
        WHERE NOT (r)-[:TO_RECIPIENT]-(:Allocation)
        OPTIONAL MATCH (r)-[:REGISTERED_AT]->(h:Hospital)
        RETURN DISTINCT r.recipient_id AS recipient_id,
                        r.name AS name,
                        r.blood_type AS blood_type,
                        r.organ_needed AS organ_needed,
                        r.urgency_score AS urgency_score,
                        coalesce(h.hospital_id, '') AS hospital_id,
                        coalesce(h.location.latitude, r.location.latitude) AS location_latitude,
                        coalesce(h.location.longitude, r.location.longitude) AS location_longitude
        ORDER BY r.urgency_score DESC, r.recipient_id ASC
        """
        async with self.driver.session() as session:
            res = await session.run(query, donor_id=donor_id)
            records = await res.data()
            return [
                {
                    "recipient_id": rec["recipient_id"],
                    "name": rec["name"],
                    "blood_type": rec["blood_type"],
                    "organ_needed": rec["organ_needed"],
                    "urgency_score": rec["urgency_score"],
                    "hospital_id": rec["hospital_id"],
                    "location": {
                        "latitude": rec["location_latitude"],
                        "longitude": rec["location_longitude"],
                    },
                }
                for rec in records
            ]

    async def update_match_request_status(
        self,
        match_id: str,
        new_status: str,
        reject_reason: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Transitions a MatchRequest's status (e.g. Pending -> Rejected).
        Writes ONLY the MatchRequest node; no allocations are created and no
        donor/recipient state is modified. Sets rejected_at/reject_reason when
        the target status is 'Rejected'.
        """
        set_clauses = ["m.status = $new_status"]
        params: Dict[str, Any] = {"match_id": match_id, "new_status": new_status}
        if new_status == "Rejected":
            params["rejected_at"] = datetime.now(timezone.utc).isoformat()
            set_clauses.append("m.rejected_at = datetime($rejected_at)")
            if reject_reason:
                params["reject_reason"] = reject_reason
                set_clauses.append("m.reject_reason = $reject_reason")

        query = f"""
        MATCH (m:MatchRequest {{match_id: $match_id}})
        OPTIONAL MATCH (d:Donor)-[:PROPOSED_IN]->(m)
        OPTIONAL MATCH (m)-[:FOR_RECIPIENT]->(r:Recipient)
        OPTIONAL MATCH (m)-[:REQUESTED_BY]->(h:Hospital)
        SET {' , '.join(set_clauses)}
        RETURN m.match_id AS match_id,
               m.match_score AS match_score,
               m.requested_at AS requested_at,
               m.status AS status,
               coalesce(d.donor_id, '') AS donor_id,
               coalesce(r.recipient_id, '') AS recipient_id,
               coalesce(h.hospital_id, '') AS hospital_id
        """
        async with self.driver.session() as session:
            res = await session.run(query, **params)
            record = await res.single()
            if not record:
                return None
            req_at = record["requested_at"]
            iso_req_at = req_at.isoformat() if hasattr(req_at, "isoformat") else str(req_at)
            return {
                "match_id": record["match_id"],
                "match_score": record["match_score"],
                "requested_at": iso_req_at,
                "status": record["status"],
                "donor_id": record["donor_id"],
                "recipient_id": record["recipient_id"],
                "hospital_id": record["hospital_id"],
            }
