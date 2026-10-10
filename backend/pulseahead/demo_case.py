"""Demo-case support: which received pressures an alert rests on, and the demo case itself.

Nothing here touches the engine or its hidden future. `drivers()` is a pure function of a received
snapshot and a forecast response. The demo case is a development/tuning seed chosen by
`demo_scan.py`; its counts-based baseline is read from a no-action replay of the same seed and is a
retrospective simulation result, never information the operator had at that moment.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from .pressure import SERVICES
from .profile import SCENARIOS

CASE_FILE = Path(__file__).with_name("demo_case.json")

# Disclosed presentation rules. They were fixed before the scan ran and are not model parameters.
DRIVER_RULES: dict[str, dict[str, Any]] = {
    "boarding": {
        "label": "Blocked departures (boarding, no suitable ward/ICU bed)",
        "min_boarding": 3,
        "rule": "At least 3 decided Ward/ICU patients are boarding, and at least one is waiting for a "
                "bed of a type with no free bed.",
    },
    "diagnostics": {
        "label": "Diagnostic delay",
        "min_queue": 2,
        "rule": "A lab or imaging queue of at least 2, with received demand above capacity "
                "(lambda > mu) or a received turnaround slower than the model's prior.",
    },
    "arrivals": {
        "label": "Announced arrivals",
        "min_patients": 2,
        "window_min": 30,
        "rule": "At least 2 patients on announced ambulances with a received ETA in the next 30 minutes.",
    },
}


def drivers(snapshot: dict[str, Any], forecast: dict[str, Any] | None) -> dict[str, Any]:
    """Only the pressures that the received evidence supports under `DRIVER_RULES`."""
    now = snapshot["sim_time_min"]
    out: list[dict[str, Any]] = []
    disp = snapshot["resources"]["disposition"]
    beds = disp["beds"]
    boarding = disp["boarding"]
    waiting_bed = {k: beds[k]["waiting"] for k in ("ward", "icu")}
    free = {k: beds[k]["free"] for k in ("ward", "icu")}
    blocked = [k for k in ("ward", "icu") if waiting_bed[k] > 0 and free[k] == 0]
    if boarding is not None and boarding >= DRIVER_RULES["boarding"]["min_boarding"] and blocked:
        out.append({
            "id": "boarding", "label": DRIVER_RULES["boarding"]["label"], "services": ["ward_beds"],
            "evidence": {
                "boarding_patients": boarding, "waiting_for_suitable_bed": waiting_bed, "free_beds": free,
                "blocked_bed_types": blocked,
            },
            "rule": DRIVER_RULES["boarding"]["rule"],
        })
    scale = ((forecast or {}).get("inputs") or {}).get("turnaround_scale") or {}
    diag = snapshot["resources"]["diagnostics"]
    svc_hits = []
    for sid in ("lab", "imaging"):
        d = diag[sid]
        q = d.get("waiting")
        if q is None or q < DRIVER_RULES["diagnostics"]["min_queue"]:
            continue
        rates = snapshot["pressure"]["services"][sid]["rates"]
        slow = (scale.get(sid) or 1.0) > 1.0
        if rates.get("pressure_signal") is True or slow:
            svc_hits.append({
                "service": sid, "name": SERVICES[sid]["name"], "queue": q, "servers": d["servers"],
                "received_per_hour": rates.get("received_per_hour"), "capacity_per_hour": rates.get("capacity_per_hour"),
                "demand_above_capacity": rates.get("pressure_signal") is True,
                "turnaround_scale": scale.get(sid), "median_turnaround_min": d.get("median_turnaround_min"),
            })
    if svc_hits:
        out.append({
            "id": "diagnostics", "label": DRIVER_RULES["diagnostics"]["label"],
            "services": [h["service"] for h in svc_hits], "evidence": {"services": svc_hits},
            "rule": DRIVER_RULES["diagnostics"]["rule"],
        })
    w = DRIVER_RULES["arrivals"]["window_min"]
    due = [a for a in snapshot.get("inbound_ambulances", [])
           if a["status"] in ("en_route", "delayed") and now < a["eta_min"] <= now + w]
    pts = sum(a["patient_count"] for a in due)
    if pts >= DRIVER_RULES["arrivals"]["min_patients"]:
        out.append({
            "id": "arrivals", "label": DRIVER_RULES["arrivals"]["label"], "services": [],
            "evidence": {
                "ambulances": len(due), "patients": pts, "window_min": w,
                "etas_in_min": sorted(round(a["eta_min"] - now, 1) for a in due),
            },
            "rule": DRIVER_RULES["arrivals"]["rule"],
        })
    return {"supported_count": len(out), "drivers": out, "rules": DRIVER_RULES, "sim_time_min": now}


# -- the case ----------------------------------------------------------------------------------------
_lock = threading.Lock()
_cache: dict[str, Any] = {}


def load_case_file() -> dict[str, Any] | None:
    if not CASE_FILE.is_file():
        return None
    return json.loads(CASE_FILE.read_text(encoding="utf-8"))


def _retrospective(rec: dict[str, Any]) -> dict[str, Any]:
    """The same seed with no action: the episode's own onset by the local threshold."""
    from .replay import ReplaySession

    key = rec["service"]
    s = ReplaySession(rec["seed"], rec["scenario"])
    horizon = rec["alert_time_min"] + 90.0 + 40.0
    t = 0.0
    found = None
    while t < horizon and found is None:
        s.advance(60.0)
        t = s.engine.now
        e = s.engine
        eps = e.monitor.episodes if key == "overall" else e.local.services[key].episodes
        for ep in eps:
            if ep.get("onset_min") is not None and rec["alert_time_min"] < ep["onset_min"] <= rec["alert_time_min"] + 90.0:
                found = ep
                break
    return {
        "kind": "retrospective_no_action_replay",
        "label": "Retrospective simulation result, not information the operator had at that moment.",
        "definition": "The counts-based alarm is this episode's own onset by the local threshold (queue at the "
                      "service threshold, or necessary capacity unavailable while work waits).",
        "service": key,
        "onset_min": None if found is None else found["onset_min"],
        "confirmed_min": None if found is None else found.get("confirmed_min"),
    }


def case() -> dict[str, Any]:
    rec = load_case_file()
    if rec is None:
        return {"api_version": "v1", "kind": "demo_case", "available": False,
                "reason": "No demo case qualified in the development/tuning scan (or the scan was not run)."}
    with _lock:
        if "retro" not in _cache or _cache.get("key") != (rec["scenario"], rec["seed"], rec["alert_time_min"]):
            _cache["retro"] = _retrospective(rec)
            _cache["key"] = (rec["scenario"], rec["seed"], rec["alert_time_min"])
        retro = _cache["retro"]
    info = SCENARIOS[rec["scenario"]]
    return {
        "api_version": "v1", "kind": "demo_case", "available": True, "synthetic": True,
        "label": "Demo case: a development/tuning seed chosen by scan. Not held-out evidence.",
        "scenario": rec["scenario"], "scenario_name": info["name"], "seed": rec["seed"],
        "partition": rec["partition"], "service": rec["service"], "service_name": rec.get("service_name"),
        "alert_time_min": rec["alert_time_min"], "why": rec["why"], "scan": rec.get("scan"),
        "driver_rules": DRIVER_RULES, "retrospective": retro,
    }
