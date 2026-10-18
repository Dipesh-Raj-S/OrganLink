import logging
from typing import Any, Dict, List
from neo4j import AsyncDriver

logger = logging.getLogger("organ_network.stats_repo")


class StatsRepository:
    """
    Data access repository for dashboard statistics, computed by real Neo4j
    aggregate queries. No synthetic data is produced by this layer.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    async def get_donor_counts(self) -> Dict[str, int]:
        """Total donors and donors currently 'Available'."""
        query = """
        MATCH (d:Donor)
        RETURN count(d) AS total_donors,
               sum(CASE WHEN d.status = 'Available' THEN 1 ELSE 0 END) AS available_donors
        """
        async with self.driver.session() as session:
            res = await session.run(query)
            record = await res.single()
            return {
                "total_donors": record["total_donors"],
                # sum() returns None (not 0) when no records exist; coalesce it.
                "available_donors": record["available_donors"] or 0,
            }

    async def get_waiting_recipient_count(self) -> int:
        """Recipients currently waiting on the waitlist."""
        query = """
        MATCH (r:Recipient {status: 'Waiting'})
        RETURN count(r) AS total_waiting
        """
        async with self.driver.session() as session:
            res = await session.run(query)
            record = await res.single()
            return record["total_waiting"]

    async def get_confirmed_allocation_count(self) -> int:
        """Allocation nodes whose status is 'Confirmed'."""
        query = """
        MATCH (a:Allocation)
        WHERE coalesce(a.status, 'Confirmed') = 'Confirmed'
        RETURN count(a) AS confirmed_allocations
        """
        async with self.driver.session() as session:
            res = await session.run(query)
            record = await res.single()
            return record["confirmed_allocations"]

    async def get_donor_status_breakdown(self) -> Dict[str, int]:
        """Donor counts grouped by the actual stored status value."""
        query = """
        MATCH (d:Donor)
        RETURN coalesce(d.status, 'UNKNOWN') AS status, count(*) AS count
        ORDER BY status
        """
        async with self.driver.session() as session:
            res = await session.run(query)
            records = await res.data()
            return {rec["status"]: rec["count"] for rec in records}

    async def get_donor_organ_breakdown(self) -> Dict[str, int]:
        """Donor counts grouped by organ type."""
        query = """
        MATCH (d:Donor)
        RETURN coalesce(d.organ_type, 'UNKNOWN') AS organ_type, count(*) AS count
        ORDER BY organ_type
        """
        async with self.driver.session() as session:
            res = await session.run(query)
            records = await res.data()
            return {rec["organ_type"]: rec["count"] for rec in records}

    async def get_donor_blood_type_distribution(self) -> Dict[str, int]:
        """Donor counts grouped by ABO/Rh blood type."""
        query = """
        MATCH (d:Donor)
        RETURN coalesce(d.blood_type, 'UNKNOWN') AS blood_type, count(*) AS count
        ORDER BY blood_type
        """
        async with self.driver.session() as session:
            res = await session.run(query)
            records = await res.data()
            return {rec["blood_type"]: rec["count"] for rec in records}

    async def count_donors_approaching_expiry(self, window_hours: int = 12) -> int:
        """
        Available donors whose simulated organ viability expires within the
        next `window_hours` (backend-defined approaching-expiry threshold).

        Expiry is derived as registered_at + expiry_window_hours — the same
        calculation the donor endpoints document; no stored expiry field exists.
        """
        query = """
        MATCH (d:Donor {status: 'Available'})
        WHERE d.registered_at IS NOT NULL
          AND (
            d.registered_at + duration({hours: toInteger(coalesce(d.expiry_window_hours, 24))})
            < datetime() + duration({hours: $window_hours})
          )
        RETURN count(d) AS approaching
        """
        async with self.driver.session() as session:
            res = await session.run(query, window_hours=window_hours)
            record = await res.single()
            return record["approaching"]

    async def get_urgent_recipients(self, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Top waiting recipients ranked by clinical urgency (backend-defined
        ranking: urgency_score DESC, recipient_id as stable tie-breaker).
        Returns raw recipient rows shaped for RecipientResponse mapping.
        """
        query = """
        MATCH (r:Recipient {status: 'Waiting'})
        OPTIONAL MATCH (r)-[:REGISTERED_AT]->(h:Hospital)
        RETURN r.recipient_id AS recipient_id,
               r.name AS name,
               r.blood_type AS blood_type,
               r.organ_needed AS organ_needed,
               r.urgency_score AS urgency_score,
               r.status AS status,
               r.waitlist_since AS waitlist_since,
               r.location.latitude AS latitude,
               r.location.longitude AS longitude,
               coalesce(h.hospital_id, '') AS hospital_id
        ORDER BY r.urgency_score DESC, r.recipient_id ASC
        LIMIT $limit
        """
        async with self.driver.session() as session:
            res = await session.run(query, limit=limit)
            records = await res.data()
            items: List[Dict[str, Any]] = []
            for rec in records:
                wl_since = rec["waitlist_since"]
                items.append(
                    {
                        "recipient_id": rec["recipient_id"],
                        "name": rec["name"],
                        "blood_type": rec["blood_type"],
                        "organ_needed": rec["organ_needed"],
                        "urgency_score": rec["urgency_score"],
                        "status": rec["status"],
                        "waitlist_since": (
                            wl_since.isoformat() if hasattr(wl_since, "isoformat") else str(wl_since)
                        ),
                        "location": {
                            "latitude": rec["latitude"],
                            "longitude": rec["longitude"],
                        },
                        "hospital_id": rec["hospital_id"],
                    }
                )
            return items
