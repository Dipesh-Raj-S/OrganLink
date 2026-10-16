from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from neo4j import AsyncDriver

from app.core.db import get_db_driver
from app.core.dependencies import get_current_user, require_role
from app.schemas.allocation import AllocationCreate, AllocationResponse
from app.schemas.auth import UserResponse
from app.schemas.common import PaginatedResponse
from app.schemas.enums import UserRoleEnum
from app.services.allocation_service import AllocationService

router = APIRouter(tags=["Allocations"])


def get_allocation_service(driver: AsyncDriver = Depends(get_db_driver)) -> AllocationService:
    return AllocationService(driver)


@router.post(
    "/matches/requests/{match_id}/allocate",
    response_model=AllocationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm match allocation (Atomic Transaction)",
    description=(
        "Executes atomic, concurrency-safe organ allocation for a proposed match request. "
        "Requires COORDINATOR or ADMIN role. Verifies donor availability, recipient waiting status, "
        "organ type match, and blood compatibility inside a locked Neo4j transaction. "
        "Updates Donor to 'Allocated', Recipient to 'Allocated', MatchRequest to 'Confirmed', "
        "and creates the Allocation node with (:Donor)-[:ALLOCATED_IN]->(:Allocation), "
        "(:Allocation)-[:TO_RECIPIENT]->(:Recipient), and (:Allocation)-[:CONFIRMED_BY]->(:Hospital)."
    ),
)
async def allocate_match(
    match_id: str,
    payload: Optional[AllocationCreate] = None,
    service: AllocationService = Depends(get_allocation_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN, UserRoleEnum.COORDINATOR)),
) -> AllocationResponse:
    return await service.allocate_match(match_id=match_id, payload=payload, current_user=current_user)


@router.get(
    "/allocations/{allocation_id}",
    response_model=AllocationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get allocation record by ID",
    description="Retrieves an allocation record by its unique identifier. Accessible by all authenticated roles.",
)
async def get_allocation(
    allocation_id: str,
    service: AllocationService = Depends(get_allocation_service),
    current_user: UserResponse = Depends(get_current_user),
) -> AllocationResponse:
    return await service.get_allocation(allocation_id)


@router.get(
    "/allocations",
    response_model=PaginatedResponse[AllocationResponse],
    status_code=status.HTTP_200_OK,
    summary="List allocation history",
    description="Lists allocation history with pagination and optional filters. Accessible by all authenticated roles.",
)
async def list_allocations(
    recipient_id: Optional[str] = Query(default=None, description="Filter by recipient ID"),
    donor_id: Optional[str] = Query(default=None, description="Filter by donor ID"),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page (max 100)"),
    service: AllocationService = Depends(get_allocation_service),
    current_user: UserResponse = Depends(get_current_user),
) -> PaginatedResponse[AllocationResponse]:
    result = await service.list_allocations(
        recipient_id=recipient_id,
        donor_id=donor_id,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse[AllocationResponse](**result)
