# API Contract — Organ/Blood Donor–Recipient Matching Network

> **Authentication Status for Phase 3:**  
> **Development-Only / Unauthenticated**. These CRUD endpoints do not yet require JWT authorization headers and are strictly scoped for internal network/local developer access. **Do not expose these endpoints directly to the public internet.**

---

## 1. Global Standard Response Contracts

### A. Paginated List Response Contract
All collection listing endpoints (`/api/v1/donors`, `/api/v1/recipients`, `/api/v1/hospitals`) strictly return:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20
}
```

### B. Standard Error Response Contract
All error states (validation failures, 404s, 409 conflicts, 503 database downtime) return:

```json
{
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human readable message",
    "details": null
  }
}
```

#### HTTP Status Code Conventions
- `200 OK`: Successful retrieval or PATCH update.
- `201 Created`: Resource successfully created in the graph.
- `204 No Content`: Successful deletion (empty response body).
- `400 Bad Request`: Invalid business logic operation (e.g. self-assigning `Allocated` status).
- `404 Not Found`: Resource or referenced entity does not exist.
- `409 Conflict`: Duplicate ID or active relationship/allocation conflict preventing deletion.
- `422 Unprocessable Entity`: Request validation failure (invalid enums, bad coordinates, urgency score out of bounds).
- `500 Internal Server Error`: Unhandled server exception with sanitized output.
- `503 Service Unavailable`: Neo4j graph database is down or unreachable.

---

## 2. Donor Endpoints (`/api/v1/donors`)

### 2.1 Create Donor
- **Method & Path**: `POST /api/v1/donors`
- **Status Code**: `201 Created`
- **Auth**: None (Dev mode)
- **Request Body**:
```json
{
  "donor_id": "DNR-051",
  "name": "Alex Mercer",
  "blood_type": "O-",
  "organ_type": "Kidney",
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "status": "Available",
  "expiry_window_hours": 36
}
```
*Note: `donor_id` is optional; if omitted, backend generates a UUID `DNR-XXXXXXXX`.*

- **Response Body**:
```json
{
  "donor_id": "DNR-051",
  "name": "Alex Mercer",
  "blood_type": "O-",
  "organ_type": "Kidney",
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "status": "Available",
  "registered_at": "2026-10-15T17:50:00Z",
  "expiry_window_hours": 36,
  "version": 0
}
```

### 2.2 List Donors
- **Method & Path**: `GET /api/v1/donors`
- **Query Parameters**:
  - `status`: Optional filter (`Available`, `Reserved`, `Allocated`, `Expired`)
  - `organ_type`: Optional filter (`Kidney`, `Liver`, `Heart`, `Lung`, `Pancreas`, `Blood`)
  - `blood_type`: Optional filter (`O-`, `O+`, `A-`, `A+`, `B-`, `B+`, `AB-`, `AB+`)
  - `page`: Integer (default `1`, min `1`)
  - `page_size`: Integer (default `20`, min `1`, max `100`)
- **Status Code**: `200 OK`
- **Response**: Paginated JSON list of `DonorResponse`.

### 2.3 Get Donor
- **Method & Path**: `GET /api/v1/donors/{donor_id}`
- **Status Code**: `200 OK` (`404` if not found)

### 2.4 Update Donor (PATCH)
- **Method & Path**: `PATCH /api/v1/donors/{donor_id}`
- **Semantics**: Omitted fields are preserved; client cannot manually modify `version` (backend auto-increments).
- **Request Body**:
```json
{
  "expiry_window_hours": 48,
  "status": "Reserved"
}
```
- **Status Code**: `200 OK`

### 2.5 Delete Donor
- **Method & Path**: `DELETE /api/v1/donors/{donor_id}`
- **Status Code**: `204 No Content`
- **Conflict Rule**: If donor has `:ALLOCATED_IN` or `:PROPOSED_IN` records, returns `409 Conflict`.

---

## 3. Recipient Endpoints (`/api/v1/recipients`)

### 3.1 Create Recipient
- **Method & Path**: `POST /api/v1/recipients`
- **Status Code**: `201 Created`
- **Validation**:
  - `urgency_score`: 1 to 10.
  - `hospital_id`: Referenced hospital must exist in graph; returns `404` if missing.
  - `status`: Defaults to `Waiting`; cannot create as `Allocated` (returns `400`).
- **Request Body**:
```json
{
  "recipient_id": "REC-051",
  "name": "Sarah Connor",
  "blood_type": "A+",
  "organ_needed": "Heart",
  "urgency_score": 9,
  "location": {
    "latitude": 13.0827,
    "longitude": 80.2707
  },
  "hospital_id": "HOSP-002"
}
```
- **Response Body**:
```json
{
  "recipient_id": "REC-051",
  "name": "Sarah Connor",
  "blood_type": "A+",
  "organ_needed": "Heart",
  "urgency_score": 9,
  "location": {
    "latitude": 13.0827,
    "longitude": 80.2707
  },
  "waitlist_since": "2026-10-15T17:50:00Z",
  "status": "Waiting",
  "hospital_id": "HOSP-002"
}
```

### 3.2 List Recipients
- **Method & Path**: `GET /api/v1/recipients`
- **Query Parameters**: `organ_needed`, `blood_type`, `hospital_id`, `status`, `page`, `page_size`
- **Status Code**: `200 OK`

### 3.3 Get Recipient
- **Method & Path**: `GET /api/v1/recipients/{recipient_id}`
- **Status Code**: `200 OK` (`404` if not found)

### 3.4 Update Recipient (PATCH)
- **Method & Path**: `PATCH /api/v1/recipients/{recipient_id}`
- **Status Code**: `200 OK`

### 3.5 Dedicated Urgency Update (PATCH)
- **Method & Path**: `PATCH /api/v1/recipients/{recipient_id}/urgency`
- **Request Body**:
```json
{
  "urgency_score": 10
}
```
- **Status Code**: `200 OK`

### 3.6 Delete Recipient
- **Method & Path**: `DELETE /api/v1/recipients/{recipient_id}`
- **Status Code**: `204 No Content`
- **Conflict Rule**: If recipient is linked to an allocation or match proposal, returns `409 Conflict`.

---

## 4. Hospital Endpoints (`/api/v1/hospitals`)

### 4.1 Create Hospital
- **Method & Path**: `POST /api/v1/hospitals`
- **Status Code**: `201 Created`
- **Request Body**:
```json
{
  "hospital_id": "HOSP-007",
  "name": "Apollo Global Transplant Hospital",
  "location": {
    "latitude": 12.9238,
    "longitude": 77.5983
  }
}
```

### 4.2 List Hospitals
- **Method & Path**: `GET /api/v1/hospitals`
- **Query Parameters**:
  - `name`: Substring search across hospital names (case-insensitive)
  - `page`, `page_size`
- **Status Code**: `200 OK`

### 4.3 Get Hospital
- **Method & Path**: `GET /api/v1/hospitals/{hospital_id}`
- **Status Code**: `200 OK`

### 4.4 Update Hospital (PATCH)
- **Method & Path**: `PATCH /api/v1/hospitals/{hospital_id}`
- **Preservation Rule**: Updates hospital properties without dropping or mutating relationships (`REGISTERED_AT`, `WORKS_AT`, `CONFIRMED_BY`).
- **Status Code**: `200 OK`

### 4.5 Delete Hospital
- **Method & Path**: `DELETE /api/v1/hospitals/{hospital_id}`
- **Conflict Rule**: Returns `409 Conflict` if the hospital has registered recipients, affiliated users, or allocation records.
- **Status Code**: `204 No Content`

---

## 5. TypeScript Interfaces for React Frontend

```typescript
export type BloodType = 'O-' | 'O+' | 'A-' | 'A+' | 'B-' | 'B+' | 'AB-' | 'AB+';
export type OrganType = 'Kidney' | 'Liver' | 'Heart' | 'Lung' | 'Pancreas' | 'Blood';
export type DonorStatus = 'Available' | 'Reserved' | 'Allocated' | 'Expired';
export type RecipientStatus = 'Waiting' | 'Allocated';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface Hospital {
  hospital_id: string;
  name: string;
  location: LocationCoordinates;
}

export interface Donor {
  donor_id: string;
  name: string;
  blood_type: BloodType;
  organ_type: OrganType;
  location: LocationCoordinates;
  status: DonorStatus;
  registered_at: string;
  expiry_window_hours: number;
  version: number;
}

export interface Recipient {
  recipient_id: string;
  name: string;
  blood_type: BloodType;
  organ_needed: OrganType;
  urgency_score: number;
  location: LocationCoordinates;
  waitlist_since: string;
  status: RecipientStatus;
  hospital_id: string;
}
```
