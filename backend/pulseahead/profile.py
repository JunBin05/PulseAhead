"""Fictional hospital profile. Plain data only; every value is a disclosed demo assumption."""

from __future__ import annotations

from typing import Any

PROFILE_ID = "fictional-ed-24"

URGENCY_GROUPS = ("urgent", "medium", "lower")
URGENCY_RANK = {"urgent": 0, "medium": 1, "lower": 2}
# Critical-bypass patients are served before every reporting group.
CRITICAL_RANK = -1

ZONES = (
    {"id": 1, "key": "arrival", "name": "Arrival and triage"},
    {"id": 2, "key": "assessment", "name": "Doctor assessment"},
    {"id": 3, "key": "diagnostics", "name": "Diagnostics and testing"},
    {"id": 4, "key": "disposition", "name": "Disposition"},
)

PROFILE: dict[str, Any] = {
    "id": PROFILE_ID,
    "name": "Fictional ED (synthetic)",
    "synthetic": True,
    "regular_spaces": 24,
    # Of the 24 regular spaces, these are resuscitation spaces held for supplied critical-bypass
    # arrivals (see OPEN_QUESTIONS.md, Q1). No extra beds exist beyond the 24.
    "resus_spaces": 2,
    "clinician_slots": 4,
    "triage_slots": 1,
    # Finite diagnostic units (spec defaults: two lab, one imaging). They serve patients who keep
    # their ED space; they are not ED beds.
    "lab_slots": 2,
    "imaging_slots": 1,
    "reserve_triage_team": {
        "size": 1,
        "active": False,
        "note": "Declared reserve; activating it is a staff-approved action in a later ticket.",
    },
    # Fictional named staff (OPEN_QUESTIONS Q3). Doctors D1-D4 each hold one clinician-work slot;
    # nurses each cover a fixed block of spaces, and an empty space is staffed only while its
    # covering nurse is on duty. Shared staff are listed once, never as extra capacity per zone.
    "doctors": [
        {"id": "D1", "name": "Dr. Okafor"},
        {"id": "D2", "name": "Dr. Lindqvist"},
        {"id": "D3", "name": "Dr. Moreau"},
        {"id": "D4", "name": "Dr. Tanaka"},
    ],
    "reserve_physician": {
        "id": "D5",
        "name": "Dr. Ibarra",
        "active": False,
        "note": "Declared reserve; activating it is a staff-approved action in a later ticket.",
    },
    "nurses": [
        {"id": "N1", "name": "Nurse Adeyemi", "covers": ["S01", "S02", "S03", "S04"]},
        {"id": "N2", "name": "Nurse Brandt", "covers": ["S05", "S06", "S07", "S08"]},
        {"id": "N3", "name": "Nurse Chen", "covers": ["S09", "S10", "S11", "S12"]},
        {"id": "N4", "name": "Nurse Dube", "covers": ["S13", "S14", "S15", "S16"]},
        {"id": "N5", "name": "Nurse Eriksen", "covers": ["S17", "S18", "S19", "S20"]},
        {"id": "N6", "name": "Nurse Fontaine", "covers": ["S21", "S22", "R1", "R2"]},
    ],
    "owners": {
        "ed_spaces": "ED attending lead",
        "clinician_slots": "ED attending lead",
        "doctors": "ED attending lead",
        "reserve_physician": "ED attending lead",
        "nurse_coverage": "ED nurse in charge",
        "lab": "Lab manager",
        "imaging": "Radiology manager",
        "triage_desk": "Triage charge nurse",
        "reserve_triage_team": "Triage charge nurse",
    },
    "acuity_system": "ESI",
    "assumptions": {
        "walk_in_rate_per_hour_average": 4.8,
        "arrival_rate_variation": 0.30,
        "ambulance_runs_per_hour_average": 1.0,
        "ambulance_patients_per_run": {"1": 0.85, "2": 0.15},
        "ambulance_announce_lead_minutes": {"min": 10, "max": 25},
        "ambulance_eta_uncertainty_minutes": 5,
        "ambulance_eta_update_probability": 0.40,
        "ambulance_cancel_probability": 0.07,
        "triage_dwell_minutes": {"min": 3, "mode": 5, "max": 8},
        "active_assessment_minutes": {"min": 5, "mode": 10, "max": 20},
        "disposition_processing_minutes": {"min": 6, "mode": 10, "max": 16},
        # Supplied care task for the urgent group and critical bypass: starts at first assessment and
        # runs alongside the doctor's work. Discharge or transfer needs it complete.
        "stabilization_task_minutes": {"min": 5, "mode": 15, "max": 30},
        # Test turnaround per task (triangular). Medians follow the spec defaults: lab about 30 min
        # (triangular 15/28/50 has median 30.4), imaging about 45 min (25/42/70 has median 44.9).
        "lab_turnaround_minutes": {"min": 15, "mode": 28, "max": 50, "median": 30},
        "imaging_turnaround_minutes": {"min": 25, "mode": 42, "max": 70, "median": 45},
        # Doctor work to review returned results before the decision.
        "result_review_minutes": {"min": 3, "mode": 5, "max": 8},
        # Supplied test needs by reporting group (critical bypass uses its own row). Patients with
        # no test take the direct 2 to 4 route.
        "test_need_probability": {
            "critical": {"lab": 0.90, "imaging": 0.50},
            "urgent": {"lab": 0.70, "imaging": 0.30},
            "medium": {"lab": 0.50, "imaging": 0.15},
            "lower": {"lab": 0.20, "imaging": 0.05},
        },
        "walk_in_urgency_mix": {"urgent": 0.08, "medium": 0.40, "lower": 0.52},
        "ambulance_urgency_mix": {"urgent": 0.30, "medium": 0.50, "lower": 0.20},
        "ambulance_critical_given_urgent": 0.35,
        "ambulance_acuity_known_at_announcement": 0.70,
        "acuity_by_group": {
            "critical": "ESI 1",
            "urgent": "ESI 2",
            "medium": "ESI 3",
            "lower": "ESI 4 or 5 (even split)",
        },
        "note": (
            "Fictional operational assumptions for the demo. They are not hospital staffing "
            "ratios or validated clinical thresholds. Acuity, urgency group and critical bypass "
            "are supplied inputs generated with the synthetic scenario; the flow model never "
            "assigns them. The ESI-to-group relationship above is a synthetic demo assumption. "
            "Walk-ins plus ambulance patients average about six arrivals per hour."
        ),
    },
    "congestion_rule": {
        "available_spaces": 0,
        "awaiting_space_at_least": 6,
        "confirm_after_minutes": 20,
        "clear_when_awaiting_below": 3,
        "clear_after_minutes": 10,
    },
}

SCENARIOS: dict[str, dict[str, Any]] = {
    "normal": {"id": "normal", "name": "Normal shift", "rate_multiplier": 1.0},
}
