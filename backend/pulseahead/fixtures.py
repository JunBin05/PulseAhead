"""Controlled test fixtures, selectable only through the API (never listed in the staff UI).

Each fixture is a fully scripted scenario: no background arrivals, fixed supplied inputs, and a fixed
ambulance script, so Playwright MCP checks can predict exact outcomes. Service durations still come
from the keyed per-patient generator, so they are fixed per seed as well.
"""

from __future__ import annotations

from typing import Any

from .profile import PROFILE
from .scenario import AmbulanceRun, SuppliedInputs


def _walk_in(urgency: str, score: int, care: float | None = None,
             tests: tuple[tuple[str, float], ...] = (), early: bool = False) -> SuppliedInputs:
    return SuppliedInputs(urgency, PROFILE["acuity_system"], score, False, "walk-in", None, care,
                          tests, early)


def _amb(run_id: str, urgency: str, score: int, critical: bool = False,
         care: float | None = None) -> SuppliedInputs:
    return SuppliedInputs(urgency, PROFILE["acuity_system"], score, critical, "ambulance", run_id, care)


def _intake_script() -> dict[str, Any]:
    return {
        # Four walk-ins at once against one triage desk: one in triage, three queued.
        "walk_ins": [
            (2.0, "W01", _walk_in("lower", 4)),
            (2.0, "W02", _walk_in("medium", 3)),
            (2.0, "W03", _walk_in("lower", 5)),
            (2.0, "W04", _walk_in("urgent", 2)),
        ],
        "ambulances": [
            # Two patients on one ambulance, on time.
            AmbulanceRun("A01", 1.0, 10.0, 5.0, [_amb("A01", "medium", 3), _amb("A01", "lower", 4)], True,
                         arrive_min=11.0),
            # ETA updated later; same identity throughout.
            AmbulanceRun("A02", 3.0, 18.0, 5.0, [_amb("A02", "medium", 3)], True,
                         update=(9.0, 26.0), arrive_min=27.0),
            # Cancelled before arrival.
            AmbulanceRun("A03", 4.0, 20.0, 5.0, [_amb("A03", "lower", 4)], True, cancel_min=12.0),
            # Overdue: ETA 15 passes at 15, actual arrival only at 30. Acuity unknown until arrival.
            AmbulanceRun("A04", 5.0, 15.0, 5.0, [_amb("A04", "urgent", 2)], False, arrive_min=30.0),
            # Three critical-bypass patients against two resuscitation spaces.
            AmbulanceRun("A05", 20.0, 35.0, 5.0,
                         [_amb("A05", "urgent", 1, True), _amb("A05", "urgent", 1, True),
                          _amb("A05", "urgent", 1, True)], True, arrive_min=35.0),
        ],
    }


def _staffing_script() -> dict[str, Any]:
    walk_ins = [
        (2.0, "W01", _walk_in("lower", 4)),
        (2.0, "W02", _walk_in("medium", 3)),
        (2.0, "W03", _walk_in("lower", 5)),
        (2.0, "W04", _walk_in("urgent", 2, 12.0)),
        (2.0, "W05", _walk_in("medium", 3)),
        (2.0, "W06", _walk_in("lower", 4)),
        (2.0, "W07", _walk_in("medium", 3)),
        (2.0, "W08", _walk_in("lower", 5)),
        (2.0, "W09", _walk_in("urgent", 2, 14.0)),
        (2.0, "W10", _walk_in("medium", 3)),
        (2.0, "W11", _walk_in("lower", 4)),
        (2.0, "W12", _walk_in("medium", 3)),
        (2.0, "W13", _walk_in("lower", 5)),
        (2.0, "W14", _walk_in("lower", 4)),
        # Arrives after the lower-urgency patients have already queued for a space.
        (40.0, "W15", _walk_in("urgent", 2, 8.0)),
    ]
    return {
        "walk_ins": walk_ins,
        "ambulances": [
            # Three critical patients against two resuscitation spaces. A 30-minute stabilization
            # task is longer than any assessment (5-20 min), so the decision arrives first.
            AmbulanceRun("A01", 1.0, 20.0, 5.0,
                         [_amb("A01", "urgent", 1, True, 30.0), _amb("A01", "urgent", 1, True, 30.0),
                          _amb("A01", "urgent", 1, True, 6.0)], True, arrive_min=20.0),
            AmbulanceRun("A02", 40.0, 60.0, 5.0, [_amb("A02", "urgent", 1, True, 10.0)], True,
                         arrive_min=60.0),
        ],
    }


def _diagnostics_script() -> dict[str, Any]:
    walk_ins = [
        # Lab: two units, 40-minute turnaround, so a lab queue forms.
        (2.0, "W01", _walk_in("medium", 3, tests=(("lab", 40.0),))),
        (2.0, "W02", _walk_in("medium", 3, tests=(("lab", 40.0),))),
        (2.0, "W03", _walk_in("lower", 4, tests=(("lab", 40.0),))),
        # Imaging: one unit, 60-minute turnaround.
        (2.0, "W04", _walk_in("medium", 3, tests=(("imaging", 60.0),))),
        (2.0, "W05", _walk_in("lower", 5, tests=(("imaging", 60.0),))),
        # Direct 2 to 4 route: no tests.
        (2.0, "W06", _walk_in("medium", 3)),
        (2.0, "W07", _walk_in("lower", 4)),
        # Both tests in order: lab, then imaging.
        (2.0, "W08", _walk_in("medium", 3, tests=(("lab", 35.0), ("imaging", 50.0)))),
        # Clinical decision received before the lab result: ineligible until tests and review end.
        (2.0, "W09", _walk_in("lower", 4, tests=(("lab", 30.0),), early=True)),
        (2.0, "W10", _walk_in("urgent", 2, 10.0, tests=(("lab", 30.0),))),
        (2.0, "W11", _walk_in("medium", 3, tests=(("imaging", 55.0),))),
        (2.0, "W12", _walk_in("lower", 4, tests=(("lab", 40.0),))),
        # Arrives while others already wait for the lab: urgent goes first.
        (30.0, "W13", _walk_in("urgent", 2, tests=(("lab", 20.0),))),
    ]
    return {"walk_ins": walk_ins, "ambulances": []}


FIXTURES: dict[str, dict[str, Any]] = {
    "fixture-intake": {
        "id": "fixture-intake",
        "name": "Fixture: triage queue, critical bypass and ambulance feed",
        "fixture": True,
        "background_arrivals": False,
        "script": _intake_script,
    },
    "fixture-diagnostics": {
        "id": "fixture-diagnostics",
        "name": "Fixture: lab and imaging queues, result review, direct route and premature decision",
        "fixture": True,
        "background_arrivals": False,
        "script": _diagnostics_script,
    },
    "fixture-staffing": {
        "id": "fixture-staffing",
        "name": "Fixture: shared staffing, unstaffed spaces and care prerequisites",
        "fixture": True,
        "background_arrivals": False,
        "script": _staffing_script,
        # Supplied staffing roster: nurses N1-N5 start the shift off duty (only N6 covers S21, S22,
        # R1, R2); N1 and N2 come on duty at 60 and stay for the rest of the run.
        "staffing": [
            (0.0, "N1", False), (0.0, "N2", False), (0.0, "N3", False),
            (0.0, "N4", False), (0.0, "N5", False),
            (60.0, "N1", True), (60.0, "N2", True),
        ],
    },
}
