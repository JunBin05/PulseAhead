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


# -- ranking (ticket 17, lite) --------------------------------------------------------------------
MIN_URGENT_FUTURES = 20
URGENT_WAIT_LIMIT_MIN = 5.0  # mean change in urgent initial wait must be at most this (fictional demo assumption)
OVERDUE_LIMIT = 0.0  # mean change in the overdue-urgent count must be at most this
Z90 = 1.645
MARGIN_MIN = 5.0

LABEL_TEXT = {
    "best_action": "Best action: supported saving and the urgent-delay check passed.",
    "supported_not_top": "Benefit supported, but another action ranks above it.",
    "no_action_shown_to_help": "No action shown to help: the saving is not supported (its 90% lower bound is not above 0).",
    "needs_review": "Needs review: too few futures with a complete urgent outcome to check urgent delay.",
    "urgent_delay_check_failed": "Urgent delay check failed: urgent patients wait longer or more of them wait over 15 minutes.",
    "cannot_assess": "Cannot assess: essential data is missing or stale.",
    "not_feasible": "Not feasible now.",
}


def resource_hours(s: dict[str, Any]) -> float:
    """Reserve unit committed from approval to the end of its active window, in hours."""
    return round((s["review_min"] + s["setup_min"] + s["active_min"]) / 60.0, 3)


def rank_row(feasible: bool, assessable: bool, comp: dict[str, Any] | None) -> dict[str, Any]:
    """One action's label from its paired comparison. Never a forced winner: every branch except
    best_action is a statement that the evidence does not support acting on this action's account."""
    rule: dict[str, Any] = {
        "min_urgent_futures": MIN_URGENT_FUTURES, "urgent_wait_limit_min": URGENT_WAIT_LIMIT_MIN,
        "overdue_limit": OVERDUE_LIMIT, "z": Z90,
    }
    if not assessable:
        return {"label": "cannot_assess", "text": LABEL_TEXT["cannot_assess"], "rule": rule}
    if not feasible or comp is None:
        return {"label": "not_feasible", "text": LABEL_TEXT["not_feasible"], "rule": rule}
    sav, uw, od = comp["total_saving_patient_min"], comp["urgent_initial_wait_change_min"], comp["overdue_urgent_change"]
    n_urgent = comp["futures_with_complete_urgent_outcome"]
    rule.update({
        "urgent_futures": n_urgent, "urgent_wait_change_mean": uw["mean"], "overdue_change_mean": od["mean"],
        "saving_mean": sav["mean"], "saving_lower_90": sav["lower_90"], "futures": sav["n"],
    })
    if n_urgent < MIN_URGENT_FUTURES:
        label = "needs_review"
    elif (uw["mean"] or 0.0) > URGENT_WAIT_LIMIT_MIN or (od["mean"] or 0.0) > OVERDUE_LIMIT:
        label = "urgent_delay_check_failed"
    elif (sav["mean"] or 0.0) > 0 and sav["lower_90"] is not None and sav["lower_90"] > 0:
        label = "best_action"
    else:
        label = "no_action_shown_to_help"
    return {"label": label, "text": LABEL_TEXT[label], "rule": rule}


def order_rows(rows: list[dict[str, Any]]) -> None:
    """Sorts rows in place: feasibility, urgent check, supported saving, resource-hours. Only the top
    supported action keeps best_action; another supported one reads 'benefit supported, ranked below'."""

    def key(r: dict[str, Any]) -> tuple:
        rk = r["rank"]
        lb = rk["rule"].get("saving_lower_90")
        urgent_ok = rk["label"] not in ("urgent_delay_check_failed", "needs_review")
        return (
            0 if r["feasible"] and rk["label"] not in ("cannot_assess", "not_feasible") else 1,
            0 if urgent_ok else 1,
            -(lb if lb is not None else -1e18),
            r["resource_hours"],
            r["id"],
        )

    rows.sort(key=key)
    seen_best = False
    for i, r in enumerate(rows, start=1):
        r["order"] = i
        if r["rank"]["label"] == "best_action":
            if seen_best:
                r["rank"]["label"] = "supported_not_top"
                r["rank"]["text"] = LABEL_TEXT["supported_not_top"]
            seen_best = True


def deadline(fc: dict[str, Any] | None, service: str, t0: float, review_min: float, setup_min: float) -> dict[str, Any]:
    """Latest start of this action: the lower onset bound minus review, setup and a margin."""
    base = {"review_min": review_min, "setup_min": setup_min, "margin_min": MARGIN_MIN,
            "basis": "this action's own review and setup against the forecast onset of its service"}
    s = (fc or {}).get("services", {}).get(service) if fc and fc.get("status") == "ok" else None
    if s is None:
        return {**base, "status": "unavailable", "latest_start_min": None}
    if s.get("kind") == "recovery":
        return {**base, "status": "recovery", "latest_start_min": None}
    onset = s.get("onset")
    if s.get("kind") != "new_onset" or not onset:
        return {**base, "status": "unavailable", "latest_start_min": None}
    latest = onset["low_min"] - review_min - setup_min - MARGIN_MIN
    return {**base, "status": "open" if latest >= t0 else "too_late", "latest_start_min": round(latest, 1),
            "in_min": round(latest - t0, 1)}
