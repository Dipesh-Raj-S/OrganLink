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

## 7. API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Application info and documentation links |
| `GET` | `/health` | Root health check (verifies Neo4j connectivity) |
| `GET` | `/api/v1/health` | Prefixed health check |
| `GET` | `/docs` | Interactive Swagger UI |
| `GET` | `/openapi.json` | OpenAPI v3 Specification schema |
