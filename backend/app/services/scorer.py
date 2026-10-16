import math
from typing import Any, Dict, Tuple


class MatchScorer:
    """
    Deterministic scoring and ranking engine for candidate donors.
    
    IMPORTANT NON-CLINICAL DISCLAIMER:
    This scoring engine is for academic and demonstration purposes.
    Organ allocation in real-world medicine requires HLA tissue typing,
    panel reactive antibodies (PRA), direct crossmatching, cold ischemia time,
    and board-certified medical triage.
    """

    # Configurable default factor weights (must sum to 1.0)
    DEFAULT_WEIGHTS = {
        "blood_compatibility": 0.40,  # ABO/Rh exact match vs compatible match
        "urgency": 0.35,              # Recipient clinical urgency (1-10 normalized to 10-100)
        "distance": 0.25,             # Logistical transit distance proximity (decay curve)
    }

    # Max distance threshold in km for distance decay calculation
    MAX_DISTANCE_KM = 2500.0

    @staticmethod
    def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculates the great-circle distance between two points on the Earth in kilometers.
        """
        r = 6371.0  # Earth's radius in kilometers
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)

        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return round(r * c, 2)

    @classmethod
    def calculate_score(
        cls,
        donor_blood_type: str,
        recipient_blood_type: str,
        urgency_score: int,
        distance_km: float,
        weights: Dict[str, float] = None,
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Calculates a deterministic 0.0 - 100.0 score with a detailed factor breakdown.

        - Blood component: 100 if exact identical blood type, 80 if compatible donor (e.g. O- to A+).
        - Urgency component: urgency_score (1-10) scaled linearly to 10 - 100.
        - Distance component: Max 100 at 0km, decaying linearly towards 0 at MAX_DISTANCE_KM.
        """
        w = weights or cls.DEFAULT_WEIGHTS

        # 1. Blood compatibility factor (0-100)
        if donor_blood_type == recipient_blood_type:
            blood_comp = 100.0
            blood_note = f"Identical blood type match ({donor_blood_type})"
        else:
            blood_comp = 80.0
            blood_note = f"Compatible universal/compatible blood type ({donor_blood_type} -> {recipient_blood_type})"

        # 2. Urgency factor (1-10 -> 10-100)
        urgency_clamped = max(1, min(10, urgency_score))
        urgency_comp = float(urgency_clamped * 10)

        # 3. Distance proximity factor (0-100)
        dist = max(0.0, distance_km)
        if dist >= cls.MAX_DISTANCE_KM:
            raw_dist_comp = 0.0
        else:
            raw_dist_comp = 100.0 * (1.0 - (dist / cls.MAX_DISTANCE_KM))
        dist_comp = round(raw_dist_comp, 2)

        # Weighted aggregate using full-precision values
        total_score_raw = (
            (blood_comp * w["blood_compatibility"])
            + (urgency_comp * w["urgency"])
            + (raw_dist_comp * w["distance"])
        )
        total_score = round(total_score_raw, 2)

        breakdown = {
            "blood_compatibility_score": blood_comp,
            "urgency_score_component": urgency_comp,
            "distance_score_component": dist_comp,
            "distance_km": dist,
            "weights": w,
            "summary": (
                f"{blood_note}. Urgency level {urgency_clamped}/10 contribution. "
                f"Transit distance: {dist} km."
            ),
        }

        return total_score, breakdown
