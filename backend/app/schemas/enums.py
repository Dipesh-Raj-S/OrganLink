from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class BloodTypeEnum(str, Enum):
    O_NEG = "O-"
    O_POS = "O+"
    A_NEG = "A-"
    A_POS = "A+"
    B_NEG = "B-"
    B_POS = "B+"
    AB_NEG = "AB-"
    AB_POS = "AB+"


class OrganTypeEnum(str, Enum):
    KIDNEY = "Kidney"
    LIVER = "Liver"
    HEART = "Heart"
    LUNG = "Lung"
    PANCREAS = "Pancreas"
    BLOOD = "Blood"


class DonorStatusEnum(str, Enum):
    AVAILABLE = "Available"
    RESERVED = "Reserved"
    ALLOCATED = "Allocated"
    EXPIRED = "Expired"


class RecipientStatusEnum(str, Enum):
    WAITING = "Waiting"
    ALLOCATED = "Allocated"


class MatchRequestStatusEnum(str, Enum):
    PENDING = "Pending"
    CONFIRMED = "Confirmed"
    REJECTED = "Rejected"
    CANCELLED = "Cancelled"


class UserRoleEnum(str, Enum):
    ADMIN = "ADMIN"
    COORDINATOR = "COORDINATOR"
    DOCTOR = "DOCTOR"
    AUDITOR = "AUDITOR"


class AllocationStatusEnum(str, Enum):
    CONFIRMED = "Confirmed"
    CANCELLED = "Cancelled"



class LocationSchema(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude in range [-90.0, 90.0]")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude in range [-180.0, 180.0]")
