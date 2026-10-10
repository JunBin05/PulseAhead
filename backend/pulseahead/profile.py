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
    # Disposition work (spec defaults: two discharge processing, one ward allocation, one transport
    # team). Ward/ICU beds are a finite pool outside the ED with a disclosed release schedule.
    "discharge_slots": 2,
    "ward_allocation_slots": 1,
    "transport_slots": 1,
    "ward_beds": [
        {"id": "WD1", "type": "ward", "free_at_min": 0},
        {"id": "WD2", "type": "ward", "free_at_min": 0},
        {"id": "WD3", "type": "ward", "free_at_min": 90},
        {"id": "WD4", "type": "ward", "free_at_min": 150},
        {"id": "WD5", "type": "ward", "free_at_min": 240},
        {"id": "WD6", "type": "ward", "free_at_min": 420},
        {"id": "IC1", "type": "icu", "free_at_min": 0},
        {"id": "IC2", "type": "icu", "free_at_min": 200},
    ],
    "reserve_triage_team": {
        "size": 1,
        "active": False,
        "note": "Declared reserve; activating it is a staff-approved action in a later ticket.",
    },
    # Declared reserve units for the two action presets built in the final build. Each is one extra
    # slot of an existing finite service, inactive until its owner approves a request; each adds work
    # capacity only (never a ward bed, a clearance, or a shorter test).
    "reserves": {
        "ward_allocation_coordinator": {
            "unit": "WA2", "service": "allocation", "owner_key": "ward_allocation",
            "name": "Reserve ward-allocation coordinator", "active": False,
            "note": "One extra ward-allocation work slot. It never creates a ward bed or a clinical clearance.",
        },
        "lab_reserve_slot": {
            "unit": "L3", "service": "lab", "owner_key": "lab",
            "name": "Reserve lab slot", "active": False,
            "note": "One extra lab slot. Turnaround per test is unchanged; results are never manufactured.",
        },
        "imaging_reserve_slot": {
            "unit": "I2", "service": "imaging", "owner_key": "imaging",
            "name": "Reserve imaging slot", "active": False,
            "note": "One extra imaging slot. Turnaround per test is unchanged; results are never manufactured.",
        },
        "transport_reserve_slot": {
            "unit": "TR2", "service": "transport", "owner_key": "transport",
            "name": "Reserve transport team", "active": False,
            "note": "One extra transport slot. Each transfer takes as long as before; it never creates a ward bed or a clinical clearance.",
        },
        "discharge_reserve_slot": {
            "unit": "DP3", "service": "discharge", "owner_key": "discharge_processing",
            "name": "Reserve discharge-processing slot", "active": False,
            "note": "One extra home-discharge processing slot. It never creates a clinical clearance; only already-cleared patients use it.",
        },
        # Declared reserve space X1 (a staffed cubicle kept closed) and its reserve nurse XN. Opening it adds
        # one staffed general ED space; it is never a ward bed and never clears a patient.
        "ed_surge_space": {
            "unit": "X1", "service": "space", "owner_key": "nurse_coverage", "nurse": "XN",
            "name": "Reserve staffed ED space (X1) with reserve nurse", "active": False,
            "note": "One extra staffed general ED space with its declared reserve nurse. It never creates a ward bed or a clinical clearance.",
        },
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
        "discharge_processing": "Ward supervisor / bed manager",
        "ward_allocation": "Ward supervisor / bed manager",
        "transport": "Ward supervisor / bed manager",
        "ward_beds": "Ward supervisor / bed manager",
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
        # Home discharge processing is "disposition_processing_minutes" above (median about 10).
        # Ward allocation work and transport per transfer (triangular, medians about 15).
        "ward_allocation_minutes": {"min": 10, "mode": 15, "max": 22, "median": 15},
        "transport_minutes": {"min": 10, "mode": 15, "max": 25, "median": 15},
        # Supplied disposition by reporting group (critical bypass has its own row); the rest go
        # home. Ward and ICU beds are not interchangeable.
        "disposition_probability": {
            "critical": {"icu": 0.50, "ward": 0.40},
            "urgent": {"icu": 0.08, "ward": 0.35},
            "medium": {"icu": 0.02, "ward": 0.15},
            "lower": {"icu": 0.0, "ward": 0.03},
        },
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
    # Local zone overload (spec initial demo values). Separate from the overall ED rule below.
    "local_rule": {
        "confirm_after_minutes": 10,
        "clear_after_minutes": 5,
        "thresholds": {
            "triage": 3,
            "assessment": 6,
            "lab": 4,
            "imaging": 2,
            "discharge": 3,
            "allocation": 3,
            "transport": 3,
        },
        "rate_window_minutes": 30,
        "note": "Departure thresholds apply to discharge, ward allocation and transport queues alike. Fictional demo values.",
    },
    "congestion_rule": {
        "available_spaces": 0,
        "awaiting_space_at_least": 6,
        "confirm_after_minutes": 20,
        "clear_when_awaiting_below": 3,
        "clear_after_minutes": 10,
    },
}

# Two-hour warm-up and eight-hour scored shift (spec editable defaults). A run starts empty at T+0; the
# warm-up and scored windows are recorded with every run for the evaluation tickets.
WARMUP_MIN = 120
SCORED_MIN = 480

ENGINE_VERSION = "flow-5"  # flow-5: staffed surge space action (no change without an approved action)
CATALOG_VERSION = "2"  # 2: adds the non-test "demo" seed partition (demo-case selection only)

# Seven retained scenario families (spec: normal shifts, busy shifts that recover, arrival surges,
# diagnostic delays, boarding blockages, mixed cascades, no-effective-action cases). Each is plain
# data read by the engine: arrival-rate segments (`surges`), extra or slower tests (`test_boosts`,
# `turnaround_scales`), a heavier admission mix (`disposition_boost`), a ward-bed schedule and a
# nurse roster. Windows are in simulated minutes from T+0 and are the replay's hidden future: they
# are saved with a run's evidence record but never appear in an observation response.
_FAMILIES: list[dict[str, Any]] = [
    {
        "id": "normal",
        "name": "Normal shift",
        "family": "normal",
        "demo": None,
        "description": "Ordinary demand with the disclosed arrival wave, walk-ins and announced ambulances.",
        "workload_variant": "Baseline arrival rate (about six patients per hour including ambulances).",
        "rate_multiplier": 1.0,
    },
    {
        "id": "busy-recovers",
        "name": "Busy shift that recovers",
        "family": "busy_recovers",
        "demo": None,
        "description": "A sustained busier spell mid-shift, then demand returns to the baseline.",
        "workload_variant": "Walk-in and ambulance demand about three times the baseline for roughly 90 minutes, then baseline.",
        "rate_multiplier": 1.0,
        "surges": [{"start": 60.0, "end": 150.0, "walk_in": 3.2, "ambulance": 2.5}],
    },
    {
        "id": "arrival-surge",
        "name": "Short arrival surge",
        "family": "arrival_surge",
        "demo": "recovering short surge",
        "description": "A short unannounced burst of walk-ins and ambulances that the ED works through.",
        "workload_variant": "About five times the walk-in rate for under half an hour, then baseline.",
        "rate_multiplier": 1.0,
        "surges": [{"start": 45.0, "end": 70.0, "walk_in": 5.0, "ambulance": 3.0}],
    },
    {
        "id": "diagnostic-delay",
        "name": "Diagnostic backlog",
        "family": "diagnostic_delay",
        "demo": "diagnostic-backlog demo",
        "description": "More patients need imaging and lab work and results come back slower; zone 3 backs up.",
        "workload_variant": "Extra imaging and lab demand with slower turnaround for about three hours.",
        "rate_multiplier": 1.0,
        "test_boosts": [
            {"kind": "imaging", "start": 0.0, "end": 240.0, "extra_prob": 0.8},
            {"kind": "lab", "start": 0.0, "end": 240.0, "extra_prob": 0.4},
        ],
        "turnaround_scales": [
            {"kind": "imaging", "start": 0.0, "end": 300.0, "scale": 2.0},
            {"kind": "lab", "start": 0.0, "end": 300.0, "scale": 1.5},
        ],
    },
    {
        "id": "boarding-blockage",
        "name": "Ward boarding blockage",
        "family": "boarding_blockage",
        "demo": "ward blockage",
        "description": "Admitted patients wait in ED spaces because few ward and ICU beds are free.",
        "workload_variant": "More admissions and a late bed-release schedule.",
        "rate_multiplier": 1.0,
        "disposition_boost": {"start": 0.0, "end": 420.0, "ward": 0.35},
        "ward_beds": [
            {"id": "WD1", "type": "ward", "free_at_min": 0},
            {"id": "WD2", "type": "ward", "free_at_min": 0},
            {"id": "WD3", "type": "ward", "free_at_min": 300},
            {"id": "WD4", "type": "ward", "free_at_min": 360},
            {"id": "WD5", "type": "ward", "free_at_min": 420},
            {"id": "WD6", "type": "ward", "free_at_min": 480},
            {"id": "IC1", "type": "icu", "free_at_min": 0},
            {"id": "IC2", "type": "icu", "free_at_min": 400},
        ],
    },
    {
        "id": "mixed-cascade",
        "name": "Mixed cascade",
        "family": "mixed_cascade",
        "demo": None,
        "description": "Slower imaging, a mid-shift surge, late ward beds and a nurse off duty together.",
        "workload_variant": "Imaging backlog, then a busier spell, a late bed schedule and one nurse away.",
        "rate_multiplier": 1.0,
        "surges": [{"start": 90.0, "end": 180.0, "walk_in": 1.8, "ambulance": 1.6}],
        "test_boosts": [{"kind": "imaging", "start": 30.0, "end": 180.0, "extra_prob": 0.35}],
        "turnaround_scales": [{"kind": "imaging", "start": 30.0, "end": 240.0, "scale": 1.6}],
        "disposition_boost": {"start": 0.0, "end": 360.0, "ward": 0.25},
        "ward_beds": [
            {"id": "WD1", "type": "ward", "free_at_min": 0},
            {"id": "WD2", "type": "ward", "free_at_min": 60},
            {"id": "WD3", "type": "ward", "free_at_min": 240},
            {"id": "WD4", "type": "ward", "free_at_min": 300},
            {"id": "WD5", "type": "ward", "free_at_min": 420},
            {"id": "WD6", "type": "ward", "free_at_min": 480},
            {"id": "IC1", "type": "icu", "free_at_min": 0},
            {"id": "IC2", "type": "icu", "free_at_min": 300},
        ],
        "staffing": [(100.0, "N3", False), (220.0, "N3", True)],
    },
    {
        "id": "no-effective-action",
        "name": "Surge that passes before help can land",
        "family": "no_effective_action",
        "demo": "no-effective-action case",
        "description": (
            "A heavy surge early in the shift followed by a quiet spell. By the time a staff-approved "
            "action could take effect the queues are already clearing, so an honest comparison should "
            "show no benefit."
        ),
        "workload_variant": "Heavy early surge, then demand well below baseline.",
        "rate_multiplier": 1.0,
        "surges": [
            {"start": 0.0, "end": 45.0, "walk_in": 7.0, "ambulance": 3.5},
            {"start": 45.0, "end": 600.0, "walk_in": 0.5, "ambulance": 0.5},
        ],
    },
]


def _partitions(index: int) -> dict[str, list[int]]:
    """Development, tuning and test seeds are kept apart (two tuning and four test seeds per family)."""
    return {
        "development": [7],
        "tuning": [1000 + 10 * index + 1, 1000 + 10 * index + 2],
        "test": [2000 + 10 * index + k for k in (1, 2, 3, 4)],
        # Extra non-test seeds used only to look for a demo case under frozen settings; never tuned on.
        "demo": [3000 + 10 * index + k for k in (1, 2, 3, 4)],
    }


SCENARIOS: dict[str, dict[str, Any]] = {}
for _i, _fam in enumerate(_FAMILIES):
    SCENARIOS[_fam["id"]] = {**_fam, "seed_partitions": _partitions(_i), "warmup_min": WARMUP_MIN, "scored_min": SCORED_MIN}

# Parameters that make up a scenario's workload variant (the hidden future of a run).
SCENARIO_PARAM_KEYS = (
    "rate_multiplier", "rate_ceiling", "surges", "test_boosts", "turnaround_scales", "disposition_boost",
    "ward_beds", "staffing",
)


def seed_partition(scenario: str, seed: int) -> str:
    parts = SCENARIOS.get(scenario, {}).get("seed_partitions")
    if not parts:
        return "fixture" if scenario not in SCENARIOS else "custom"
    for name, seeds in parts.items():
        if seed in seeds:
            return name
    return "custom"


def scenario_catalog() -> list[dict[str, Any]]:
    """Presenter-facing description of the families. It names the kind of workload variant but not the
    time windows, which are the replay's hidden future."""
    return [
        {
            "id": s["id"], "name": s["name"], "family": s["family"], "demo": s["demo"],
            "description": s["description"], "workload_variant": s["workload_variant"],
            "warmup_min": s["warmup_min"], "scored_min": s["scored_min"],
            "seed_partitions": s["seed_partitions"],
        }
        for s in SCENARIOS.values()
    ]
