"""SimPy patient-flow engine for the fictional ED.

Routes so far: walk-ins and non-critical ambulance patients queue for the finite triage desk
(zone 1), then wait for a staffed general ED space, a named doctor, assessment and cleared
departure. Supplied critical-bypass patients skip registration and wait for a staffed
resuscitation space inside the 24-space pool (zone 2). A patient keeps the same ED space until
physical departure. A space is staffed only while its covering nurse is on duty; urgent-group and
critical patients also carry a supplied stabilization task that must complete before discharge or
transfer eligibility, even if the clinical decision is received earlier.

Every state change is emitted as an event. The API exposes only events whose time has been
reached; the engine never generates anything beyond the simulated time it was asked to reach.
Per-patient random values come from a generator keyed by (seed, patient id), so demand and care
requirements do not depend on scheduling order (needed later for paired comparisons).
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Any

import simpy
from dataclasses import replace as dc_replace

from .feeds import SERVICE_SOURCE, IngestGate
from .fixtures import FIXTURES
from .pressure import LocalMonitor
from .profile import CRITICAL_RANK, PROFILE, SCENARIOS, URGENCY_RANK
from .scenario import (
    AmbulanceRun,
    SuppliedInputs,
    generate_ambulance_run,
    walk_in_inputs,
)

PHASE_ZONE = {
    "awaiting_triage": 1,
    "in_triage": 1,
    "awaiting_space": 2,
    "awaiting_clinician": 2,
    "assessment_active": 2,
    "awaiting_care_completion": 2,
    # Logical diagnostics (zone 3): the patient keeps the ED space, no doctor is held.
    "awaiting_lab": 3,
    "in_lab": 3,
    "awaiting_imaging": 3,
    "in_imaging": 3,
    # Results return to the clinician in zone 2 before the decision.
    "awaiting_result_review": 2,
    "result_review_active": 2,
    # Zone 4: home discharge processing, or a ward/ICU transfer (bed, allocation work, transport).
    "awaiting_discharge": 4,
    "disposition_processing": 4,
    "awaiting_ward_bed": 4,
    "awaiting_ward_allocation": 4,
    "ward_allocation_active": 4,
    "awaiting_transport": 4,
    "in_transport": 4,
    "departed": None,
}


# Wait phase -> service whose queue it joins; active phase -> service whose work it completes.
WAIT_SERVICE = {
    "awaiting_triage": "triage",
    "awaiting_space": "space",
    "awaiting_clinician": "assessment",
    # Result review is the same patient returning for more doctor work; it is not a new patient
    # for the assessment rate (patients per hour), so it has its own log key.
    "awaiting_result_review": "assessment_review",
    "awaiting_lab": "lab",
    "awaiting_imaging": "imaging",
    "awaiting_discharge": "discharge",
    "awaiting_ward_bed": "ward_beds",
    "awaiting_ward_allocation": "allocation",
    "awaiting_transport": "transport",
}
DONE_SERVICE = {
    "in_triage": "triage",
    "assessment_active": "assessment",
    "result_review_active": "assessment_review",
    "in_lab": "lab",
    "in_imaging": "imaging",
    "disposition_processing": "discharge",
    "ward_allocation_active": "allocation",
    "in_transport": "transport",
    # Leaving these queues is a grant (space, bed), counted as that service's throughput.
    "awaiting_space": "space",
    "awaiting_ward_bed": "ward_beds",
}


# Phase -> the service whose waiting queue the patient is in. First assessment and result review
# share one doctor queue (the same doctors), so both belong to "assessment" for queue counts.
QUEUE_SERVICE = {**WAIT_SERVICE, "awaiting_result_review": "assessment"}


def scenario_definition(scenario: str) -> dict[str, Any]:
    if scenario in SCENARIOS:
        return SCENARIOS[scenario]
    if scenario in FIXTURES:
        return FIXTURES[scenario]
    raise ValueError(f"unknown scenario {scenario!r}")


def _triangular(rng: random.Random, spec: dict[str, float]) -> float:
    return rng.triangular(spec["min"], spec["max"], spec["mode"])


@dataclass
class Patient:
    id: str
    supplied: SuppliedInputs
    arrival_min: float
    triage_min: float
    work_min: float
    disposition_min: float
    phase: str = "awaiting_triage"
    phase_since_min: float = 0.0
    space_id: str | None = None
    nurse_id: str | None = None
    clinician_id: str | None = None
    triage_id: str | None = None
    triage_start_min: float | None = None
    test_unit: str | None = None
    review_min: float = 5.0
    tests_ordered: bool = False
    tests_done: list = field(default_factory=list)
    results_min: float | None = None
    review_start_min: float | None = None
    review_end_min: float | None = None
    first_assessment_min: float | None = None
    # Clinical decision as received. Eligibility needs this and the care prerequisites.
    decision_min: float | None = None
    care_started: bool = False
    care_complete_min: float | None = None
    effective_disposition_min: float | None = None
    departure_min: float | None = None
    care_done: Any = None
    allocation_min: float = 15.0
    transport_min: float = 15.0
    space_grant_min: float | None = None
    ward_bed_id: str | None = None
    disp_unit: str | None = None
    bed_reserved_min: float | None = None
    allocation_start_min: float | None = None
    transport_start_min: float | None = None
    exit: str | None = None

    @property
    def has_space(self) -> bool:
        return self.space_id is not None

    def resources(self) -> dict[str, str | None]:
        return {
            "triage_desk": self.triage_id,
            "ed_space": self.space_id,
            "clinician_slot": self.clinician_id,
            "nurse": self.nurse_id,
            "diagnostic_unit": self.test_unit,
            "ward_bed": self.ward_bed_id,
            "disposition_unit": self.disp_unit,
        }

    def tests_status(self) -> str:
        """not_ordered | none | pending | complete. Needs stay hidden until tests are ordered."""
        if not self.tests_ordered:
            return "not_ordered"
        if not self.supplied.tests:
            return "none"
        return "complete" if self.results_min is not None else "pending"

    def care_status(self) -> str:
        """none (no supplied task) | not_started | in_progress | complete.

        The task's length is never exposed before it completes.
        """
        if self.supplied.care_task_min is None:
            return "none"
        if self.care_complete_min is not None:
            return "complete"
        return "in_progress" if self.care_started else "not_started"

    def public(self, now: float) -> dict[str, Any]:
        s = self.supplied
        return {
            "id": self.id,
            "urgency": s.urgency,
            "acuity_system": s.acuity_system,
            "acuity_score": s.acuity_score,
            "critical_bypass": s.critical_bypass,
            "arrival_mode": s.arrival_mode,
            "ambulance_id": s.ambulance_id,
            "phase": self.phase,
            "zone": PHASE_ZONE[self.phase],
            "has_space": self.has_space,
            "space_id": self.space_id,
            "clinician_id": self.clinician_id,
            "nurse_id": self.nurse_id,
            "diagnostic_unit": self.test_unit,
            "triage_id": self.triage_id,
            "care_status": self.care_status(),
            "tests_status": self.tests_status(),
            "tests_done": list(self.tests_done),
            # The test kinds are known once they are ordered (end of first assessment), never before.
            "tests_required": [k for k, _ in self.supplied.tests] if self.tests_ordered else None,
            "decision_received": self.decision_min is not None,
            # The disposition is part of the clinical decision: hidden until it is received.
            "disposition": s.disposition if self.decision_min is not None else None,
            "ward_bed_id": self.ward_bed_id,
            "phase_since_min": round(self.phase_since_min, 2),
            "minutes_in_phase": round(now - self.phase_since_min, 2),
            "arrival_min": round(self.arrival_min, 2),
        }

    def time_parts(self, now: float | None = None) -> dict[str, Any]:
        """The three mutually exclusive parts of total ED time (OPEN_QUESTIONS Q5).

        Initial wait is arrival to first assessment; care and tests is first assessment to effective
        disposition; awaiting departure is effective disposition to physical departure. An unfinished
        stay reports accrued minutes up to `now` and is never counted as complete.
        """

        def r(v: float | None) -> float | None:
            return None if v is None else round(v, 3)

        end = self.departure_min
        complete = end is not None
        upto = end if complete else now
        first = self.first_assessment_min
        eff = self.effective_disposition_min
        initial = (first if first is not None else upto) - self.arrival_min if upto is not None else None
        care = None
        if first is not None and upto is not None:
            care = (eff if eff is not None else upto) - first
        awaiting = None
        if eff is not None and upto is not None:
            awaiting = upto - eff
        boarding = awaiting if self.supplied.disposition != "home" and eff is not None else None
        return {
            "complete": complete,
            "initial_wait_min": r(initial),
            "care_tests_min": r(care),
            "awaiting_departure_min": r(awaiting),
            "boarding_min": r(boarding),
            "total_ed_min": r(upto - self.arrival_min) if upto is not None else None,
            "ed_space_min": r(upto - self.space_grant_min) if upto is not None and self.space_grant_min is not None else None,
        }

    def timestamps(self, now: float | None = None) -> dict[str, Any]:
        def r(v: float | None) -> float | None:
            return None if v is None else round(v, 3)

        return {
            "patient_id": self.id,
            "urgency": self.supplied.urgency,
            "acuity": f"{self.supplied.acuity_system} {self.supplied.acuity_score}",
            "critical_bypass": self.supplied.critical_bypass,
            "arrival_mode": self.supplied.arrival_mode,
            "arrival_min": r(self.arrival_min),
            "triage_start_min": r(self.triage_start_min),
            "first_assessment_min": r(self.first_assessment_min),
            "decision_min": r(self.decision_min),
            "care_task_required": (
                None if self.first_assessment_min is None else self.supplied.care_task_min is not None
            ),
            "tests_required": (
                None if not self.tests_ordered else [kind for kind, _ in self.supplied.tests]
            ),
            "results_received_min": r(self.results_min),
            "review_start_min": r(self.review_start_min),
            "review_end_min": r(self.review_end_min),
            "care_complete_min": r(self.care_complete_min),
            "effective_disposition_min": r(self.effective_disposition_min),
            "disposition": self.supplied.disposition if self.decision_min is not None else None,
            "ward_bed_id": self.ward_bed_id,
            "bed_reserved_min": r(self.bed_reserved_min),
            "allocation_start_min": r(self.allocation_start_min),
            "transport_start_min": r(self.transport_start_min),
            "exit": self.exit,
            "space_grant_min": r(self.space_grant_min),
            "departure_min": r(self.departure_min),
            "time_parts": self.time_parts(now),
        }


@dataclass
class Announcement:
    """Received ambulance information only: never the run's hidden arrival time."""

    id: str
    received_min: float
    eta_min: float
    uncertainty_min: float
    patient_count: int
    acuity: list[dict[str, Any]] | None
    source_updated_min: float
    state: str = "en_route"  # en_route | cancelled | arrived
    closed_min: float | None = None

    def status(self, now: float) -> str:
        if self.state == "en_route" and now > self.eta_min:
            return "delayed"
        return self.state

    def public(self, now: float) -> dict[str, Any]:
        return {
            "id": self.id,
            "received_min": round(self.received_min, 2),
            "eta_min": round(self.eta_min, 2),
            "eta_uncertainty_min": self.uncertainty_min,
            "minutes_overdue": round(now - self.eta_min, 2) if self.status(now) == "delayed" else None,
            "patient_count": self.patient_count,
            "acuity": self.acuity,
            "source_updated_min": round(self.source_updated_min, 2),
            "status": self.status(now),
            "closed_min": None if self.closed_min is None else round(self.closed_min, 2),
        }


@dataclass
class CongestionMonitor:
    """Overall ED congestion rule from the spec, evaluated every simulated minute."""

    state: str = "stable"  # stable | building | confirmed
    onset_min: float | None = None
    confirmed_min: float | None = None
    below_since_min: float | None = None
    episodes: list[dict[str, Any]] = field(default_factory=list)

    @property
    def recovering(self) -> bool:
        """Confirmed congestion whose recovery clock (fewer than 3 waiting) is running."""
        return self.state == "confirmed" and self.below_since_min is not None

    def degrade(self) -> None:
        """Essential inputs are missing: nothing can be established. A building interval is no longer
        continuous, and recovery time cannot accrue; a confirmed episode stays open."""
        if self.state == "building":
            self.state = "stable"
            self.onset_min = None
        elif self.state == "confirmed":
            self.below_since_min = None

    def tick(self, now: float, available_spaces: int, awaiting_space: int) -> None:
        rule = PROFILE["congestion_rule"]
        cond = (
            available_spaces <= rule["available_spaces"]
            and awaiting_space >= rule["awaiting_space_at_least"]
        )
        if self.state == "stable":
            if cond:
                self.state = "building"
                self.onset_min = now
        elif self.state == "building":
            if not cond:
                self.state = "stable"
                self.onset_min = None
            elif now - (self.onset_min or now) >= rule["confirm_after_minutes"]:
                self.state = "confirmed"
                self.confirmed_min = now
                self.episodes.append(
                    {"onset_min": self.onset_min, "confirmed_min": now, "cleared_min": None}
                )
        elif self.state == "confirmed":
            if awaiting_space < rule["clear_when_awaiting_below"]:
                if self.below_since_min is None:
                    self.below_since_min = now
                elif now - self.below_since_min >= rule["clear_after_minutes"]:
                    self.episodes[-1]["cleared_min"] = now
                    self.state = "stable"
                    self.onset_min = None
                    self.confirmed_min = None
                    self.below_since_min = None
            else:
                self.below_since_min = None


class WardBeds:
    """Finite Ward/ICU beds outside the ED. A bed is reserved for one transfer from the moment it is
    granted until the patient physically departs, then stays occupied for the rest of the run.

    Beds that are occupied by current inpatients become free on a disclosed schedule
    (`free_at_min`); that schedule is a hidden future and is never exposed. Ward and ICU beds are
    not interchangeable.
    """

    def __init__(self, env: simpy.Environment, beds: list[dict[str, Any]], on_free) -> None:
        self.env = env
        self.on_free = on_free
        self.beds: dict[str, dict[str, Any]] = {}
        self.waiting: list[tuple[int, int, str, simpy.Event]] = []
        self._seq = 0
        for b in beds:
            ready = b["free_at_min"] <= 0
            self.beds[b["id"]] = {"type": b["type"], "state": "free" if ready else "occupied"}
            if not ready:
                env.process(self._release_at(b["id"], b["free_at_min"]))

    def _release_at(self, bed_id: str, at: float):
        yield self.env.timeout(at)
        self.beds[bed_id]["state"] = "free"
        self.on_free(bed_id, self.beds[bed_id]["type"])
        self.dispatch()

    def counts(self) -> dict[str, dict[str, int]]:
        out: dict[str, dict[str, int]] = {}
        for kind in ("ward", "icu"):
            ids = [b for b in self.beds.values() if b["type"] == kind]
            out[kind] = {
                "total": len(ids),
                "free": sum(1 for b in ids if b["state"] == "free"),
                "reserved": sum(1 for b in ids if b["state"] == "reserved"),
                "occupied": sum(1 for b in ids if b["state"] == "occupied"),
                "waiting": sum(1 for w in self.waiting if w[2] == kind),
            }
        return out

    def request(self, kind: str, rank: int) -> simpy.Event:
        event = self.env.event()
        self._seq += 1
        self.waiting.append((rank, self._seq, kind, event))
        self.waiting.sort(key=lambda w: (w[0], w[1]))
        self.dispatch()
        return event

    def dispatch(self) -> None:
        # Walk the queue in service order; a waiter with no suitable bed does not block others.
        for item in list(self.waiting):
            _, _, kind, event = item
            free = sorted(i for i, b in self.beds.items() if b["type"] == kind and b["state"] == "free")
            if not free:
                continue
            self.beds[free[0]]["state"] = "reserved"
            self.waiting.remove(item)
            event.succeed(free[0])

    def occupy(self, bed_id: str) -> None:
        self.beds[bed_id]["state"] = "occupied"


class SpacePool:
    """Finite named spaces. A free space can be granted only while its covering nurse is on duty.

    Waiters are served by (urgency rank, request order) and re-evaluated on every release and every
    staffing change. Occupied spaces are never taken back.
    """

    def __init__(self, env: simpy.Environment, ids: list[str], coverage: dict[str, str], on_duty: set[str]):
        self.env = env
        self.ids = sorted(ids)
        self.coverage = coverage
        self.on_duty = on_duty
        self.held: set[str] = set()
        self.waiting: list[tuple[int, int, simpy.Event]] = []
        self._seq = 0
        # Reserve spaces whose active window has closed while a patient still holds them: they take no
        # new patient and leave the pool when that patient departs (see EDEngine surge-space actions).
        self.closing: set[str] = set()
        self.on_closed = None  # callback(space_id) when a closing space is released

    @property
    def capacity(self) -> int:
        return len(self.ids)

    @property
    def count(self) -> int:
        return len(self.held)

    def is_staffed(self, space_id: str) -> bool:
        return self.coverage[space_id] in self.on_duty

    def free_staffed(self) -> list[str]:
        return [s for s in self.ids if s not in self.held and s not in self.closing and self.is_staffed(s)]

    def free_unstaffed(self) -> list[str]:
        return [s for s in self.ids if s not in self.held and not self.is_staffed(s)]

    def request(self, rank: int) -> simpy.Event:
        event = self.env.event()
        self._seq += 1
        self.waiting.append((rank, self._seq, event))
        self.waiting.sort(key=lambda w: (w[0], w[1]))
        self.dispatch()
        return event

    def release(self, space_id: str) -> None:
        self.held.discard(space_id)
        if space_id in self.closing:
            self.closing.discard(space_id)
            self.ids.remove(space_id)
            if self.on_closed is not None:
                self.on_closed(space_id)
        self.dispatch()

    def dispatch(self) -> None:
        while self.waiting:
            free = self.free_staffed()
            if not free:
                return
            _, _, event = self.waiting.pop(0)
            self.held.add(free[0])
            event.succeed(free[0])


class EDEngine:
    def __init__(self, seed: int, scenario: str = "normal") -> None:
        self.definition = scenario_definition(scenario)
        self.seed = seed
        self.scenario = scenario
        self.env = simpy.Environment()
        n_resus = PROFILE["resus_spaces"]
        n_general = PROFILE["regular_spaces"] - n_resus
        self.triage = simpy.PriorityResource(self.env, capacity=PROFILE["triage_slots"])
        self.clinicians = simpy.PriorityResource(self.env, capacity=PROFILE["clinician_slots"])
        self.lab = simpy.PriorityResource(self.env, capacity=PROFILE["lab_slots"])
        self.imaging = simpy.PriorityResource(self.env, capacity=PROFILE["imaging_slots"])
        self.free_lab = [f"L{i}" for i in range(1, PROFILE["lab_slots"] + 1)]
        self.free_imaging = [f"I{i}" for i in range(1, PROFILE["imaging_slots"] + 1)]
        self.discharge = simpy.PriorityResource(self.env, capacity=PROFILE["discharge_slots"])
        self.allocation = simpy.PriorityResource(self.env, capacity=PROFILE["ward_allocation_slots"])
        self.transport = simpy.PriorityResource(self.env, capacity=PROFILE["transport_slots"])
        self.free_discharge = [f"DP{i}" for i in range(1, PROFILE["discharge_slots"] + 1)]
        self.free_allocation = [f"WA{i}" for i in range(1, PROFILE["ward_allocation_slots"] + 1)]
        self.free_transport = [f"TR{i}" for i in range(1, PROFILE["transport_slots"] + 1)]
        self.ward_beds = WardBeds(
            self.env,
            self.definition.get("ward_beds", PROFILE["ward_beds"]),
            lambda bed_id, kind: self._emit(
                "ward_bed_available", None, {"bed_id": bed_id, "type": kind}, {"ward_bed": bed_id}
            ),
        )
        self.departed_home = 0
        self.departed_ward = 0
        # Staff-approved actions (see start_action): lifecycle records by action id and the reserve
        # units whose slot is closing but still held by work that has not finished.
        self.actions: dict[str, dict[str, Any]] = {}
        self.retiring: set[str] = set()
        # Test start and finish log (kind, time) for recent work and throughput figures.
        self.test_starts: list[tuple[str, float]] = []
        self.test_log: list[tuple[str, float]] = []
        # Nurse coverage: every space has one covering nurse; a nurse is on duty unless a supplied
        # staffing roster says otherwise.
        self.nurses = {n["id"]: n for n in PROFILE["nurses"]}
        self.on_duty: set[str] = set(self.nurses)
        coverage = {sp: n["id"] for n in PROFILE["nurses"] for sp in n["covers"]}
        self.general_pool = SpacePool(
            self.env, [f"S{i:02d}" for i in range(1, n_general + 1)], coverage, self.on_duty
        )
        self.resus_pool = SpacePool(
            self.env, [f"R{i}" for i in range(1, n_resus + 1)], coverage, self.on_duty
        )
        self.general_pool.on_closed = self._surge_space_closed
        # Named units so events and state say which unit a patient holds. Always the lowest free
        # id, so allocation is deterministic for a seed.
        self.free_triage = [f"T{i}" for i in range(1, PROFILE["triage_slots"] + 1)]
        self.free_clinicians = [d["id"] for d in PROFILE["doctors"]]
        self.patients: dict[str, Patient] = {}
        self.announcements: dict[str, Announcement] = {}
        self.events: list[dict[str, Any]] = []
        # What was received through the feeds. The replay's own record is `events`; the two differ only
        # when a fixture scripts a feed fault.
        self.gate = IngestGate(self.definition)
        # Per-minute record of the readings the monitors use, so a stopped or delayed feed can be read
        # as of the time its newest data describes.
        self._hist: dict[str, list[tuple[float, int, bool]]] = {sid: [] for sid in SERVICE_SOURCE}
        self._hist_overall: list[tuple[float, int, int]] = []
        self.departed_count = 0
        self.monitor = CongestionMonitor()
        self.local = LocalMonitor()
        # Queue entries and completions per service (times), for received-work and throughput rates.
        self.work_entries: dict[str, list[float]] = {}
        self.work_done: dict[str, list[float]] = {}
        self._rate_mult = self.definition.get("rate_multiplier", 1.0)
        if self.definition.get("background_arrivals", True):
            self._walk_in_rng = random.Random(f"{seed}:arrivals")
            self._ambulance_rng = random.Random(f"{seed}:ambulances")
            self._walk_in_counter = 0
            self.env.process(self._walk_ins())
            self.env.process(self._ambulance_stream())
        if "script" in self.definition:
            script = self.definition["script"]()
            for at, pid, supplied in script["walk_ins"]:
                self.env.process(self._scripted_walk_in(at, pid, supplied))
            for run in script["ambulances"]:
                self.env.process(self._ambulance(run))
        for at, nurse_id, on in self.definition.get("staffing", []):
            self.env.process(self._staffing_change(at, nurse_id, on))
        for inj in self.gate.injections:
            self.env.process(self._inject(inj))
        self.env.process(self._monitor_loop())

    # -- time ----------------------------------------------------------------------------
    @property
    def now(self) -> float:
        return float(self.env.now)

    def run_until(self, t: float) -> None:
        """Process every event scheduled at or before t.

        `env.run(until=t)` stops before events scheduled exactly at t (such as the per-minute
        congestion tick), which would show them one advance late.
        """
        if t > self.env.now:
            self.env.run(until=t)
        while self.env.peek() <= t:
            self.env.step()

    # -- derived resource state ----------------------------------------------------------
    def occupied_spaces(self) -> int:
        return self.general_pool.count + self.resus_pool.count

    def available_general_spaces(self) -> int:
        """Empty general spaces with a covering nurse on duty (what a waiting patient can take)."""
        return len(self.general_pool.free_staffed())

    def awaiting_space(self) -> int:
        return len(self.general_pool.waiting) + len(self.resus_pool.waiting)

    # -- events --------------------------------------------------------------------------
    def _emit(
        self,
        etype: str,
        patient_id: str | None,
        payload: dict[str, Any],
        resources: dict[str, str | None] | None = None,
        ambulance_id: str | None = None,
    ) -> None:
        event = {
            "id": f"E{len(self.events) + 1:06d}",
            "type": etype,
            "event_time_min": round(self.now, 3),
            "received_time_min": round(self.now, 3),
            "patient_id": patient_id,
            "ambulance_id": ambulance_id,
            "resources": resources or {},
            "payload": payload,
        }
        self.events.append(event)
        self.gate.deliver(event, self.now)

    # -- staff-approved actions ----------------------------------------------------------
    def _resource(self, service: str) -> tuple[Any, list[str]]:
        return {
            "allocation": (self.allocation, self.free_allocation),
            "lab": (self.lab, self.free_lab),
            "imaging": (self.imaging, self.free_imaging),
        }[service]

    # -- staffed surge space (one declared reserve space with its reserve nurse) -----------------
    def _open_surge_space(self, unit: str) -> None:
        reserve = next(r for r in PROFILE["reserves"].values() if r["unit"] == unit)
        nurse = reserve["nurse"]
        pool = self.general_pool
        pool.coverage[unit] = nurse
        self.on_duty.add(nurse)
        pool.ids.append(unit)
        pool.dispatch()

    def _close_surge_space(self, rec: dict[str, Any]) -> None:
        unit = rec["unit"]
        pool = self.general_pool
        if unit in pool.held:
            pool.closing.add(unit)  # completes when its patient departs
            return
        pool.ids.remove(unit)
        self._surge_nurse_off(unit)
        self._finish_action(rec, "completed")

    def _surge_nurse_off(self, unit: str) -> None:
        nurse = self.general_pool.coverage.get(unit)
        if nurse and nurse not in self.nurses:
            self.on_duty.discard(nurse)

    def _surge_space_closed(self, unit: str) -> None:
        self._surge_nurse_off(unit)
        for rec in self.actions.values():
            if rec["unit"] == unit and rec["stage"] == "draining":
                self._finish_action(rec, "completed")

    def _give_back(self, free: list[str], unit: str) -> None:
        """Return a named unit to its pool. A reserve unit whose active window has closed is not
        returned: the work it was doing has now finished, so the slot is gone (completed)."""
        if unit in self.retiring:
            self.retiring.discard(unit)
            for rec in self.actions.values():
                if rec["unit"] == unit and rec["stage"] == "draining":
                    self._finish_action(rec, "completed")
            return
        free.append(unit)

    def _finish_action(self, rec: dict[str, Any], stage: str, reason: str | None = None) -> None:
        rec["stage"] = stage
        rec["stage_since_min"] = round(self.now, 3)
        rec["closed_min"] = round(self.now, 3)
        rec["reason"] = reason
        self._emit(f"action_{stage}", None, self.action_public(rec))

    def action_public(self, rec: dict[str, Any]) -> dict[str, Any]:
        keys = ("id", "request_id", "preset", "target", "service", "unit", "owners", "stage", "stage_since_min",
                "approved_min", "review_end_min", "setup_end_min", "active_end_min", "closed_min", "reason")
        return {k: rec.get(k) for k in keys}

    def start_action(self, aid: str, request_id: str, preset: str, target: str | None, service: str, unit: str,
                     owners: list[str], review_min: float, setup_min: float, active_min: float) -> dict[str, Any]:
        """The final valid grant: review, setup, active, draining, completed or blocked. Nothing changes
        before activation. The reserve is checked again at activation and, if it is gone, the action is
        blocked and no capacity is added."""
        now = self.now
        rec = {
            "id": aid, "request_id": request_id, "preset": preset, "target": target, "service": service,
            "unit": unit, "owners": owners, "stage": "review", "stage_since_min": round(now, 3),
            "approved_min": round(now, 3), "review_end_min": round(now + review_min, 3),
            "setup_end_min": round(now + review_min + setup_min, 3),
            "active_end_min": round(now + review_min + setup_min + active_min, 3),
            "closed_min": None, "reason": None, "review_min": review_min, "setup_min": setup_min,
            "active_min": active_min,
        }
        self.actions[aid] = rec
        self._emit("action_approved", None, self.action_public(rec))
        self._emit("action_review", None, self.action_public(rec))
        self.env.process(self._action_lifecycle(rec))
        return rec

    def _reserve_gone(self, unit: str) -> bool:
        return any(start <= self.now < end and u == unit for start, end, u in self.definition.get("reserve_outages", []))

    def _action_lifecycle(self, rec: dict[str, Any]):
        yield self.env.timeout(rec["review_min"])
        rec["stage"], rec["stage_since_min"] = "setup", round(self.now, 3)
        self._emit("action_setup", None, self.action_public(rec))
        yield self.env.timeout(rec["setup_min"])
        if self._reserve_gone(rec["unit"]):
            self._finish_action(rec, "blocked", "The declared reserve is no longer available at activation.")
            return
        if rec["service"] == "space":
            self._open_surge_space(rec["unit"])
            rec["stage"], rec["stage_since_min"] = "active", round(self.now, 3)
            self._emit("action_active", None, self.action_public(rec))
            yield self.env.timeout(rec["active_min"])
            rec["stage"], rec["stage_since_min"] = "draining", round(self.now, 3)
            self._emit("action_draining", None, self.action_public(rec))
            self._close_surge_space(rec)
            return
        res, free = self._resource(rec["service"])
        # Adding a slot: SimPy resources take their capacity at construction, so the extra slot is added
        # to the pending-request machinery directly (pinned simpy 4.1.2).
        res._capacity += 1
        free.append(rec["unit"])
        res._trigger_put(None)
        rec["stage"], rec["stage_since_min"] = "active", round(self.now, 3)
        self._emit("action_active", None, self.action_public(rec))
        yield self.env.timeout(rec["active_min"])
        # Draining: the slot closes to new work; a task already running on it finishes first.
        res._capacity -= 1
        rec["stage"], rec["stage_since_min"] = "draining", round(self.now, 3)
        self._emit("action_draining", None, self.action_public(rec))
        if rec["unit"] in free:
            free.remove(rec["unit"])
            self._finish_action(rec, "completed")
        else:
            self.retiring.add(rec["unit"])

    @staticmethod
    def _take(pool: list[str]) -> str:
        pool.sort()
        return pool.pop(0)

    def _set_phase(self, p: Patient, phase: str) -> None:
        previous = p.phase
        p.phase = phase
        p.phase_since_min = self.now
        service = WAIT_SERVICE.get(phase)
        if service:
            self.work_entries.setdefault(service, []).append(self.now)
        done = DONE_SERVICE.get(previous)
        if done and phase != previous:
            self.work_done.setdefault(done, []).append(self.now)
        self._emit(
            "phase_change",
            p.id,
            {"from": previous, "to": phase, "zone": PHASE_ZONE[phase], "has_space": p.has_space},
            p.resources(),
        )

    # -- staffing ------------------------------------------------------------------------
    def _staffing_change(self, at: float, nurse_id: str, on: bool):
        if at > self.now:
            yield self.env.timeout(at - self.now)
        nurse = self.nurses[nurse_id]
        if on:
            self.on_duty.add(nurse_id)
        else:
            self.on_duty.discard(nurse_id)
        self._emit(
            "staff_on_duty" if on else "staff_off_duty",
            None,
            {
                "staff_id": nurse_id,
                "role": "nurse",
                "name": nurse["name"],
                "covers": nurse["covers"],
                "source": "supplied staffing roster",
            },
            {"nurse": nurse_id},
        )
        self.general_pool.dispatch()
        self.resus_pool.dispatch()

    # -- arrivals ------------------------------------------------------------------------
    def _base_walk_in_rate_per_min(self) -> float:
        return PROFILE["assumptions"]["walk_in_rate_per_hour_average"] / 60.0 * self._rate_mult

    def _segment_mult(self, t: float, key: str) -> float:
        """Scenario arrival-rate multiplier at time t for walk-ins or ambulances (1.0 without segments)."""
        m = 1.0
        for s in self.definition.get("surges", ()):
            if s["start"] <= t < s["end"]:
                m *= s.get(key, 1.0)
        return m

    def _rate_ceiling(self, key: str) -> float:
        """Upper bound the thinning is done against. A scenario can fix it so that two scenarios share a
        random stream until their hidden futures differ."""
        d = self.definition
        if "rate_ceiling" in d:
            return float(d["rate_ceiling"])
        ceiling = 1.0
        for s in d.get("surges", ()):
            ceiling *= max(1.0, s.get(key, 1.0))
        return ceiling

    def _adjust(self, key: str, s: SuppliedInputs) -> SuppliedInputs:
        """Scenario workload variants applied to one patient's supplied inputs when they arrive: extra
        or slower tests and a heavier admission mix. Every draw is keyed by seed and identity."""
        d = self.definition
        boosts, scales, dboost = d.get("test_boosts"), d.get("turnaround_scales"), d.get("disposition_boost")
        if not (boosts or scales or dboost):
            return s
        t = self.now
        tests = list(s.tests)
        for b in boosts or ():
            if b["start"] <= t < b["end"] and all(k != b["kind"] for k, _ in tests):
                if random.Random(f"{self.seed}:{key}:boost:{b['kind']}").random() < b["extra_prob"]:
                    spec = PROFILE["assumptions"][f"{b['kind']}_turnaround_minutes"]
                    rng = random.Random(f"{self.seed}:{key}:boostmin:{b['kind']}")
                    tests.append((b["kind"], round(rng.triangular(spec["min"], spec["max"], spec["mode"]), 3)))
        tests.sort(key=lambda x: 0 if x[0] == "lab" else 1)
        for sc in scales or ():
            if sc["start"] <= t < sc["end"]:
                tests = [(k, round(m * sc["scale"], 3)) if k == sc["kind"] else (k, m) for k, m in tests]
        disposition = s.disposition
        if dboost and dboost["start"] <= t < dboost["end"] and disposition == "home":
            if random.Random(f"{self.seed}:{key}:dboost").random() < dboost["ward"]:
                disposition = "ward"
        return dc_replace(s, tests=tuple(tests), disposition=disposition)

    def _walk_in_rate_per_min(self, t: float) -> float:
        variation = PROFILE["assumptions"]["arrival_rate_variation"]
        # Slow daily wave around the average, peaking mid-shift (demo assumption).
        wave = 1.0 + variation * math.sin(2 * math.pi * (t / 60.0 - 4.0) / 24.0)
        return self._base_walk_in_rate_per_min() * wave * self._segment_mult(t, "walk_in")

    def _walk_ins(self):
        max_rate = (
            self._base_walk_in_rate_per_min()
            * (1 + PROFILE["assumptions"]["arrival_rate_variation"])
            * self._rate_ceiling("walk_in")
        )
        while True:
            yield self.env.timeout(self._walk_in_rng.expovariate(max_rate))
            # Thinning for a time-varying rate.
            if self._walk_in_rng.random() <= self._walk_in_rate_per_min(self.now) / max_rate:
                self._walk_in_counter += 1
                pid = f"P{self._walk_in_counter:04d}"
                self._spawn(pid, self._adjust(pid, walk_in_inputs(self.seed, pid)))

    def _scripted_walk_in(self, at: float, pid: str, supplied: SuppliedInputs):
        yield self.env.timeout(at)
        self._spawn(pid, supplied)

    def _ambulance_stream(self):
        d = self.definition
        thin = "surges" in d or "rate_ceiling" in d
        ceiling = self._rate_ceiling("ambulance") if thin else 1.0
        rate = PROFILE["assumptions"]["ambulance_runs_per_hour_average"] / 60.0 * self._rate_mult * ceiling
        counter = 0
        while True:
            yield self.env.timeout(self._ambulance_rng.expovariate(rate))
            if thin and self._ambulance_rng.random() > self._segment_mult(self.now, "ambulance") / ceiling:
                continue
            counter += 1
            run = generate_ambulance_run(self.seed, f"A{counter:03d}", self.now)
            run.patients = [self._adjust(f"{run.id}:{i}", s) for i, s in enumerate(run.patients, start=1)]
            self.env.process(self._ambulance(run))

    def _ambulance(self, run: AmbulanceRun):
        if run.announce_min > self.now:
            yield self.env.timeout(run.announce_min - self.now)
        acuity = (
            [
                {"acuity": f"{s.acuity_system} {s.acuity_score}", "urgency": s.urgency,
                 "critical_bypass": s.critical_bypass}
                for s in run.patients
            ]
            if run.acuity_known
            else None
        )
        ann = Announcement(
            id=run.id,
            received_min=self.now,
            eta_min=run.eta_min,
            uncertainty_min=run.uncertainty_min,
            patient_count=len(run.patients),
            acuity=acuity,
            source_updated_min=self.now,
        )
        self.announcements[run.id] = ann
        self._emit("ambulance_announced", None, ann.public(self.now), ambulance_id=run.id)

        steps: list[tuple[float, str]] = []
        if run.update is not None:
            steps.append((run.update[0], "update"))
        if run.cancel_min is not None:
            steps.append((run.cancel_min, "cancel"))
        if run.arrive_min is not None:
            steps.append((run.arrive_min, "arrive"))
        for at, kind in sorted(steps):
            if at > self.now:
                yield self.env.timeout(at - self.now)
            if ann.state == "cancelled":
                return  # cancelled from outside before the scripted step
            ann.source_updated_min = self.now
            if kind == "update":
                ann.eta_min = run.update[1]  # type: ignore[index]
                self._emit("ambulance_updated", None, ann.public(self.now), ambulance_id=run.id)
            elif kind == "cancel":
                ann.state, ann.closed_min = "cancelled", self.now
                self._emit("ambulance_cancelled", None, ann.public(self.now), ambulance_id=run.id)
                return
            else:
                ann.state, ann.closed_min = "arrived", self.now
                self._emit("ambulance_arrived", None, ann.public(self.now), ambulance_id=run.id)
                for i, supplied in enumerate(run.patients, start=1):
                    self._spawn(f"{run.id}-{i}", supplied)

    def _spawn(self, pid: str, supplied: SuppliedInputs) -> None:
        rng = random.Random(f"{self.seed}:{pid}")
        a = PROFILE["assumptions"]
        fixed = self.definition.get("fixed_minutes", {})
        p = Patient(
            id=pid,
            supplied=supplied,
            arrival_min=self.now,
            triage_min=_triangular(rng, a["triage_dwell_minutes"]),
            work_min=_triangular(rng, a["active_assessment_minutes"]),
            review_min=_triangular(random.Random(f"{self.seed}:{pid}:review"), a["result_review_minutes"]),
            allocation_min=fixed.get("allocation")
            or _triangular(random.Random(f"{self.seed}:{pid}:allocation"), a["ward_allocation_minutes"]),
            transport_min=fixed.get("transport")
            or _triangular(random.Random(f"{self.seed}:{pid}:transport"), a["transport_minutes"]),
            disposition_min=fixed.get("discharge") or _triangular(rng, a["disposition_processing_minutes"]),
            phase="awaiting_space" if supplied.critical_bypass else "awaiting_triage",
            phase_since_min=self.now,
        )
        self.patients[pid] = p
        # The first queue is entered at arrival, not through _set_phase: it counts as received work.
        self.work_entries.setdefault(WAIT_SERVICE[p.phase], []).append(self.now)
        self._emit(
            "arrival",
            pid,
            {
                "urgency": supplied.urgency,
                "acuity_system": supplied.acuity_system,
                "acuity_score": supplied.acuity_score,
                "critical_bypass": supplied.critical_bypass,
                "arrival_mode": supplied.arrival_mode,
                "ambulance_id": supplied.ambulance_id,
                "phase": p.phase,
                "zone": PHASE_ZONE[p.phase],
            },
            p.resources(),
        )
        self.env.process(self._patient(p))

    # -- patient flow --------------------------------------------------------------------
    def _decide(self, p: Patient) -> None:
        """The supplied clinical decision is received. Eligibility needs care and tests complete."""
        p.decision_min = self.now
        care_done = p.care_complete_min is not None
        tests_done = (not p.supplied.tests) or p.results_min is not None
        self._emit(
            "decision_received",
            p.id,
            {
                "care_complete": care_done,
                "tests_complete": tests_done,
                "eligible": care_done and tests_done,
            },
            p.resources(),
        )

    def _tests(self, p: Patient, rank: int):
        """Run the supplied tests in order. The patient keeps the ED space and holds no doctor."""
        for kind, minutes in p.supplied.tests:
            if kind == "lab":
                res, free, waiting, active = self.lab, self.free_lab, "awaiting_lab", "in_lab"
            else:
                res, free, waiting, active = self.imaging, self.free_imaging, "awaiting_imaging", "in_imaging"
            self._set_phase(p, waiting)
            req = res.request(priority=rank)
            yield req
            p.test_unit = self._take(free)
            self.test_starts.append((kind, self.now))
            self._set_phase(p, active)
            yield self.env.timeout(minutes)
            res.release(req)
            self._give_back(free, p.test_unit)
            self.test_log.append((kind, self.now))
            p.tests_done.append(kind)
            self._emit(
                "test_completed",
                p.id,
                {"test": kind, "unit": p.test_unit, "elapsed_min": round(minutes, 3)},
                p.resources(),
            )
            p.test_unit = None
        p.results_min = self.now

    def _care_task(self, p: Patient, minutes: float):
        yield self.env.timeout(minutes)
        p.care_complete_min = self.now
        self._emit(
            "care_completed",
            p.id,
            {"task": "stabilization", "elapsed_min": round(self.now - (p.first_assessment_min or 0), 3)},
            p.resources(),
        )
        p.care_done.succeed()

    def _patient(self, p: Patient):
        critical = p.supplied.critical_bypass
        rank = CRITICAL_RANK if critical else URGENCY_RANK[p.supplied.urgency]
        if critical:
            # Bypass registration: wait for a staffed resuscitation space inside the 24-space pool.
            pool = self.resus_pool
        else:
            triage_req = self.triage.request(priority=rank)
            yield triage_req
            p.triage_id = self._take(self.free_triage)
            p.triage_start_min = self.now
            self._set_phase(p, "in_triage")
            yield self.env.timeout(p.triage_min)
            self.triage.release(triage_req)
            self.free_triage.append(p.triage_id)
            p.triage_id = None
            self._set_phase(p, "awaiting_space")
            pool = self.general_pool
        p.space_id = yield pool.request(rank)
        p.space_grant_min = self.now
        p.nurse_id = pool.coverage[p.space_id]
        self._set_phase(p, "awaiting_clinician")
        clin_req = self.clinicians.request(priority=rank)
        yield clin_req
        p.clinician_id = self._take(self.free_clinicians)
        p.first_assessment_min = self.now
        if p.supplied.care_task_min is None:
            p.care_complete_min = self.now  # no required care task: prerequisites hold at once
        else:
            p.care_started = True
            p.care_done = self.env.event()
            self._emit("care_started", p.id, {"task": "stabilization"}, p.resources())
            self.env.process(self._care_task(p, p.supplied.care_task_min))
        self._set_phase(p, "assessment_active")
        yield self.env.timeout(p.work_min)
        # First assessment ends: the doctor slot is released, the ED space is not.
        self.clinicians.release(clin_req)
        self.free_clinicians.append(p.clinician_id)
        p.clinician_id = None
        p.tests_ordered = True
        if p.supplied.tests:
            # Supplied decision that arrives before the tests are done stays ineligible.
            if p.supplied.early_decision:
                self._decide(p)
            yield from self._tests(p, rank)
            # Results return to the clinician in zone 2 before the decision.
            self._set_phase(p, "awaiting_result_review")
            review_req = self.clinicians.request(priority=rank)
            yield review_req
            p.clinician_id = self._take(self.free_clinicians)
            p.review_start_min = self.now
            self._set_phase(p, "result_review_active")
            yield self.env.timeout(p.review_min)
            self.clinicians.release(review_req)
            self.free_clinicians.append(p.clinician_id)
            p.clinician_id = None
            p.review_end_min = self.now
        if p.decision_min is None:
            self._decide(p)
        if p.care_complete_min is None:
            # Decision received, required care not finished: holds the space, holds no doctor.
            self._set_phase(p, "awaiting_care_completion")
            yield p.care_done
        p.effective_disposition_min = self.now
        disposition = p.supplied.disposition
        if disposition == "home":
            # Cleared discharge: finite home-discharge processing.
            self._set_phase(p, "awaiting_discharge")
            req = self.discharge.request(priority=rank)
            yield req
            p.disp_unit = self._take(self.free_discharge)
            self._set_phase(p, "disposition_processing")
            yield self.env.timeout(p.disposition_min)
            self.discharge.release(req)
            self.free_discharge.append(p.disp_unit)
            p.disp_unit = None
        else:
            # Ward/ICU transfer: a suitable bed (reserved for the transfer), allocation work and
            # transport are all required. The ED space is kept through all of it (boarding).
            self._set_phase(p, "awaiting_ward_bed")
            p.ward_bed_id = yield self.ward_beds.request(disposition, rank)
            p.bed_reserved_min = self.now
            self._set_phase(p, "awaiting_ward_allocation")
            req = self.allocation.request(priority=rank)
            yield req
            p.disp_unit = self._take(self.free_allocation)
            p.allocation_start_min = self.now
            self._set_phase(p, "ward_allocation_active")
            yield self.env.timeout(p.allocation_min)
            self.allocation.release(req)
            self._give_back(self.free_allocation, p.disp_unit)
            p.disp_unit = None
            self._set_phase(p, "awaiting_transport")
            req = self.transport.request(priority=rank)
            yield req
            p.disp_unit = self._take(self.free_transport)
            p.transport_start_min = self.now
            self._set_phase(p, "in_transport")
            yield self.env.timeout(p.transport_min)
            self.transport.release(req)
            self.free_transport.append(p.disp_unit)
            p.disp_unit = None
        # Physical departure: the only point where the ED space is released.
        pool.release(p.space_id)
        p.departure_min = self.now
        self.departed_count += 1
        p.exit = "home" if disposition == "home" else "ward"
        if p.exit == "home":
            self.departed_home += 1
        else:
            self.departed_ward += 1
            self.ward_beds.occupy(p.ward_bed_id)
        # The departure event names the space it released and the exit taken.
        released, nurse = p.space_id, p.nurse_id
        p.space_id = None
        p.nurse_id = None
        p.phase, previous = "departed", p.phase
        p.phase_since_min = self.now
        if previous in DONE_SERVICE:
            self.work_done.setdefault(DONE_SERVICE[previous], []).append(self.now)
        self._emit(
            "phase_change",
            p.id,
            {
                "from": previous,
                "to": "departed",
                "zone": None,
                "has_space": False,
                "exit": p.exit,
                "disposition": disposition,
            },
            {
                "triage_desk": None,
                "ed_space": released,
                "clinician_slot": None,
                "nurse": nurse,
                "ward_bed": p.ward_bed_id,
            },
        )

    def waiting_reason(self, p: Patient) -> str | None:
        """Plain reason a zone 4 patient is waiting (never an invented one)."""
        if p.phase == "awaiting_discharge":
            return "Discharge processing is busy"
        if p.phase == "awaiting_ward_allocation":
            return "Ward allocation coordinator is busy"
        if p.phase == "awaiting_transport":
            return "Transport team is busy"
        if p.phase == "awaiting_ward_bed":
            kind = p.supplied.disposition
            other = "icu" if kind == "ward" else "ward"
            names = {"ward": "ward", "icu": "ICU"}
            c = self.ward_beds.counts()
            if c[other]["free"] > 0:
                return (
                    f"Unsuitable bed: needs an {names[kind]} bed, only {names[other]} beds are free "
                    f"({c[other]['free']})"
                )
            return (
                f"Unavailable bed: all {c[kind]['total']} {names[kind]} beds are occupied or reserved "
                f"for other transfers"
            )
        return None

    def _inputs_ok(self, service: str) -> bool:
        """A service's inputs are usable when its source is fresh (its newest valid update is no more
        than ten simulated minutes old) and no fixture declares them missing for an interval."""
        for start, end, services in self.definition.get("missing_inputs", []):
            if start <= self.now < end and service in services:
                return False
        return self.gate.fresh(SERVICE_SOURCE[service], self.now)

    def missing_services(self) -> list[str]:
        """Services a fixture currently declares missing (as opposed to a stale feed)."""
        return sorted(
            {s for start, end, services in self.definition.get("missing_inputs", []) if start <= self.now < end
             for s in services}
        )

    def _record(self) -> None:
        """Remember this minute's true readings (see local_readings, _overall_inputs)."""
        for sid, (q, blocked) in self._raw_readings().items():
            self._hist[sid].append((self.now, q, blocked))
        self._hist_overall.append((self.now, self.available_general_spaces(), self.awaiting_space()))

    @staticmethod
    def _at(hist: list[tuple], asof: float) -> tuple | None:
        for entry in reversed(hist):
            if entry[0] <= asof + 1e-9:
                return entry
        return None

    def _overall_inputs(self) -> tuple[int, int] | None:
        """Available staffed spaces and patients awaiting a space as the feeds describe them, or None
        when a source they need is older than ten simulated minutes."""
        srcs = ("spaces", "staffing")
        if "space" in self.missing_services():
            return None
        if not all(self.gate.fresh(s, self.now) for s in srcs):
            return None
        asof = min(self.gate.observed_as_of(s, self.now) for s in srcs)
        if asof >= self.now - 1e-9:
            return self.available_general_spaces(), self.awaiting_space()
        entry = self._at(self._hist_overall, asof)
        return (entry[1], entry[2]) if entry else (0, 0)

    def _raw_readings(self) -> dict[str, tuple[int, bool]]:
        gp, rp = self.general_pool, self.resus_pool
        space_blocked = (len(gp.waiting) > 0 and not gp.free_staffed()) or (
            len(rp.waiting) > 0 and not rp.free_staffed()
        )
        beds_waiting = len(self.ward_beds.waiting)
        def unit(res: Any) -> tuple[int, bool]:
            # Capacity is unavailable only when the service has no staffed unit at all.
            return len(res.queue), res.capacity == 0

        return {
            "triage": unit(self.triage),
            "assessment": unit(self.clinicians),
            "space": (len(gp.waiting) + len(rp.waiting), space_blocked),
            "lab": unit(self.lab),
            "imaging": unit(self.imaging),
            "discharge": unit(self.discharge),
            "allocation": unit(self.allocation),
            "transport": unit(self.transport),
            # A waiter exists only when no suitable free bed of its type does.
            "ward_beds": (beds_waiting, beds_waiting > 0),
        }

    def local_readings(self) -> dict[str, dict[str, Any]]:
        """Queue and capacity readings as the feeds describe them: live while a source is healthy, the
        last minute before a stop, or the minute a delayed feed's data is from."""
        raw = self._raw_readings()
        out: dict[str, dict[str, Any]] = {}
        for sid, (q, blocked) in raw.items():
            asof = self.gate.observed_as_of(SERVICE_SOURCE[sid], self.now)
            if asof < self.now - 1e-9:
                entry = self._at(self._hist[sid], asof)
                q, blocked = (entry[1], entry[2]) if entry else (0, False)
            out[sid] = {"queue": q, "capacity_unavailable": blocked, "inputs_ok": self._inputs_ok(sid)}
        return out

    def _monitor_loop(self):
        while True:
            yield self.env.timeout(1.0)
            self._record()
            inputs = self._overall_inputs()
            if inputs is None:
                self.monitor.degrade()
            else:
                self.monitor.tick(self.now, *inputs)
            self.local.tick(self.now, self.local_readings())
            self.gate.flush(self.now)

    # -- messages from outside the replay ---------------------------------------------------
    def _inject(self, inj: dict[str, Any]):
        if inj["at"] > self.now:
            yield self.env.timeout(inj["at"] - self.now)
        self.gate.receive(inj["message"], inj["source"], self)

    def apply_external_announcement(self, amb: str, eta: float, uncertainty: float, patients: int) -> None:
        ann = Announcement(
            id=amb, received_min=self.now, eta_min=eta, uncertainty_min=uncertainty,
            patient_count=patients, acuity=None, source_updated_min=self.now,
        )
        self.announcements[amb] = ann
        self._emit("ambulance_announced", None, ann.public(self.now), ambulance_id=amb)

    def apply_external_eta(self, amb: str, eta: float) -> None:
        ann = self.announcements[amb]
        ann.eta_min = eta
        ann.source_updated_min = self.now
        self._emit("ambulance_updated", None, ann.public(self.now), ambulance_id=amb)

    def apply_external_ambulance_cancel(self, amb: str) -> None:
        ann = self.announcements[amb]
        ann.state, ann.closed_min = "cancelled", self.now
        ann.source_updated_min = self.now
        self._emit("ambulance_cancelled", None, ann.public(self.now), ambulance_id=amb)

    # -- read models ---------------------------------------------------------------------
    def active_patients(self) -> list[Patient]:
        return [p for p in self.patients.values() if p.phase != "departed"]
