# Organ/Blood Donor–Recipient Matching Network

A clean, asynchronous backend foundation for an Organ/Blood Donor–Recipient Matching Network. Built with FastAPI and Neo4j 5 graph database, designed for demonstrating complex compatibility matching, donor-recipient graph networks, and hospital allocations.

---

## 1. Features Implemented

### Phase 1: Backend Foundation
- **Asynchronous Driver Management**: Reusable Neo4j driver managed through FastAPI `lifespan` without opening/closing connections per request.
- **Fail-Safe Health Checks**: Verified connectivity checks via Cypher ping (`/health` and `/api/v1/health`) returning HTTP 200 when connected, or HTTP 503 when the database is unreachable without exposing stack traces.
- **Containerized Database**: Neo4j 5 Community Edition configured in `docker-compose.yml` with health checks, persistent volumes, and restricted `127.0.0.1` port bindings.
- **Strict Environment Configuration**: Centralized settings with `pydantic-settings` reading from `.env` or system environment variables.
- **CORS Configured**: Ready for frontend development (defaults to `http://localhost:5173`).
- **Interactive Documentation**: Swagger UI at `/docs` and OpenAPI JSON at `/openapi.json`.

### Phase 2: Neo4j Graph Schema, Constraints & Seed Data
- **Graph Schema DDL**: [schema.cypher](file:///d:/projects/OrganLink/organ-network/backend/cypher/schema.cypher) declaring 8 uniqueness constraints and 8 query performance indexes.
- **Schema Repository**: [schema_repository.py](file:///d:/projects/OrganLink/organ-network/backend/app/repositories/schema_repository.py) providing programmatic constraint enforcement and runtime schema introspection.
- **Deterministic Seeding Engine**: [seed.py](file:///d:/projects/OrganLink/organ-network/backend/scripts/seed.py) populating 121 nodes and 190 relationships with idempotent `MERGE` operations.
- **Security Best Practices**: Role-based system users (`ADMIN`, `COORDINATOR`, `DOCTOR`, `AUDITOR`) with PBKDF2-HMAC-SHA256 password hashes (no plaintext passwords).
- **Graph Traversal & Geodesic Distance**: Spatial Neo4j WGS-84 Point coordinates on Donors, Recipients, and Hospitals enabling `point.distance()` queries.
- **Clinical Nuance Documentation**: Detailed [phase-2-data-model.md](file:///d:/projects/OrganLink/organ-network/docs/phase-2-data-model.md) documenting ABO blood compatibility vs. HLA/crossmatch organ transplant requirements.

---

## 2. Prerequisites

- **Python**: Version 3.11 or 3.12+
- **Docker & Docker Compose**: For running the Neo4j 5 container
- **Git**

---

## 3. Project Directory Structure

```text
organ-network/
├── .env.example                    # Safe example environment configuration
├── .gitignore                      # Excludes .env, virtualenvs, __pycache__, logs
├── README.md                       # Complete project setup and operation documentation
├── docker-compose.yml              # Neo4j 5 container definition with persistent volumes
├── docs/
│   ├── phase-1-workflow.md         # Architecture sequence diagrams and workflow analysis
│   └── phase-2-data-model.md       # Graph schema, node definitions, and Cypher queries
└── backend/
    ├── requirements.txt            # Stable pinned dependencies
    ├── pytest.ini                  # Pytest configuration & markers
    ├── cypher/
    │   ├── schema.cypher           # DDL constraints and indexes
    │   └── seed.cypher             # Reproducible Cypher seed statements
    ├── app/
    │   ├── __init__.py
    │   ├── main.py                 # FastAPI entrypoint, lifespan, CORS, and endpoints
    │   ├── core/
    │   │   ├── __init__.py
    │   │   ├── config.py           # Pydantic-settings configuration
    │   │   └── db.py               # Asynchronous Neo4j driver connection manager
    │   └── repositories/
    │       ├── __init__.py
    │       └── schema_repository.py # Schema DDL & inspection repository
    ├── scripts/
    │   ├── __init__.py
    │   ├── seed.py                 # Idempotent database seeder
    │   └── verify_graph.py         # Graph verification and traversal queries
    └── tests/
        ├── __init__.py
        ├── test_health.py          # Unit & health integration tests
        └── test_graph.py           # Schema constraints & seed data tests
```

---

## 4. Setup & Installation

### Step 1: Configure Environment Variables
Copy the template `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Set your desired password in `.env`:
```dotenv
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=DevSecretPassword2026!
API_PREFIX=/api/v1
APP_ENV=development
```

### Step 2: Install Virtual Environment & Dependencies
From `organ-network/backend/`:
```bash
python -m venv .venv
# Activate on Windows:
.venv\Scripts\Activate.ps1
# Activate on Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### Step 2b: Configure the Frontend to Reach the Live API
The React app can run against the seeded mock engine or the real FastAPI backend. For live integration, set the frontend env values in `frontend/.env.example` or a local `frontend/.env`:
```dotenv
VITE_API_URL=http://127.0.0.1:8000/api/v1
VITE_USE_MOCK_API=false
```
The Vite dev server is configured to proxy `/api` to the backend on port `8000` so the app can authenticate directly with `/api/v1/auth/login` and `/api/v1/auth/me`.

---

## 5. Running & Seeding the Database

### 1. Start Neo4j Database (Docker Compose)
From the project root (`organ-network/`):
```bash
docker compose up -d
docker compose ps
```

### 2. Apply Schema & Seed Demonstration Data
From `organ-network/backend/`:
```bash
python scripts/seed.py
```
*(This script is safe to rerun repeatedly. It uses `IF NOT EXISTS` and `MERGE` to prevent duplicate nodes or edges).*

### 3. Verify Graph Constraints, Node Counts & Traversals
From `organ-network/backend/`:
```bash
python scripts/verify_graph.py
```

### 4. Safely Reset / Clean the Database
To clear all data and start fresh during development:
```cypher
// In Neo4j Browser (http://localhost:7474):
MATCH (n) DETACH DELETE n;
```
Then rerun `python scripts/seed.py`.

---

## 6. Running the API & Automated Tests

### Start the Backend API
From `organ-network/backend/`:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Run All Automated Tests
```bash
pytest -v
```

---

### Phase 5: Authentication, RBAC, and Transactional Allocation
- **PBKDF2-HMAC-SHA256 Authentication**: Secure credential verification against stored password hashes in Neo4j (`POST /api/v1/auth/login`).
- **Signed JWT Bearer Tokens**: Configurable short-lived access tokens with strict expiration, issuer, audience, and algorithm verification.
- **Role-Based Access Control (RBAC)**: Endpoint protection enforcing least-privilege policies across `ADMIN`, `COORDINATOR`, `DOCTOR`, and `AUDITOR`.
- **Atomic Transactional Allocation**: Concurrency-safe organ allocation in Neo4j 5 Community Edition (`POST /api/v1/matches/requests/{match_id}/allocate`) preventing double allocations via deterministic write lock acquisition and conditional status transitions.

---

### Phase 6: Frontend ↔ Backend Integration (Live API + Preserved Mock Engine)
- **Adapter-Layer Integration**: The React app calls its existing legacy endpoints; a live request dispatcher in `src/api/client.ts` translates paths, payloads, and responses to the real backend contract (`src/api/adapters.ts`, with the verified enum constants in `src/api/enums.ts`). The in-browser mock engine is untouched and fully isolated.
- **Live Auth & Session Expiry**: `POST /auth/login` with real JWTs (`VITE_API_URL` precedence → dev default `http://127.0.0.1:8000/api/v1` → prod same-origin `/api/v1`); live 401s dispatch a session-expired event that clears the session and redirects.
- **Matching Workflows on Real Scoring**: candidate discovery (forward + reverse), match request creation (`donor_id`/`recipient_id` only), single-flight guarded allocation with a clear 409 conflict banner, and pending-only rejection (`PATCH /matches/requests/{id}/reject`, ADMIN/COORDINATOR).
- **New Backend Endpoints**: `GET /stats/dashboard` (genuine graph aggregates incl. approaching-expiry donors), `GET /graph/matches/{id}` (real relationship subgraph), `GET /matches/donors/{id}/candidate-recipients` (reverse discovery), `PATCH /matches/requests/{match_id}/reject`.
- **Honest Field Backwards-Compatibility**: backend-missing fields (HLA, procurement hospital, notes) render conditionally or are labeled as display calculations — no invented data, no silent rescaling (live urgency is the backend 1–10 scale; mock keeps 1–100).
- **Verification**: frontend `tsc --noEmit` + `vite build` clean; backend `pytest` **98 passed**; a 27/27 live end-to-end workflow (auth → stats → candidates → create → allocate → idempotent repeat → reject lifecycle → graph → urgency → error envelope) against the seed baseline. See [phase-6-frontend-integration.md](file:///d:/projects/OrganLink/docs/phase-6-frontend-integration.md).

--- 

## 7. API Endpoints

| Method | Endpoint | Auth / Role | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | Application info and documentation links |
| `GET` | `/health` | Public | Root health check (verifies Neo4j connectivity) |
| `GET` | `/api/v1/health` | Public | Prefixed health check |
| `POST` | `/api/v1/auth/login` | Public | Authenticate user credentials & receive JWT token |
| `POST` | `/api/v1/auth/token` | Public | OAuth2 password form login (Swagger UI integration) |
| `GET` | `/api/v1/auth/me` | Authenticated | Retrieve authenticated user profile & role |
| `GET` | `/api/v1/donors` | Authenticated | List donors (paginated, filtered) |
| `POST` | `/api/v1/donors` | `ADMIN`, `COORDINATOR` | Register a new donor |
| `GET` | `/api/v1/donors/{id}` | Authenticated | Retrieve donor profile |
| `PATCH` | `/api/v1/donors/{id}` | `ADMIN`, `COORDINATOR` | Partially update donor profile |
| `DELETE` | `/api/v1/donors/{id}` | `ADMIN` | Delete donor with dependency checks |
| `GET` | `/api/v1/recipients` | Authenticated | List waiting recipients (paginated) |
| `POST` | `/api/v1/recipients` | `ADMIN`, `COORDINATOR` | Register a new recipient |
| `GET` | `/api/v1/recipients/{id}` | Authenticated | Retrieve recipient profile |
| `PATCH` | `/api/v1/recipients/{id}` | `ADMIN`, `COORDINATOR` | Update recipient profile |
| `PATCH` | `/api/v1/recipients/{id}/urgency` | `ADMIN`, `COORDINATOR` | Update recipient clinical urgency score |
| `DELETE` | `/api/v1/recipients/{id}` | `ADMIN` | Delete recipient with dependency checks |
| `GET` | `/api/v1/hospitals` | Authenticated | List hospitals |
| `POST` | `/api/v1/hospitals` | `ADMIN`, `COORDINATOR` | Register hospital |
| `GET` | `/api/v1/hospitals/{id}` | Authenticated | Get hospital by ID |
| `PATCH` | `/api/v1/hospitals/{id}` | `ADMIN`, `COORDINATOR` | Update hospital details |
| `DELETE` | `/api/v1/hospitals/{id}` | `ADMIN` | Delete hospital |
| `GET` | `/api/v1/matches/recipients/{id}/candidates` | Authenticated | Discover & rank candidate donors |
| `GET` | `/api/v1/matches/donors/{id}/candidate-recipients` | Authenticated | Reverse candidate discovery for an available donor |
| `POST` | `/api/v1/matches/requests` | `ADMIN`, `COORDINATOR` | Create formal match request |
| `GET` | `/api/v1/matches/requests/{id}` | Authenticated | Retrieve match request details |
| `GET` | `/api/v1/matches/requests` | Authenticated | List match requests |
| `PATCH` | `/api/v1/matches/requests/{id}/reject` | `ADMIN`, `COORDINATOR` | Reject a pending match request (409 on invalid transitions) |
| `POST` | `/api/v1/matches/requests/{id}/allocate` | `ADMIN`, `COORDINATOR` | Atomic match allocation commit |
| `GET` | `/api/v1/allocations/{id}` | Authenticated | Get allocation record |
| `GET` | `/api/v1/allocations` | Authenticated | List allocation history |
| `GET` | `/api/v1/graph/matches/{id}` | Authenticated | Visualization subgraph for one match request |
| `GET` | `/api/v1/stats/dashboard` | Authenticated | Aggregated operational dashboard statistics |
| `GET` | `/docs` | Public | Interactive Swagger UI |
| `GET` | `/openapi.json` | Public | OpenAPI specification schema |

