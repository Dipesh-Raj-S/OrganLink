import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from neo4j import AsyncDriver

from app.core.exceptions import ConflictException, NotFoundException
from app.repositories.donor_repository import DonorRepository
from app.schemas.donor import DonorCreate, DonorResponse, DonorUpdate
from app.schemas.enums import BloodTypeEnum, DonorStatusEnum, OrganTypeEnum


class DonorService:
    """Business logic and validation service for Donor entity."""

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver
        self.repo = DonorRepository(driver)

    async def create_donor(self, payload: DonorCreate) -> DonorResponse:
        donor_id = payload.donor_id or f"DNR-{uuid.uuid4().hex[:8].upper()}"

        if await self.repo.exists(donor_id):
            raise ConflictException(
                message=f"Donor with ID '{donor_id}' already exists.",
                code="DUPLICATE_DONOR_ID",
            )

        now_iso = datetime.now(timezone.utc).isoformat()

        data = {
            "donor_id": donor_id,
            "name": payload.name,
            "blood_type": payload.blood_type.value,
            "organ_type": payload.organ_type.value,
            "location": payload.location.model_dump(),
            "status": payload.status.value,
            "registered_at": now_iso,
            "expiry_window_hours": payload.expiry_window_hours,
            "version": 0,
        }

        record = await self.repo.create(data)
        return DonorResponse(**record)

    async def get_donor(self, donor_id: str) -> DonorResponse:
        record = await self.repo.get_by_id(donor_id)
        if not record:
            raise NotFoundException(
                message=f"Donor with ID '{donor_id}' not found.",
                code="DONOR_NOT_FOUND",
            )
        return DonorResponse(**record)

    async def list_donors(
        self,
        status: Optional[DonorStatusEnum] = None,
        organ_type: Optional[OrganTypeEnum] = None,
        blood_type: Optional[BloodTypeEnum] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        result = await self.repo.list_donors(
            status=status.value if status else None,
            organ_type=organ_type.value if organ_type else None,
            blood_type=blood_type.value if blood_type else None,
            page=page,
            page_size=page_size,
        )
        return {
            "items": [DonorResponse(**item) for item in result["items"]],
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"],
        }

    async def update_donor(self, donor_id: str, payload: DonorUpdate) -> DonorResponse:
        if not await self.repo.exists(donor_id):
            raise NotFoundException(
                message=f"Donor with ID '{donor_id}' not found.",
                code="DONOR_NOT_FOUND",
            )

        # Distinguish omitted fields from explicitly provided fields
        updates = payload.model_dump(exclude_unset=True)

        # Enum value transformations
        if "blood_type" in updates and updates["blood_type"] is not None:
            updates["blood_type"] = updates["blood_type"].value
        if "organ_type" in updates and updates["organ_type"] is not None:
            updates["organ_type"] = updates["organ_type"].value
        if "status" in updates and updates["status"] is not None:
            updates["status"] = updates["status"].value
        if "location" in updates and updates["location"] is not None:
            updates["location"] = updates["location"]

        record = await self.repo.update(donor_id, updates)
        if not record:
            raise NotFoundException(
                message=f"Donor with ID '{donor_id}' not found.",
                code="DONOR_NOT_FOUND",
            )
        return DonorResponse(**record)

    async def delete_donor(self, donor_id: str) -> None:
        if not await self.repo.exists(donor_id):
            raise NotFoundException(
                message=f"Donor with ID '{donor_id}' not found.",
                code="DONOR_NOT_FOUND",
            )

        alloc_count = await self.repo.get_allocation_count(donor_id)
        if alloc_count > 0:
            raise ConflictException(
                message=f"Cannot delete donor '{donor_id}': involved in {alloc_count} historical allocation/match record(s).",
                code="DONOR_ALLOCATION_CONFLICT",
            )

        await self.repo.delete(donor_id)
