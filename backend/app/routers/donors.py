from fastapi import APIRouter, Depends, Query, status
from neo4j import AsyncDriver

from app.core.db import get_db_driver
from app.schemas.common import PaginatedResponse
from app.schemas.donor import DonorCreate, DonorResponse, DonorUpdate
from app.schemas.enums import BloodTypeEnum, DonorStatusEnum, OrganTypeEnum
from app.services.donor_service import DonorService

router = APIRouter(prefix="/donors", tags=["Donors"])


def get_donor_service(driver: AsyncDriver = Depends(get_db_driver)) -> DonorService:
    return DonorService(driver)


@router.post(
    "",
    response_model=DonorResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create donor",
    description="Registers a new organ/blood donor with location coordinates and viability window.",
)
async def create_donor(
    payload: DonorCreate,
    service: DonorService = Depends(get_donor_service),
) -> DonorResponse:
    return await service.create_donor(payload)


@router.get(
    "",
    response_model=PaginatedResponse[DonorResponse],
    status_code=status.HTTP_200_OK,
    summary="List donors",
    description="Lists donors with pagination and filters for status, organ_type, and blood_type.",
)
async def list_donors(
    status_filter: DonorStatusEnum = Query(default=None, alias="status", description="Filter by donor status"),
    organ_type: OrganTypeEnum = Query(default=None, description="Filter by organ type"),
    blood_type: BloodTypeEnum = Query(default=None, description="Filter by blood type"),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page (max 100)"),
    service: DonorService = Depends(get_donor_service),
) -> PaginatedResponse[DonorResponse]:
    result = await service.list_donors(
        status=status_filter,
        organ_type=organ_type,
        blood_type=blood_type,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse[DonorResponse](**result)


@router.get(
    "/{donor_id}",
    response_model=DonorResponse,
    status_code=status.HTTP_200_OK,
    summary="Get donor by ID",
    description="Retrieves a specific donor profile by unique donor_id.",
)
async def get_donor(
    donor_id: str,
    service: DonorService = Depends(get_donor_service),
) -> DonorResponse:
    return await service.get_donor(donor_id)


@router.patch(
    "/{donor_id}",
    response_model=DonorResponse,
    status_code=status.HTTP_200_OK,
    summary="Update donor",
    description="Partially updates donor details and increments version automatically.",
)
async def update_donor(
    donor_id: str,
    payload: DonorUpdate,
    service: DonorService = Depends(get_donor_service),
) -> DonorResponse:
    return await service.update_donor(donor_id, payload)


@router.delete(
    "/{donor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete donor",
    description="Deletes a donor if no allocation or match proposal history exists.",
)
async def delete_donor(
    donor_id: str,
    service: DonorService = Depends(get_donor_service),
) -> None:
    await service.delete_donor(donor_id)
