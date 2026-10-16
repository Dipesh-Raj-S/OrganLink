from datetime import datetime, timezone
import logging
from typing import Any, Dict, Optional
import uuid
from neo4j import AsyncDriver

from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.repositories.allocation_repository import AllocationRepository
from app.repositories.donor_repository import DonorRepository
from app.repositories.matching_repository import MatchingRepository
from app.repositories.recipient_repository import RecipientRepository
from app.schemas.allocation import AllocationCreate, AllocationResponse
from app.schemas.auth import UserResponse

logger = logging.getLogger("organ_network.allocation_service")


class AllocationService:
    """
    Business service orchestrating transactional allocation of donors to recipients.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver
        self.allocation_repo = AllocationRepository(driver)
        self.matching_repo = MatchingRepository(driver)
        self.donor_repo = DonorRepository(driver)
        self.recipient_repo = RecipientRepository(driver)

    async def allocate_match(
        self,
        match_id: str,
        payload: Optional[AllocationCreate],
        current_user: UserResponse,
    ) -> AllocationResponse:
        """
        Validates preconditions and executes atomic allocation.
        Idempotency: If the match request was already allocated, returns the existing allocation.
        """
        # 1. Fetch MatchRequest
        match_req = await self.matching_repo.get_match_request(match_id)
        if not match_req:
            raise NotFoundException(
                message=f"MatchRequest with ID '{match_id}' not found",
                code="MATCH_REQUEST_NOT_FOUND",
            )

        # 2. Check Idempotency: Has this match request already been resolved/allocated?
        existing_alc = await self.allocation_repo.get_allocation_by_match_id(match_id)
        if existing_alc:
            logger.info("MatchRequest '%s' already allocated in '%s'. Returning existing allocation.", match_id, existing_alc["allocation_id"])
            return AllocationResponse(**existing_alc)

        if match_req["status"] != "Pending":
            raise ConflictException(
                message=f"MatchRequest '{match_id}' is in status '{match_req['status']}', cannot allocate",
                code="INVALID_MATCH_STATUS",
            )

        # 3. Determine donor_id
        donor_id = match_req.get("donor_id")
        if payload and payload.donor_id:
            donor_id = payload.donor_id

        if not donor_id:
            raise BadRequestException(
                message="Donor ID is required to allocate this match request",
                code="DONOR_ID_REQUIRED",
            )

        recipient_id = match_req.get("recipient_id")
        if not recipient_id:
            raise BadRequestException(
                message="MatchRequest has no linked recipient",
                code="RECIPIENT_ID_MISSING",
            )

        hospital_id = match_req.get("hospital_id")
        if not hospital_id:
            raise BadRequestException(
                message="MatchRequest has no linked hospital",
                code="HOSPITAL_ID_MISSING",
            )

        # 4. Validate donor existence and availability
        donor = await self.donor_repo.get_by_id(donor_id)
        if not donor:
            raise NotFoundException(
                message=f"Donor '{donor_id}' not found",
                code="DONOR_NOT_FOUND",
            )

        if donor["status"] != "Available":
            raise ConflictException(
                message=f"Donor '{donor_id}' is not available (status: '{donor['status']}')",
                code="DONOR_UNAVAILABLE",
            )

        # 5. Validate recipient existence and eligibility
        recipient = await self.recipient_repo.get_by_id(recipient_id)
        if not recipient:
            raise NotFoundException(
                message=f"Recipient '{recipient_id}' not found",
                code="RECIPIENT_NOT_FOUND",
            )

        if recipient["status"] != "Waiting":
            raise ConflictException(
                message=f"Recipient '{recipient_id}' is not waiting (status: '{recipient['status']}')",
                code="RECIPIENT_NOT_ELIGIBLE",
            )

        # 6. Validate organ compatibility
        if donor["organ_type"] != recipient["organ_needed"]:
            raise ConflictException(
                message=f"Organ mismatch: Donor organ is '{donor['organ_type']}', Recipient needs '{recipient['organ_needed']}'",
                code="ORGAN_TYPE_MISMATCH",
            )

        # 7. Validate blood compatibility via graph
        query_compat = """
        MATCH (db:BloodType {blood_type: $donor_blood})
        MATCH (rb:BloodType {blood_type: $recipient_blood})
        RETURN exists((db)-[:CAN_DONATE_TO]->(rb)) AS is_compatible
        """
        async with self.driver.session() as session:
            compat_res = await session.run(
                query_compat,
                donor_blood=donor["blood_type"],
                recipient_blood=recipient["blood_type"],
            )
            compat_rec = await compat_res.single()
            if not compat_rec or not compat_rec["is_compatible"]:
                raise ConflictException(
                    message=f"Blood type incompatibility: Donor '{donor['blood_type']}' cannot donate to Recipient '{recipient['blood_type']}'",
                    code="BLOOD_INCOMPATIBLE",
                )

        # 8. Generate unique allocation ID & ISO timestamp
        allocation_id = f"ALC-{uuid.uuid4().hex[:12].upper()}"
        confirmed_at_iso = datetime.now(timezone.utc).isoformat()

        # 9. Execute atomic Neo4j transaction
        alc_record = await self.allocation_repo.execute_allocation_transaction(
            allocation_id=allocation_id,
            match_id=match_id,
            donor_id=donor_id,
            recipient_id=recipient_id,
            hospital_id=hospital_id,
            allocated_by=current_user.user_id,
            confirmed_at_iso=confirmed_at_iso,
        )

        return AllocationResponse(**alc_record)

    async def get_allocation(self, allocation_id: str) -> AllocationResponse:
        alc = await self.allocation_repo.get_allocation_by_id(allocation_id)
        if not alc:
            raise NotFoundException(
                message=f"Allocation with ID '{allocation_id}' not found",
                code="ALLOCATION_NOT_FOUND",
            )
        return AllocationResponse(**alc)

    async def list_allocations(
        self,
        recipient_id: Optional[str] = None,
        donor_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        return await self.allocation_repo.list_allocations(
            recipient_id=recipient_id,
            donor_id=donor_id,
            page=page,
            page_size=page_size,
        )
