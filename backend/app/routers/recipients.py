from fastapi import APIRouter, Depends, Query, status
from neo4j import AsyncDriver

from app.core.db import get_db_driver
from app.core.dependencies import get_current_user, require_role
from app.schemas.auth import UserResponse
from app.schemas.common import PaginatedResponse
from app.schemas.enums import BloodTypeEnum, OrganTypeEnum, RecipientStatusEnum, UserRoleEnum
from app.schemas.recipient import (
    RecipientCreate,
    RecipientResponse,
    RecipientUpdate,
    RecipientUrgencyUpdate,
)
from app.services.recipient_service import RecipientService

router = APIRouter(prefix="/recipients", tags=["Recipients"])


def get_recipient_service(driver: AsyncDriver = Depends(get_db_driver)) -> RecipientService:
    return RecipientService(driver)


@router.post(
    "",
    response_model=RecipientResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create recipient",
    description="Registers a new recipient on the waiting list and creates hospital and blood type relationships. Requires ADMIN or COORDINATOR role.",
)
async def create_recipient(
    payload: RecipientCreate,
    service: RecipientService = Depends(get_recipient_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN, UserRoleEnum.COORDINATOR)),
) -> RecipientResponse:
    return await service.create_recipient(payload)


@router.get(
    "",
    response_model=PaginatedResponse[RecipientResponse],
    status_code=status.HTTP_200_OK,
    summary="List recipients",
    description="Lists recipients with pagination and filters for organ, blood type, hospital, and status. Accessible by all authenticated roles.",
)
async def list_recipients(
    organ_needed: OrganTypeEnum = Query(default=None, description="Filter by needed organ"),
    blood_type: BloodTypeEnum = Query(default=None, description="Filter by blood type"),
    hospital_id: str = Query(default=None, description="Filter by registered hospital ID"),
    status_filter: RecipientStatusEnum = Query(default=None, alias="status", description="Filter by status"),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page (max 100)"),
    service: RecipientService = Depends(get_recipient_service),
    current_user: UserResponse = Depends(get_current_user),
) -> PaginatedResponse[RecipientResponse]:
    result = await service.list_recipients(
        organ_needed=organ_needed,
        blood_type=blood_type,
        hospital_id=hospital_id,
        status=status_filter,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse[RecipientResponse](**result)


@router.get(
    "/{recipient_id}",
    response_model=RecipientResponse,
    status_code=status.HTTP_200_OK,
    summary="Get recipient by ID",
    description="Retrieves a specific recipient waitlist profile by unique recipient_id. Accessible by all authenticated roles.",
)
async def get_recipient(
    recipient_id: str,
    service: RecipientService = Depends(get_recipient_service),
    current_user: UserResponse = Depends(get_current_user),
) -> RecipientResponse:
    return await service.get_recipient(recipient_id)


@router.patch(
    "/{recipient_id}",
    response_model=RecipientResponse,
    status_code=status.HTTP_200_OK,
    summary="Update recipient",
    description="Partially updates recipient details without allowing direct allocation. Requires ADMIN or COORDINATOR role.",
)
async def update_recipient(
    recipient_id: str,
    payload: RecipientUpdate,
    service: RecipientService = Depends(get_recipient_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN, UserRoleEnum.COORDINATOR)),
) -> RecipientResponse:
    return await service.update_recipient(recipient_id, payload)


@router.patch(
    "/{recipient_id}/urgency",
    response_model=RecipientResponse,
    status_code=status.HTTP_200_OK,
    summary="Update recipient urgency",
    description="Updates the recipient's clinical urgency score (1-10) via dedicated endpoint. Requires ADMIN or COORDINATOR role.",
)
async def update_recipient_urgency(
    recipient_id: str,
    payload: RecipientUrgencyUpdate,
    service: RecipientService = Depends(get_recipient_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN, UserRoleEnum.COORDINATOR)),
) -> RecipientResponse:
    return await service.update_urgency(recipient_id, payload)


@router.delete(
    "/{recipient_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete recipient",
    description="Deletes a recipient if no allocation or match history exists. Requires ADMIN role.",
)
async def delete_recipient(
    recipient_id: str,
    service: RecipientService = Depends(get_recipient_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN)),
) -> None:
    await service.delete_recipient(recipient_id)
