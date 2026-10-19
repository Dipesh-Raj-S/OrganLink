"""
Seed data script for Organ/Blood Donor–Recipient Matching Network.
Creates deterministic, reproducible demonstration data:
- 8 Standard BloodTypes with CAN_DONATE_TO compatibility relationships
- 6 Fictional Hospitals with geographic coordinates
- 4 Role-based Users (ADMIN, COORDINATOR, DOCTOR, AUDITOR) with salted PBKDF2-HMAC-SHA256 password hashes
- 50 Synthetic Donors with location, blood type, organ type, status, and UTC timestamps
- 50 Synthetic Recipients with location, blood type, organ needed, urgency scores (1-10), waitlist timestamp, and hospital registration
- Sample MatchRequests and Allocation nodes demonstrating multi-hop relationships
"""

import asyncio
import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any

# Ensure backend root is in python path
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.core.db import db
from app.repositories.schema_repository import SchemaRepository


def hash_password(password: str, salt: str = "organ_network_seed_salt_2026") -> str:
    """
    Standard PBKDF2-HMAC-SHA256 password hashing.
    Avoids storing plaintext passwords or depending on C-extension binaries.
    """
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=100_000,
    )
    return f"pbkdf2_sha256$100000${salt}${key.hex()}"


# ------------------------------------------------------------------------------
# 1. DETERMINISTIC SEED DATA DEFINITIONS
# ------------------------------------------------------------------------------

BLOOD_TYPES = [
    {"type": "O-", "category": "Blood"},
    {"type": "O+", "category": "Blood"},
    {"type": "A-", "category": "Blood"},
    {"type": "A+", "category": "Blood"},
    {"type": "B-", "category": "Blood"},
    {"type": "B+", "category": "Blood"},
    {"type": "AB-", "category": "Blood"},
    {"type": "AB+", "category": "Blood"},
]

BLOOD_COMPATIBILITY = [
    # O- is Universal Blood Donor
    ("O-", "O-"), ("O-", "O+"), ("O-", "A-"), ("O-", "A+"),
    ("O-", "B-"), ("O-", "B+"), ("O-", "AB-"), ("O-", "AB+"),
    # O+ can donate to Rh+ blood types
    ("O+", "O+"), ("O+", "A+"), ("O+", "B+"), ("O+", "AB+"),
    # A- can donate to A and AB types
    ("A-", "A-"), ("A-", "A+"), ("A-", "AB-"), ("A-", "AB+"),
    # A+ can donate to A+ and AB+
    ("A+", "A+"), ("A+", "AB+"),
    # B- can donate to B and AB types
    ("B-", "B-"), ("B-", "B+"), ("B-", "AB-"), ("B-", "AB+"),
    # B+ can donate to B+ and AB+
    ("B+", "B+"), ("B+", "AB+"),
    # AB- can donate to AB- and AB+
    ("AB-", "AB-"), ("AB-", "AB+"),
    # AB+ is Universal Recipient; can only donate to AB+
    ("AB+", "AB+"),
]

HOSPITALS = [
    {
        "hospital_id": "HOSP-001",
        "name": "Metro Apex Multi-Specialty Hospital",
        "latitude": 12.9716,
        "longitude": 77.5946,
    },
    {
        "hospital_id": "HOSP-002",
        "name": "St. Jude Organ Transplant Center",
        "latitude": 13.0827,
        "longitude": 80.2707,
    },
    {
        "hospital_id": "HOSP-003",
        "name": "National Institute of Medical Sciences",
        "latitude": 17.3850,
        "longitude": 78.4867,
    },
    {
        "hospital_id": "HOSP-004",
        "name": "Fortis Care Regional Trauma Center",
        "latitude": 19.0760,
        "longitude": 72.8777,
    },
    {
        "hospital_id": "HOSP-005",
        "name": "City Life Memorial Hospital",
        "latitude": 28.7041,
        "longitude": 77.1025,
    },
    {
        "hospital_id": "HOSP-006",
        "name": "Highland Comprehensive Health Institute",
        "latitude": 22.5726,
        "longitude": 88.3639,
    },
]

USERS = [
    {
        "user_id": "USR-001",
        "username": "admin_sys",
        "password_hash": hash_password("AdminSecurePass!2026"),
        "role": "ADMIN",
        "is_active": True,
        "hospital_id": "HOSP-001",
    },
    {
        "user_id": "USR-002",
        "username": "coordinator_sarah",
        "password_hash": hash_password("CoordPass!2026"),
        "role": "COORDINATOR",
        "is_active": True,
        "hospital_id": "HOSP-002",
    },
    {
        "user_id": "USR-003",
        "username": "dr_chen_transplant",
        "password_hash": hash_password("DoctorPass!2026"),
        "role": "DOCTOR",
        "is_active": True,
        "hospital_id": "HOSP-003",
    },
    {
        "user_id": "USR-004",
        "username": "auditor_james",
        "password_hash": hash_password("AuditPass!2026"),
        "role": "AUDITOR",
        "is_active": True,
        "hospital_id": "HOSP-004",
    },
]

FIRST_NAMES = [
    "Aarav", "Aditi", "Rohan", "Priya", "Vikram", "Ananya", "Rahul", "Sneha",
    "Arjun", "Kavita", "Siddharth", "Pooja", "Amit", "Divya", "Karan", "Meera",
    "David", "Elena", "Liam", "Sophia", "Noah", "Olivia", "Lucas", "Emma",
    "Oliver", "Isabella", "Mateo", "Mia", "Alexander", "Zoe", "Daniel", "Grace",
    "Marcus", "Chloe", "Leo", "Lily", "Ethan", "Aria", "Henry", "Nora",
    "Benjamin", "Layla", "Samuel", "Mila", "Gabriel", "Maya", "Julian", "Hannah",
    "Anthony", "Ellie",
]

LAST_NAMES = [
    "Sharma", "Patel", "Verma", "Iyer", "Rao", "Nair", "Reddy", "Menon",
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
    "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
    "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young",
    "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
    "Green", "Adams",
]

ORGAN_TYPES = ["Kidney", "Liver", "Heart", "Lung", "Pancreas", "Blood"]
BLOOD_TYPE_VALUES = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]

DONOR_STATUSES = ["Available", "Available", "Available", "Reserved", "Allocated", "Expired"]
RECIPIENT_STATUSES = ["Waiting", "Waiting", "Waiting", "Waiting", "Allocated"]


def build_donors() -> List[Dict[str, Any]]:
    donors = []
    base_time = 1718000000
    for i in range(1, 51):
        idx = i - 1
        name = f"{FIRST_NAMES[idx % len(FIRST_NAMES)]} {LAST_NAMES[(idx * 3) % len(LAST_NAMES)]}"
        blood = BLOOD_TYPE_VALUES[idx % len(BLOOD_TYPE_VALUES)]
        organ = ORGAN_TYPES[idx % len(ORGAN_TYPES)]
        status = DONOR_STATUSES[idx % len(DONOR_STATUSES)]

        lat = 12.5 + ((i * 17) % 150) * 0.1
        lon = 77.0 + ((i * 13) % 150) * 0.1

        registered_epoch = base_time + (i * 3600 * 12)
        registered_iso = datetime.fromtimestamp(registered_epoch, tz=timezone.utc).isoformat()
        expiry_hours = 24 if organ in ["Heart", "Lung"] else (48 if organ in ["Kidney", "Liver"] else 720)

        donors.append({
            "donor_id": f"DNR-{i:03d}",
            "name": name,
            "blood_type": blood,
            "organ_type": organ,
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "status": status,
            "registered_at": registered_iso,
            "expiry_window_hours": expiry_hours,
            "version": 0,
        })
    return donors


def build_recipients() -> List[Dict[str, Any]]:
    recipients = []
    base_time = 1715000000
    for i in range(1, 51):
        idx = i - 1
        name = f"{FIRST_NAMES[(idx + 7) % len(FIRST_NAMES)]} {LAST_NAMES[(idx * 5) % len(LAST_NAMES)]}"
        blood = BLOOD_TYPE_VALUES[(idx + 2) % len(BLOOD_TYPE_VALUES)]
        organ = ORGAN_TYPES[idx % len(ORGAN_TYPES)]
        urgency = 1 + ((i * 7) % 10)
        status = RECIPIENT_STATUSES[idx % len(RECIPIENT_STATUSES)]

        hosp_id = HOSPITALS[idx % len(HOSPITALS)]["hospital_id"]

        lat = 12.8 + ((i * 19) % 140) * 0.1
        lon = 77.2 + ((i * 11) % 140) * 0.1

        waitlist_epoch = base_time + (i * 3600 * 24)
        waitlist_iso = datetime.fromtimestamp(waitlist_epoch, tz=timezone.utc).isoformat()

        recipients.append({
            "recipient_id": f"REC-{i:03d}",
            "name": name,
            "blood_type": blood,
            "organ_needed": organ,
            "urgency_score": urgency,
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "waitlist_since": waitlist_iso,
            "status": status,
            "registered_hospital_id": hosp_id,
        })
    return recipients


async def seed_database() -> Dict[str, int]:
    settings = get_settings()
    await db.connect(settings)
    driver = db.driver

    try:
        # 1. Apply Schema (Constraints & Indexes)
        schema_repo = SchemaRepository(driver)
        await schema_repo.apply_schema()

        async with driver.session() as session:
            # A. Seed BloodType Nodes & Compatibility
            for bt in BLOOD_TYPES:
                await session.run(
                    """
                    MERGE (b:BloodType {blood_type: $blood_type})
                    ON CREATE SET b.category = $category
                    ON MATCH SET b.category = $category
                    """,
                    blood_type=bt["type"],
                    category=bt["category"],
                )

            for donor_bt, recipient_bt in BLOOD_COMPATIBILITY:
                await session.run(
                    """
                    MATCH (d:BloodType {blood_type: $d_type})
                    MATCH (r:BloodType {blood_type: $r_type})
                    MERGE (d)-[:CAN_DONATE_TO]->(r)
                    """,
                    d_type=donor_bt,
                    r_type=recipient_bt,
                )

            # B. Seed Hospitals
            for h in HOSPITALS:
                await session.run(
                    """
                    MERGE (hosp:Hospital {hospital_id: $hospital_id})
                    ON CREATE SET 
                        hosp.name = $name,
                        hosp.location = point({latitude: $latitude, longitude: $longitude})
                    ON MATCH SET 
                        hosp.name = $name,
                        hosp.location = point({latitude: $latitude, longitude: $longitude})
                    """,
                    hospital_id=h["hospital_id"],
                    name=h["name"],
                    latitude=h["latitude"],
                    longitude=h["longitude"],
                )

            # C. Seed Users and WORKS_AT relationships
            for u in USERS:
                await session.run(
                    """
                    MERGE (usr:User {user_id: $user_id})
                    ON CREATE SET 
                        usr.username = $username,
                        usr.password_hash = $password_hash,
                        usr.role = $role,
                        usr.is_active = $is_active
                    ON MATCH SET 
                        usr.username = $username,
                        usr.password_hash = $password_hash,
                        usr.role = $role,
                        usr.is_active = $is_active
                    WITH usr
                    MATCH (h:Hospital {hospital_id: $hospital_id})
                    MERGE (usr)-[:WORKS_AT]->(h)
                    """,
                    user_id=u["user_id"],
                    username=u["username"],
                    password_hash=u["password_hash"],
                    role=u["role"],
                    is_active=u["is_active"],
                    hospital_id=u["hospital_id"],
                )

            # D. Seed Donors and HAS_BLOOD_TYPE relationship
            donors = build_donors()
            for d in donors:
                await session.run(
                    """
                    MERGE (dnr:Donor {donor_id: $donor_id})
                    ON CREATE SET 
                        dnr.name = $name,
                        dnr.blood_type = $blood_type,
                        dnr.organ_type = $organ_type,
                        dnr.location = point({latitude: $latitude, longitude: $longitude}),
                        dnr.status = $status,
                        dnr.registered_at = datetime($registered_at),
                        dnr.expiry_window_hours = $expiry_window_hours,
                        dnr.version = $version
                    ON MATCH SET 
                        dnr.name = $name,
                        dnr.blood_type = $blood_type,
                        dnr.organ_type = $organ_type,
                        dnr.location = point({latitude: $latitude, longitude: $longitude}),
                        dnr.status = $status,
                        dnr.registered_at = datetime($registered_at),
                        dnr.expiry_window_hours = $expiry_window_hours
                    WITH dnr
                    MATCH (b:BloodType {blood_type: $blood_type})
                    MERGE (dnr)-[:HAS_BLOOD_TYPE]->(b)
                    """,
                    donor_id=d["donor_id"],
                    name=d["name"],
                    blood_type=d["blood_type"],
                    organ_type=d["organ_type"],
                    latitude=d["latitude"],
                    longitude=d["longitude"],
                    status=d["status"],
                    registered_at=d["registered_at"],
                    expiry_window_hours=d["expiry_window_hours"],
                    version=d["version"],
                )

            # E. Seed Recipients, HAS_BLOOD_TYPE, and REGISTERED_AT Hospital
            recipients = build_recipients()
            for r in recipients:
                await session.run(
                    """
                    MERGE (rec:Recipient {recipient_id: $recipient_id})
                    ON CREATE SET 
                        rec.name = $name,
                        rec.blood_type = $blood_type,
                        rec.organ_needed = $organ_needed,
                        rec.urgency_score = $urgency_score,
                        rec.location = point({latitude: $latitude, longitude: $longitude}),
                        rec.waitlist_since = datetime($waitlist_since),
                        rec.status = $status
                    ON MATCH SET 
                        rec.name = $name,
                        rec.blood_type = $blood_type,
                        rec.organ_needed = $organ_needed,
                        rec.urgency_score = $urgency_score,
                        rec.location = point({latitude: $latitude, longitude: $longitude}),
                        rec.waitlist_since = datetime($waitlist_since),
                        rec.status = $status
                    WITH rec
                    MATCH (b:BloodType {blood_type: $blood_type})
                    MERGE (rec)-[:HAS_BLOOD_TYPE]->(b)
                    WITH rec
                    MATCH (h:Hospital {hospital_id: $hospital_id})
                    MERGE (rec)-[:REGISTERED_AT]->(h)
                    """,
                    recipient_id=r["recipient_id"],
                    name=r["name"],
                    blood_type=r["blood_type"],
                    organ_needed=r["organ_needed"],
                    urgency_score=r["urgency_score"],
                    latitude=r["latitude"],
                    longitude=r["longitude"],
                    waitlist_since=r["waitlist_since"],
                    status=r["status"],
                    hospital_id=r["registered_hospital_id"],
                )

            # F. Seed Sample Demonstration MatchRequests & Allocations
            sample_matches = [
                {
                    "match_id": "MTR-001",
                    "match_score": 92.5,
                    "requested_at": "2026-06-15T10:00:00Z",
                    "status": "Pending",
                    "donor_id": "DNR-001",
                    "recipient_id": "REC-001",
                    "hospital_id": "HOSP-001",
                },
                {
                    "match_id": "MTR-002",
                    "match_score": 87.0,
                    "requested_at": "2026-06-16T14:30:00Z",
                    "status": "Confirmed",
                    "donor_id": "DNR-004",
                    "recipient_id": "REC-004",
                    "hospital_id": "HOSP-002",
                },
            ]

            for m in sample_matches:
                await session.run(
                    """
                    MERGE (req:MatchRequest {match_id: $match_id})
                    ON CREATE SET 
                        req.match_score = $match_score,
                        req.requested_at = datetime($requested_at),
                        req.status = $status
                    ON MATCH SET 
                        req.match_score = $match_score,
                        req.requested_at = datetime($requested_at),
                        req.status = $status
                    WITH req
                    MATCH (d:Donor {donor_id: $donor_id})
                    MATCH (r:Recipient {recipient_id: $recipient_id})
                    MATCH (h:Hospital {hospital_id: $hospital_id})
                    MERGE (d)-[:PROPOSED_IN]->(req)
                    MERGE (req)-[:FOR_RECIPIENT]->(r)
                    MERGE (req)-[:REQUESTED_BY]->(h)
                    """,
                    match_id=m["match_id"],
                    match_score=m["match_score"],
                    requested_at=m["requested_at"],
                    status=m["status"],
                    donor_id=m["donor_id"],
                    recipient_id=m["recipient_id"],
                    hospital_id=m["hospital_id"],
                )

            sample_allocations = [
                {
                    "allocation_id": "ALC-001",
                    "confirmed_at": "2026-06-16T18:00:00Z",
                    "donor_id": "DNR-004",
                    "recipient_id": "REC-004",
                    "hospital_id": "HOSP-002",
                }
            ]

            for a in sample_allocations:
                await session.run(
                    """
                    MERGE (alc:Allocation {allocation_id: $allocation_id})
                    ON CREATE SET alc.confirmed_at = datetime($confirmed_at)
                    ON MATCH SET alc.confirmed_at = datetime($confirmed_at)
                    WITH alc
                    MATCH (d:Donor {donor_id: $donor_id})
                    MATCH (r:Recipient {recipient_id: $recipient_id})
                    MATCH (h:Hospital {hospital_id: $hospital_id})
                    MERGE (d)-[:ALLOCATED_IN]->(alc)
                    MERGE (alc)-[:TO_RECIPIENT]->(r)
                    MERGE (alc)-[:CONFIRMED_BY]->(h)
                    """,
                    allocation_id=a["allocation_id"],
                    confirmed_at=a["confirmed_at"],
                    donor_id=a["donor_id"],
                    recipient_id=a["recipient_id"],
                    hospital_id=a["hospital_id"],
                )

            res_nodes = await session.run("MATCH (n) RETURN count(n) AS total_nodes")
            total_nodes = (await res_nodes.single())["total_nodes"]

            res_rels = await session.run("MATCH ()-[r]->() RETURN count(r) AS total_relationships")
            total_rels = (await res_rels.single())["total_relationships"]

            print(f"=== Database Seeding Complete ===")
            print(f"Total Nodes: {total_nodes}")
            print(f"Total Relationships: {total_rels}")

            return {"total_nodes": total_nodes, "total_relationships": total_rels}

    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(seed_database())
