"""Synthetic scenario inputs: what the outside world supplies to the ED.

Acuity, reporting urgency group and the critical-bypass flag are supplied inputs (in a real ED they
come from triage staff and ambulance crews). They are generated here with the synthetic scenario and
the flow model only reads them; it never assigns clinical acuity.

Ambulance runs are the replay's hidden script: the actual arrival time lives only here and inside
the engine, never in an observation response. Every random value is keyed by the seed plus a stable
identity, so inputs do not depend on simulation scheduling order.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from .profile import PROFILE, URGENCY_GROUPS


@dataclass(frozen=True)
class SuppliedInputs:
    urgency: str  # reporting urgency group: urgent | medium | lower
    acuity_system: str
    acuity_score: int
    critical_bypass: bool
    arrival_mode: str  # walk-in | ambulance
    ambulance_id: str | None = None


@dataclass
class AmbulanceRun:
    """One ambulance's full script. Only received parts are ever exposed."""

    id: str
    announce_min: float
    eta_min: float
    uncertainty_min: float
    patients: list[SuppliedInputs]
    acuity_known: bool
    # Hidden future: when updates, cancellation and arrival actually happen.
    update: tuple[float, float] | None = None  # (at_min, new_eta_min)
    cancel_min: float | None = None
    arrive_min: float | None = None


def _pick(rng: random.Random, mix: dict[str, float]) -> str:
    draw = rng.random()
    cumulative = 0.0
    for group in URGENCY_GROUPS:
        cumulative += mix[group]
        if draw < cumulative:
            return group
    return URGENCY_GROUPS[-1]


def _acuity(rng: random.Random, urgency: str, critical: bool) -> int:
    """Synthetic ESI score consistent with the supplied group (a disclosed demo assumption)."""
    if critical:
        return 1
    return {"urgent": 2, "medium": 3}.get(urgency) or (4 if rng.random() < 0.5 else 5)


def walk_in_inputs(seed: int, patient_id: str) -> SuppliedInputs:
    rng = random.Random(f"{seed}:{patient_id}:supplied")
    a = PROFILE["assumptions"]
    urgency = _pick(rng, a["walk_in_urgency_mix"])
    return SuppliedInputs(
        urgency=urgency,
        acuity_system=PROFILE["acuity_system"],
        acuity_score=_acuity(rng, urgency, False),
        critical_bypass=False,
        arrival_mode="walk-in",
    )


def ambulance_patient_inputs(seed: int, run_id: str, index: int) -> SuppliedInputs:
    rng = random.Random(f"{seed}:{run_id}:{index}:supplied")
    a = PROFILE["assumptions"]
    urgency = _pick(rng, a["ambulance_urgency_mix"])
    critical = urgency == "urgent" and rng.random() < a["ambulance_critical_given_urgent"]
    return SuppliedInputs(
        urgency=urgency,
        acuity_system=PROFILE["acuity_system"],
        acuity_score=_acuity(rng, urgency, critical),
        critical_bypass=critical,
        arrival_mode="ambulance",
        ambulance_id=run_id,
    )


def generate_ambulance_run(seed: int, run_id: str, announce_min: float) -> AmbulanceRun:
    rng = random.Random(f"{seed}:{run_id}:run")
    a = PROFILE["assumptions"]
    lead = rng.uniform(a["ambulance_announce_lead_minutes"]["min"], a["ambulance_announce_lead_minutes"]["max"])
    eta = announce_min + lead
    uncertainty = float(a["ambulance_eta_uncertainty_minutes"])
    count = 2 if rng.random() >= a["ambulance_patients_per_run"]["1"] else 1
    patients = [ambulance_patient_inputs(seed, run_id, i + 1) for i in range(count)]
    known = rng.random() < a["ambulance_acuity_known_at_announcement"]
    run = AmbulanceRun(run_id, announce_min, eta, uncertainty, patients, known)
    if rng.random() < a["ambulance_cancel_probability"]:
        run.cancel_min = announce_min + lead * rng.uniform(0.3, 0.7)
        return run
    # Actual arrival scatters around the first estimate; it is never shown as an ETA.
    run.arrive_min = max(announce_min + 3.0, eta + rng.gauss(0.0, 6.0))
    if rng.random() < a["ambulance_eta_update_probability"]:
        at = announce_min + (run.arrive_min - announce_min) * rng.uniform(0.3, 0.7)
        run.update = (at, max(at + 1.0, run.arrive_min + rng.gauss(0.0, 2.0)))
    return run
