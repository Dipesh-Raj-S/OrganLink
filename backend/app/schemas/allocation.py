from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.enums import AllocationStatusEnum


class AllocationCreate(BaseModel):
    donor_id: Optional[str] = Field(
        default=None,
        description="Optional explicit donor ID override if not using the donor linked to the match request",
    )


class AllocationResponse(BaseModel):
    allocation_id: str = Field(..., description="Unique allocation identifier (e.g. ALC-001 or ALC-UUID)")
    match_id: str = Field(..., description="Referenced MatchRequest ID")
    donor_id: str = Field(..., description="Allocated Donor ID")
    recipient_id: str = Field(..., description="Allocated Recipient ID")
    hospital_id: str = Field(..., description="Hospital where allocation is confirmed")
    allocated_by: Optional[str] = Field(default=None, description="User ID of coordinator/admin who executed the allocation")
    confirmed_at: str = Field(..., description="ISO UTC timestamp when allocation was committed")
    status: AllocationStatusEnum = Field(default=AllocationStatusEnum.CONFIRMED, description="Allocation record status")
