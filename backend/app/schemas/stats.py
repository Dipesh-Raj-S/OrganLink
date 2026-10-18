from typing import Dict, List
from pydantic import BaseModel, Field

from app.schemas.allocation import AllocationResponse
from app.schemas.recipient import RecipientResponse


class DashboardStatsResponse(BaseModel):
    """
    Genuine operational statistics computed from the Neo4j graph.

    Field names intentionally match the frontend dashboard view model so the
    API layer performs no renaming. `status_breakdown` is keyed by the actual
    stored donor status values ('Available' | 'Reserved' | 'Allocated' | 'Expired').
    """

    total_donors: int = Field(..., ge=0, description="Total number of Donor nodes")
    available_donors: int = Field(..., ge=0, description="Donors with status 'Available'")
    total_recipients_waiting: int = Field(..., ge=0, description="Recipients with status 'Waiting'")
    confirmed_allocations: int = Field(..., ge=0, description="Allocation nodes with status 'Confirmed'")
    donors_approaching_expiry: int = Field(
        ...,
        ge=0,
        description=(
            "Available donors whose registered_at + expiry_window_hours falls within the "
            "next APPROACHING_EXPIRY_WINDOW_HOURS hours (backend-defined threshold)."
        ),
    )
    status_breakdown: Dict[str, int] = Field(default_factory=dict, description="Donor counts grouped by status")
    organ_breakdown: Dict[str, int] = Field(default_factory=dict, description="Donor counts grouped by organ_type")
    blood_type_distribution: Dict[str, int] = Field(
        default_factory=dict, description="Donor counts grouped by blood_type"
    )
    recent_allocations: List[AllocationResponse] = Field(
        default_factory=list, description="Most recent allocations (ordered by confirmed_at DESC)"
    )
    urgent_recipients: List[RecipientResponse] = Field(
        default_factory=list,
        description=(
            "Top waiting recipients ordered by urgency_score DESC (backend-ranked; "
            "no synthetic urgency thresholds are applied)."
        ),
    )
