"""SimPy patient-flow engine for the fictional ED.

Routes so far: walk-ins and non-critical ambulance patients queue for the finite triage desk
(zone 1), then wait for a general ED space, a clinician, assessment and cleared departure. Supplied
critical-bypass patients skip registration and wait for one of the resuscitation spaces inside the
24-space pool (zone 2). A patient keeps the same ED space until physical departure.

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
    clinician_id: str | None = None
    triage_id: str | None = None
    triage_start_min: float | None = None
    first_assessment_min: float | None = None
    decision_min: float | None = None
    departure_min: float | None = None

    @property
    def has_space(self) -> bool:
        return self.space_id is not None

    def resources(self) -> dict[str, str | None]:
        return {
            "triage_desk": self.triage_id,
            "ed_space": self.space_id,
            "clinician_slot": self.clinician_id,
        }

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
            "triage_id": self.triage_id,
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


class EDEngine:
    def __init__(self, seed: int, scenario: str = "normal") -> None:
        self.definition = scenario_definition(scenario)
        self.seed = seed
        self.scenario = scenario
        self.env = simpy.Environment()
        n_resus = PROFILE["resus_spaces"]
        n_general = PROFILE["regular_spaces"] - n_resus
        self.triage = simpy.PriorityResource(self.env, capacity=PROFILE["triage_slots"])
        self.general_spaces = simpy.PriorityResource(self.env, capacity=n_general)
        self.resus_spaces = simpy.PriorityResource(self.env, capacity=n_resus)
        self.clinicians = simpy.PriorityResource(self.env, capacity=PROFILE["clinician_slots"])
        # Named units so events and state say which unit a patient holds. Always the lowest free
        # id, so allocation is deterministic for a seed.
        self.free_triage = [f"T{i}" for i in range(1, PROFILE["triage_slots"] + 1)]
        self.free_general = [f"S{i:02d}" for i in range(1, n_general + 1)]
        self.free_resus = [f"R{i}" for i in range(1, n_resus + 1)]
        self.free_clinicians = [f"C{i}" for i in range(1, PROFILE["clinician_slots"] + 1)]
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
        return self.general_spaces.count + self.resus_spaces.count

    def available_general_spaces(self) -> int:
        return self.general_spaces.capacity - self.general_spaces.count

    def awaiting_space(self) -> int:
        return len(self.general_spaces.queue) + len(self.resus_spaces.queue)

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
    def _patient(self, p: Patient):
        critical = p.supplied.critical_bypass
        rank = CRITICAL_RANK if critical else URGENCY_RANK[p.supplied.urgency]
        if critical:
            # Bypass registration: wait for a resuscitation space inside the 24-space pool.
            pool, free = self.resus_spaces, self.free_resus
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
            pool, free = self.general_spaces, self.free_general
        space_req = pool.request(priority=rank)
        yield space_req
        p.space_id = self._take(free)
        self._set_phase(p, "awaiting_clinician")
        clin_req = self.clinicians.request(priority=rank)
        yield clin_req
        p.clinician_id = self._take(self.free_clinicians)
        p.first_assessment_min = self.now
        self._set_phase(p, "assessment_active")
        yield self.env.timeout(p.work_min)
        self.clinicians.release(clin_req)
        self.free_clinicians.append(p.clinician_id)
        p.clinician_id = None
        p.decision_min = self.now
        self._set_phase(p, "disposition_processing")
        yield self.env.timeout(p.disposition_min)
        # Physical departure: the only point where the ED space is released.
        pool.release(space_req)
        free.append(p.space_id)
        p.departure_min = self.now
        self.departed_count += 1
        # The departure event names the space it released.
        released = p.space_id
        p.space_id = None
        p.phase, previous = "departed", p.phase
        p.phase_since_min = self.now
        self._emit(
            "phase_change",
            p.id,
            {"from": previous, "to": "departed", "zone": None, "has_space": False},
            {"triage_desk": None, "ed_space": released, "clinician_slot": None},
        )

    def _monitor_loop(self):
        while True:
            yield self.env.timeout(1.0)
            self.monitor.tick(self.now, self.available_general_spaces(), self.awaiting_space())

    # -- read models ---------------------------------------------------------------------
    def active_patients(self) -> list[Patient]:
        return [p for p in self.patients.values() if p.phase != "departed"]
