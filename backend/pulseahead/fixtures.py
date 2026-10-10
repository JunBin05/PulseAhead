"""Controlled test fixtures, selectable only through the API (never listed in the staff UI).

Each fixture is a fully scripted scenario: no background arrivals, fixed supplied inputs, and a fixed
ambulance script, so Playwright MCP checks can predict exact outcomes. Service durations still come
from the keyed per-patient generator, so they are fixed per seed as well.
"""

from __future__ import annotations

from typing import Any

from .profile import PROFILE
from .scenario import AmbulanceRun, SuppliedInputs


def _walk_in(urgency: str, score: int) -> SuppliedInputs:
    return SuppliedInputs(urgency, PROFILE["acuity_system"], score, False, "walk-in")


def _amb(run_id: str, urgency: str, score: int, critical: bool = False) -> SuppliedInputs:
    return SuppliedInputs(urgency, PROFILE["acuity_system"], score, critical, "ambulance", run_id)


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


FIXTURES: dict[str, dict[str, Any]] = {
    "fixture-intake": {
        "id": "fixture-intake",
        "name": "Fixture: triage queue, critical bypass and ambulance feed",
        "fixture": True,
        "background_arrivals": False,
        "script": _intake_script,
    },
}
