from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from neo4j import AsyncDriver

from app.core.db import get_db_driver
from app.core.dependencies import get_current_user, require_role
from app.schemas.auth import UserResponse
from app.schemas.common import PaginatedResponse
from app.schemas.enums import MatchRequestStatusEnum, UserRoleEnum
from app.schemas.matching import (
    CandidateListResponse,
    MatchRequestCreate,
    MatchRequestResponse,
)
from app.services.matching_service import MatchingService

router = APIRouter(prefix="/matches", tags=["Matching Engine"])


def get_matching_service(driver: AsyncDriver = Depends(get_db_driver)) -> MatchingService:
    return MatchingService(driver)


@router.get(
    "/recipients/{recipient_id}/candidates",
    response_model=CandidateListResponse,
    status_code=status.HTTP_200_OK,
    summary="Find candidate donors for recipient",
    description=(
        "Discovers eligible organ/blood donors using Neo4j graph traversal across CAN_DONATE_TO "
        "edges, ranks them with deterministic multi-factor scoring (blood, urgency, proximity), "
        "and returns an explained, paginated candidate list. Accessible by all authenticated roles."
    ),
)
async def get_candidate_donors(
    recipient_id: str,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page (max 100)"),
    service: MatchingService = Depends(get_matching_service),
    current_user: UserResponse = Depends(get_current_user),
) -> CandidateListResponse:
    return await service.get_candidate_donors(recipient_id=recipient_id, page=page, page_size=page_size)


@router.post(
    "/requests",
    response_model=MatchRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create match request",
    description=(
        "Initiates a formal match request linking a candidate donor, waiting recipient, "
        "and hospital. Validates eligibility and records the computed match score. "
        "Requires ADMIN or COORDINATOR role."
    ),
)
async def create_match_request(
    payload: MatchRequestCreate,
    service: MatchingService = Depends(get_matching_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN, UserRoleEnum.COORDINATOR)),
) -> MatchRequestResponse:
    return await service.create_match_request(payload)


@router.get(
    "/requests/{match_id}",
    response_model=MatchRequestResponse,
    status_code=status.HTTP_200_OK,
    summary="Get match request by ID",
    description="Retrieves a match request record and its linked entities. Accessible by all authenticated roles.",
)
async def get_match_request(
    match_id: str,
    service: MatchingService = Depends(get_matching_service),
    current_user: UserResponse = Depends(get_current_user),
) -> MatchRequestResponse:
    return await service.get_match_request(match_id)


@router.get(
    "/requests",
    response_model=PaginatedResponse[MatchRequestResponse],
    status_code=status.HTTP_200_OK,
    summary="List match requests",
    description="Lists match requests with pagination and optional status/recipient filters. Accessible by all authenticated roles.",
)
async def list_match_requests(
    status_filter: Optional[MatchRequestStatusEnum] = Query(default=None, alias="status", description="Filter by request status"),
    recipient_id: Optional[str] = Query(default=None, description="Filter by recipient ID"),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page (max 100)"),
    service: MatchingService = Depends(get_matching_service),
    current_user: UserResponse = Depends(get_current_user),
) -> PaginatedResponse[MatchRequestResponse]:
    result = await service.list_match_requests(
        status=status_filter,
        recipient_id=recipient_id,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse[MatchRequestResponse](**result)
