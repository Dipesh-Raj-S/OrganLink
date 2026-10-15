import logging
from typing import Optional
from neo4j import AsyncGraphDatabase, AsyncDriver
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from app.core.config import Settings

logger = logging.getLogger("organ_network.db")


class Neo4jDatabase:
    """
    Manages the lifecycle and connectivity checks for the asynchronous Neo4j driver.
    """

    def __init__(self) -> None:
        self._driver: Optional[AsyncDriver] = None

    @property
    def driver(self) -> AsyncDriver:
        """Returns the active driver instance or raises an error if not connected."""
        if self._driver is None:
            raise RuntimeError("Database driver is not initialized. Ensure lifespan has started.")
        return self._driver

    async def connect(self, settings: Settings) -> None:
        """
        Initializes the async driver and verifies database connectivity.
        """
        logger.info("Initializing Neo4j async driver for URI: %s", settings.NEO4J_URI)
        try:
            self._driver = AsyncGraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                max_connection_lifetime=3600,
            )
            # Verify connectivity immediately at startup
            await self.verify_connectivity()
            logger.info("Successfully established connection to Neo4j database.")
        except Exception as exc:
            logger.error("Failed to connect to Neo4j: %s", str(exc))
            # Clean up if driver was created partially
            if self._driver:
                await self._driver.close()
                self._driver = None
            raise

    async def verify_connectivity(self) -> bool:
        """
        Executes driver verification and a lightweight query to ensure Neo4j is truly operational.
        Returns True if reachable, raises exception otherwise.
        """
        if self._driver is None:
            raise ServiceUnavailable("Neo4j driver is not initialized.")

        # verify_connectivity verifies the connection pool and authentication
        await self._driver.verify_connectivity()

        # Run a simple query to confirm Cypher execution readiness
        async with self._driver.session() as session:
            result = await session.run("RETURN 1 AS ping")
            record = await result.single()
            if not record or record["ping"] != 1:
                raise ServiceUnavailable("Unexpected response from Neo4j ping check.")

        return True

    async def close(self) -> None:
        """
        Closes the Neo4j driver connection pool gracefully on application shutdown.
        """
        if self._driver is not None:
            logger.info("Closing Neo4j async driver connection pool...")
            await self._driver.close()
            self._driver = None
            logger.info("Neo4j driver closed successfully.")


# Global database manager instance
db = Neo4jDatabase()


async def get_db_driver() -> AsyncDriver:
    """FastAPI dependency to retrieve the active driver."""
    return db.driver
