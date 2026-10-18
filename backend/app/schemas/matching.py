from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.schemas.enums import BloodTypeEnum, MatchRequestStatusEnum, OrganTypeEnum


class ScoreFactorBreakdown(BaseModel):
    blood_compatibility_score: float = Field(..., description="ABO/Rh compatibility component (0-100 normalized)")
    urgency_score_component: float = Field(..., description="Recipient clinical urgency component (0-100 normalized)")
    distance_score_component: float = Field(..., description="Proximity/logistics component (0-100 normalized)")
    distance_km: float = Field(..., description="Haversine transit distance in kilometers between donor and hospital")
    weights: Dict[str, float] = Field(..., description="Configured scoring weights applied")


class MatchExplanation(BaseModel):
    summary: str = Field(..., description="Human-readable synthesis of eligibility and scoring rationale")
    factors: ScoreFactorBreakdown = Field(..., description="Detailed factor breakdown")
    disclaimer: str = Field(
        default="Research/demonstration engine only. ABO compatibility and proximity do not substitute for clinical HLA crossmatching.",
        description="Non-clinical demonstration safety disclaimer",
    )


class CandidateDonorResponse(BaseModel):
    donor_id: str
    name: str
    blood_type: BloodTypeEnum
    organ_type: OrganTypeEnum
    donor_location: Dict[str, float]
    expiry_window_hours: int
    score: float = Field(..., ge=0.0, le=100.0, description="Overall matching rank score (0.0 - 100.0)")
    eligible: bool = Field(default=True, description="Passed all gating criteria")
    explanation: MatchExplanation


class CandidateListResponse(BaseModel):
    recipient_id: str
    recipient_name: str
    organ_needed: OrganTypeEnum
    recipient_blood_type: BloodTypeEnum
    urgency_score: int
    hospital_id: str
    items: List[CandidateDonorResponse] = Field(default_factory=list)
    total: int
    page: int
    page_size: int


class MatchRequestCreate(BaseModel):
    match_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Optional custom identifier (e.g., MTR-001). Generated as UUID if omitted.",
    )
    donor_id: str = Field(..., min_length=1, max_length=64, description="ID of proposed candidate donor")
    recipient_id: str = Field(..., min_length=1, max_length=64, description="ID of waiting recipient")
    hospital_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Optional hospital ID. If omitted, defaults to recipient's registered hospital.",
    )


class MatchRequestRejectRequest(BaseModel):
    reason: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Optional rejection reason recorded on the MatchRequest for audit.",
    )


class ReverseCandidateRecipientResponse(BaseModel):
    recipient_id: str
    name: str
    blood_type: BloodTypeEnum
    organ_needed: OrganTypeEnum
    urgency_score: int = Field(..., ge=1, le=10)
    hospital_id: str
    distance_km: float = Field(..., description="Haversine transit distance donor -> recipient hospital")
    score: float = Field(..., ge=0.0, le=100.0, description="Backend-computed rank score (0.0 - 100.0)")
    explanation: MatchExplanation
    eligible: bool = Field(default=True)


class ReverseCandidateListResponse(BaseModel):
    donor_id: str
    donor_name: str
    organ_type: OrganTypeEnum
    donor_blood_type: BloodTypeEnum
    items: List[ReverseCandidateRecipientResponse] = Field(default_factory=list)
    total: int
    page: int
    page_size: int


class MatchRequestResponse(BaseModel):
    match_id: str
    match_score: float
    requested_at: str
    status: MatchRequestStatusEnum
    donor_id: str
    recipient_id: str
    hospital_id: str
