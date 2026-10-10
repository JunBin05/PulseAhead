"""Staff-approved action presets: what exists, who must approve, and whether one can help now.

Plain data and pure functions of a received snapshot. Nothing here touches the engine or the hidden
replay future. Two presets are built in the final build (spec "Scope amendment"); the rest of the
catalog is listed as not modeled and cannot be requested.
"""

from __future__ import annotations

from typing import Any

from .profile import PROFILE

REVIEW_MIN = 5.0
ACTIVE_MIN = 60.0
NOT_MODELED_REASON = "Not modeled in this build."

PRESETS: dict[str, dict[str, Any]] = {
    "ward_coordination": {
        "name": "Ward coordination",
        "summary": "Use the declared reserve ward-allocation coordinator to add one ward-allocation work slot.",
        "targets": {"allocation": {"reserve": "ward_allocation_coordinator", "zone": 4, "setup_min": 10.0}},
        "effect": "One extra ward-allocation slot. It never creates a ward bed or a clinical clearance.",
    },
    "diagnostic_reserve": {
        "name": "Diagnostic reserve slot",
        "summary": "Use one declared reserve lab slot or reserve imaging slot.",
        "targets": {
            "lab": {"reserve": "lab_reserve_slot", "zone": 3, "setup_min": 15.0},
            "imaging": {"reserve": "imaging_reserve_slot", "zone": 3, "setup_min": 15.0},
        },
        "effect": "One extra slot of the chosen service. Tests are never shortened and results never manufactured.",
    },
}

NOT_MODELED: list[dict[str, str]] = [
    {"id": "cleared_discharge", "name": "Cleared discharge support", "reason": NOT_MODELED_REASON},
    {"id": "staffed_surge_spaces", "name": "Staffed surge spaces", "reason": NOT_MODELED_REASON},
    {"id": "surge_triage_desk", "name": "Surge triage desk", "reason": NOT_MODELED_REASON},
    {"id": "reserve_physician", "name": "Reserve physician assessment capacity", "reason": NOT_MODELED_REASON},
    {"id": "diagnostic_reallocation", "name": "Diagnostic reallocation from another service", "reason": NOT_MODELED_REASON},
]

DEMO_COORDINATOR = "ED shift coordinator"


def demo_roles() -> list[str]:
    """The demo-role switcher: the coordinator (may request, never approves) and every resource owner."""
    owners = sorted({PROFILE["owners"][r["owner_key"]] for r in PROFILE["reserves"].values()})
    return [DEMO_COORDINATOR, *owners]


def spec(preset: str, target: str | None) -> dict[str, Any]:
    """The resolved preset+target, or raises KeyError/ValueError for something that cannot be requested."""
    p = PRESETS[preset]
    if target is None and len(p["targets"]) == 1:
        target = next(iter(p["targets"]))
    if target not in p["targets"]:
        raise ValueError(f"{preset} needs a target of {', '.join(p['targets'])}")
    t = p["targets"][target]
    reserve = PROFILE["reserves"][t["reserve"]]
    return {
        "preset": preset, "name": p["name"], "target": target, "service": reserve["service"],
        "unit": reserve["unit"], "reserve": t["reserve"], "zone": t["zone"],
        # Approvers come from the owner of the resource the action adds capacity to, never the clicked zone.
        "owners": [PROFILE["owners"][reserve["owner_key"]]],
        "review_min": REVIEW_MIN, "setup_min": t["setup_min"], "active_min": ACTIVE_MIN,
        "effect": p["effect"],
    }


def all_specs() -> list[dict[str, Any]]:
    return [spec(pid, tid) for pid, p in PRESETS.items() for tid in p["targets"]]


def eligibility(snapshot: dict[str, Any], s: dict[str, Any], in_flight: bool) -> dict[str, Any]:
    """Whether this action can help now, from received state only. Reasons are plain and specific."""
    reasons: list[str] = []
    if in_flight:
        reasons.append("Another action is already in flight (one at a time).")
    patients = snapshot["patients"]
    if s["service"] == "allocation":
        waiting = [p for p in patients if p["phase"] == "awaiting_ward_allocation" and p["decision_received"]]
        bed_wait = [p for p in patients if p["phase"] == "awaiting_ward_bed" and p["decision_received"]]
        if not waiting:
            if bed_wait:
                reasons.append(
                    f"{len(bed_wait)} decided Ward/ICU patient(s) are waiting for a suitable bed, not for allocation "
                    "work: another allocation slot cannot help them and never creates a bed."
                )
            else:
                reasons.append("No decided Ward/ICU patient is waiting for allocation work.")
    else:
        d = snapshot["resources"]["diagnostics"][s["service"]]
        waiting = d.get("waiting")
        if waiting is None:
            reasons.append("This service's feed is not current; its queue cannot be assessed.")
        elif waiting < 1:
            reasons.append(f"No patient is waiting for {s['service']}: an extra slot has no queue to serve.")
    if PROFILE["reserves"][s["reserve"]]["active"] is not False:
        reasons.append("The declared reserve is not available.")
    return {"feasible": not reasons, "reasons": reasons}
