"""Replay sessions: plain-data state, versioning, and the observed-state read model.

A session owns one engine. Observation responses are built only from received state and events;
nothing beyond the current simulated time is ever exposed.
"""

from __future__ import annotations

import threading
import uuid
from typing import Any

from .engine import EDEngine
from .profile import PROFILE, PROFILE_ID, ZONES

MAX_ADVANCE_MIN = 60.0
API_VERSION = "v1"


class ReplaySession:
    def __init__(self, seed: int, scenario: str) -> None:
        self.id = uuid.uuid4().hex[:12]
        self.seed = seed
        self.scenario = scenario
        self.run_number = 1
        self.version = 1
        self.lock = threading.Lock()
        self.engine = EDEngine(seed, scenario)

    # -- commands ------------------------------------------------------------------------
    def advance(self, minutes: float, expected_version: int | None = None) -> dict[str, Any] | None:
        with self.lock:
            if expected_version is not None and expected_version != self.version:
                return None
            self.engine.run_until(self.engine.now + minutes)
            self.version += 1
            return self.snapshot()

    def reset(self, seed: int | None = None, scenario: str | None = None) -> dict[str, Any]:
        with self.lock:
            if seed is not None:
                self.seed = seed
            if scenario is not None:
                self.scenario = scenario
            self.engine = EDEngine(self.seed, self.scenario)
            self.run_number += 1
            self.version += 1
            return self.snapshot()

    # -- read models ---------------------------------------------------------------------
    def snapshot(self) -> dict[str, Any]:
        e = self.engine
        now = e.now
        active = e.active_patients()
        patients = [
            {**p.public(now), "waiting_reason": e.waiting_reason(p)}
            for p in sorted(active, key=lambda p: p.id)
        ]

        def in_phase(*phases: str) -> list[str]:
            return [p["id"] for p in patients if p["phase"] in phases]

        zone_defs = {z["id"]: z for z in ZONES}
        zones = []
        for zid in (1, 2, 3, 4):
            if zid == 1:
                ids = in_phase("awaiting_triage", "in_triage")
                detail = {"queue": len(in_phase("awaiting_triage")), "active": len(in_phase("in_triage"))}
                # No treatment-bed pool in zone 1.
                capacity = {"kind": "triage_desk", "treatment_beds": None}
            elif zid == 2:
                ids = in_phase(
                    "awaiting_space",
                    "awaiting_clinician",
                    "assessment_active",
                    "awaiting_result_review",
                    "result_review_active",
                    "awaiting_care_completion",
                )
                detail = {
                    "queue": len(in_phase("awaiting_space", "awaiting_clinician", "awaiting_result_review")),
                    "active": len(in_phase("assessment_active", "result_review_active")),
                    "awaiting_space": len(in_phase("awaiting_space")),
                    "awaiting_clinician": len(in_phase("awaiting_clinician")),
                    # Returning from diagnostics: results are waiting for, or under, doctor review.
                    "awaiting_result_review": len(in_phase("awaiting_result_review")),
                    "result_review_active": len(in_phase("result_review_active")),
                    # Decision received, required care not finished: holds the space, no doctor.
                    "awaiting_care_completion": len(in_phase("awaiting_care_completion")),
                }
                capacity = {"kind": "ed_spaces", "shared_with_zone": 3}
            elif zid == 3:
                ids = in_phase("awaiting_lab", "in_lab", "awaiting_imaging", "in_imaging")
                lab_q, lab_a = len(in_phase("awaiting_lab")), len(in_phase("in_lab"))
                img_q, img_a = len(in_phase("awaiting_imaging")), len(in_phase("in_imaging"))
                # Logical diagnostic work only: these patients keep their ED space (zone 2/3 pool).
                detail = {
                    "queue": lab_q + img_q,
                    "active": lab_a + img_a,
                    "lab_queue": lab_q,
                    "lab_active": lab_a,
                    "imaging_queue": img_q,
                    "imaging_active": img_a,
                }
                capacity = {"kind": "ed_spaces", "shared_with_zone": 2}
            else:
                ids = in_phase(
                    "awaiting_discharge",
                    "disposition_processing",
                    "awaiting_ward_bed",
                    "awaiting_ward_allocation",
                    "ward_allocation_active",
                    "awaiting_transport",
                    "in_transport",
                )
                detail = {
                    "queue": len(
                        in_phase(
                            "awaiting_discharge",
                            "awaiting_ward_bed",
                            "awaiting_ward_allocation",
                            "awaiting_transport",
                        )
                    ),
                    "active": len(in_phase("disposition_processing", "ward_allocation_active", "in_transport")),
                    # Home path and ward/ICU transfer constraints are kept apart.
                    "awaiting_discharge": len(in_phase("awaiting_discharge")),
                    "discharge_active": len(in_phase("disposition_processing")),
                    "awaiting_ward_bed": len(in_phase("awaiting_ward_bed")),
                    "awaiting_ward_allocation": len(in_phase("awaiting_ward_allocation")),
                    "allocation_active": len(in_phase("ward_allocation_active")),
                    "awaiting_transport": len(in_phase("awaiting_transport")),
                    "in_transport": len(in_phase("in_transport")),
                    "home_patients": len([p for p in patients if p["zone"] == 4 and p["disposition"] == "home"]),
                    "transfer_patients": len(
                        [p for p in patients if p["zone"] == 4 and p["disposition"] in ("ward", "icu")]
                    ),
                }
                capacity = {"kind": "ed_spaces_retained"}
            zones.append(
                {
                    "id": zid,
                    "key": zone_defs[zid]["key"],
                    "name": zone_defs[zid]["name"],
                    "patient_count": len(ids),
                    "patient_ids": ids,
                    **detail,
                    "capacity": capacity,
                }
            )

        mon = e.monitor
        status_label = {
            "stable": "Stable",
            "building": "Building congestion",
            "confirmed": "Congested",
        }[mon.state]

        gp, rp = e.general_pool, e.resus_pool
        all_ids = gp.ids + rp.ids
        unstaffed_total = [s for pool in (gp, rp) for s in pool.ids if not pool.is_staffed(s)]
        unstaffed_empty = gp.free_unstaffed() + rp.free_unstaffed()
        on_duty = sorted(e.on_duty)
        off_duty = [n for n in sorted(e.nurses) if n not in e.on_duty]
        holder = {p["clinician_id"]: p["id"] for p in patients if p["clinician_id"]}
        space_patient = {p["space_id"]: p["id"] for p in patients if p["space_id"]}
        staff = {
            "doctors": [
                {
                    "id": d["id"],
                    "name": d["name"],
                    "role": "doctor",
                    "on_duty": True,
                    "patient_id": holder.get(d["id"]),
                    "owner": PROFILE["owners"]["doctors"],
                }
                for d in PROFILE["doctors"]
            ],
            "reserve_physician": {
                **PROFILE["reserve_physician"],
                "role": "doctor",
                "owner": PROFILE["owners"]["reserve_physician"],
            },
            "nurses": [
                {
                    "id": n["id"],
                    "name": n["name"],
                    "role": "nurse",
                    "on_duty": n["id"] in e.on_duty,
                    "covers": n["covers"],
                    "occupied": sum(1 for sp in n["covers"] if sp in space_patient),
                    "empty": sum(1 for sp in n["covers"] if sp not in space_patient),
                    "owner": PROFILE["owners"]["nurse_coverage"],
                }
                for n in PROFILE["nurses"]
            ],
            "on_duty_nurses": on_duty,
            "off_duty_nurses": off_duty,
            "unstaffed_empty_spaces": {
                "count": len(unstaffed_empty),
                "space_ids": unstaffed_empty,
                "reason": (
                    None
                    if not unstaffed_empty
                    else "Empty but not usable: no covering nurse on duty ("
                    + ", ".join(off_duty)
                    + ")."
                ),
            },
            "note": "Shared staff are listed once. Doctors serve zone 2 work; nurses cover spaces for zones 2 and 3.",
        }

        def diag(kind: str, res: Any, starts: list, finished: list, spec: dict, owner: str) -> dict:
            window = 30.0
            started = sum(1 for k, t in starts if k == kind and t > now - window)
            completed = sum(1 for k, t in finished if k == kind and t > now - window)
            servers = res.capacity
            return {
                "servers": servers,
                "busy": res.count,
                "waiting": len(res.queue),
                "owner": owner,
                "median_turnaround_min": spec["median"],
                # Staffed service capacity in tasks per hour from the disclosed median turnaround.
                "capacity_tasks_per_hour": round(servers * 60.0 / spec["median"], 2),
                "started_last_30_min": started,
                "completed_last_30_min": completed,
                # Recent completed throughput, separate from capacity: an idle service completes
                # nothing without having no capacity.
                "recent_throughput_tasks_per_hour": round(completed * 60.0 / window, 2),
            }

        diagnostics = {
            "unit": "tasks per hour",
            "window_min": 30,
            "lab": diag("lab", e.lab, e.test_starts, e.test_log,
                        PROFILE["assumptions"]["lab_turnaround_minutes"], PROFILE["owners"]["lab"]),
            "imaging": diag("imaging", e.imaging, e.test_starts, e.test_log,
                            PROFILE["assumptions"]["imaging_turnaround_minutes"], PROFILE["owners"]["imaging"]),
            "note": "One patient can need several tests, so lab and imaging are reported as separate task rates.",
        }

        def svc(res: Any, spec: dict, owner: str) -> dict:
            return {
                "servers": res.capacity,
                "busy": res.count,
                "waiting": len(res.queue),
                "owner": owner,
                "median_min": spec["median"],
                "capacity_tasks_per_hour": round(res.capacity * 60.0 / spec["median"], 2),
            }

        a_ = PROFILE["assumptions"]
        beds = e.ward_beds
        disposition = {
            "unit": "patients per hour",
            "discharge": svc(
                e.discharge,
                {"median": a_["disposition_processing_minutes"]["mode"]},
                PROFILE["owners"]["discharge_processing"],
            ),
            "allocation": svc(e.allocation, a_["ward_allocation_minutes"], PROFILE["owners"]["ward_allocation"]),
            "transport": svc(e.transport, a_["transport_minutes"], PROFILE["owners"]["transport"]),
            "beds": {
                "owner": PROFILE["owners"]["ward_beds"],
                **beds.counts(),
                # Bed state only: the release schedule of occupied beds is hidden future.
                "list": [{"id": i, "type": b["type"], "state": b["state"]} for i, b in sorted(beds.beds.items())],
            },
            "boarding": sum(
                1
                for p in patients
                if p["phase"]
                in ("awaiting_ward_bed", "awaiting_ward_allocation", "ward_allocation_active",
                    "awaiting_transport", "in_transport")
            ),
            "note": "Home processing and ward/ICU transfer constraints are reported separately; one blended rate would hide a blocked ward.",
        }

        announcements = [a.public(now) for a in sorted(e.announcements.values(), key=lambda a: a.id)]
        inbound = [a for a in announcements if a["status"] in ("en_route", "delayed")]
        inbound_patients = sum(a["patient_count"] for a in inbound)
        feed_times = [a["source_updated_min"] for a in announcements]
        background = e.definition.get("background_arrivals", True)
        rate_mult = e.definition.get("rate_multiplier", 1.0) if background else 0.0
        assumptions = PROFILE["assumptions"]

        return {
            "api_version": API_VERSION,
            "replay_id": self.id,
            "run_number": self.run_number,
            "version": self.version,
            "profile_id": PROFILE_ID,
            "scenario": self.scenario,
            "scenario_name": e.definition["name"],
            "seed": self.seed,
            "synthetic": True,
            "sim_time_min": round(now, 3),
            "freshness": {
                "state_updated_at_min": round(now, 3),
                "age_min": 0.0,
                "note": "Single in-process replay feed; per-source heartbeats arrive in ticket 08.",
            },
            "overall_status": {
                "state": mon.state,
                "label": status_label,
                "onset_min": mon.onset_min,
                "confirmed_min": mon.confirmed_min,
                "rule": PROFILE["congestion_rule"],
            },
            "resources": {
                "ed_spaces": {
                    "total": PROFILE["regular_spaces"],
                    "occupied": e.occupied_spaces(),
                    # Spaces a waiting general patient could take now; resuscitation spaces are
                    # held for critical bypass and reported separately.
                    "available_staffed": e.available_general_spaces(),
                    "awaiting_space": e.awaiting_space(),
                    "general_total": gp.capacity,
                    "general_occupied": gp.count,
                    "staffed_total": len(all_ids) - len(unstaffed_total),
                    "unstaffed_total": len(unstaffed_total),
                    "unstaffed_empty": len(unstaffed_empty),
                    "owner": PROFILE["owners"]["ed_spaces"],
                },
                "resus_spaces": {
                    "total": rp.capacity,
                    "occupied": rp.count,
                    "available": len(rp.free_staffed()),
                    "unstaffed_empty": len(rp.free_unstaffed()),
                    "awaiting": len(rp.waiting),
                    "within_ed_spaces": True,
                    "owner": PROFILE["owners"]["ed_spaces"],
                },
                "staff": staff,
                "diagnostics": diagnostics,
                "disposition": disposition,
                "clinician_slots": {
                    "total": e.clinicians.capacity,
                    "busy": e.clinicians.count,
                    "waiting": len(e.clinicians.queue),
                    "owner": PROFILE["owners"]["clinician_slots"],
                },
                "triage_desk": {
                    "total": e.triage.capacity,
                    "busy": e.triage.count,
                    "waiting": len(e.triage.queue),
                    "owner": PROFILE["owners"]["triage_desk"],
                    "reserve_team": {
                        **PROFILE["reserve_triage_team"],
                        "owner": PROFILE["owners"]["reserve_triage_team"],
                    },
                },
            },
            "counts": {
                "in_ed": len(patients),
                "arrived_total": len(e.patients),
                "departed_total": e.departed_count,
                "departed_home": e.departed_home,
                "departed_ward": e.departed_ward,
            },
            "zones": zones,
            "patients": patients,
            "inbound_ambulances": inbound,
            "inbound_summary": {
                "ambulances": len(inbound),
                "patients": inbound_patients,
                "delayed": sum(1 for a in inbound if a["status"] == "delayed"),
                "feed_last_update_min": max(feed_times) if feed_times else None,
            },
            "ambulance_announcements": announcements,
            # Forecast inputs for later tickets. Known demand comes only from received
            # announcements; background demand is the disclosed unannounced-arrival assumption.
            "incoming_demand": {
                "known": {
                    "source": "received ambulance announcements",
                    "ambulances": len(inbound),
                    "patients": inbound_patients,
                    "arrivals": [
                        {
                            "ambulance_id": a["id"],
                            "eta_min": a["eta_min"],
                            "eta_uncertainty_min": a["eta_uncertainty_min"],
                            "patient_count": a["patient_count"],
                            "status": a["status"],
                        }
                        for a in inbound
                    ],
                },
                "background": {
                    "source": "disclosed profile assumption (unannounced arrivals)",
                    "walk_ins_per_hour_average": assumptions["walk_in_rate_per_hour_average"] * rate_mult,
                    "unannounced_ambulance_runs_per_hour_average": assumptions["ambulance_runs_per_hour_average"] * rate_mult,
                    "note": "Announced ambulances are counted only under known demand.",
                },
            },
            "event_count": len(e.events),
        }

    def _time_summary(self) -> dict[str, Any]:
        """Mean of the three time parts by reporting urgency group, completed stays only.

        Unfinished stays are counted separately and never averaged in as if complete.
        """
        e = self.engine
        out: dict[str, Any] = {}
        for group in ("urgent", "medium", "lower"):
            done = [p for p in e.patients.values() if p.supplied.urgency == group and p.departure_min is not None]
            open_ = [p for p in e.patients.values() if p.supplied.urgency == group and p.departure_min is None]
            parts = [p.time_parts() for p in done]

            def mean(key: str, rows: list[dict[str, Any]] = parts) -> float | None:
                vals = [r[key] for r in rows if r[key] is not None]
                return round(sum(vals) / len(vals), 3) if vals else None

            out[group] = {
                "completed": len(done),
                "unfinished": len(open_),
                "mean_total_ed_min": mean("total_ed_min"),
                "mean_initial_wait_min": mean("initial_wait_min"),
                "mean_care_tests_min": mean("care_tests_min"),
                "mean_awaiting_departure_min": mean("awaiting_departure_min"),
                "ward_icu_transfers": sum(1 for p in done if p.supplied.disposition != "home"),
                "mean_boarding_min": mean("boarding_min"),
            }
        return out

    def events(self, since: int = 0) -> dict[str, Any]:
        with self.lock:
            e = self.engine
            return {
                "replay_id": self.id,
                "version": self.version,
                "sim_time_min": round(e.now, 3),
                "total": len(e.events),
                "since": since,
                "events": e.events[since:],
            }

    def export(self) -> dict[str, Any]:
        with self.lock:
            e = self.engine
            return {
                "api_version": API_VERSION,
                "synthetic": True,
                "replay_id": self.id,
                "run_number": self.run_number,
                "version": self.version,
                "profile": PROFILE,
                "scenario": self.scenario,
                "seed": self.seed,
                "sim_time_min": round(e.now, 3),
                "events": list(e.events),
                "patients": [p.timestamps(e.now) for p in e.patients.values()],
                "time_summary": self._time_summary(),
                "unfinished": [
                    {
                        "patient_id": p.id,
                        "phase": p.phase,
                        "urgency": p.supplied.urgency,
                        "accrued_ed_min": p.time_parts(e.now)["total_ed_min"],
                    }
                    for p in e.patients.values()
                    if p.departure_min is None
                ],
                "congestion_episodes": list(e.monitor.episodes),
            }


class ReplayStore:
    def __init__(self) -> None:
        self._sessions: dict[str, ReplaySession] = {}
        self._lock = threading.Lock()

    def create(self, seed: int, scenario: str) -> ReplaySession:
        session = ReplaySession(seed, scenario)
        with self._lock:
            self._sessions[session.id] = session
        return session

    def get(self, replay_id: str) -> ReplaySession | None:
        with self._lock:
            return self._sessions.get(replay_id)
