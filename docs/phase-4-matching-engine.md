# Phase 4 — Graph-Based Donor–Recipient Matching Engine

This document details the architecture, graph traversal algorithms, deterministic multi-factor ranking model, API contracts, and verification results for **Phase 4** of the **OrganLink** platform.

---

## 1. Phase 4 Objective

The primary objective of Phase 4 is to implement an asynchronous, graph-powered **Candidate Discovery and Match Request Management Engine**.

Given a waiting recipient identifier, the matching engine:
1. Validates recipient existence and confirms eligibility (`status == "Waiting"`).
2. Traverses the Neo4j knowledge graph across `(:BloodType)-[:CAN_DONATE_TO]->(:BloodType)` edges.
3. Enforces clinical and operational gating filters:
   - Donor availability status (`status == "Available"`).
   - Organ type exact match (`d.organ_type == r.organ_needed`).
   - Blood type compatibility via graph relationship.
   - Exclusion of donors with active `Allocation` relationships.
4. Ranks eligible candidates via a deterministic, transparent multi-factor scoring model.
5. Returns paginated candidate results with human-readable and factor-by-factor explanations.
6. Manages the lifecycle of formal `MatchRequest` records (`(Donor)-[:PROPOSED_IN]->(MatchRequest)-[:FOR_RECIPIENT]->(Recipient)`).

> [!IMPORTANT]
> **Separation of Matching vs. Allocation**: Candidate discovery and match request creation are **read-only** with respect to donor and recipient states. Donors remain `Available` and recipients remain `Waiting`. Allocations and state transitions to `Allocated` are reserved for transactional allocation workflows.

---

## 2. Layered Architecture & Data Flow

Phase 4 extends the 5-layer backend architecture without introducing ORMs or extraneous dependencies:

```
HTTP Client (React / Swagger / cURL)
        │
        ▼
   [FastAPI Router]          <── app/routers/matching.py
        │
        ▼
  [Pydantic Validation]      <── app/schemas/matching.py
        │
        ▼
   [Matching Service]        <── app/services/matching_service.py
        │        │
        │        ├──────────► [Match Scorer] (app/services/scorer.py)
        ▼        ▼
 [Matching Repository]       <── app/repositories/matching_repository.py
        │
        ▼
[Neo4j Graph Database]       <── CAN_DONATE_TO / HAS_BLOOD_TYPE / PROPOSED_IN
```

### Component Roles:
- **`app/routers/matching.py`**: Declares endpoints (`/api/v1/matches/recipients/{recipient_id}/candidates`, `/api/v1/matches/requests`), validates path/query params, and maps domain exceptions.
- **`app/schemas/matching.py`**: Declares request and response models: `CandidateListResponse`, `CandidateDonorResponse`, `MatchExplanation`, `ScoreFactorBreakdown`, `MatchRequestCreate`, and `MatchRequestResponse`.
- **`app/services/scorer.py`**: An isolated, deterministic mathematical scoring component implementing great-circle distance (Haversine), normalization, factor weighting, and clamping.
- **`app/services/matching_service.py`**: Coordinates validation, graph query execution, scoring, ranking, tie-breaking, and match request persistence.
- **`app/repositories/matching_repository.py`**: Parameterized Cypher executions over asynchronous Neo4j driver sessions.

---

## 3. Graph Traversal Strategy

Candidate discovery utilizes native Neo4j graph relationships to prune incompatible donors in the database engine:

```cypher
MATCH (r:Recipient {recipient_id: $recipient_id})-[:HAS_BLOOD_TYPE]->(rb:BloodType)
MATCH (db:BloodType)-[:CAN_DONATE_TO]->(rb)
MATCH (d:Donor {status: 'Available', organ_type: r.organ_needed})-[:HAS_BLOOD_TYPE]->(db)
WHERE NOT (d)-[:ALLOCATED_IN]->(:Allocation)
RETURN DISTINCT d.donor_id AS donor_id,
                d.name AS name,
                d.blood_type AS blood_type,
                d.organ_type AS organ_type,
                d.location.latitude AS latitude,
                d.location.longitude AS longitude,
                d.expiry_window_hours AS expiry_window_hours
```

### Key Traversal Properties:
- **Index Accelerated**: Leverages `index_donor_status`, `index_donor_organ_type`, and `constraint_blood_type`.
- **Directional Integrity**: Directs compatibility from donor's blood type to recipient's blood type: `(db:BloodType)-[:CAN_DONATE_TO]->(rb:BloodType)`.
- **Duplicate Prevention**: `RETURN DISTINCT` guarantees multiple graph paths do not produce duplicate candidate entries.
- **Allocation Protection**: `WHERE NOT (d)-[:ALLOCATED_IN]->(:Allocation)` excludes donors already committed to an allocation.

---

## 4. Candidate Scoring, Normalization & Ranking

### 4.1 Scoring Factors and Weights

$$TotalScore = (S_{blood} \times W_{blood}) + (S_{urgency} \times W_{urgency}) + (S_{distance} \times W_{distance})$$

Configured Default Weights:
- **Blood Compatibility Weight ($W_{blood}$)**: `0.40` (40%)
- **Medical Urgency Weight ($W_{urgency}$)**: `0.35` (35%)
- **Geographic Distance Proximity Weight ($W_{distance}$)**: `0.25` (25%)
- **Total**: $0.40 + 0.35 + 0.25 = 1.00$

### 4.2 Factor Normalization:
1. **Blood Compatibility Score ($S_{blood}$)**:
   - **$100.0$**: Exact blood group match (e.g., $A^+ \to A^+$).
   - **$80.0$**: Compatible cross-group donor (e.g., $O^- \to A^+$).
2. **Clinical Urgency Score ($S_{urgency}$)**:
   - Scaled linearly from recipient clinical urgency $U \in [1, 10]$:
     $$S_{urgency} = U \times 10.0 \quad (\text{Range: } 10.0 \text{ to } 100.0)$$
3. **Geographic Proximity Score ($S_{distance}$)**:
   - Transit distance $D$ (in km) calculated via spherical Haversine formula between donor location and recipient hospital.
   - Normalized using linear decay threshold ($D_{max} = 2500.0\text{ km}$):
     $$S_{distance} = \max\left(0.0, 100.0 \times \left(1.0 - \frac{D}{D_{max}}\right)\right)$$

### 4.3 Deterministic Tie-Breaking
When candidates achieve identical scores:
- Primary sort: `score DESC`
- Deterministic secondary tie-breaker: `donor_id ASC` (e.g. `DNR-001` before `DNR-002`)

---

## 5. API Endpoint Specifications

### 5.1 Find Candidate Donors
- **Path**: `GET /api/v1/matches/recipients/{recipient_id}/candidates`
- **Query Parameters**:
  - `page`: Integer (default `1`, min `1`)
  - `page_size`: Integer (default `20`, min `1`, max `100`)
- **Status Codes**:
  - `200 OK`: Successful candidate retrieval (returns empty `items: []` if no eligible donors exist).
  - `400 Bad Request`: Recipient is already `Allocated`.
  - `404 Not Found`: Recipient does not exist.

**Example Response (`200 OK`):**
```json
{
  "recipient_id": "REC-001",
  "recipient_name": "Kavita Rao",
  "organ_needed": "Kidney",
  "recipient_blood_type": "A-",
  "urgency_score": 8,
  "hospital_id": "HOSP-001",
  "items": [
    {
      "donor_id": "DNR-005",
      "name": "Vikram Iyer",
      "blood_type": "O-",
      "organ_type": "Kidney",
      "donor_location": {
        "latitude": 21.0,
        "longitude": 83.5
      },
      "expiry_window_hours": 48,
      "score": 74.21,
      "eligible": true,
      "explanation": {
        "summary": "Compatible universal/compatible blood type (O- -> A-). Urgency level 8/10 contribution. Transit distance: 1079.18 km.",
        "factors": {
          "blood_compatibility_score": 80.0,
          "urgency_score_component": 80.0,
          "distance_score_component": 56.83,
          "distance_km": 1079.18,
          "weights": {
            "blood_compatibility": 0.4,
            "urgency": 0.35,
            "distance": 0.25
          }
        },
        "disclaimer": "Research/demonstration engine only. ABO compatibility and proximity do not substitute for clinical HLA crossmatching."
      }
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

### 5.2 Create Match Request
- **Path**: `POST /api/v1/matches/requests`
- **Request Body**:
```json
{
  "match_id": "MTR-099",
  "donor_id": "DNR-005",
  "recipient_id": "REC-001",
  "hospital_id": "HOSP-001"
}
```
*(`match_id` and `hospital_id` are optional; auto-generated or defaulted if omitted).*

- **Status Codes**:
  - `201 Created`: Request created with initial status `Pending`.
  - `400 Bad Request`: Donor not available or organ type mismatch.
  - `404 Not Found`: Donor, recipient, or hospital does not exist.
  - `409 Conflict`: Duplicate `match_id`.

**Example Response (`201 Created`):**
```json
{
  "match_id": "MTR-099",
  "match_score": 74.21,
  "requested_at": "2026-10-15T19:22:00Z",
  "status": "Pending",
  "donor_id": "DNR-005",
  "recipient_id": "REC-001",
  "hospital_id": "HOSP-001"
}
```

### 5.3 Retrieve Match Request by ID
- **Path**: `GET /api/v1/matches/requests/{match_id}`
- **Status Codes**: `200 OK`, `404 Not Found`.

### 5.4 List Match Requests
- **Path**: `GET /api/v1/matches/requests`
- **Query Parameters**: `status`, `recipient_id`, `page`, `page_size`.
- **Status Code**: `200 OK`.

---

## 6. Verification and Test Results

Automated regression suite was executed:
```bash
powershell -Command "& .\.venv\Scripts\Activate.ps1; pytest -v"
```

### Output Summary:
```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-8.4.2
collected 39 items

tests/test_crud_integration.py ...                                       [  7%]
tests/test_crud_unit.py .............                                    [ 41%]
tests/test_graph.py ..                                                   [ 46%]
tests/test_health.py .....                                               [ 58%]
tests/test_matching_integration.py ...                                   [ 66%]
tests/test_matching_unit.py .............                                [100%]

============================= 39 passed in 19.86s =============================
```

### New Phase 4 Tests Added:
- **`tests/test_matching_unit.py`** (13 tests):
  - Haversine distance calculations and accuracy within geographic tolerances.
  - Scoring determinism, factor bounds (0-100), blood type identical vs. compatible differentiation.
  - Distance decay limits and urgency score clamping.
  - Candidate endpoint mocking: successful candidate lists, recipient not found (`404`), empty candidate lists (`200 OK`).
  - Match request endpoint mocking: creation (`201`), organ mismatch rejection (`400`), get by ID (`200`), not found (`404`), paginated list.
- **`tests/test_matching_integration.py`** (3 tests against live Neo4j):
  - Live graph candidate discovery for seeded recipient `REC-001`, verifying descending score order and factor breakdowns.
  - Live 404 verification for non-existent recipient.
  - Live match request lifecycle: candidate query $\to$ create match request $\to$ verify donor status remains `Available` $\to$ get request $\to$ duplicate rejection (`409`) $\to$ query list.

---

## 7. Non-Clinical Demonstration Disclaimer

> [!CAUTION]
> OrganLink is an academic demonstration and research platform. The matching algorithm evaluates **ABO/Rh compatibility, geographic proximity, and waitlist urgency** on synthetic data. Real-world organ transplantation requires complex histocompatibility testing including:
> - Human Leukocyte Antigen (HLA) high-resolution typing (A, B, C, DRB1, DQB1).
> - Panel Reactive Antibody (PRA) and Donor-Specific Antibody (DSA) assays.
> - Complement-dependent cytotoxicity (CDC) or flow cytometric crossmatching.
> - Cold ischemia time limits and organ preservation metrics.
> This engine must never be used for real clinical decision-making.
