from typing import Any, Dict, List
from pydantic import BaseModel, Field


class GraphNodeData(BaseModel):
    """A single Neo4j node in the match subgraph visualization."""

    id: str = Field(..., description="Business identifier of the entity (donor_id, recipient_id, ...)")
    label: str = Field(..., description="Human-readable display label")
    type: str = Field(..., description="Entity kind: DONOR | RECIPIENT | HOSPITAL | MATCH_REQUEST | ALLOCATION")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Actual stored node properties")


class GraphEdgeData(BaseModel):
    """A single Neo4j relationship between two nodes of the match subgraph."""

    id: str = Field(..., description="Deterministic edge identifier (source->target:REL_TYPE)")
    source: str = Field(..., description="Source node business identifier")
    target: str = Field(..., description="Target node business identifier")
    relationship: str = Field(..., description="Actual Neo4j relationship type (e.g. PROPOSED_IN)")


class MatchGraphResponse(BaseModel):
    """Subgraph for one MatchRequest, assembled from the real graph edges."""

    match_id: str
    nodes: List[GraphNodeData] = Field(default_factory=list)
    edges: List[GraphEdgeData] = Field(default_factory=list)
