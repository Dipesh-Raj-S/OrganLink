from fastapi import APIRouter, Depends, status
from neo4j import AsyncDriver

from app.core.db import get_db_driver
from app.core.dependencies import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.graph import MatchGraphResponse
from app.services.graph_service import GraphService

router = APIRouter(prefix="/graph", tags=["Graph Visualization"])


def get_graph_service(driver: AsyncDriver = Depends(get_db_driver)) -> GraphService:
    return GraphService(driver)


@router.get(
    "/matches/{match_id}",
    response_model=MatchGraphResponse,
    status_code=status.HTTP_200_OK,
    summary="Visualization subgraph for one match request",
    description=(
        "Returns the nodes and real relationship types (PROPOSED_IN, FOR_RECIPIENT, "
        "REQUESTED_BY, RESOLVED_IN, ALLOCATED_IN, REGISTERED_AT) forming the "
        "MatchRequest subgraph, for visualization. Read-only; requires authentication."
    ),
)
async def get_match_graph(
    match_id: str,
    service: GraphService = Depends(get_graph_service),
    current_user: UserResponse = Depends(get_current_user),
) -> MatchGraphResponse:
    return await service.get_match_graph(match_id)
