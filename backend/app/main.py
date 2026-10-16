import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.db import db
from app.core.exceptions import AppException
from app.routers import allocations, auth, donors, hospitals, matching, recipients


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
        description=(
            "Graph-based matching network backend connecting donors, recipients, and hospitals. "
            "[Development Mode: Unauthenticated CRUD operations for Phase 3]"
        ),
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

    # --------------------------------------------------------------------------
    # Global Exception Handlers (Standard Error Contract)
    # --------------------------------------------------------------------------
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        # Format field error descriptions cleanly
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed.",
                    "details": errors,
                }
            },
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        code = "HTTP_ERROR"
        if exc.status_code == 404:
            code = "RESOURCE_NOT_FOUND"
        elif exc.status_code == 503:
            code = "SERVICE_UNAVAILABLE"
        elif exc.status_code == 400:
            code = "BAD_REQUEST"
        elif exc.status_code == 409:
            code = "CONFLICT_ERROR"

        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": code,
                    "message": str(exc.detail),
                    "details": None,
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled server exception on %s %s: %s", request.method, request.url.path, str(exc), exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected server error occurred.",
                    "details": None,
                }
            },
        )

    # --------------------------------------------------------------------------
    # Include CRUD, Auth, Matching & Allocation Routers under API_PREFIX (/api/v1)
    # --------------------------------------------------------------------------
    app.include_router(auth.router, prefix=settings.API_PREFIX)
    app.include_router(donors.router, prefix=settings.API_PREFIX)
    app.include_router(recipients.router, prefix=settings.API_PREFIX)
    app.include_router(hospitals.router, prefix=settings.API_PREFIX)
    app.include_router(matching.router, prefix=settings.API_PREFIX)
    app.include_router(allocations.router, prefix=settings.API_PREFIX)


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
