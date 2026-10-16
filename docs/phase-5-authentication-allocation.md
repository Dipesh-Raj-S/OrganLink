# Phase 5: Authentication, Role-Based Access Control, and Transactional Allocation

## Executive Summary

Phase 5 completes the production-grade security and transactional core of OrganLink:
1. **PBKDF2-HMAC-SHA256 Authentication**: Securely authenticates users against stored password hashes in Neo4j without plaintext exposure or timing leak vulnerabilities.
2. **Signed JWT Bearer Access Tokens**: Configurable short-lived token issuance with subject, role, issuer, audience, and expiration claims validation.
3. **Role-Based Access Control (RBAC)**: Protects sensitive read and write endpoints across all routers based on a least-privilege matrix (`ADMIN`, `COORDINATOR`, `DOCTOR`, `AUDITOR`).
4. **Atomic Transactional Allocation**: An atomic allocation workflow (`POST /api/v1/matches/requests/{match_id}/allocate`) designed for Neo4j 5 Community Edition that enforces exclusive write locks, revalidates state, links multi-hop relationships (`ALLOCATED_IN`, `TO_RECIPIENT`, `CONFIRMED_BY`, `RESOLVED_IN`), updates node statuses, and guarantees that competing requests cannot double-allocate donors or recipients.

---

## 1. Authentication Flow & JWT Configuration

### 1.1 Credential Verification
User credentials in OrganLink are stored as PBKDF2-HMAC-SHA256 salted hashes matching the format:
```
pbkdf2_sha256$<iterations>$<salt>$<hex_key>
```
Verification executes 100,000 iterations of SHA-256 HMAC and compares the resulting digest using constant-time comparison (`hmac.compare_digest`) to prevent timing side-channel attacks.

### 1.2 JWT Settings
Configuration is managed via Pydantic Settings (`app.core.config.Settings`):
- `JWT_SECRET`: Cryptographic signing secret.
- `JWT_ALGORITHM`: Restricted explicitly to `HS256`.
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Default 30 minutes.
- `JWT_ISSUER`: `organlink-auth`.
- `JWT_AUDIENCE`: `organlink-api`.

Tokens encode:
```json
{
  "sub": "USR-002",
  "username": "coordinator_sarah",
  "role": "COORDINATOR",
  "iat": 1776337200,
  "exp": 1776339000,
  "iss": "organlink-auth",
  "aud": "organlink-api"
}
```

### 1.3 How to Obtain a Token
#### Using JSON endpoint:
```bash
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "coordinator_sarah",
    "password": "<PASSWORD_PLACEHOLDER>"
  }'
```
Response:
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

#### Using OAuth2 Form (Swagger UI):
The application provides `POST /api/v1/auth/token` compatible with standard OAuth2 password request forms for interactive testing in Swagger UI (`/docs`).

### 1.4 Current User Inspection (`GET /api/v1/auth/me`)
```bash
curl -X GET "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer <TOKEN_PLACEHOLDER>"
```
Response:
```json
{
  "user_id": "USR-002",
  "username": "coordinator_sarah",
  "role": "COORDINATOR",
  "is_active": true,
  "hospital_id": "HOSP-002"
}
```

---

## 2. Role-Based Access Control (RBAC)

OrganLink enforces four discrete system roles:
- `ADMIN`: Full administrative privileges, including deletes and entity management.
- `COORDINATOR`: Clinical organ coordinators capable of managing donors, recipients, match requests, and executing allocations.
- `DOCTOR`: Medical staff capable of reading records and evaluating candidate matches.
- `AUDITOR`: Compliance auditors with read-only access to all operational and allocation records.

### RBAC Permission Matrix

| Operation | Endpoint | ADMIN | COORDINATOR | DOCTOR | AUDITOR |
|---|---|:---:|:---:|:---:|:---:|
| Read Donors/Recipients/Hospitals | `GET /api/v1/{donors,recipients,hospitals}` | Yes | Yes | Yes | Yes |
| Create/Update Donors | `POST/PATCH /api/v1/donors` | Yes | Yes | No | No |
| Create/Update Recipients | `POST/PATCH /api/v1/recipients` | Yes | Yes | No | No |
| Update Recipient Urgency | `PATCH /api/v1/recipients/{id}/urgency` | Yes | Yes | No | No |
| Create/Update Hospitals | `POST/PATCH /api/v1/hospitals` | Yes | Yes | No | No |
| Delete Donors/Recipients/Hospitals | `DELETE /api/v1/{donors,recipients,hospitals}/{id}` | Yes | No | No | No |
| View Match Candidates | `GET /api/v1/matches/recipients/{id}/candidates` | Yes | Yes | Yes | Yes |
| Create Match Request | `POST /api/v1/matches/requests` | Yes | Yes | No | No |
| Read Match Requests | `GET /api/v1/matches/requests` | Yes | Yes | Yes | Yes |
| Confirm Allocation | `POST /api/v1/matches/requests/{id}/allocate` | Yes | Yes | No | No |
| Read Allocations | `GET /api/v1/allocations` | Yes | Yes | Yes | Yes |
| Health Checks & OpenAPI | `GET /health`, `GET /docs` | Public | Public | Public | Public |

Unauthenticated requests return `401 Unauthorized` with code `AUTHENTICATION_REQUIRED` or `INVALID_TOKEN`. Authenticated users attempting forbidden actions receive `403 Forbidden` with code `FORBIDDEN_INSUFFICIENT_ROLE`.

---

## 3. Transactional Allocation & Concurrency Protection

### 3.1 Allocation Endpoint
`POST /api/v1/matches/requests/{match_id}/allocate`
- **Authorized Roles**: `ADMIN`, `COORDINATOR`.
- **Preconditions**:
  1. `MatchRequest` exists and has `status == 'Pending'`.
  2. `Donor` exists and has `status == 'Available'`.
  3. `Recipient` exists and has `status == 'Waiting'`.
  4. Neither `Donor` nor `Recipient` already has an active allocation relationship.
  5. Donor organ matches recipient needed organ.
  6. Donor blood type can donate to recipient blood type via the graph (`(:BloodType)-[:CAN_DONATE_TO]->(:BloodType)`).

### 3.2 Concurrency & Double-Allocation Prevention in Neo4j 5 Community Edition
In Neo4j 5 Community Edition, transactions acquire exclusive write locks on nodes when a property is modified. To prevent race conditions between two concurrent allocation requests for the same donor or recipient:
1. **Deterministic Lock Ordering**: The transaction computes a sorted order of the `donor_id` and `recipient_id`. It acquires an exclusive write lock on both nodes in that exact order by executing `SET n._tx_lock = timestamp()`. This guarantees no deadlock occurs between inverted pairs.
2. **Re-validation Under Exclusive Lock**: While holding the write lock, the transaction re-queries the donor and recipient statuses and allocation edges. If another transaction won the race and committed, the re-check detects `status != 'Available'` or an existing `[:ALLOCATED_IN]` relationship and immediately aborts.
3. **Atomic Multi-Entity State Commit**: In the same transaction:
   - Creates the `(:Allocation)` node.
   - Creates relationships:
     - `(d:Donor)-[:ALLOCATED_IN]->(a:Allocation)`
     - `(a:Allocation)-[:TO_RECIPIENT]->(r:Recipient)`
     - `(a:Allocation)-[:CONFIRMED_BY]->(h:Hospital)`
     - `(m:MatchRequest)-[:RESOLVED_IN]->(a:Allocation)`
     - `(a:Allocation)-[:ALLOCATED_BY_USER]->(u:User)` (if user node exists)
   - Updates statuses:
     - `Donor.status = 'Allocated'`
     - `Recipient.status = 'Allocated'`
     - `MatchRequest.status = 'Confirmed'`
   - Removes temporary lock properties `_tx_lock`.
   - Commits all changes atomically or rolls back entirely on any error.

### 3.3 Idempotency
If an allocation request is repeated for an already allocated match request, the service inspects existing graph relationships and returns the existing allocation record with HTTP 200 without creating duplicate nodes or corrupting statuses.

---

## 4. Verification and Test Execution

Run the complete test suite:
```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pytest -v
```

Test Results:
- **74 passed in 33.94s** (100% pass rate).
- Integration tests ran directly against the running Neo4j container (`bolt://localhost:7687`), verifying live candidate discovery, atomic allocation, and concurrent race-condition prevention with simultaneous coroutines.

---

## 5. College Demonstration & Medical Disclaimer

> [!CAUTION]
> **DEMONSTRATION ONLY — NOT CLINICALLY VALIDATED**  
> OrganLink is a demonstration and academic research prototype for graph-based matching algorithms. ABO/Rh blood compatibility and geographical distance calculations alone are **not** clinically sufficient to establish real-world transplant eligibility. Real clinical organ allocation requires complex Human Leukocyte Antigen (HLA) high-resolution typing, panel reactive antibody (PRA) testing, physical T/B-cell crossmatching, cold ischemia time monitoring, body weight/size ratios, viral serologies, and regulatory oversight (such as UNOS/OPTN or NOTTO policies).
