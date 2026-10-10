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

from .fixtures import FIXTURES
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
    "disposition_processing": 4,
    "departed": None,
}


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
            "decision_received": self.decision_min is not None,
            "phase_since_min": round(self.phase_since_min, 2),
            "minutes_in_phase": round(now - self.phase_since_min, 2),
            "arrival_min": round(self.arrival_min, 2),
        }

    def timestamps(self) -> dict[str, Any]:
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
            "departure_min": r(self.departure_min),
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

    @property
    def capacity(self) -> int:
        return len(self.ids)

    @property
    def count(self) -> int:
        return len(self.held)

    def is_staffed(self, space_id: str) -> bool:
        return self.coverage[space_id] in self.on_duty

    def free_staffed(self) -> list[str]:
        return [s for s in self.ids if s not in self.held and self.is_staffed(s)]

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
        # Named units so events and state say which unit a patient holds. Always the lowest free
        # id, so allocation is deterministic for a seed.
        self.free_triage = [f"T{i}" for i in range(1, PROFILE["triage_slots"] + 1)]
        self.free_clinicians = [d["id"] for d in PROFILE["doctors"]]
        self.patients: dict[str, Patient] = {}
        self.announcements: dict[str, Announcement] = {}
        self.events: list[dict[str, Any]] = []
        self.departed_count = 0
        self.monitor = CongestionMonitor()
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
        self.events.append(
            {
                "id": f"E{len(self.events) + 1:06d}",
                "type": etype,
                "event_time_min": round(self.now, 3),
                "received_time_min": round(self.now, 3),
                "patient_id": patient_id,
                "ambulance_id": ambulance_id,
                "resources": resources or {},
                "payload": payload,
            }
        )

    @staticmethod
    def _take(pool: list[str]) -> str:
        pool.sort()
        return pool.pop(0)

    def _set_phase(self, p: Patient, phase: str) -> None:
        previous = p.phase
        p.phase = phase
        p.phase_since_min = self.now
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

    def _walk_in_rate_per_min(self, t: float) -> float:
        variation = PROFILE["assumptions"]["arrival_rate_variation"]
        # Slow daily wave around the average, peaking mid-shift (demo assumption).
        wave = 1.0 + variation * math.sin(2 * math.pi * (t / 60.0 - 4.0) / 24.0)
        return self._base_walk_in_rate_per_min() * wave

    def _walk_ins(self):
        max_rate = self._base_walk_in_rate_per_min() * (1 + PROFILE["assumptions"]["arrival_rate_variation"])
        while True:
            yield self.env.timeout(self._walk_in_rng.expovariate(max_rate))
            # Thinning for a time-varying rate.
            if self._walk_in_rng.random() <= self._walk_in_rate_per_min(self.now) / max_rate:
                self._walk_in_counter += 1
                pid = f"P{self._walk_in_counter:04d}"
                self._spawn(pid, walk_in_inputs(self.seed, pid))

    def _scripted_walk_in(self, at: float, pid: str, supplied: SuppliedInputs):
        yield self.env.timeout(at)
        self._spawn(pid, supplied)

    def _ambulance_stream(self):
        rate = PROFILE["assumptions"]["ambulance_runs_per_hour_average"] / 60.0 * self._rate_mult
        counter = 0
        while True:
            yield self.env.timeout(self._ambulance_rng.expovariate(rate))
            counter += 1
            run = generate_ambulance_run(self.seed, f"A{counter:03d}", self.now)
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
        p = Patient(
            id=pid,
            supplied=supplied,
            arrival_min=self.now,
            triage_min=_triangular(rng, a["triage_dwell_minutes"]),
            work_min=_triangular(rng, a["active_assessment_minutes"]),
            review_min=_triangular(random.Random(f"{self.seed}:{pid}:review"), a["result_review_minutes"]),
            disposition_min=_triangular(rng, a["disposition_processing_minutes"]),
            phase="awaiting_space" if supplied.critical_bypass else "awaiting_triage",
            phase_since_min=self.now,
        )
        self.patients[pid] = p
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
            free.append(p.test_unit)
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
        self._set_phase(p, "disposition_processing")
        yield self.env.timeout(p.disposition_min)
        # Physical departure: the only point where the ED space is released.
        pool.release(p.space_id)
        p.departure_min = self.now
        self.departed_count += 1
        # The departure event names the space it released.
        released, nurse = p.space_id, p.nurse_id
        p.space_id = None
        p.nurse_id = None
        p.phase, previous = "departed", p.phase
        p.phase_since_min = self.now
        self._emit(
            "phase_change",
            p.id,
            {"from": previous, "to": "departed", "zone": None, "has_space": False},
            {"triage_desk": None, "ed_space": released, "clinician_slot": None, "nurse": nurse},
        )

    def _monitor_loop(self):
        while True:
            yield self.env.timeout(1.0)
            self.monitor.tick(self.now, self.available_general_spaces(), self.awaiting_space())

    # -- read models ---------------------------------------------------------------------
    def active_patients(self) -> list[Patient]:
        return [p for p in self.patients.values() if p.phase != "departed"]
