from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.enums import LocationSchema


class HospitalBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Hospital or medical center name")
    location: LocationSchema = Field(..., description="Geographic coordinates")


class HospitalCreate(HospitalBase):
    hospital_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=64,
        description="Optional custom identifier (e.g. HOSP-001). Generated as UUID if omitted.",
    )


class HospitalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    location: Optional[LocationSchema] = None


class HospitalResponse(BaseModel):
    hospital_id: str
    name: str
    location: LocationSchema
