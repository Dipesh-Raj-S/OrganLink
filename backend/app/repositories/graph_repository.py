import logging
from typing import Any, Dict, List, Optional
from neo4j import AsyncDriver

logger = logging.getLogger("organ_network.graph_repo")

MATCH_SUBGRAPH_QUERY = """
MATCH (m:MatchRequest {match_id: $match_id})
OPTIONAL MATCH (d:Donor)-[:PROPOSED_IN]->(m)
OPTIONAL MATCH (m)-[:FOR_RECIPIENT]->(r:Recipient)
OPTIONAL MATCH (m)-[:REQUESTED_BY]->(h:Hospital)
OPTIONAL MATCH (m)-[:RESOLVED_IN]->(a:Allocation)
OPTIONAL MATCH (ad:Donor)-[:ALLOCATED_IN]->(a)
OPTIONAL MATCH (d)-[:REGISTERED_AT]->(dh:Hospital)
OPTIONAL MATCH (r)-[:REGISTERED_AT]->(rh:Hospital)
RETURN m, d, r, h, a, ad, dh, rh
"""

# Query columns -> semantic keys for edge assembly. Semantic keys can repeat
# on one node when hospitals are shared (h/dh/rh).
_KEY_BY_COLUMN = {
    "m": "match_request",
    "d": "donor",
    "r": "recipient",
    "h": "hospital",
    "a": "allocation",
    "ad": "allocated_donor",
    "dh": "donor_hospital",
    "rh": "recipient_hospital",
}


class GraphRepository:
    """
    Data access for Phase 6 graph visualization: reads the real relationship
    structure of one MatchRequest subgraph without mutating anything.
    """

    def __init__(self, driver: AsyncDriver) -> None:
        self.driver = driver

    async def get_match_subgraph(self, match_id: str) -> Optional[Dict[str, Any]]:
        """Assembles the subgraph rows; returns None when the MatchRequest does not exist."""
        async with self.driver.session() as session:
            res = await session.run(MATCH_SUBGRAPH_QUERY, match_id=match_id)
            record = await res.single()
            if not record or record["m"] is None:
                return None

            # Deduplicate identical nodes while accumulating which semantic keys
            # each node fulfills (a single hospital may be h + dh + rh).
            nodes: List[Dict[str, Any]] = []
            index_by_identity: Dict[Any, int] = {}

            for column, type_key in _KEY_BY_COLUMN.items():
                node = record[column]
                if node is None:
                    continue

                ident = _business_identity(node)
                lookups = ident["keys"]
                lookups.append(type_key)
                identity = ident["identity"]

                if identity in index_by_identity:
                    merge_keys = nodes[index_by_identity[identity]]["keys"]
                    for k in lookups:
                        if k not in merge_keys:
                            merge_keys.append(k)
                else:
                    index_by_identity[identity] = len(nodes)
                    nodes.append(
                        {
                            "id": ident["id"],
                            "label": ident["label"],
                            "type": ident["type"],
                            "properties": {
                                k: _to_json_safe(v) for k, v in dict(node).items()
                            },
                            "keys": lookups,
                        }
                    )

            return {"nodes": nodes}


def _to_json_safe(value: Any) -> Any:
    """
    Converts Neo4j temporal/spatial values (neo4j.time.DateTime etc.) into
    JSON-serializable primitives for graph node properties.
    """
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {k: _to_json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_json_safe(v) for v in value]
    iso = getattr(value, "iso_format", None) or getattr(value, "isoformat", None)
    if callable(iso):
        return iso()
    return str(value)


def _business_identity(node: Any) -> Dict[str, Any]:
    """Maps a Neo4j node to its business id, display label, type, and identity key."""
    label_values = node.labels
    if "Donor" in label_values:
        return {
            "id": node["donor_id"],
            "label": node.get("name", node["donor_id"]),
            "type": "DONOR",
            "keys": [],
            "identity": ("DONOR", node["donor_id"]),
        }
    if "Recipient" in label_values:
        return {
            "id": node["recipient_id"],
            "label": node.get("name", node["recipient_id"]),
            "type": "RECIPIENT",
            "keys": [],
            "identity": ("RECIPIENT", node["recipient_id"]),
        }
    if "Hospital" in label_values:
        return {
            "id": node["hospital_id"],
            "label": node.get("name", node["hospital_id"]),
            "type": "HOSPITAL",
            "keys": [],
            "identity": ("HOSPITAL", node["hospital_id"]),
        }
    if "MatchRequest" in label_values:
        return {
            "id": node["match_id"],
            "label": f"Match Request {node['match_id']}",
            "type": "MATCH_REQUEST",
            "keys": [],
            "identity": ("MATCH_REQUEST", node["match_id"]),
        }
    if "Allocation" in label_values:
        return {
            "id": node["allocation_id"],
            "label": f"Allocation {node['allocation_id']}",
            "type": "ALLOCATION",
            "keys": [],
            "identity": ("ALLOCATION", node["allocation_id"]),
        }
    return {
        "id": node.element_id,
        "label": "(unknown)",
        "type": "UNKNOWN",
        "keys": [],
        "identity": ("UNKNOWN", node.element_id),
    }
