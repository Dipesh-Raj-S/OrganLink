import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.db import db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("organ_network.main")


class HealthResponse(BaseModel):
    """Schema for health response."""
    status: str
    database: str


class RootResponse(BaseModel):
    """Schema for root endpoint response."""
    application: str
    version: str
    status: str
    environment: str
    docs_url: str
    openapi_url: str


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    FastAPI Lifespan context manager:
    - On Startup: Loads configuration and establishes connection to Neo4j.
    - On Shutdown: Gracefully closes the Neo4j driver connection pool.
    """
    settings = get_settings()
    logger.info("Starting up Organ/Blood Matching Network backend in '%s' mode...", settings.APP_ENV)
    try:
        await db.connect(settings)
    except Exception as exc:
        logger.warning(
            "Application started, but Neo4j is not reachable at startup: %s. "
            "Health checks will report 503 until Neo4j is up.",
            str(exc),
        )
    yield
    logger.info("Shutting down Organ/Blood Matching Network backend...")
    await db.close()


def create_app() -> FastAPI:
    """Factory to create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Organ/Blood Donor–Recipient Matching Network API",
        description="Graph-based matching network backend connecting donors, recipients, and hospitals.",
        version="1.0.0",
        docs_url="/docs",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # CORS configuration for frontend development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register root endpoint
    @app.get(
        "/",
        response_model=RootResponse,
        tags=["System"],
        summary="Service information and documentation link",
    )
    async def get_root() -> RootResponse:
        return RootResponse(
            application="Organ/Blood Donor–Recipient Matching Network",
            version="1.0.0",
            status="operational",
            environment=settings.APP_ENV,
            docs_url="/docs",
            openapi_url="/openapi.json",
        )

    # Health check implementation
    async def perform_health_check() -> Dict[str, str]:
        """
        Verifies actual connectivity to the Neo4j graph database.
        Returns 200 with {'status': 'healthy', 'database': 'connected'} if reachable.
        Raises HTTP 503 if Neo4j is down or unreachable without exposing credentials.
        """
        try:
            await db.verify_connectivity()
            return {"status": "healthy", "database": "connected"}
        except Exception as exc:
            logger.error("Health check failed - Database connectivity error: %s", str(exc))
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database unavailable. Service is unhealthy.",
            )

    # Health endpoints: Root level (/health) and API prefix level (/api/v1/health)
    @app.get(
        "/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Database & service connectivity health check",
        responses={
            200: {"description": "System is fully healthy and Neo4j is connected."},
            503: {"description": "Neo4j is disconnected or unreachable."},
        },
    )
    async def health_check() -> Dict[str, str]:
        return await perform_health_check()

    @app.get(
        f"{settings.API_PREFIX}/health",
        response_model=HealthResponse,
        tags=["Health"],
        summary="Prefixed database & service connectivity health check",
        responses={
            200: {"description": "System is fully healthy and Neo4j is connected."},
            503: {"description": "Neo4j is disconnected or unreachable."},
        },
    )
    async def prefixed_health_check() -> Dict[str, str]:
        return await perform_health_check()

    return app


app = create_app()
