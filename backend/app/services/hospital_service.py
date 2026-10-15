import uuid
from typing import Any, Dict, Optional
from neo4j import AsyncDriver

from app.core.exceptions import ConflictException, NotFoundException
from app.repositories.hospital_repository import HospitalRepository
from app.schemas.hospital import HospitalCreate, HospitalResponse, HospitalUpdate


class HospitalService:
    """Business logic and validation service for Hospital entity."""

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver
        self.repo = HospitalRepository(driver)

    async def create_hospital(self, payload: HospitalCreate) -> HospitalResponse:
        hospital_id = payload.hospital_id or f"HOSP-{uuid.uuid4().hex[:8].upper()}"

        if await self.repo.exists(hospital_id):
            raise ConflictException(
                message=f"Hospital with ID '{hospital_id}' already exists.",
                code="DUPLICATE_HOSPITAL_ID",
            )

        data = {
            "hospital_id": hospital_id,
            "name": payload.name,
            "location": payload.location.model_dump(),
        }
        record = await self.repo.create(data)
        return HospitalResponse(**record)

    async def get_hospital(self, hospital_id: str) -> HospitalResponse:
        record = await self.repo.get_by_id(hospital_id)
        if not record:
            raise NotFoundException(
                message=f"Hospital with ID '{hospital_id}' not found.",
                code="HOSPITAL_NOT_FOUND",
            )
        return HospitalResponse(**record)

    async def list_hospitals(
        self,
        name: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        result = await self.repo.list_hospitals(name_query=name, page=page, page_size=page_size)
        return {
            "items": [HospitalResponse(**item) for item in result["items"]],
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"],
        }

    async def update_hospital(self, hospital_id: str, payload: HospitalUpdate) -> HospitalResponse:
        if not await self.repo.exists(hospital_id):
            raise NotFoundException(
                message=f"Hospital with ID '{hospital_id}' not found.",
                code="HOSPITAL_NOT_FOUND",
            )

        # Distinguish omitted fields from provided fields
        updates = payload.model_dump(exclude_unset=True)
        record = await self.repo.update(hospital_id, updates)
        if not record:
            raise NotFoundException(
                message=f"Hospital with ID '{hospital_id}' not found.",
                code="HOSPITAL_NOT_FOUND",
            )
        return HospitalResponse(**record)

    async def delete_hospital(self, hospital_id: str) -> None:
        if not await self.repo.exists(hospital_id):
            raise NotFoundException(
                message=f"Hospital with ID '{hospital_id}' not found.",
                code="HOSPITAL_NOT_FOUND",
            )

        deps = await self.repo.get_dependencies_count(hospital_id)
        conflict_reasons = []
        if deps["recipients"] > 0:
            conflict_reasons.append(f"{deps['recipients']} registered recipient(s)")
        if deps["users"] > 0:
            conflict_reasons.append(f"{deps['users']} associated user(s)")
        if deps["allocations"] > 0 or deps["requests"] > 0:
            conflict_reasons.append(f"{deps['allocations'] + deps['requests']} allocation/match record(s)")

        if conflict_reasons:
            raise ConflictException(
                message=f"Cannot delete hospital '{hospital_id}' with active dependencies: {', '.join(conflict_reasons)}.",
                code="HOSPITAL_CONFLICT",
            )

        await self.repo.delete(hospital_id)
