from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.enums import BloodTypeEnum, LocationSchema, OrganTypeEnum, RecipientStatusEnum


class RecipientBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150, description="Recipient full name")
    blood_type: BloodTypeEnum = Field(..., description="ABO/Rh blood group")
    organ_needed: OrganTypeEnum = Field(..., description="Organ or blood product needed")
    urgency_score: int = Field(..., ge=1, le=10, description="Clinical urgency score from 1 (lowest) to 10 (critical)")
    location: LocationSchema = Field(..., description="Geographic coordinates of patient/hospital")
    hospital_id: str = Field(..., min_length=1, max_length=64, description="ID of registering hospital")
    status: RecipientStatusEnum = Field(default=RecipientStatusEnum.WAITING, description="Initial status")


class RecipientCreate(RecipientBase):
    recipient_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Optional custom identifier (e.g. REC-001). Generated as UUID if omitted.",
    )


class RecipientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    blood_type: Optional[BloodTypeEnum] = None
    organ_needed: Optional[OrganTypeEnum] = None
    urgency_score: Optional[int] = Field(default=None, ge=1, le=10)
    location: Optional[LocationSchema] = None
    hospital_id: Optional[str] = Field(default=None, min_length=1, max_length=64)


class RecipientUrgencyUpdate(BaseModel):
    urgency_score: int = Field(..., ge=1, le=10, description="Updated urgency score (1-10)")


class RecipientResponse(BaseModel):
    recipient_id: str
    name: str
    blood_type: BloodTypeEnum
    organ_needed: OrganTypeEnum
    urgency_score: int
    location: LocationSchema
    waitlist_since: str = Field(..., description="ISO-8601 UTC timestamp")
    status: RecipientStatusEnum
    hospital_id: str
