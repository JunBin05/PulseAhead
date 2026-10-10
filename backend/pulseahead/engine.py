"""SimPy patient-flow engine for the fictional ED.

Ticket 01 scope: arrival -> doctor assessment -> cleared departure, with a finite ED-space pool and
finite clinician-work slots. A patient keeps the same ED space until physical departure.

Every state change is emitted as an event. The API exposes only events whose time has been
reached; the engine never generates anything beyond the simulated time it was asked to reach.
All per-patient random values come from a generator keyed by (seed, patient id), so patient demand
and care requirements do not depend on scheduling order (needed later for paired comparisons).
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Any

import simpy

from .profile import (
    PROFILE,
    SCENARIOS,
    URGENCY_GROUPS,
    URGENCY_MIX,
    URGENCY_RANK,
)

PHASES = (
    "arrival",
    "awaiting_space",
    "awaiting_clinician",
    "assessment_active",
    "disposition_processing",
    "departed",
)

PHASE_ZONE = {
    "arrival": 1,
    "awaiting_space": 2,
    "awaiting_clinician": 2,
    "assessment_active": 2,
    "disposition_processing": 4,
    "departed": None,
}


def _triangular(rng: random.Random, spec: dict[str, float]) -> float:
    return rng.triangular(spec["min"], spec["max"], spec["mode"])


@dataclass
class Patient:
    id: str
    urgency: str
    arrival_min: float
    triage_min: float
    work_min: float
    disposition_min: float
    phase: str = "arrival"
    phase_since_min: float = 0.0
    has_space: bool = False
    space_id: str | None = None
    clinician_id: str | None = None
    first_assessment_min: float | None = None
    decision_min: float | None = None
    departure_min: float | None = None

    def public(self, now: float) -> dict[str, Any]:
        return {
            "id": self.id,
            "urgency": self.urgency,
            "phase": self.phase,
            "zone": PHASE_ZONE[self.phase],
            "has_space": self.has_space,
            "space_id": self.space_id,
            "clinician_id": self.clinician_id,
            "phase_since_min": round(self.phase_since_min, 2),
            "minutes_in_phase": round(now - self.phase_since_min, 2),
            "arrival_min": round(self.arrival_min, 2),
        }

    def timestamps(self) -> dict[str, Any]:
        def r(v: float | None) -> float | None:
            return None if v is None else round(v, 3)

        return {
            "patient_id": self.id,
            "urgency": self.urgency,
            "arrival_min": r(self.arrival_min),
            "first_assessment_min": r(self.first_assessment_min),
            "decision_min": r(self.decision_min),
            "departure_min": r(self.departure_min),
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
        if scenario not in SCENARIOS:
            raise ValueError(f"unknown scenario {scenario!r}")
        self.seed = seed
        self.scenario = scenario
        self.env = simpy.Environment()
        self.spaces = simpy.PriorityResource(self.env, capacity=PROFILE["regular_spaces"])
        self.clinicians = simpy.PriorityResource(self.env, capacity=PROFILE["clinician_slots"])
        # Named units so events and state can say which space and clinician slot a patient holds.
        # Always the lowest free id, so allocation is deterministic for a seed.
        self.free_spaces = [f"S{i:02d}" for i in range(1, PROFILE["regular_spaces"] + 1)]
        self.free_clinicians = [f"C{i}" for i in range(1, PROFILE["clinician_slots"] + 1)]
        self.patients: dict[str, Patient] = {}
        self.events: list[dict[str, Any]] = []
        self.departed_count = 0
        self.monitor = CongestionMonitor()
        self._arrival_rng = random.Random(f"{seed}:arrivals")
        self._counter = 0
        self._rate_mult = SCENARIOS[scenario]["rate_multiplier"]
        self.env.process(self._arrivals())
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
        return self.spaces.count

    def available_spaces(self) -> int:
        return PROFILE["regular_spaces"] - self.spaces.count

    def awaiting_space(self) -> int:
        return len(self.spaces.queue)

    # -- events --------------------------------------------------------------------------
    def _emit(
        self,
        etype: str,
        patient_id: str | None,
        payload: dict[str, Any],
        resources: dict[str, str | None] | None = None,
    ) -> None:
        self.events.append(
            {
                "id": f"E{len(self.events) + 1:06d}",
                "type": etype,
                "event_time_min": round(self.now, 3),
                "received_time_min": round(self.now, 3),
                "patient_id": patient_id,
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
            {
                "from": previous,
                "to": phase,
                "zone": PHASE_ZONE[phase],
                "has_space": p.has_space,
            },
            {"ed_space": p.space_id, "clinician_slot": p.clinician_id},
        )

    # -- processes -----------------------------------------------------------------------
    def _base_rate_per_min(self) -> float:
        return PROFILE["assumptions"]["arrival_rate_per_hour_average"] / 60.0 * self._rate_mult

    def _rate_per_min(self, t: float) -> float:
        variation = PROFILE["assumptions"]["arrival_rate_variation"]
        # Slow daily wave around the average, peaking mid-shift (demo assumption).
        wave = 1.0 + variation * math.sin(2 * math.pi * (t / 60.0 - 4.0) / 24.0)
        return self._base_rate_per_min() * wave

    def _arrivals(self):
        max_rate = self._base_rate_per_min() * (1 + PROFILE["assumptions"]["arrival_rate_variation"])
        while True:
            yield self.env.timeout(self._arrival_rng.expovariate(max_rate))
            # Thinning for a time-varying rate.
            if self._arrival_rng.random() <= self._rate_per_min(self.now) / max_rate:
                self._counter += 1
                self._spawn(f"P{self._counter:04d}")

    def _spawn(self, pid: str) -> None:
        rng = random.Random(f"{self.seed}:{pid}")
        a = PROFILE["assumptions"]
        draw = rng.random()
        cumulative = 0.0
        urgency = URGENCY_GROUPS[-1]
        for group in URGENCY_GROUPS:
            cumulative += URGENCY_MIX[group]
            if draw < cumulative:
                urgency = group
                break
        p = Patient(
            id=pid,
            urgency=urgency,
            arrival_min=self.now,
            triage_min=_triangular(rng, a["triage_dwell_minutes"]),
            work_min=_triangular(rng, a["active_assessment_minutes"]),
            disposition_min=_triangular(rng, a["disposition_processing_minutes"]),
            phase_since_min=self.now,
        )
        self.patients[pid] = p
        self._emit(
            "arrival",
            pid,
            {"urgency": urgency, "phase": "arrival", "zone": 1, "arrival_mode": "walk-in"},
        )
        self.env.process(self._patient(p))

    def _patient(self, p: Patient):
        rank = URGENCY_RANK[p.urgency]
        yield self.env.timeout(p.triage_min)
        self._set_phase(p, "awaiting_space")
        space_req = self.spaces.request(priority=rank)
        yield space_req
        p.has_space = True
        p.space_id = self._take(self.free_spaces)
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
        self.spaces.release(space_req)
        self.free_spaces.append(p.space_id)
        p.has_space = False
        p.departure_min = self.now
        self.departed_count += 1
        # The departure event names the space it released.
        self._set_phase(p, "departed")
        p.space_id = None

    def _monitor_loop(self):
        while True:
            yield self.env.timeout(1.0)
            self.monitor.tick(self.now, self.available_spaces(), self.awaiting_space())

    # -- read models ---------------------------------------------------------------------
    def active_patients(self) -> list[Patient]:
        return [p for p in self.patients.values() if p.phase != "departed"]
