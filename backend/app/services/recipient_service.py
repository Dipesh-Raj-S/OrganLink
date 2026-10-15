import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from neo4j import AsyncDriver

from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.repositories.hospital_repository import HospitalRepository
from app.repositories.recipient_repository import RecipientRepository
from app.schemas.enums import BloodTypeEnum, OrganTypeEnum, RecipientStatusEnum
from app.schemas.recipient import (
    RecipientCreate,
    RecipientResponse,
    RecipientUpdate,
    RecipientUrgencyUpdate,
)


class RecipientService:
    """Business logic and validation service for Recipient entity."""

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver
        self.repo = RecipientRepository(driver)
        self.hospital_repo = HospitalRepository(driver)

    async def create_recipient(self, payload: RecipientCreate) -> RecipientResponse:
        recipient_id = payload.recipient_id or f"REC-{uuid.uuid4().hex[:8].upper()}"

        if await self.repo.exists(recipient_id):
            raise ConflictException(
                message=f"Recipient with ID '{recipient_id}' already exists.",
                code="DUPLICATE_RECIPIENT_ID",
            )

        # Validate that referenced hospital exists
        if not await self.hospital_repo.exists(payload.hospital_id):
            raise NotFoundException(
                message=f"Referenced hospital '{payload.hospital_id}' does not exist.",
                code="HOSPITAL_NOT_FOUND",
            )

        # Clients cannot self-designate as Allocated on creation
        if payload.status == RecipientStatusEnum.ALLOCATED:
            raise BadRequestException(
                message="Cannot create recipient directly with 'Allocated' status. Allocation occurs via match workflows.",
                code="INVALID_INITIAL_STATUS",
            )

        now_iso = datetime.now(timezone.utc).isoformat()

        data = {
            "recipient_id": recipient_id,
            "name": payload.name,
            "blood_type": payload.blood_type.value,
            "organ_needed": payload.organ_needed.value,
            "urgency_score": payload.urgency_score,
            "location": payload.location.model_dump(),
            "waitlist_since": now_iso,
            "status": payload.status.value,
            "hospital_id": payload.hospital_id,
        }

        record = await self.repo.create(data)
        return RecipientResponse(**record)

    async def get_recipient(self, recipient_id: str) -> RecipientResponse:
        record = await self.repo.get_by_id(recipient_id)
        if not record:
            raise NotFoundException(
                message=f"Recipient with ID '{recipient_id}' not found.",
                code="RECIPIENT_NOT_FOUND",
            )
        return RecipientResponse(**record)

    async def list_recipients(
        self,
        organ_needed: Optional[OrganTypeEnum] = None,
        blood_type: Optional[BloodTypeEnum] = None,
        hospital_id: Optional[str] = None,
        status: Optional[RecipientStatusEnum] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        result = await self.repo.list_recipients(
            organ_needed=organ_needed.value if organ_needed else None,
            blood_type=blood_type.value if blood_type else None,
            hospital_id=hospital_id,
            status=status.value if status else None,
            page=page,
            page_size=page_size,
        )
        return {
            "items": [RecipientResponse(**item) for item in result["items"]],
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"],
        }

    async def update_recipient(self, recipient_id: str, payload: RecipientUpdate) -> RecipientResponse:
        if not await self.repo.exists(recipient_id):
            raise NotFoundException(
                message=f"Recipient with ID '{recipient_id}' not found.",
                code="RECIPIENT_NOT_FOUND",
            )

        updates = payload.model_dump(exclude_unset=True)

        if "hospital_id" in updates and updates["hospital_id"] is not None:
            if not await self.hospital_repo.exists(updates["hospital_id"]):
                raise NotFoundException(
                    message=f"Referenced hospital '{updates['hospital_id']}' does not exist.",
                    code="HOSPITAL_NOT_FOUND",
                )

        if "blood_type" in updates and updates["blood_type"] is not None:
            updates["blood_type"] = updates["blood_type"].value
        if "organ_needed" in updates and updates["organ_needed"] is not None:
            updates["organ_needed"] = updates["organ_needed"].value

        record = await self.repo.update(recipient_id, updates)
        if not record:
            raise NotFoundException(
                message=f"Recipient with ID '{recipient_id}' not found.",
                code="RECIPIENT_NOT_FOUND",
            )
        return RecipientResponse(**record)

    async def update_urgency(self, recipient_id: str, payload: RecipientUrgencyUpdate) -> RecipientResponse:
        if not await self.repo.exists(recipient_id):
            raise NotFoundException(
                message=f"Recipient with ID '{recipient_id}' not found.",
                code="RECIPIENT_NOT_FOUND",
            )

        record = await self.repo.update_urgency(recipient_id, payload.urgency_score)
        if not record:
            raise NotFoundException(
                message=f"Recipient with ID '{recipient_id}' not found.",
                code="RECIPIENT_NOT_FOUND",
            )
        return RecipientResponse(**record)

    async def delete_recipient(self, recipient_id: str) -> None:
        if not await self.repo.exists(recipient_id):
            raise NotFoundException(
                message=f"Recipient with ID '{recipient_id}' not found.",
                code="RECIPIENT_NOT_FOUND",
            )

        alloc_count = await self.repo.get_allocation_count(recipient_id)
        if alloc_count > 0:
            raise ConflictException(
                message=f"Cannot delete recipient '{recipient_id}': involved in {alloc_count} historical allocation/match record(s).",
                code="RECIPIENT_ALLOCATION_CONFLICT",
            )

        await self.repo.delete(recipient_id)
