import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from neo4j import AsyncDriver

from app.core.exceptions import BadRequestException, ConflictException, NotFoundException
from app.repositories.donor_repository import DonorRepository
from app.repositories.hospital_repository import HospitalRepository
from app.repositories.matching_repository import MatchingRepository
from app.repositories.recipient_repository import RecipientRepository
from app.schemas.enums import MatchRequestStatusEnum
from app.schemas.matching import (
    CandidateDonorResponse,
    CandidateListResponse,
    MatchExplanation,
    MatchRequestCreate,
    MatchRequestRejectRequest,
    MatchRequestResponse,
    ReverseCandidateListResponse,
    ReverseCandidateRecipientResponse,
    ScoreFactorBreakdown,
)
from app.services.scorer import MatchScorer


class MatchingService:
    """
    Service layer coordinating graph-based candidate matching and MatchRequest creation.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver
        self.repo = MatchingRepository(driver)
        self.recipient_repo = RecipientRepository(driver)
        self.donor_repo = DonorRepository(driver)
        self.hospital_repo = HospitalRepository(driver)

    async def get_candidate_donors(
        self,
        recipient_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> CandidateListResponse:
        """
        Discovers, scores, and ranks candidate donors for a given recipient.
        - Verifies recipient existence.
        - Traverses graph for eligible donors (blood compatibility + organ match + Available status).
        - Computes deterministic score using MatchScorer.
        - Ranks candidates in descending score order with donor_id as stable tie-breaker.
        - Applies pagination.
        """
        # 1. Verify recipient exists and retrieve context
        rec_context = await self.repo.get_recipient_context(recipient_id)
        if not rec_context:
            raise NotFoundException(
                message=f"Recipient with ID '{recipient_id}' not found.",
                code="RECIPIENT_NOT_FOUND",
            )

        if rec_context["status"] == "Allocated":
            raise BadRequestException(
                message=f"Recipient '{recipient_id}' is already Allocated and cannot be matched.",
                code="RECIPIENT_ALREADY_ALLOCATED",
            )

        # 2. Graph Traversal: Retrieve eligible candidates
        raw_candidates = await self.repo.find_candidate_donors_for_recipient(recipient_id)

        # 3. Score and explain each candidate
        hosp_loc = rec_context["hospital_location"]
        scored_candidates: List[CandidateDonorResponse] = []

        for cand in raw_candidates:
            # Transit distance from donor to recipient hospital
            distance_km = MatchScorer.haversine_distance_km(
                cand["location"]["latitude"],
                cand["location"]["longitude"],
                hosp_loc["latitude"],
                hosp_loc["longitude"],
            )

            score, breakdown = MatchScorer.calculate_score(
                donor_blood_type=cand["blood_type"],
                recipient_blood_type=rec_context["blood_type"],
                urgency_score=rec_context["urgency_score"],
                distance_km=distance_km,
            )

            explanation = MatchExplanation(
                summary=breakdown["summary"],
                factors=ScoreFactorBreakdown(
                    blood_compatibility_score=breakdown["blood_compatibility_score"],
                    urgency_score_component=breakdown["urgency_score_component"],
                    distance_score_component=breakdown["distance_score_component"],
                    distance_km=breakdown["distance_km"],
                    weights=breakdown["weights"],
                ),
            )

            scored_candidates.append(
                CandidateDonorResponse(
                    donor_id=cand["donor_id"],
                    name=cand["name"],
                    blood_type=cand["blood_type"],
                    organ_type=cand["organ_type"],
                    donor_location=cand["location"],
                    expiry_window_hours=cand["expiry_window_hours"],
                    score=score,
                    eligible=True,
                    explanation=explanation,
                )
            )

        # 4. Rank candidates: descending score, then ascending donor_id for stable tie-breaking
        scored_candidates.sort(key=lambda c: (-c.score, c.donor_id))

        total_candidates = len(scored_candidates)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paged_items = scored_candidates[start_idx:end_idx]

        return CandidateListResponse(
            recipient_id=rec_context["recipient_id"],
            recipient_name=rec_context["name"],
            organ_needed=rec_context["organ_needed"],
            recipient_blood_type=rec_context["blood_type"],
            urgency_score=rec_context["urgency_score"],
            hospital_id=rec_context["hospital_id"],
            items=paged_items,
            total=total_candidates,
            page=page,
            page_size=page_size,
        )

    async def create_match_request(self, payload: MatchRequestCreate) -> MatchRequestResponse:
        """
        Creates a MatchRequest between a donor, recipient, and hospital.
        - Validates recipient exists and is Waiting.
        - Validates donor exists and is Available.
        - Validates hospital exists (or defaults to recipient's registered hospital).
        - Computes dynamic match score for audit trail.
        - Preserves existing graph state (does NOT mark donor or recipient as Allocated).
        """
        match_id = payload.match_id or f"MTR-{uuid.uuid4().hex[:8].upper()}"

        if await self.repo.match_request_exists(match_id):
            raise ConflictException(
                message=f"MatchRequest with ID '{match_id}' already exists.",
                code="DUPLICATE_MATCH_REQUEST_ID",
            )

        # Verify recipient
        rec_context = await self.repo.get_recipient_context(payload.recipient_id)
        if not rec_context:
            raise NotFoundException(
                message=f"Recipient with ID '{payload.recipient_id}' not found.",
                code="RECIPIENT_NOT_FOUND",
            )

        # Verify donor
        donor = await self.donor_repo.get_by_id(payload.donor_id)
        if not donor:
            raise NotFoundException(
                message=f"Donor with ID '{payload.donor_id}' not found.",
                code="DONOR_NOT_FOUND",
            )

        if donor["status"] != "Available":
            raise BadRequestException(
                message=f"Donor '{payload.donor_id}' is not available (current status: '{donor['status']}').",
                code="DONOR_NOT_AVAILABLE",
            )

        if donor["organ_type"] != rec_context["organ_needed"]:
            raise BadRequestException(
                message=(
                    f"Organ mismatch: Donor has '{donor['organ_type']}' but recipient needs "
                    f"'{rec_context['organ_needed']}'."
                ),
                code="ORGAN_TYPE_MISMATCH",
            )

        # Determine hospital
        hospital_id = payload.hospital_id or rec_context["hospital_id"]
        if not hospital_id or not await self.hospital_repo.exists(hospital_id):
            raise NotFoundException(
                message=f"Hospital with ID '{hospital_id}' not found.",
                code="HOSPITAL_NOT_FOUND",
            )

        # Compute match score for the request record
        hosp_loc = rec_context["hospital_location"]
        distance_km = MatchScorer.haversine_distance_km(
            donor["location"]["latitude"],
            donor["location"]["longitude"],
            hosp_loc["latitude"],
            hosp_loc["longitude"],
        )
        score, _ = MatchScorer.calculate_score(
            donor_blood_type=donor["blood_type"],
            recipient_blood_type=rec_context["blood_type"],
            urgency_score=rec_context["urgency_score"],
            distance_km=distance_km,
        )

        now_iso = datetime.now(timezone.utc).isoformat()

        record = await self.repo.create_match_request(
            match_id=match_id,
            match_score=score,
            requested_at=now_iso,
            status=MatchRequestStatusEnum.PENDING.value,
            donor_id=payload.donor_id,
            recipient_id=payload.recipient_id,
            hospital_id=hospital_id,
        )

        return MatchRequestResponse(**record)

    async def get_match_request(self, match_id: str) -> MatchRequestResponse:
        record = await self.repo.get_match_request(match_id)
        if not record:
            raise NotFoundException(
                message=f"MatchRequest with ID '{match_id}' not found.",
                code="MATCH_REQUEST_NOT_FOUND",
            )
        return MatchRequestResponse(**record)

    async def list_match_requests(
        self,
        status: Optional[MatchRequestStatusEnum] = None,
        recipient_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        result = await self.repo.list_match_requests(
            status=status.value if status else None,
            recipient_id=recipient_id,
            page=page,
            page_size=page_size,
        )
        return {
            "items": [MatchRequestResponse(**r) for r in result["items"]],
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"],
        }

    async def get_candidate_recipients(
        self,
        donor_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> ReverseCandidateListResponse:
        """
        Reverse candidate discovery for a donor (Phase 6).
        Reuses the same eligibility traversal and the same MatchScorer instance
        (weights + factors) as forward matching — no second scoring engine.
        - Verifies donor exists and is Available (mirrors forward-matching gating).
        - Finds Waiting recipients needing the donor's organ with compatible blood.
        - Ranks them by descending score with recipient_id as stable tie-breaker.
        - Applies pagination.
        """
        donor = await self.donor_repo.get_by_id(donor_id)
        if not donor:
            raise NotFoundException(
                message=f"Donor with ID '{donor_id}' not found.",
                code="DONOR_NOT_FOUND",
            )

        if donor["status"] != "Available":
            raise BadRequestException(
                message=f"Donor '{donor_id}' is not available for reverse candidate discovery (current status: '{donor['status']}').",
                code="DONOR_NOT_AVAILABLE",
            )

        raw_candidates = await self.repo.find_candidate_recipients_for_donor(donor_id)

        donor_loc = donor["location"]
        scored: List[ReverseCandidateRecipientResponse] = []

        for cand in raw_candidates:
            distance_km = MatchScorer.haversine_distance_km(
                donor_loc["latitude"],
                donor_loc["longitude"],
                cand["location"]["latitude"],
                cand["location"]["longitude"],
            )

            score, breakdown = MatchScorer.calculate_score(
                donor_blood_type=donor["blood_type"],
                recipient_blood_type=cand["blood_type"],
                urgency_score=cand["urgency_score"],
                distance_km=distance_km,
            )

            explanation = MatchExplanation(
                summary=breakdown["summary"],
                factors=ScoreFactorBreakdown(
                    blood_compatibility_score=breakdown["blood_compatibility_score"],
                    urgency_score_component=breakdown["urgency_score_component"],
                    distance_score_component=breakdown["distance_score_component"],
                    distance_km=breakdown["distance_km"],
                    weights=breakdown["weights"],
                ),
            )

            scored.append(
                ReverseCandidateRecipientResponse(
                    recipient_id=cand["recipient_id"],
                    name=cand["name"],
                    blood_type=cand["blood_type"],
                    organ_needed=cand["organ_needed"],
                    urgency_score=cand["urgency_score"],
                    hospital_id=cand["hospital_id"],
                    distance_km=distance_km,
                    score=score,
                    eligible=True,
                    explanation=explanation,
                )
            )

        scored.sort(key=lambda c: (-c.score, c.recipient_id))

        total = len(scored)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paged_items = scored[start_idx:end_idx]

        return ReverseCandidateListResponse(
            donor_id=donor["donor_id"],
            donor_name=donor["name"],
            organ_type=donor["organ_type"],
            donor_blood_type=donor["blood_type"],
            items=paged_items,
            total=total,
            page=page,
            page_size=page_size,
        )

    async def reject_match_request(
        self,
        match_id: str,
        payload: MatchRequestRejectRequest,
    ) -> MatchRequestResponse:
        """
        Rejects a Pending MatchRequest (Phase 6 extension).
        - Only Pending requests can be rejected; any other state yields a
          structured 409 INVALID_MATCH_STATUS (including repeated rejection).
        - Restricts the mutation to the MatchRequest node itself: no allocation
          is created and no donor/recipient graph state is altered.
        - Stores the optional audit reason on the node.
        """
        record = await self.repo.get_match_request(match_id)
        if not record:
            raise NotFoundException(
                message=f"MatchRequest with ID '{match_id}' not found.",
                code="MATCH_REQUEST_NOT_FOUND",
            )

        if record["status"] != MatchRequestStatusEnum.PENDING.value:
            raise ConflictException(
                message=(
                    f"MatchRequest '{match_id}' has status '{record['status']}' and cannot be "
                    f"rejected. Only Pending requests can be rejected."
                ),
                code="INVALID_MATCH_STATUS",
            )

        updated = await self.repo.update_match_request_status(
            match_id=match_id,
            new_status=MatchRequestStatusEnum.REJECTED.value,
            reject_reason=payload.reason,
        )
        if not updated:
            raise NotFoundException(
                message=f"MatchRequest with ID '{match_id}' not found.",
                code="MATCH_REQUEST_NOT_FOUND",
            )
        return MatchRequestResponse(**updated)
