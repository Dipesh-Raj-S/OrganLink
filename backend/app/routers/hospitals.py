from fastapi import APIRouter, Depends, Query, status
from neo4j import AsyncDriver

from app.core.db import get_db_driver
from app.core.dependencies import get_current_user, require_role
from app.schemas.auth import UserResponse
from app.schemas.common import PaginatedResponse
from app.schemas.enums import UserRoleEnum
from app.schemas.hospital import HospitalCreate, HospitalResponse, HospitalUpdate
from app.services.hospital_service import HospitalService

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])


def get_hospital_service(driver: AsyncDriver = Depends(get_db_driver)) -> HospitalService:
    return HospitalService(driver)


@router.post(
    "",
    response_model=HospitalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create hospital",
    description="Registers a new hospital with geographical coordinates. Requires ADMIN or COORDINATOR role.",
)
async def create_hospital(
    payload: HospitalCreate,
    service: HospitalService = Depends(get_hospital_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN, UserRoleEnum.COORDINATOR)),
) -> HospitalResponse:
    return await service.create_hospital(payload)


@router.get(
    "",
    response_model=PaginatedResponse[HospitalResponse],
    status_code=status.HTTP_200_OK,
    summary="List hospitals",
    description="Lists hospitals with pagination and optional search by name. Accessible by all authenticated roles.",
)
async def list_hospitals(
    name: str = Query(default=None, description="Filter by name substring (case-insensitive)"),
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=100, description="Items per page (max 100)"),
    service: HospitalService = Depends(get_hospital_service),
    current_user: UserResponse = Depends(get_current_user),
) -> PaginatedResponse[HospitalResponse]:
    result = await service.list_hospitals(name=name, page=page, page_size=page_size)
    return PaginatedResponse[HospitalResponse](**result)


@router.get(
    "/{hospital_id}",
    response_model=HospitalResponse,
    status_code=status.HTTP_200_OK,
    summary="Get hospital by ID",
    description="Retrieves a specific hospital by its unique ID. Accessible by all authenticated roles.",
)
async def get_hospital(
    hospital_id: str,
    service: HospitalService = Depends(get_hospital_service),
    current_user: UserResponse = Depends(get_current_user),
) -> HospitalResponse:
    return await service.get_hospital(hospital_id)


@router.patch(
    "/{hospital_id}",
    response_model=HospitalResponse,
    status_code=status.HTTP_200_OK,
    summary="Update hospital",
    description="Partially updates hospital details without breaking relationships. Requires ADMIN or COORDINATOR role.",
)
async def update_hospital(
    hospital_id: str,
    payload: HospitalUpdate,
    service: HospitalService = Depends(get_hospital_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN, UserRoleEnum.COORDINATOR)),
) -> HospitalResponse:
    return await service.update_hospital(hospital_id, payload)


@router.delete(
    "/{hospital_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete hospital",
    description="Deletes a hospital if it has no registered recipients, users, or allocation history. Requires ADMIN role.",
)
async def delete_hospital(
    hospital_id: str,
    service: HospitalService = Depends(get_hospital_service),
    current_user: UserResponse = Depends(require_role(UserRoleEnum.ADMIN)),
) -> None:
    await service.delete_hospital(hospital_id)
