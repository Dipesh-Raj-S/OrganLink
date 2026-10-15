# Organ/Blood Donor–Recipient Matching Network

**Phase 1: Backend Foundation & Neo4j Integration**

A clean, asynchronous backend foundation for an Organ/Blood Donor–Recipient Matching Network. Built with FastAPI and Neo4j 5 graph database, designed for demonstrating complex compatibility matching, donor-recipient graph networks, and hospital allocations.

---

## 1. Features Implemented in Phase 1

- **Asynchronous Driver Management**: Reusable Neo4j driver managed through FastAPI `lifespan` without opening/closing connections per request.
- **Fail-Safe Health Checks**: Verified connectivity checks via Cypher ping (`/health` and `/api/v1/health`) returning HTTP 200 when connected, or HTTP 503 when the database is unreachable without exposing stack traces.
- **Containerized Database**: Neo4j 5 Community Edition configured in `docker-compose.yml` with health checks, persistent volumes, and restricted `127.0.0.1` port bindings.
- **Strict Environment Configuration**: Centralized settings with `pydantic-settings` reading from `.env` or system environment variables.
- **CORS Configured**: Ready for frontend development (defaults to `http://localhost:5173`).
- **Interactive Documentation**: Swagger UI at `/docs` and OpenAPI JSON at `/openapi.json`.
- **Automated Test Suite**: Unit tests with dependency mocking and integration test coverage.

---

## 2. Prerequisites

- **Python**: Version 3.11 or 3.12+
- **Docker & Docker Compose**: For running the Neo4j 5 container
- **Git**

---

## 3. Project Directory Structure

```text
organ-network/
├── .env.example              # Safe example environment configuration
├── .gitignore                # Excludes .env, virtualenvs, __pycache__, logs
├── README.md                 # Complete project setup and operation documentation
├── docker-compose.yml        # Neo4j 5 container definition with persistent volumes
├── docs/
│   └── phase-1-workflow.md   # Architectural sequence diagrams and workflow analysis
└── backend/
    ├── requirements.txt      # Stable pinned dependencies
    ├── app/
    │   ├── __init__.py
    │   ├── main.py           # FastAPI entrypoint, lifespan, CORS, and endpoints
    │   └── core/
    │       ├── __init__.py
    │       ├── config.py     # Pydantic-settings configuration
    │       └── db.py         # Asynchronous Neo4j driver connection manager
    └── tests/
        ├── __init__.py
        └── test_health.py    # Unit & integration test cases
```

---

## 4. Setup & Installation

### Step 1: Clone and Navigate to Directory
```bash
cd organ-network
```

### Step 2: Configure Environment Variables
Copy the template `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Review `.env` and set your desired `NEO4J_PASSWORD`:
```dotenv
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=StrongSecretPassword123
API_PREFIX=/api/v1
APP_ENV=development
```

### Step 3: Create & Activate Python Virtual Environment
Navigate to the `backend/` directory:
```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:
- **Windows (PowerShell)**:
  ```powershell
  .venv\Scripts\Activate.ps1
  ```
- **Linux / macOS**:
  ```bash
  source .venv/bin/activate
  ```

### Step 4: Install Dependencies
```bash
pip install -r requirements.txt
```

---

## 5. Running the Application

### 1. Start Neo4j Database (Docker Compose)
From the project root (`organ-network/`):
```bash
docker compose up -d
```
Check container status:
```bash
docker compose ps
```
To stop the database:
```bash
docker compose down
```

### 2. Start the Backend API (Uvicorn)
From `organ-network/backend/`:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

---

## 6. Endpoints & Example Responses

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Application info and documentation links |
| `GET` | `/health` | Root health check (verifies Neo4j connectivity) |
| `GET` | `/api/v1/health` | Prefixed health check |
| `GET` | `/docs` | Interactive Swagger UI |
| `GET` | `/openapi.json` | OpenAPI v3 Specification schema |

### Example Responses

#### `GET /` (200 OK)
```json
{
  "application": "Organ/Blood Donor–Recipient Matching Network",
  "version": "1.0.0",
  "status": "operational",
  "environment": "development",
  "docs_url": "/docs",
  "openapi_url": "/openapi.json"
}
```

#### `GET /health` (When Neo4j is Connected — 200 OK)
```json
{
  "status": "healthy",
  "database": "connected"
}
```

#### `GET /health` (When Neo4j is Unreachable — 503 Service Unavailable)
```json
{
  "detail": "Database unavailable. Service is unhealthy."
}
```

---

## 7. Running Automated Tests

Run the test suite using `pytest` from the `backend/` directory:

```bash
cd backend
pytest -v
```

To run only unit tests (which do not require a live Neo4j database):
```bash
pytest -m "not integration" -v
```

---

## 8. Common Troubleshooting Steps

1. **`ValueError: Configuration key 'NEO4J_PASSWORD' must not be empty`**
   - **Cause**: The `.env` file is missing or `NEO4J_PASSWORD` is blank.
   - **Solution**: Ensure `.env` exists in either the root (`organ-network/`) or `organ-network/backend/` directory with a valid password.

2. **`503 Service Unavailable` on `/health`**
   - **Cause**: Neo4j is not running or still initializing.
   - **Solution**: Run `docker compose ps` to check container health. Wait ~15 seconds for initial database startup, or verify port 7687 is available.

3. **Port 7687 or 7474 Already in Use**
   - **Cause**: Another Neo4j instance or process is using the ports.
   - **Solution**: Stop existing services using `docker ps` or change port mapping in `docker-compose.yml`.
