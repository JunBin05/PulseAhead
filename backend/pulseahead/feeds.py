"""Received-data layer: source heartbeats, freshness, deduplication and validation of inputs.

Every healthy source sends a heartbeat every five simulated minutes and sends an update whenever
its data changes. The replay clock is a separate aggregate heartbeat: it never makes a stopped
queue, space or staffing feed fresh. A source whose newest valid update is older than ten
simulated minutes is stale, and a stale essential source means Cannot assess.

A fixture may script faults (`feed_faults`: stop, delay, duplicate) and external messages
(`injections`). That schedule is hidden replay future: only what has been received is exposed.
Invalid messages are quarantined with a reason, never applied, and never refresh a source.
Extreme but valid values (a long test, a big ETA move, an arrival burst) are accepted and kept.
"""

from __future__ import annotations

import heapq
import math
from typing import Any

HEARTBEAT_MIN = 5.0
# "Older than ten simulated minutes" is strictly greater than ten.
STALE_AFTER_MIN = 10.0
EPS = 1e-9

# source id -> descriptor. Essential sources decide whether the ED can be assessed at all; optional
# sources carry an explicit limitation when stale.
SOURCES: dict[str, dict[str, Any]] = {
    "queues": {
        "label": "Arrival and doctor queues",
        "essential": True,
        "limitation": "Triage and doctor-assessment queues and patient positions are not current.",
    },
    "spaces": {
        "label": "ED space occupancy",
        "essential": True,
        "limitation": "Occupied spaces and the number awaiting a space are not current.",
    },
    "staffing": {
        "label": "Staff on duty and coverage",
        "essential": True,
        "limitation": "Which nurses are on duty, and so which spaces are staffed, is not current.",
    },
    "diagnostics": {
        "label": "Lab and imaging",
        "essential": False,
        "limitation": "Lab and imaging queues and turnaround are not current; diagnostic delay cannot be assessed.",
    },
    "disposition": {
        "label": "Discharge, ward beds and transport",
        "essential": False,
        "limitation": "Discharge, ward allocation, transport and bed figures are not current.",
    },
    "ambulance": {
        "label": "Inbound ambulance announcements",
        "essential": False,
        "limitation": "Inbound ETAs may be out of date; arrival timing and counts are uncertain.",
    },
}

# Pressure service -> the source whose inputs it needs.
SERVICE_SOURCE = {
    "triage": "queues",
    "assessment": "queues",
    "space": "spaces",
    "lab": "diagnostics",
    "imaging": "diagnostics",
    "discharge": "disposition",
    "allocation": "disposition",
    "transport": "disposition",
    "ward_beds": "disposition",
}

_QUEUE_PHASES = {
    "awaiting_triage",
    "in_triage",
    "assessment_active",
    "awaiting_result_review",
    "result_review_active",
    "awaiting_care_completion",
}
_SPACE_PHASES = {"awaiting_space", "awaiting_clinician", "departed"}
_DIAG_PHASES = {"awaiting_lab", "in_lab", "awaiting_imaging", "in_imaging"}
_DISPO_PHASES = {
    "awaiting_discharge",
    "disposition_processing",
    "awaiting_ward_bed",
    "awaiting_ward_allocation",
    "ward_allocation_active",
    "awaiting_transport",
    "in_transport",
}

# Valid next phases, from the flow model. Anything else is an impossible transition.
ALLOWED_NEXT: dict[str, set[str]] = {
    "awaiting_triage": {"in_triage"},
    "in_triage": {"awaiting_space"},
    "awaiting_space": {"awaiting_clinician"},
    "awaiting_clinician": {"assessment_active"},
    "assessment_active": {
        "awaiting_lab", "awaiting_imaging", "awaiting_result_review", "awaiting_care_completion",
        "awaiting_discharge", "awaiting_ward_bed",
    },
    "awaiting_lab": {"in_lab"},
    "in_lab": {"awaiting_imaging", "awaiting_result_review"},
    "awaiting_imaging": {"in_imaging"},
    "in_imaging": {"awaiting_result_review"},
    "awaiting_result_review": {"result_review_active"},
    "result_review_active": {"awaiting_care_completion", "awaiting_discharge", "awaiting_ward_bed"},
    "awaiting_care_completion": {"awaiting_discharge", "awaiting_ward_bed"},
    "awaiting_discharge": {"disposition_processing"},
    "disposition_processing": {"departed"},
    "awaiting_ward_bed": {"awaiting_ward_allocation"},
    "awaiting_ward_allocation": {"ward_allocation_active"},
    "ward_allocation_active": {"awaiting_transport"},
    "awaiting_transport": {"in_transport"},
    "in_transport": {"departed"},
    "departed": set(),
}

# Extreme but valid values worth flagging (and keeping).
OUTLIER_TEST_MIN = 100.0  # twice the longest disclosed test turnaround
OUTLIER_ETA_SHIFT_MIN = 30.0
OUTLIER_BURST_ARRIVALS = 10  # arrivals within one simulated minute
AMBULANCE_PATIENTS_RANGE = (1, 10)


def event_source(event: dict[str, Any]) -> str:
    """Which feed carries this event."""
    t = event["type"]
    if t == "phase_change":
        to = event["payload"]["to"]
        if to in _SPACE_PHASES:
            return "spaces"
        if to in _DIAG_PHASES:
            return "diagnostics"
        if to in _DISPO_PHASES:
            return "disposition"
        return "queues"
    if t == "test_completed":
        return "diagnostics"
    if t.startswith("staff_"):
        return "staffing"
    if t == "ward_bed_available":
        return "disposition"
    if t.startswith("ambulance_"):
        return "ambulance"
    return "queues"  # arrival, decision_received, care_started, care_completed


class IngestGate:
    """What was received, when, and what was refused."""

    def __init__(self, definition: dict[str, Any]) -> None:
        self.faults: list[dict[str, Any]] = list(definition.get("feed_faults", []))
        self.injections: list[dict[str, Any]] = list(definition.get("injections", []))
        self.received: list[dict[str, Any]] = []
        self._pending: list[tuple[float, int, dict[str, Any]]] = []
        self._seq = 0
        self._seen: set[str] = set()
        self.last_event: dict[str, float] = {}
        self.log: list[dict[str, Any]] = []
        self.counts = {"accepted": 0, "duplicates": 0, "out_of_order": 0, "quarantined": 0, "outliers_kept": 0}
        self._eta: dict[str, float] = {}
        self._arrivals: list[float] = []

    @property
    def has_faults(self) -> bool:
        return bool(self.faults)

    # -- schedule (hidden): pure functions of time -----------------------------------------
    def _active(self, source: str, t: float, kind: str) -> dict[str, Any] | None:
        for f in self.faults:
            if f["source"] == source and f["kind"] == kind and f["start"] <= t + EPS and t < f["end"] - EPS:
                return f
        return None

    def stopped_at(self, source: str, t: float) -> bool:
        return self._active(source, t, "stop") is not None

    def delay_at(self, source: str, t: float) -> float:
        f = self._active(source, t, "delay")
        return float(f["delay_min"]) if f else 0.0

    def observed_as_of(self, source: str, now: float) -> float:
        """Simulated time the newest delivered data describes: now while healthy, the start of a
        stop, or now minus the delay."""
        f = self._active(source, now, "stop")
        if f is not None:
            return f["start"] - 1e-6
        d = self.delay_at(source, now)
        return now - d if d > 0 else now

    # -- delivery of the replay's own events -------------------------------------------------
    def deliver(self, event: dict[str, Any], now: float) -> None:
        source = event_source(event)
        t = event["event_time_min"]
        if self._active(source, t, "stop"):
            return  # never received; shows up only as a sequence gap
        delay = self.delay_at(source, t)
        copies = 2 if self._active(source, t, "duplicate") else 1
        for _ in range(copies):
            if delay > 0:
                self._seq += 1
                heapq.heappush(self._pending, (t + delay, self._seq, event))
            else:
                self._accept(event, t, source)

    def flush(self, now: float) -> None:
        while self._pending and self._pending[0][0] <= now + EPS:
            at, _, event = heapq.heappop(self._pending)
            self._accept(event, at, event_source(event))

    def _accept(self, event: dict[str, Any], received_at: float, source: str) -> None:
        eid = event["id"]
        if eid in self._seen:
            self.counts["duplicates"] += 1
            self.log.append(
                self._entry("duplicate", event, source, received_at, "The same event id was already received; ignored.")
            )
            return
        self._seen.add(eid)
        if received_at > event["event_time_min"] + EPS:
            event = {**event, "received_time_min": round(received_at, 3)}
        self.received.append(event)
        self.counts["accepted"] += 1
        self.last_event[source] = max(self.last_event.get(source, -1.0), event["event_time_min"])
        self._outlier_checks(event, received_at)

    def _outlier_checks(self, event: dict[str, Any], received_at: float) -> None:
        t = event["type"]
        t_min = event["event_time_min"]
        note: str | None = None
        if t == "test_completed" and event["payload"].get("elapsed_min", 0) > OUTLIER_TEST_MIN:
            note = f"{event['payload']['test']} turnaround {event['payload']['elapsed_min']} min is extreme but valid"
        elif t == "ambulance_updated":
            amb = event["ambulance_id"]
            eta = event["payload"]["eta_min"]
            prev = self._eta.get(amb)
            if prev is not None and abs(eta - prev) >= OUTLIER_ETA_SHIFT_MIN:
                note = f"ETA moved by {round(eta - prev, 1)} min (to T+{eta}); extreme but valid"
        if t == "ambulance_announced":
            self._eta[event["ambulance_id"]] = event["payload"]["eta_min"]
        elif t == "ambulance_updated":
            self._eta[event["ambulance_id"]] = event["payload"]["eta_min"]
        if t == "arrival":
            self._arrivals = [x for x in self._arrivals if x > t_min - 1.0] + [t_min]
            if len(self._arrivals) == OUTLIER_BURST_ARRIVALS:
                note = f"{OUTLIER_BURST_ARRIVALS} or more arrivals within one minute; an extreme but valid surge"
        if note:
            self.counts["outliers_kept"] += 1
            self.log.append(
                {
                    "id": event["id"],
                    "kind": "outlier_kept",
                    "source": event_source(event),
                    "type": t,
                    "event_time_min": t_min,
                    "received_min": round(received_at, 3),
                    "subject": event.get("patient_id") or event.get("ambulance_id"),
                    "reason": note + "; kept in the received state.",
                }
            )

    @staticmethod
    def _entry(kind: str, event: dict[str, Any], source: str, received_at: float, reason: str) -> dict[str, Any]:
        return {
            "id": event.get("id"),
            "kind": kind,
            "source": source,
            "type": event.get("type"),
            "event_time_min": event.get("event_time_min"),
            "received_min": round(received_at, 3),
            "subject": event.get("patient_id") or event.get("ambulance_id"),
            "reason": reason,
        }

    # -- validation of external messages ----------------------------------------------------
    def receive(self, message: dict[str, Any], source: str, view: Any) -> str:
        """Validate one external message against the received state. Returns its outcome kind."""
        now = view.now
        mid = message.get("id")
        t = float(message.get("event_time_min", now))
        kind = message.get("type")

        def refuse(outcome: str, reason: str) -> str:
            key = {"quarantined": "quarantined", "out_of_order": "out_of_order", "duplicate": "duplicates"}[outcome]
            self.counts[key] += 1
            self.log.append(self._entry(outcome, {**message, "event_time_min": t}, source, now, reason))
            return outcome

        if mid is not None and mid in self._seen:
            return refuse("duplicate", "The same message id was already received; ignored.")
        if mid is not None:
            self._seen.add(mid)
        if t > now + EPS:
            return refuse("quarantined", f"Event time T+{round(t, 2)} is in the future (now T+{round(now, 2)}).")

        if kind == "phase_change":
            p = view.patients.get(message.get("patient_id"))
            if p is None:
                return refuse("quarantined", f"Unknown patient id {message.get('patient_id')!r}.")
            to = message["payload"].get("to")
            if to not in ALLOWED_NEXT:
                return refuse("quarantined", f"Unknown phase {to!r}.")
            if t < p.phase_since_min - EPS:
                return refuse(
                    "out_of_order",
                    f"Event time T+{round(t, 2)} is older than the state already received "
                    f"(phase since T+{round(p.phase_since_min, 2)}); newer state kept.",
                )
            if to not in ALLOWED_NEXT.get(p.phase, set()):
                return refuse("quarantined", f"Impossible transition {p.phase} to {to}.")
            return refuse("quarantined", "Transitions are produced by the replay feed, not accepted from outside.")

        if kind == "count_report":
            service = message.get("service")
            count = message.get("count")
            present = len(view.active_patients())
            if isinstance(count, bool) or not isinstance(count, int):
                return refuse("quarantined", f"Count {count!r} for {service} is not a whole number.")
            if count < 0:
                return refuse("quarantined", f"Negative count {count} for {service}.")
            if count > present and service in ("triage", "assessment", "space", "lab", "imaging", "discharge",
                                               "allocation", "transport"):
                return refuse(
                    "quarantined", f"Count {count} for {service} exceeds the {present} patients present in the ED."
                )
            self._seen.add(f"{mid}:ok")
            self.counts["accepted"] += 1
            self.last_event[source] = max(self.last_event.get(source, -1.0), t)
            return "accepted"

        if kind in ("ambulance_announced", "ambulance_updated", "ambulance_cancelled"):
            return self._receive_ambulance(message, kind, t, source, view, refuse)

        return refuse("quarantined", f"Unsupported message type {kind!r}.")

    def _receive_ambulance(self, message, kind, t, source, view, refuse) -> str:
        now = view.now
        amb = message.get("ambulance_id")
        payload = message.get("payload", {})
        ann = view.announcements.get(amb)
        if kind == "ambulance_announced":
            if ann is not None:
                return refuse("quarantined", f"Ambulance {amb} is already announced; an announcement cannot be repeated.")
            n = payload.get("patient_count")
            lo, hi = AMBULANCE_PATIENTS_RANGE
            if isinstance(n, bool) or not isinstance(n, int) or not lo <= n <= hi:
                return refuse("quarantined", f"Announced patient count {n!r} is outside {lo} to {hi}.")
            eta = payload.get("eta_min")
            if not isinstance(eta, (int, float)) or eta < now - EPS:
                return refuse(
                    "quarantined",
                    f"ETA {eta!r} is earlier than the announcement time T+{round(now, 2)}.",
                )
            self.counts["accepted"] += 1
            self.last_event[source] = max(self.last_event.get(source, -1.0), t)
            self._eta[amb] = float(eta)
            view.apply_external_announcement(amb, float(eta), float(payload.get("eta_uncertainty_min", 5.0)), n)
            return "accepted"
        if ann is None:
            return refuse("quarantined", f"Unknown ambulance {amb!r}.")
        if ann.state in ("cancelled", "arrived"):
            return refuse("quarantined", f"Ambulance {amb} is already {ann.state}; it cannot change again.")
        if t < ann.source_updated_min - EPS:
            return refuse(
                "out_of_order",
                f"Update time T+{round(t, 2)} is older than the announcement's latest update "
                f"(T+{round(ann.source_updated_min, 2)}); newer state kept.",
            )
        if kind == "ambulance_cancelled":
            self.counts["accepted"] += 1
            self.last_event[source] = max(self.last_event.get(source, -1.0), t)
            view.apply_external_ambulance_cancel(amb)
            return "accepted"
        eta = payload.get("eta_min")
        if not isinstance(eta, (int, float)) or eta < now - EPS:
            return refuse("quarantined", f"New ETA {eta!r} is earlier than the update time T+{round(now, 2)}.")
        shift = eta - ann.eta_min
        self.counts["accepted"] += 1
        self.last_event[source] = max(self.last_event.get(source, -1.0), t)
        self._eta[amb] = float(eta)
        view.apply_external_eta(amb, float(eta))
        if abs(shift) >= OUTLIER_ETA_SHIFT_MIN:
            self.counts["outliers_kept"] += 1
            self.log.append(
                {
                    "id": message.get("id"),
                    "kind": "outlier_kept",
                    "source": source,
                    "type": kind,
                    "event_time_min": t,
                    "received_min": round(now, 3),
                    "subject": amb,
                    "reason": f"ETA moved by {round(shift, 1)} min (to T+{eta}); extreme but valid; kept.",
                }
            )
        return "accepted"

    # -- freshness read model ----------------------------------------------------------------
    def last_update(self, source: str, now: float) -> float | None:
        """Source time of the newest valid update or heartbeat received by `now`."""
        best: float | None = None
        g = math.floor(now / HEARTBEAT_MIN + EPS) * HEARTBEAT_MIN
        while g >= -EPS:
            if g + self.delay_at(source, g) <= now + EPS and not self.stopped_at(source, g):
                best = g
                break
            g -= HEARTBEAT_MIN
        ev = self.last_event.get(source)
        cands = [x for x in (best, ev) if x is not None]
        return max(cands) if cands else None

    def age(self, source: str, now: float) -> float | None:
        lu = self.last_update(source, now)
        return None if lu is None else max(0.0, now - lu)

    def fresh(self, source: str, now: float) -> bool:
        a = self.age(source, now)
        return a is not None and a <= STALE_AFTER_MIN + EPS

    def resumed_at(self, source: str, now: float) -> float | None:
        """When the newest finished stop of this source ended, once it has ended."""
        ends = [f["end"] for f in self.faults if f["source"] == source and f["kind"] == "stop" and f["end"] <= now + EPS]
        return max(ends) if ends else None

    def feeds_view(self, now: float) -> dict[str, dict[str, Any]]:
        self.flush(now)
        out: dict[str, dict[str, Any]] = {
            "replay": {
                "id": "replay",
                "label": "Replay clock (aggregate heartbeat)",
                "essential": False,
                "last_update_min": round(now, 3),
                "age_min": 0.0,
                "status": "fresh",
                "limitation": None,
                "guidance": None,
                "note": "The replay heartbeat shows the clock is running. It never refreshes a source below.",
            }
        }
        for sid, spec in SOURCES.items():
            lu = self.last_update(sid, now)
            age = None if lu is None else max(0.0, now - lu)
            if lu is None:
                status = "missing"
            else:
                status = "fresh" if age <= STALE_AFTER_MIN + EPS else "stale"
            limitation = None
            guidance = None
            if status != "fresh":
                limitation = spec["limitation"]
                since = "never received" if lu is None else f"no valid update since T+{round(lu, 2)}"
                guidance = (
                    f"{spec['label']}: {since}. The figures shown are the last valid values. "
                    + ("Prediction and ranking are unavailable until a valid update arrives."
                       if spec["essential"] else "Assessment of this part carries a limitation until a valid update arrives.")
                )
            out[sid] = {
                "id": sid,
                "label": spec["label"],
                "essential": spec["essential"],
                "last_update_min": None if lu is None else round(lu, 3),
                "age_min": None if age is None else round(age, 3),
                "status": status,
                "limitation": limitation,
                "guidance": guidance,
                "resumed_at_min": self.resumed_at(sid, now),
                "as_of_min": round(self.observed_as_of(sid, now), 3),
            }
        return out

    def sequence_gaps(self) -> list[dict[str, Any]]:
        """Runs of missing event ids in the received log: how a gap is noticed once later events arrive."""
        nums = sorted(int(e["id"][1:]) for e in self.received)
        gaps = []
        for a, b in zip(nums, nums[1:]):
            if b - a > 1:
                gaps.append({"after": f"E{a:06d}", "before": f"E{b:06d}", "missing": b - a - 1})
        return gaps
