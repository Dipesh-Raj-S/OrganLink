import logging
from typing import Any, Dict, List

from neo4j import AsyncDriver

from app.repositories.allocation_repository import AllocationRepository
from app.repositories.stats_repository import StatsRepository
from app.schemas.allocation import AllocationResponse
from app.schemas.recipient import RecipientResponse
from app.schemas.stats import DashboardStatsResponse

logger = logging.getLogger("organ_network.stats_service")

# Backend-defined approaching-expiry threshold for dashboard urgency.
APPROACHING_EXPIRY_WINDOW_HOURS = 12


class StatsService:
    """
    Service layer assembling genuine dashboard statistics from graph aggregates.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.repo = StatsRepository(driver)
        self.allocation_repo = AllocationRepository(driver)

    async def get_dashboard_stats(self) -> DashboardStatsResponse:
        donor_counts = await self.repo.get_donor_counts()
        waiting_count = await self.repo.get_waiting_recipient_count()
        confirmed_allocations = await self.repo.get_confirmed_allocation_count()
        status_breakdown: Dict[str, int] = await self.repo.get_donor_status_breakdown()
        organ_breakdown: Dict[str, int] = await self.repo.get_donor_organ_breakdown()
        blood_distribution: Dict[str, int] = await self.repo.get_donor_blood_type_distribution()
        approaching_expiry = await self.repo.count_donors_approaching_expiry(
            window_hours=APPROACHING_EXPIRY_WINDOW_HOURS
        )

        urgent_raw: List[Dict[str, Any]] = await self.repo.get_urgent_recipients(limit=5)
        urgent_recipients = [
            RecipientResponse(
                recipient_id=row["recipient_id"],
                name=row["name"],
                blood_type=row["blood_type"],
                organ_needed=row["organ_needed"],
                urgency_score=row["urgency_score"],
                status=row["status"],
                waitlist_since=row["waitlist_since"],
                location=row["location"],
                hospital_id=row["hospital_id"],
            )
            for row in urgent_raw
        ]

        allocation_page = await self.allocation_repo.list_allocations(page=1, page_size=5)
        allocations_raw: List[Dict[str, Any]] = allocation_page["items"]
        recent_allocations = [AllocationResponse(**row) for row in allocations_raw]

        return DashboardStatsResponse(
            total_donors=donor_counts["total_donors"],
            available_donors=donor_counts["available_donors"],
            total_recipients_waiting=waiting_count,
            confirmed_allocations=confirmed_allocations,
            donors_approaching_expiry=approaching_expiry,
            status_breakdown=status_breakdown,
            organ_breakdown=organ_breakdown,
            blood_type_distribution=blood_distribution,
            recent_allocations=recent_allocations,
            urgent_recipients=urgent_recipients,
        )
