from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.enums import BloodTypeEnum, DonorStatusEnum, LocationSchema, OrganTypeEnum


class DonorBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150, description="Full name or identifier label for donor")
    blood_type: BloodTypeEnum = Field(..., description="ABO/Rh blood group")
    organ_type: OrganTypeEnum = Field(..., description="Organ or blood product available")
    location: LocationSchema = Field(..., description="Geographic coordinates")
    status: DonorStatusEnum = Field(default=DonorStatusEnum.AVAILABLE, description="Current availability status")
    expiry_window_hours: int = Field(default=24, ge=1, le=8760, description="Viability window in hours")


class DonorCreate(DonorBase):
    donor_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Optional custom identifier (e.g. DNR-001). Generated as UUID if omitted.",
    )


class DonorUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    blood_type: Optional[BloodTypeEnum] = None
    organ_type: Optional[OrganTypeEnum] = None
    location: Optional[LocationSchema] = None
    status: Optional[DonorStatusEnum] = None
    expiry_window_hours: Optional[int] = Field(default=None, ge=1, le=8760)


class DonorResponse(BaseModel):
    donor_id: str
    name: str
    blood_type: BloodTypeEnum
    organ_type: OrganTypeEnum
    location: LocationSchema
    status: DonorStatusEnum
    registered_at: str = Field(..., description="ISO-8601 UTC timestamp")
    expiry_window_hours: int
    version: int = Field(..., description="Optimistic concurrency control version")
