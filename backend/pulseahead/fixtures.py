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
             tests: tuple[tuple[str, float], ...] = (), early: bool = False,
             disposition: str = "home") -> SuppliedInputs:
    return SuppliedInputs(urgency, PROFILE["acuity_system"], score, False, "walk-in", None, care,
                          tests, early, disposition)


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


def _boarding_script() -> dict[str, Any]:
    walk_ins = [
        # Home discharges: 25-minute processing on two slots, so the later ones queue.
        (2.0, "H1", _walk_in("lower", 4)),
        (2.0, "H2", _walk_in("lower", 5)),
        (2.0, "H3", _walk_in("medium", 3)),
        (2.0, "H4", _walk_in("medium", 3)),
        # Ward transfers: two beds free at once, the rest become free later.
        (2.0, "G1", _walk_in("medium", 3, disposition="ward")),
        (2.0, "G2", _walk_in("medium", 3, disposition="ward")),
        (2.0, "G3", _walk_in("lower", 4, disposition="ward")),
        (2.0, "G4", _walk_in("lower", 4, disposition="ward")),
        # ICU patients: the ICU bed is not free yet; ward beds are the wrong type.
        (2.0, "I1", _walk_in("medium", 3, disposition="icu")),
        (2.0, "I2", _walk_in("lower", 4, disposition="icu")),
        # Urgent transfer arriving while lower-urgency transfers already wait for a bed.
        (40.0, "U1", _walk_in("urgent", 2, disposition="ward")),
    ]
    return {"walk_ins": walk_ins, "ambulances": []}


def _surge_script() -> dict[str, Any]:
    # Twenty-four walk-ins at one instant against one triage desk: the triage queue is far above its
    # threshold and more than one row of dots. Spaces never run out, so only the triage zone alarms.
    urgencies = ["urgent"] * 2 + ["medium"] * 8 + ["lower"] * 14
    scores = {"urgent": 2, "medium": 3, "lower": 4}
    return {
        "walk_ins": [
            (2.5, f"Q{i:02d}", _walk_in(u, scores[u])) for i, u in enumerate(urgencies, start=1)
        ],
        "ambulances": [],
    }


def _congestion_script() -> dict[str, Any]:
    return {
        # Two urgent walk-ins whose long stabilization tasks keep the only two staffed general
        # spaces occupied (nurses N1-N5 are off duty), so no staffed general space is available.
        "walk_ins": [
            (1.5, "W01", _walk_in("urgent", 2, 400.0)),
            (1.5, "W02", _walk_in("urgent", 2, 400.0)),
        ],
        "ambulances": [
            # Eight critical patients at one instant against two resuscitation spaces: six wait.
            # Non-integer arrival so the per-minute monitor tick never ties with it.
            AmbulanceRun("A01", 5.0, 30.5, 5.0, [_amb("A01", "urgent", 1, True) for _ in range(8)], True,
                         arrive_min=30.5),
        ],
    }



def _feed_staffing_script() -> dict[str, Any]:
    # Steady demand and a live ambulance feed while the staffing feed is stopped.
    walk_ins = [
        (2.0, "W01", _walk_in("lower", 4)),
        (2.0, "W02", _walk_in("medium", 3)),
        (2.0, "W03", _walk_in("lower", 5)),
        (2.0, "W04", _walk_in("medium", 3)),
        (2.0, "W05", _walk_in("lower", 4)),
        (2.0, "W06", _walk_in("medium", 3)),
        (50.0, "W07", _walk_in("lower", 4)),
        (50.0, "W08", _walk_in("medium", 3)),
        (50.0, "W09", _walk_in("lower", 5)),
        (50.0, "W10", _walk_in("medium", 3)),
    ]
    return {
        "walk_ins": walk_ins,
        "ambulances": [
            AmbulanceRun("A01", 1.0, 10.0, 5.0, [_amb("A01", "medium", 3)], True, arrive_min=11.0),
            # Announced before the stop, ETA revised inside it: the ambulance feed stays healthy.
            AmbulanceRun("A02", 3.0, 60.0, 5.0, [_amb("A02", "lower", 4)], True,
                         update=(40.0, 70.0), arrive_min=71.0),
            AmbulanceRun("A03", 45.0, 85.0, 5.0, [_amb("A03", "medium", 3)], True, arrive_min=86.0),
        ],
    }


def _feed_faults_script() -> dict[str, Any]:
    walk_ins = [
        (2.0, "W01", _walk_in("lower", 4)),
        # Two ordinary tests whose events fall inside the delayed-diagnostics window.
        (2.0, "W02", _walk_in("medium", 3, tests=(("lab", 35.0),))),
        (2.0, "W03", _walk_in("lower", 5, tests=(("imaging", 40.0),))),
        (2.0, "W04", _walk_in("urgent", 2, 12.0)),
        # An extreme but valid test turnaround (supplied 130 min): must be kept, not discarded.
        (5.0, "W05", _walk_in("medium", 3, tests=(("lab", 130.0),))),
    ] + [
        # Ten arrivals in one minute: an extreme but valid surge.
        (30.0, f"B{i:02d}", _walk_in("lower", 4)) for i in range(1, 11)
    ]
    return {
        "walk_ins": walk_ins,
        "ambulances": [
            AmbulanceRun("A01", 1.0, 10.0, 5.0, [_amb("A01", "medium", 3), _amb("A01", "lower", 4)], True,
                         arrive_min=11.0),
            # ETA revised within its uncertainty (ordinary noise).
            AmbulanceRun("A02", 3.0, 18.0, 5.0, [_amb("A02", "medium", 3)], True,
                         update=(9.0, 26.0), arrive_min=27.0),
            AmbulanceRun("A03", 4.0, 20.0, 5.0, [_amb("A03", "lower", 4)], True, cancel_min=12.0),
            # ETA moved by 90 minutes: extreme but valid.
            AmbulanceRun("A05", 20.0, 35.0, 5.0, [_amb("A05", "urgent", 1, True)], True,
                         update=(25.0, 125.0), arrive_min=125.0),
        ],
    }


def _feed_optional_script() -> dict[str, Any]:
    walk_ins = [
        (2.0, "W01", _walk_in("medium", 3, tests=(("lab", 40.0),))),
        (2.0, "W02", _walk_in("medium", 3, tests=(("lab", 40.0),))),
        (2.0, "W03", _walk_in("lower", 4, tests=(("imaging", 60.0),))),
        (2.0, "W04", _walk_in("lower", 4)),
    ]
    return {
        "walk_ins": walk_ins,
        "ambulances": [
            AmbulanceRun("A01", 1.0, 45.0, 5.0, [_amb("A01", "medium", 3)], True, arrive_min=47.0),
            # Announced while the ambulance feed is stopped: never received.
            AmbulanceRun("A02", 30.0, 70.0, 5.0, [_amb("A02", "lower", 4)], True, arrive_min=72.0),
        ],
    }


def _inj(at: float, source: str, message: dict[str, Any]) -> dict[str, Any]:
    return {"at": at, "source": source, "message": message}


# External messages for fixture-feed-faults. They are the hidden schedule of what the outside world
# sends; each is validated on receipt against the received state.
_FEED_INJECTIONS = [
    # A real event id delivered a second time.
    _inj(13.0, "queues", {"id": "E000005", "type": "phase_change", "patient_id": "W01",
                          "event_time_min": 2.0, "payload": {"to": "awaiting_triage"}}),
    # W04 cannot go from its current phase straight to departed.
    _inj(14.0, "queues", {"id": "X-IMP-1", "type": "phase_change", "patient_id": "W04",
                          "event_time_min": 14.0, "payload": {"to": "departed"}}),
    # A stale replay of an old transition for W01: its newer state must be kept.
    _inj(15.0, "queues", {"id": "X-OOO-1", "type": "phase_change", "patient_id": "W01",
                          "event_time_min": 3.0, "payload": {"to": "in_triage"}}),
    _inj(16.0, "queues", {"id": "X-NEG-1", "type": "count_report", "service": "triage", "count": -3}),
    _inj(17.0, "spaces", {"id": "X-CNT-1", "type": "count_report", "service": "space", "count": 99}),
    # A01 already arrived at 11.
    _inj(18.0, "ambulance", {"id": "X-ETA-1", "type": "ambulance_updated", "ambulance_id": "A01",
                             "payload": {"eta_min": 30.0}}),
    _inj(19.0, "ambulance", {"id": "X-ETA-2", "type": "ambulance_updated", "ambulance_id": "A99",
                             "payload": {"eta_min": 40.0}}),
    # ETA before the announcement, and an impossible patient count.
    _inj(21.0, "ambulance", {"id": "X-ANN-1", "type": "ambulance_announced", "ambulance_id": "A07",
                             "payload": {"patient_count": 2, "eta_min": 5.0}}),
    _inj(22.0, "ambulance", {"id": "X-ANN-2", "type": "ambulance_announced", "ambulance_id": "A08",
                             "payload": {"patient_count": 0, "eta_min": 40.0}}),
    # An older update than A02's latest (T+9).
    _inj(23.0, "ambulance", {"id": "X-ETA-3", "type": "ambulance_updated", "ambulance_id": "A02",
                             "event_time_min": 1.0, "payload": {"eta_min": 24.0}}),
    # A valid ETA update from outside: applied.
    _inj(24.0, "ambulance", {"id": "X-ETA-4", "type": "ambulance_updated", "ambulance_id": "A05",
                             "payload": {"eta_min": 38.0}}),
    _inj(26.0, "queues", {"id": "X-FUT-1", "type": "phase_change", "patient_id": "W02",
                          "event_time_min": 60.0, "payload": {"to": "in_triage"}}),
    _inj(27.0, "queues", {"id": "X-UNK-1", "type": "phase_change", "patient_id": "Z999",
                          "event_time_min": 27.0, "payload": {"to": "in_triage"}}),
]

FIXTURES: dict[str, dict[str, Any]] = {
    "fixture-intake": {
        "id": "fixture-intake",
        "name": "Fixture: triage queue, critical bypass and ambulance feed",
        "fixture": True,
        "background_arrivals": False,
        "script": _intake_script,
    },
    "fixture-boarding": {
        "id": "fixture-boarding",
        "name": "Fixture: discharge processing, ward/ICU beds, transport and boarding",
        "fixture": True,
        "background_arrivals": False,
        "script": _boarding_script,
        # Fixed work durations so contention is predictable.
        "fixed_minutes": {"discharge": 25.0, "allocation": 20.0, "transport": 20.0},
        # Supplied bed release schedule (hidden future). IC2 is never released within the run.
        "ward_beds": [
            {"id": "WD1", "type": "ward", "free_at_min": 0},
            {"id": "WD2", "type": "ward", "free_at_min": 0},
            {"id": "WD3", "type": "ward", "free_at_min": 70},
            {"id": "WD4", "type": "ward", "free_at_min": 100},
            {"id": "WD5", "type": "ward", "free_at_min": 130},
            {"id": "WD6", "type": "ward", "free_at_min": 160},
            {"id": "IC1", "type": "icu", "free_at_min": 120},
            {"id": "IC2", "type": "icu", "free_at_min": 100000},
        ],
    },
    "fixture-congestion-boundary": {
        "id": "fixture-congestion-boundary",
        "name": "Fixture: sustained space shortage for exact congestion and recovery boundaries",
        "fixture": True,
        "background_arrivals": False,
        "script": _congestion_script,
        "staffing": [
            (0.0, "N1", False), (0.0, "N2", False), (0.0, "N3", False),
            (0.0, "N4", False), (0.0, "N5", False),
        ],
    },
    "fixture-queue-surge": {
        "id": "fixture-queue-surge",
        "name": "Fixture: 24 walk-ins at once, a triage-only overload (overall ED status stays Stable)",
        "fixture": True,
        "background_arrivals": False,
        "script": _surge_script,
    },
    "fixture-diagnostics-gap": {
        "id": "fixture-diagnostics-gap",
        "name": "Fixture: diagnostics with the imaging queue feed missing for 30 minutes",
        "fixture": True,
        "background_arrivals": False,
        "script": _diagnostics_script,
        # Supplied faulty feed: imaging queue and capacity inputs are missing from 90 to 120.
        "missing_inputs": [(90.0, 120.0, ["imaging"])],
    },
    "fixture-diagnostics": {
        "id": "fixture-diagnostics",
        "name": "Fixture: lab and imaging queues, result review, direct route and premature decision",
        "fixture": True,
        "background_arrivals": False,
        "script": _diagnostics_script,
    },
    "fixture-feed-staffing-stop": {
        "id": "fixture-feed-staffing-stop",
        "name": "Fixture: staffing feed stopped from T+32 to T+70 while the replay and ambulance feeds stay healthy",
        "fixture": True,
        "background_arrivals": False,
        "script": _feed_staffing_script,
        # Hidden schedule: two nurses go off duty during the outage, which the staffing feed never
        # reports until it resumes.
        "staffing": [(45.0, "N1", False), (55.0, "N2", False)],
        "feed_faults": [{"source": "staffing", "kind": "stop", "start": 32.0, "end": 70.0}],
    },
    "fixture-feed-faults": {
        "id": "fixture-feed-faults",
        "name": "Fixture: duplicate, delayed, out-of-order and invalid inputs, with valid outliers kept",
        "fixture": True,
        "background_arrivals": False,
        "script": _feed_faults_script,
        "feed_faults": [
            # Every queue event is delivered twice from T+2 to T+12.
            {"source": "queues", "kind": "duplicate", "start": 2.0, "end": 12.0},
            # Lab and imaging events arrive six minutes late from T+40 to T+90.
            {"source": "diagnostics", "kind": "delay", "start": 40.0, "end": 90.0, "delay_min": 6.0},
        ],
        "injections": _FEED_INJECTIONS,
    },
    "fixture-feed-optional-stop": {
        "id": "fixture-feed-optional-stop",
        "name": "Fixture: ambulance feed stopped T+25 to T+60 and diagnostics feed stopped T+40 to T+80",
        "fixture": True,
        "background_arrivals": False,
        "script": _feed_optional_script,
        "feed_faults": [
            {"source": "ambulance", "kind": "stop", "start": 25.0, "end": 60.0},
            {"source": "diagnostics", "kind": "stop", "start": 40.0, "end": 80.0},
        ],
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
