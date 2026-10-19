"""
One-time, idempotent data cleanup: strips the legacy "Synthetic Donor " and
"Synthetic Recipient " prefixes from already-seeded name properties.

Only the `name` property of Donor/Recipient nodes whose value STARTS WITH the
exact prefix is rewritten; every other property, node, and relationship is
left untouched. Running the script more than once is safe (subsequent runs
match zero nodes).

Usage:
    python scripts/cleanup_synthetic_name_prefixes.py
"""

import asyncio
import sys
from pathlib import Path

# Ensure backend root is in python path
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings
from app.core.db import db

PREFIXES = {
    "Donor": "Synthetic Donor ",
    "Recipient": "Synthetic Recipient ",
}


async def cleanup() -> dict:
    settings = get_settings()
    await db.connect(settings)
    driver = db.driver

    results = {}
    try:
        async with driver.session() as session:
            for label, prefix in PREFIXES.items():
                res = await session.run(
                    f"""
                    MATCH (n:{label})
                    WHERE n.name STARTS WITH $prefix
                    SET n.name = trim(substring(n.name, size($prefix)))
                    RETURN count(n) AS updated
                    """,
                    prefix=prefix,
                )
                record = await res.single()
                results[label] = record["updated"]

                check = await session.run(
                    f"""
                    MATCH (n:{label})
                    WHERE n.name STARTS WITH $prefix
                    RETURN count(n) AS remaining
                    """,
                    prefix=prefix,
                )
                remaining = (await check.single())["remaining"]
                assert remaining == 0, f"{label}: {remaining} prefixed names remain"

        for label, updated in results.items():
            print(f"{label}: {updated} name(s) cleaned")
        return results
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(cleanup())
