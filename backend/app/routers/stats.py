from fastapi import APIRouter, Depends, status
from neo4j import AsyncDriver

from app.core.db import get_db_driver
from app.core.dependencies import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.stats import DashboardStatsResponse
from app.services.stats_service import StatsService

router = APIRouter(prefix="/stats", tags=["Statistics"])


def get_stats_service(driver: AsyncDriver = Depends(get_db_driver)) -> StatsService:
    return StatsService(driver)


@router.get(
    "/dashboard",
    response_model=DashboardStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregated operational dashboard statistics",
    description=(
        "Genuine counts and lists computed from Neo4j graph state: donor totals, "
        "waitlist size, confirmed allocations, donors approaching viability expiry "
        "(registered_at + expiry_window_hours within the next 12 hours), blood type "
        "distribution, status/organ breakdowns, the most recent allocations, and the "
        "top-ranked urgent waiting recipients. Accessible by all authenticated roles."
    ),
)
async def get_dashboard_stats(
    service: StatsService = Depends(get_stats_service),
    current_user: UserResponse = Depends(get_current_user),
) -> DashboardStatsResponse:
    return await service.get_dashboard_stats()
