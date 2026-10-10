"""Local zone overload, evaluated separately from the overall ED congestion rule.

Each service (triage desk, doctor assessment, staffed ED space, lab, imaging, discharge, ward
allocation, transport, ward/ICU beds) has its own waiting queue and its own episode. Local overload
is confirmed when its queue reaches the threshold, or necessary capacity is unavailable while eligible
work waits, continuously for ten minutes. It clears only after the queue is below the threshold with
required capacity available for five continuous minutes. Missing inputs cannot establish recovery.

Everything here is plain data: the engine hands in a reading per service each simulated minute.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .profile import PROFILE

# service id -> descriptor. `threshold` None means the service has no queue-length trigger (it only
# alarms on unavailable capacity). Thresholds are the spec's initial demo values.
SERVICES: dict[str, dict[str, Any]] = {
    "triage": {
        "zone": 1, "name": "Triage desk", "category": "triage_arrival",
        "threshold": PROFILE["local_rule"]["thresholds"]["triage"], "queue_label": "waiting for triage",
    },
    "assessment": {
        "zone": 2, "name": "Doctor assessment", "category": "physician_space",
        "threshold": PROFILE["local_rule"]["thresholds"]["assessment"],
        "queue_label": "waiting for a doctor (assessment or result review)",
    },
    "space": {
        "zone": 2, "name": "Staffed ED space", "category": "physician_space",
        "threshold": None, "queue_label": "waiting for a staffed space",
    },
    "lab": {
        "zone": 3, "name": "Lab", "category": "lab_imaging",
        "threshold": PROFILE["local_rule"]["thresholds"]["lab"], "queue_label": "waiting for the lab",
    },
    "imaging": {
        "zone": 3, "name": "Imaging", "category": "lab_imaging",
        "threshold": PROFILE["local_rule"]["thresholds"]["imaging"], "queue_label": "waiting for imaging",
    },
    "discharge": {
        "zone": 4, "name": "Discharge processing", "category": "departure_ward_transport",
        "threshold": PROFILE["local_rule"]["thresholds"]["discharge"], "queue_label": "waiting for discharge",
    },
    "allocation": {
        "zone": 4, "name": "Ward allocation", "category": "departure_ward_transport",
        "threshold": PROFILE["local_rule"]["thresholds"]["allocation"],
        "queue_label": "waiting for ward allocation",
    },
    "transport": {
        "zone": 4, "name": "Transport", "category": "departure_ward_transport",
        "threshold": PROFILE["local_rule"]["thresholds"]["transport"], "queue_label": "waiting for transport",
    },
    "ward_beds": {
        "zone": 4, "name": "Ward/ICU beds", "category": "departure_ward_transport",
        "threshold": None, "queue_label": "waiting for a suitable bed",
    },
}

CATEGORY_LABEL = {
    "triage_arrival": "Triage / arrival pressure",
    "physician_space": "Physician / staffed-space constraint",
    "lab_imaging": "Lab / imaging delay",
    "departure_ward_transport": "Departure / ward / transport blockage",
    "mixed": "Mixed",
}


@dataclass
class ServiceState:
    state: str = "normal"  # normal | building | overloaded
    onset_min: float | None = None
    confirmed_min: float | None = None
    below_since_min: float | None = None
    unknown: bool = False
    last_queue: int = 0
    last_capacity_unavailable: bool = False
    episodes: list[dict[str, Any]] = field(default_factory=list)


class LocalMonitor:
    def __init__(self) -> None:
        self.services: dict[str, ServiceState] = {sid: ServiceState() for sid in SERVICES}

    def tick(self, now: float, readings: dict[str, dict[str, Any]]) -> None:
        rule = PROFILE["local_rule"]
        for sid, spec in SERVICES.items():
            r = readings[sid]
            st = self.services[sid]
            if not r["inputs_ok"]:
                # Missing inputs: nothing is established. A building interval is no longer
                # continuous and recovery time cannot accrue.
                st.unknown = True
                st.below_since_min = None
                if st.state == "building":
                    st.state, st.onset_min = "normal", None
                continue
            st.unknown = False
            queue = int(r["queue"])
            st.last_queue = queue
            st.last_capacity_unavailable = bool(r["capacity_unavailable"])
            threshold = spec["threshold"]
            over = threshold is not None and queue >= threshold
            blocked = bool(r["capacity_unavailable"]) and queue >= 1
            condition = over or blocked
            if st.state == "normal":
                if condition:
                    st.state, st.onset_min = "building", now
            elif st.state == "building":
                if not condition:
                    st.state, st.onset_min = "normal", None
                elif now - (st.onset_min or now) >= rule["confirm_after_minutes"]:
                    st.state, st.confirmed_min = "overloaded", now
                    st.episodes.append({"onset_min": st.onset_min, "confirmed_min": now, "cleared_min": None})
            else:  # overloaded
                # Clear only with the queue below its threshold and required capacity available.
                clear_ok = (not over) and (not r["capacity_unavailable"])
                if clear_ok:
                    if st.below_since_min is None:
                        st.below_since_min = now
                    elif now - st.below_since_min >= rule["clear_after_minutes"]:
                        st.episodes[-1]["cleared_min"] = now
                        st.state = "normal"
                        st.onset_min = st.confirmed_min = st.below_since_min = None
                else:
                    st.below_since_min = None

    # -- read model ----------------------------------------------------------------------
    def zone_state(self, zone: int) -> str:
        """overloaded > building > unknown > normal (a known problem outranks a gap in inputs)."""
        sts = [s for sid, s in self.services.items() if SERVICES[sid]["zone"] == zone]
        if any(s.state == "overloaded" for s in sts):
            return "overloaded"
        if any(s.state == "building" for s in sts):
            return "building"
        if any(s.unknown for s in sts):
            return "unknown"
        return "normal"
