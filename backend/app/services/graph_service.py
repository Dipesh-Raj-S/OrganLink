import logging
from typing import Any, Dict, List, Optional

from neo4j import AsyncDriver

from app.core.exceptions import NotFoundException
from app.repositories.graph_repository import GraphRepository
from app.schemas.graph import GraphEdgeData, GraphNodeData, MatchGraphResponse

logger = logging.getLogger("organ_network.graph_service")


class GraphService:
    """
    Service layer assembling the Phase 6 match visualization subgraph from the
    actual Neo4j relationships: PROPOSED_IN, FOR_RECIPIENT, REQUESTED_BY,
    RESOLVED_IN, ALLOCATED_IN, and REGISTERED_AT. Read-only; nothing is mutated.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.repo = GraphRepository(driver)

    async def get_match_graph(self, match_id: str) -> MatchGraphResponse:
        data: Optional[Dict[str, Any]] = await self.repo.get_match_subgraph(match_id)
        if not data:
            raise NotFoundException(
                message=f"MatchRequest with ID '{match_id}' not found.",
                code="MATCH_REQUEST_NOT_FOUND",
            )

        nodes = [
            GraphNodeData(
                id=item["id"],
                label=item["label"],
                type=item["type"],
                properties=item["properties"],
            )
            for item in data["nodes"]
        ]

        def find_id(key: str) -> Optional[str]:
            for item in data["nodes"]:
                if key in item["keys"]:
                    return item["id"]
            return None

        match_request_id = find_id("match_request") or match_id
        donor_id = find_id("donor")
        allocated_donor_id = find_id("allocated_donor")
        recipient_id = find_id("recipient")
        hospital_id = find_id("hospital")
        allocation_id = find_id("allocation")
        donor_hospital_id = find_id("donor_hospital")
        recipient_hospital_id = find_id("recipient_hospital")

        edge_rows: List[Dict[str, str]] = []
        if donor_id:
            edge_rows.append({"source": donor_id, "target": match_request_id, "relationship": "PROPOSED_IN"})
        if recipient_id:
            edge_rows.append({"source": match_request_id, "target": recipient_id, "relationship": "FOR_RECIPIENT"})
        if hospital_id:
            edge_rows.append({"source": match_request_id, "target": hospital_id, "relationship": "REQUESTED_BY"})
        if allocation_id:
            edge_rows.append({"source": match_request_id, "target": allocation_id, "relationship": "RESOLVED_IN"})
        if allocated_donor_id and allocation_id:
            edge_rows.append({"source": allocated_donor_id, "target": allocation_id, "relationship": "ALLOCATED_IN"})
        if donor_id and donor_hospital_id:
            edge_rows.append({"source": donor_id, "target": donor_hospital_id, "relationship": "REGISTERED_AT"})
        if recipient_id and recipient_hospital_id:
            edge_rows.append({"source": recipient_id, "target": recipient_hospital_id, "relationship": "REGISTERED_AT"})

        edges = [
            GraphEdgeData(
                id=f"{row['source']}->{row['target']}:{row['relationship']}",
                source=row["source"],
                target=row["target"],
                relationship=row["relationship"],
            )
            for row in edge_rows
        ]

        return MatchGraphResponse(match_id=match_request_id, nodes=nodes, edges=edges)
