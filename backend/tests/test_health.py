import os
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch

from app.core.config import get_settings
from app.main import create_app
from app.core.db import db



@pytest.fixture
def test_app():
    """Provides a fresh FastAPI instance for tests."""
    return create_app()


# ---------------------------------------------------------
# Unit Tests (Mocked DB — No live Neo4j required)
# ---------------------------------------------------------

@pytest.mark.asyncio
async def test_root_endpoint(test_app):
    """
    Test GET / returns 200, identifies the application,
    and links to Swagger docs.
    """
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")

    assert response.status_code == 200
    data = response.json()
    assert "Organ/Blood Donor–Recipient Matching Network" in data["application"]
    assert data["status"] == "operational"
    assert data["docs_url"] == "/docs"
    assert data["openapi_url"] == "/openapi.json"


@pytest.mark.asyncio
async def test_health_check_healthy_mocked(test_app):
    """
    Test GET /health and GET /api/v1/health when Neo4j is reachable (Mocked).
    Should return 200 with {'status': 'healthy', 'database': 'connected'}.
    """
    with patch.object(db, "verify_connectivity", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = True

        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Test /health
            resp_root = await client.get("/health")
            assert resp_root.status_code == 200
            assert resp_root.json() == {"status": "healthy", "database": "connected"}

            # Test /api/v1/health
            resp_api = await client.get("/api/v1/health")
            assert resp_api.status_code == 200
            assert resp_api.json() == {"status": "healthy", "database": "connected"}


@pytest.mark.asyncio
async def test_health_check_database_down_mocked(test_app):
    """
    Test GET /health and GET /api/v1/health when Neo4j is unreachable (Mocked).
    Should return 503 Service Unavailable without leaking sensitive stack traces.
    """
    from neo4j.exceptions import ServiceUnavailable

    with patch.object(db, "verify_connectivity", new_callable=AsyncMock) as mock_verify:
        mock_verify.side_effect = ServiceUnavailable("Failed to establish connection to localhost:7687")

        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Test /health
            resp_root = await client.get("/health")
            assert resp_root.status_code == 503
            data = resp_root.json()
            assert "error" in data
            assert data["error"]["code"] == "SERVICE_UNAVAILABLE"
            assert data["error"]["message"] == "Database unavailable. Service is unhealthy."
            # Verify sensitive details or credentials are not exposed
            assert "localhost" not in str(data)
            assert "testpassword123" not in str(data)

            # Test /api/v1/health
            resp_api = await client.get("/api/v1/health")
            assert resp_api.status_code == 503


@pytest.mark.asyncio
async def test_lifespan_startup_and_shutdown():
    """
    Verify application lifespan initializes driver and shuts down cleanly.
    """
    from app.main import lifespan
    from app.core.config import get_settings

    test_settings = get_settings()
    app_mock = create_app()

    with patch.object(db, "connect", new_callable=AsyncMock) as mock_connect, \
         patch.object(db, "close", new_callable=AsyncMock) as mock_close:

        async with lifespan(app_mock):
            mock_connect.assert_awaited_once_with(test_settings)
            assert not mock_close.called

        mock_close.assert_awaited_once()


# ---------------------------------------------------------
# Integration Tests (Requires a live running Neo4j instance)
# ---------------------------------------------------------

@pytest.mark.integration
@pytest.mark.asyncio
async def test_live_neo4j_health_check():
    """
    Integration test against a live Neo4j database container.
    Skipped unless explicitly requested or when live Neo4j is available.
    """
    from app.main import app
    from app.core.config import get_settings

    settings = get_settings()

    # Attempt real connection
    try:
        await db.connect(settings)
    except Exception as exc:
        pytest.skip(f"Live Neo4j instance is not running: {exc}")

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")
            assert response.status_code == 200
            assert response.json() == {"status": "healthy", "database": "connected"}
    finally:
        await db.close()
