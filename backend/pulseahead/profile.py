"""Fictional hospital profile. Plain data only; every value is a disclosed demo assumption."""

from __future__ import annotations

from typing import Any

PROFILE_ID = "fictional-ed-24"

URGENCY_GROUPS = ("urgent", "medium", "lower")
URGENCY_MIX = {"urgent": 0.10, "medium": 0.40, "lower": 0.50}
URGENCY_RANK = {"urgent": 0, "medium": 1, "lower": 2}

ZONES = (
    {"id": 1, "key": "arrival", "name": "Arrival and triage"},
    {"id": 2, "key": "assessment", "name": "Doctor assessment"},
    {"id": 3, "key": "diagnostics", "name": "Diagnostics and testing"},
    {"id": 4, "key": "disposition", "name": "Disposition"},
)

PROFILE: dict[str, Any] = {
    "id": PROFILE_ID,
    "name": "Fictional ED (synthetic)",
    "synthetic": True,
    "regular_spaces": 24,
    "clinician_slots": 4,
    "owners": {
        "ed_spaces": "ED attending lead",
        "clinician_slots": "ED attending lead",
    },
    "assumptions": {
        "arrival_rate_per_hour_average": 6.0,
        "arrival_rate_variation": 0.30,
        "triage_dwell_minutes": {"min": 3, "mode": 5, "max": 8},
        "active_assessment_minutes": {"min": 5, "mode": 10, "max": 20},
        "disposition_processing_minutes": {"min": 6, "mode": 10, "max": 16},
        "urgency_mix": URGENCY_MIX,
        "note": (
            "Fictional operational assumptions for the demo. They are not hospital staffing "
            "ratios or validated clinical thresholds. Triage and discharge have no finite "
            "resource yet; later tickets add them."
        ),
    },
    "congestion_rule": {
        "available_spaces": 0,
        "awaiting_space_at_least": 6,
        "confirm_after_minutes": 20,
        "clear_when_awaiting_below": 3,
        "clear_after_minutes": 10,
    },
}

SCENARIOS = {
    "normal": {"id": "normal", "name": "Normal shift", "rate_multiplier": 1.0},
}
