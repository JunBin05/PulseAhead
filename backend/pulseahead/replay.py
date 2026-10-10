"""Replay sessions: plain-data state, versioning, and the observed-state read model.

A session owns one engine. Observation responses are built only from received state and events;
nothing beyond the current simulated time is ever exposed.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from . import forecast as fcast
from .engine import QUEUE_SERVICE, EDEngine
from .feeds import HEARTBEAT_MIN, SERVICE_SOURCE, SOURCES, STALE_AFTER_MIN
from .pressure import CATEGORY_LABEL, SERVICES
from . import saved
from .profile import (
    CATALOG_VERSION, ENGINE_VERSION, PROFILE, PROFILE_ID, SCENARIO_PARAM_KEYS, SCORED_MIN, WARMUP_MIN, ZONES,
    seed_partition,
)

MAX_ADVANCE_MIN = 60.0


def _triangular_mean(spec: dict[str, Any]) -> float:
    """Mean of a disclosed triangular duration assumption (min, mode, max)."""
    return (spec["min"] + spec["mode"] + spec["max"]) / 3.0
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
        # Set when this run was rebuilt from a saved run; cleared by a reset.
        self.saved_run: dict[str, Any] | None = None
        self._samples: list[tuple[float, dict[str, Any]]] = []
        # Forecasts by (state version, samples): result, plain input, snapshot. Recent ones only.
        self._fc: dict[tuple[int, int], tuple[dict[str, Any], dict[str, Any], dict[str, Any]]] = {}
        self._fc_lock = threading.Lock()
        if self.engine.gate.has_faults:
            self._sample(0.0)

    # -- commands ------------------------------------------------------------------------
    def advance(self, minutes: float, expected_version: int | None = None) -> dict[str, Any] | None:
        with self.lock:
            if expected_version is not None and expected_version != self.version:
                return None
            e = self.engine
            target = e.now + minutes
            if e.gate.has_faults:
                # Step by whole minutes so each feed's last delivered state is recorded exactly.
                t = e.now
                while t < target - 1e-9:
                    t = min(math.floor(t + 1e-9) + 1.0, target)
                    e.run_until(t)
                    self._sample(t)
            else:
                e.run_until(target)
            self.version += 1
            return self.snapshot()

    def reset(self, seed: int | None = None, scenario: str | None = None) -> dict[str, Any]:
        with self.lock:
            if seed is not None:
                self.seed = seed
            if scenario is not None:
                self.scenario = scenario
            self.engine = EDEngine(self.seed, self.scenario)
            self.saved_run = None
            self._samples = []
            self._fc = {}
            if self.engine.gate.has_faults:
                self._sample(0.0)
            self.run_number += 1
            self.version += 1
            return self.snapshot()

    # -- read models ---------------------------------------------------------------------
    def _live_snapshot(self) -> dict[str, Any]:
        """The engine's own readings. `snapshot()` is what the feeds have delivered."""
        e = self.engine
        now = e.now
        active = e.active_patients()
        patients = [
            {**p.public(now), "waiting_reason": e.waiting_reason(p)}
            for p in sorted(active, key=lambda p: p.id)
        ]

        zones = self._zones_for(patients)

        mon = e.monitor
        status_label = {
            "stable": "Stable",
            "building": "Building congestion",
            "confirmed": "Congested",
        }[mon.state]
        if mon.recovering:
            status_label = "Congested, recovering"

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
            span = min(now, window)  # the throughput window is shorter early in the run
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
                "recent_throughput_tasks_per_hour": round(completed * 60.0 / span, 2) if span > 0 else 0.0,
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
                "median_min": spec.get("median", spec["mode"]),
                # Same basis as the zone pressure panel: units x 60 / mean disclosed task minutes.
                "capacity_patients_per_hour": round(res.capacity * 60.0 / _triangular_mean(spec), 2),
            }

        a_ = PROFILE["assumptions"]
        beds = e.ward_beds
        disposition = {
            "unit": "patients per hour",
            "discharge": svc(
                e.discharge, a_["disposition_processing_minutes"], PROFILE["owners"]["discharge_processing"]
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

        pressure = self._pressure(patients, now)

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
                "recovering": mon.recovering,
                "recovery_since_min": mon.below_since_min,
                # The overall rule is separate from local zone alerts; this only flags that one exists.
                "local_alert": any(z["state"] == "overloaded" for z in pressure["zones"]),
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
                    "held_space_ids": sorted(gp.held | rp.held),
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
            "pressure": pressure,
            "event_count": len(e.gate.received),
        }

    def _zones_for(self, patients: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Zone counts and member ids from a patient list: the live one, or the one as received."""
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
        return zones

    # -- what the feeds have delivered -------------------------------------------------------
    def _received_patients(self, live_patients: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """Patients as the received events describe them: each patient's record is the state at their
        newest received event, so a transition carried by a stopped or delayed feed is not shown.
        Samples are one per simulated minute, so a record can include another feed's change from the
        same minute."""
        e = self.engine
        now = e.now
        newest: dict[str, dict[str, Any]] = {}
        for ev in e.gate.received:
            pid = ev.get("patient_id")
            if pid is not None and (pid not in newest or ev["event_time_min"] >= newest[pid]["event_time_min"]):
                newest[pid] = ev
        live_by_id = {p["id"]: p for p in live_patients}
        patients: list[dict[str, Any]] = []
        home = ward = 0
        for pid in sorted(newest):
            ev = newest[pid]
            t = ev["event_time_min"]
            if ev["type"] == "phase_change" and ev["payload"].get("to") == "departed":
                if ev["payload"].get("exit") == "home":
                    home += 1
                else:
                    ward += 1
                continue
            rec = None
            for st, snap in self._samples:
                if st >= t - 1e-9:
                    rec = next((p for p in snap["patients"] if p["id"] == pid), None)
                    if rec is not None:
                        break
            if rec is None:
                for st, snap in reversed(self._samples):
                    rec = next((p for p in snap["patients"] if p["id"] == pid), None)
                    if rec is not None:
                        break
            if rec is None:
                rec = live_by_id.get(pid)
            if rec is None:
                continue
            patients.append({**rec, "minutes_in_phase": round(now - rec["phase_since_min"], 2)})
        counts = {
            "in_ed": len(patients),
            "arrived_total": len(newest),
            "departed_total": home + ward,
            "departed_home": home,
            "departed_ward": ward,
        }
        return patients, counts

    def _mask_missing(self, out: dict[str, Any]) -> None:
        """A service whose inputs a fixture declares missing shows no figures, not exact ones. Works
        on copies: the overlays above may share dictionaries with stored samples."""
        missing = self.engine.missing_services()
        if not missing:
            return
        res = copy.deepcopy(out["resources"])
        zones = copy.deepcopy(out["zones"])
        zone = {z["id"]: z for z in zones}

        def null(d: dict[str, Any], keys: tuple[str, ...]) -> None:
            for k in keys:
                if k in d:
                    d[k] = None

        for sid in missing:
            if sid in ("lab", "imaging"):
                d = res["diagnostics"][sid]
                null(d, ("busy", "waiting", "started_last_30_min", "completed_last_30_min",
                         "recent_throughput_tasks_per_hour"))
                d["inputs_ok"] = False
                null(zone[3], (f"{sid}_queue", f"{sid}_active", "queue", "active"))
            elif sid in ("discharge", "allocation", "transport"):
                d = res["disposition"][sid]
                null(d, ("busy", "waiting"))
                d["inputs_ok"] = False
                keys = {
                    "discharge": ("awaiting_discharge", "discharge_active"),
                    "allocation": ("awaiting_ward_allocation", "allocation_active"),
                    "transport": ("awaiting_transport", "in_transport"),
                }[sid]
                null(zone[4], keys + ("queue", "active"))
            elif sid == "ward_beds":
                null(zone[4], ("awaiting_ward_bed", "queue"))
            elif sid == "triage":
                null(res["triage_desk"], ("busy", "waiting"))
                res["triage_desk"]["inputs_ok"] = False
                null(zone[1], ("queue", "active"))
            elif sid == "assessment":
                null(res["clinician_slots"], ("busy", "waiting"))
                res["clinician_slots"]["inputs_ok"] = False
                null(zone[2], ("awaiting_clinician", "awaiting_result_review", "result_review_active",
                               "awaiting_care_completion", "queue", "active"))
            elif sid == "space":
                null(res["ed_spaces"], ("awaiting_space", "available_staffed"))
                res["ed_spaces"]["inputs_ok"] = False
                null(res["resus_spaces"], ("awaiting", "available"))
                null(zone[2], ("awaiting_space", "queue"))
        out["resources"], out["zones"] = res, zones
        out["limited_services"] = sorted(missing)

    def _sample(self, t: float) -> None:
        """Keep this minute's true readings so a stopped or delayed feed can later be shown as it was.
        Only sessions with scripted feed faults pay for this."""
        self._samples.append((round(t, 6), self._live_snapshot()))
        if len(self._samples) > 400:
            del self._samples[:100]

    def _sample_at(self, asof: float) -> dict[str, Any]:
        best = self._samples[0][1]
        for t, snap in self._samples:
            if t > asof + 1e-9:
                break
            best = snap
        return best

    def snapshot(self) -> dict[str, Any]:
        """Received state: the engine's readings, except that a source whose feed is stopped or delayed
        is shown as of its newest delivered data, and every response carries per-source freshness."""
        e = self.engine
        e.gate.flush(e.now)
        live = self._live_snapshot()
        feeds = e.gate.feeds_view(e.now)
        out = self._observe(live, feeds)
        out["saved_run"] = self.saved_run
        return out

    def _observe(self, live: dict[str, Any], feeds: dict[str, dict[str, Any]]) -> dict[str, Any]:
        e = self.engine
        behind = {s: e.gate.observed_as_of(s, e.now) for s in SOURCES}
        behind = {s: a for s, a in behind.items() if a < e.now - 1e-9}
        out = dict(live)
        if behind:
            obs, counts = self._received_patients(live["patients"])
            out["patients"], out["zones"], out["counts"] = obs, self._zones_for(obs), counts
            res = dict(live["resources"])
            sp, rs = dict(res["ed_spaces"]), dict(res["resus_spaces"])
            staff = dict(res["staff"])
            if "queues" in behind:
                c = self._sample_at(behind["queues"])
                res["triage_desk"] = c["resources"]["triage_desk"]
                res["clinician_slots"] = c["resources"]["clinician_slots"]
            if "spaces" in behind:
                c = self._sample_at(behind["spaces"])["resources"]
                for k in ("occupied", "awaiting_space", "general_occupied", "held_space_ids"):
                    sp[k] = c["ed_spaces"][k]
                for k in ("occupied", "awaiting"):
                    rs[k] = c["resus_spaces"][k]
            if "staffing" in behind:
                staff = dict(self._sample_at(behind["staffing"])["resources"]["staff"])
            if "spaces" in behind or "staffing" in behind or "queues" in behind:
                # Rebuild what depends on several feeds from the observed pieces.
                held = set(sp["held_space_ids"])
                on_duty = set(staff["on_duty_nurses"])
                cover = {s: n["id"] for n in staff["nurses"] for s in n["covers"]}
                unstaffed = [s for s in cover if cover[s] not in on_duty]
                empty_unstaffed = sorted(s for s in unstaffed if s not in held)
                general = [s for s in cover if s.startswith("S")]
                resus = [s for s in cover if s.startswith("R")]
                sp["staffed_total"] = len(cover) - len(unstaffed)
                sp["unstaffed_total"] = len(unstaffed)
                sp["unstaffed_empty"] = len(empty_unstaffed)
                sp["available_staffed"] = sum(1 for s in general if s not in held and cover[s] in on_duty)
                rs["unstaffed_empty"] = sum(1 for s in empty_unstaffed if s.startswith("R"))
                rs["available"] = sum(1 for s in resus if s not in held and cover[s] in on_duty)
                holder = {p["clinician_id"]: p["id"] for p in out["patients"] if p["clinician_id"]}
                off = staff["off_duty_nurses"]
                staff["doctors"] = [{**d, "patient_id": holder.get(d["id"])} for d in staff["doctors"]]
                staff["nurses"] = [
                    {
                        **n,
                        "occupied": sum(1 for s in n["covers"] if s in held),
                        "empty": sum(1 for s in n["covers"] if s not in held),
                    }
                    for n in staff["nurses"]
                ]
                staff["unstaffed_empty_spaces"] = {
                    "count": len(empty_unstaffed),
                    "space_ids": empty_unstaffed,
                    "reason": (
                        None
                        if not empty_unstaffed
                        else "Empty but not usable: no covering nurse on duty (" + ", ".join(off) + ")."
                    ),
                }
            if "diagnostics" in behind:
                res["diagnostics"] = self._sample_at(behind["diagnostics"])["resources"]["diagnostics"]
            if "disposition" in behind:
                res["disposition"] = self._sample_at(behind["disposition"])["resources"]["disposition"]
            res["ed_spaces"], res["resus_spaces"], res["staff"] = sp, rs, staff
            out["resources"] = res
            if "ambulance" in behind:
                c = self._sample_at(behind["ambulance"])
                arrived_from = {p["ambulance_id"] for p in out["patients"] if p["ambulance_id"]}
                # An ambulance whose patients are already in the ED is not still inbound.
                inbound = [a for a in c["inbound_ambulances"] if a["id"] not in arrived_from]
                out["inbound_ambulances"] = inbound
                out["ambulance_announcements"] = c["ambulance_announcements"]
                out["inbound_summary"] = {
                    "ambulances": len(inbound),
                    "patients": sum(a["patient_count"] for a in inbound),
                    "delayed": sum(1 for a in inbound if a["status"] == "delayed"),
                    "feed_last_update_min": c["inbound_summary"]["feed_last_update_min"],
                }
                known = dict(live["incoming_demand"]["known"])
                known["ambulances"] = len(inbound)
                known["patients"] = out["inbound_summary"]["patients"]
                known["arrivals"] = [x for x in c["incoming_demand"]["known"]["arrivals"]
                                     if x["ambulance_id"] not in arrived_from]
                out["incoming_demand"] = {**live["incoming_demand"], "known": known}

        self._mask_missing(out)

        essential = [s for s, spec in SOURCES.items() if spec["essential"]]
        bad = [s for s in essential if feeds[s]["status"] != "fresh"]
        assessable = not bad
        ages = [feeds[s]["age_min"] for s in essential if feeds[s]["age_min"] is not None]
        status = dict(live["overall_status"])
        status["assessable"] = assessable
        status["reasons"] = [feeds[s]["guidance"] for s in bad]
        if not assessable:
            status["last_valid_label"] = status["label"]
            status["label"] = "Cannot assess"
        out["overall_status"] = status
        out["freshness"] = {
            "state_updated_at_min": round(e.now, 3),
            "age_min": 0.0,
            "stale_after_min": STALE_AFTER_MIN,
            "heartbeat_every_min": HEARTBEAT_MIN,
            "oldest_essential_age_min": max(ages) if ages else None,
            "essential_ok": assessable,
            "note": "The replay clock heartbeat is separate from each source below; it never refreshes a stopped source.",
        }
        out["feeds"] = feeds
        gaps = e.gate.sequence_gaps()
        out["data_quality"] = {
            "assessable": assessable,
            "reasons": status["reasons"],
            "essential_sources": essential,
            "stale_after_min": STALE_AFTER_MIN,
            "heartbeat_every_min": HEARTBEAT_MIN,
            "counts": dict(e.gate.counts),
            "sequence_gaps": gaps,
            "recent": list(reversed(e.gate.log[-20:])),
        }
        return out

    # -- forecast (received state and received history only) -----------------------------------
    def forecast(self, samples: int = fcast.DEFAULT_SAMPLES, expected_version: int | None = None
                 ) -> tuple[dict[str, Any] | None, bool]:
        """Returns (result, cached). None when expected_version is stale. The plain input is built under
        the session lock; the futures are sampled outside it so replay controls stay responsive."""
        with self._fc_lock:
            with self.lock:
                if expected_version is not None and expected_version != self.version:
                    return None, False
                key = (self.version, samples)
                hit = self._fc.get(key)
                if hit is not None:
                    return hit[0], True
                snap = self.snapshot()
                inp = fcast.build_input(snap, list(self.engine.gate.received))
            result = fcast.forecast_from_input(inp, snap, samples, fcast.FORECAST_SEED)
            with self.lock:
                self._fc[key] = (result, inp, snap)
                for old in sorted(self._fc)[:-6]:
                    del self._fc[old]
            return result, False

    def forecast_explain(self, zone: int, samples: int, version: int) -> dict[str, Any] | None:
        """Explains the forecast already computed for `version` (None when it is no longer held)."""
        with self._fc_lock:
            hit = self._fc.get((version, samples))
        if hit is None:
            return None
        result, inp, snap = hit
        if result["status"] != "ok":
            return {"api_version": "v1", "kind": "forecast_explanation", "source": result["source"],
                    "status": result["status"], "reasons": result["reasons"], "zone": zone}
        return fcast.explain_zone(inp, snap, result, zone, samples, fcast.FORECAST_SEED)

    # -- one zone, versioned ---------------------------------------------------------------
    def zone_detail(self, zone_id: int) -> dict[str, Any] | None:
        """Details for one zone, computed from the same state version as `snapshot()`.

        Everything here is received simulation state: the roster, who is assigned, queues and
        capacity. Nothing is a forecast and nothing comes from the hidden replay future. Callers hold
        the session lock. Returns None for an unknown zone.
        """
        if zone_id not in (1, 2, 3, 4):
            return None
        snap = self.snapshot()
        zone = next(z for z in snap["zones"] if z["id"] == zone_id)
        members = set(zone["patient_ids"])
        roster = [p for p in snap["patients"] if p["id"] in members]
        res = snap["resources"]
        pressure = snap["pressure"]
        zone_pressure = next(z for z in pressure["zones"] if z["zone"] == zone_id)
        sp, rs = res["ed_spaces"], res["resus_spaces"]
        dg, dp = res["diagnostics"], res["disposition"]

        def line(key: str, label: str, count: int, kind: str, of: int | None = None) -> dict[str, Any]:
            return {"id": key, "label": label, "count": count, "kind": kind, "of": of}

        if zone_id == 1:
            queues = [
                line("triage_queue", "Waiting for triage", zone["queue"], "queue"),
                line("triage_active", "At the triage desk", zone["active"], "active", res["triage_desk"]["total"]),
            ]
            units = [
                {"id": "triage_desk", "label": "Triage desk", **{k: res["triage_desk"][k] for k in ("busy", "waiting", "owner")},
                 "servers": res["triage_desk"]["total"],
                 "reserve_team_active": res["triage_desk"]["reserve_team"]["active"]},
            ]
            capacity = {
                "kind": "none",
                "text": "No treatment beds here. Patients wait for registration and triage.",
            }
        elif zone_id == 2:
            queues = [
                line("awaiting_space", "Waiting for an ED space", zone["awaiting_space"], "queue"),
                line("awaiting_clinician", "Waiting for a clinician", zone["awaiting_clinician"], "queue"),
                line("with_clinician", "With a clinician (assessment or result review)", zone["active"], "active",
                     res["clinician_slots"]["total"]),
                line("awaiting_result_review", "Results back, waiting for review", zone["awaiting_result_review"], "queue"),
                line("awaiting_care_completion", "Decision received, care not complete", zone["awaiting_care_completion"],
                     "queue"),
            ]
            units = [
                {"id": "clinician_slots", "label": "Doctor work slots", "busy": res["clinician_slots"]["busy"],
                 "servers": res["clinician_slots"]["total"], "waiting": res["clinician_slots"]["waiting"],
                 "owner": res["clinician_slots"]["owner"]},
            ]
        elif zone_id == 3:
            queues = [
                line("lab_queue", "Waiting for the lab", zone["lab_queue"], "queue"),
                line("lab_active", "Lab tests running", zone["lab_active"], "active", dg["lab"]["servers"]),
                line("imaging_queue", "Waiting for imaging", zone["imaging_queue"], "queue"),
                line("imaging_active", "Imaging running", zone["imaging_active"], "active", dg["imaging"]["servers"]),
            ]
            units = [
                {"id": k, "label": k.capitalize(), **{f: dg[k][f] for f in ("busy", "servers", "waiting", "owner")}}
                for k in ("lab", "imaging")
            ]
        else:
            queues = [
                line("discharge_queue", "Home discharge: waiting", zone["awaiting_discharge"], "queue"),
                line("discharge_active", "Home discharge: processing", zone["discharge_active"], "active",
                     dp["discharge"]["servers"]),
                line("boarding", "Boarding: waiting for a suitable bed", zone["awaiting_ward_bed"], "queue"),
                line("allocation_queue", "Ward allocation: waiting", zone["awaiting_ward_allocation"], "queue"),
                line("allocation_active", "Ward allocation: in progress", zone["allocation_active"], "active",
                     dp["allocation"]["servers"]),
                line("transport_queue", "Transport: waiting", zone["awaiting_transport"], "queue"),
                line("transport_active", "Transport: moving a patient", zone["in_transport"], "active",
                     dp["transport"]["servers"]),
            ]
            units = [
                {"id": k, "label": k.capitalize(), **{f: dp[k][f] for f in ("busy", "servers", "waiting", "owner")}}
                for k in ("discharge", "allocation", "transport")
            ]

        if zone_id in (2, 3):
            # One pool for both zones: the same numbers appear in each zone and are never added.
            capacity = {
                "kind": "shared_ed_spaces",
                "shared_with_zone": 3 if zone_id == 2 else 2,
                "total": sp["total"],
                "occupied": sp["occupied"],
                "available_staffed": sp["available_staffed"],
                "staffed_total": sp["staffed_total"],
                "resus": {"total": rs["total"], "available": rs["available"], "awaiting": rs["awaiting"]},
                "held_by_patients_here": sum(1 for p in roster if p["space_id"]),
                "text": "ED spaces are one shared pool for zones 2 and 3; zone 3 patients keep their space "
                "while they wait for tests, so the two zones' counts are never added together.",
            }
        elif zone_id == 4:
            capacity = {
                "kind": "spaces_retained",
                "total": sp["total"],
                "occupied": sp["occupied"],
                "held_by_patients_here": sum(1 for p in roster if p["space_id"]),
                "ward_beds": {k: dp["beds"]["ward"][k] for k in ("free", "reserved", "occupied", "total")},
                "icu_beds": {k: dp["beds"]["icu"][k] for k in ("free", "reserved", "occupied", "total")},
                "text": "These patients still occupy their ED space until they physically leave.",
            }

        # Who is assigned here, from the received assignment of each patient. Nobody is listed as
        # assigned unless a patient in this zone is actually with them.
        doctors: list[dict[str, Any]] = []
        if zone_id == 2:
            holder = {p["clinician_id"]: p["id"] for p in roster if p["clinician_id"]}
            doctors = [
                {"id": d["id"], "name": d["name"], "on_duty": d["on_duty"], "owner": d["owner"],
                 "patient_id": holder.get(d["id"]), "assigned": d["id"] in holder}
                for d in res["staff"]["doctors"]
                if d["on_duty"]
            ]
        nurses: list[dict[str, Any]] = []
        if zone_id in (2, 3, 4):
            for n in res["staff"]["nurses"]:
                mine = [p for p in roster if p["nurse_id"] == n["id"]]
                if n["on_duty"] and mine:
                    nurses.append(
                        {"id": n["id"], "name": n["name"], "on_duty": True, "owner": n["owner"],
                         "patient_ids": [p["id"] for p in mine], "space_ids": [p["space_id"] for p in mine]}
                    )
        staff_note = {
            1: "Zone 1 has no treatment spaces, so no doctor or nurse is assigned here.",
            2: "Doctors work only in zone 2. Nurses are listed when they cover a space held by a patient here.",
            3: "No doctor is held while patients wait for or have tests. Nurses are listed when they cover a "
            "space held by a patient here.",
            4: "No doctor is held in disposition. Nurses are listed when they cover a space held by a patient here.",
        }[zone_id]

        # Plain cause / blocked-reason summary from received queues and capacity (no forecast).
        alerts = [a for a in pressure["alerts"] if a["zone"] == zone_id]
        services = {sid: pressure["services"][sid] for sid in zone_pressure["services"]}
        state = zone_pressure["state"]
        top = next((a for a in alerts if a["state"] == "overloaded"), alerts[0] if alerts else None)
        headline: str
        cause: str | None = None
        blocked: str | None = None
        if state in ("overloaded", "building") and top is not None:
            svc = services[top["service"]]
            headline = "Overloaded: " if state == "overloaded" else "Pressure building: "
            headline += top["category_label"]
            cause = (
                f"{top['evidence']}. Affected patients: {top['affected_patients']}; "
                f"urgent group waiting: {top['urgent_group_waiting']}."
            )
            if svc["capacity_unavailable"]:
                blocked = "No suitable free capacity for patients who are waiting."
            elif svc["threshold"] is not None and svc["queue"] is not None and svc["queue"] >= svc["threshold"]:
                blocked = f"The waiting line is at or above its threshold of {svc['threshold']}."
            if state == "building" and svc["confirms_in_min"] is not None:
                cause += f" It confirms in about {svc['confirms_in_min']} min if it persists."
        elif state == "unknown":
            missing = [s["name"] for s in services.values() if not s["inputs_ok"]]
            headline = "Cannot assess this zone"
            cause = "Inputs are missing for: " + (", ".join(missing) or "an essential feed") + "."
        else:
            headline = "No local alert"
            cause = "Every service in this zone is within its threshold."
        summary = {
            "state": state,
            "headline": headline,
            "cause": cause,
            "blocked_reason": blocked,
            "overall_status_label": snap["overall_status"]["label"],
            "note": "A local zone state is not overall ED congestion.",
        }

        return {
            "api_version": API_VERSION,
            "replay_id": self.id,
            "run_number": self.run_number,
            "version": snap["version"],
            "sim_time_min": snap["sim_time_min"],
            "freshness": snap["freshness"],
            "zone": {
                "id": zone["id"],
                "key": zone["key"],
                "name": zone["name"],
                "patient_count": zone["patient_count"],
                "counts": {
                    k: v
                    for k, v in zone.items()
                    if k not in ("id", "key", "name", "patient_count", "patient_ids", "capacity")
                },
            },
            "roster": roster,
            "queues": queues,
            "units": units,
            "capacity": capacity,
            "staff": {"doctors": doctors, "nurses": nurses, "note": staff_note,
                      "off_duty_nurses": res["staff"]["off_duty_nurses"]},
            "pressure": {
                "state": state,
                "label": zone_pressure["label"],
                "service_ids": zone_pressure["services"],
                "alerts": alerts,
            },
            "summary": summary,
        }

    # -- zone pressure ---------------------------------------------------------------------
    def _pressure(self, patients: list[dict[str, Any]], now: float) -> dict[str, Any]:
        """Local zone overload state, rates in matching units and failure categories."""
        e = self.engine
        rule = PROFILE["local_rule"]
        a = PROFILE["assumptions"]
        window = min(now, float(rule["rate_window_minutes"]))

        # Doctor minutes per patient: first assessment plus the result review of the share of assessed
        # patients who have so far come back for one (received work only, no hidden test needs).
        assessed = len(e.work_entries.get("assessment", []))
        reviewed = len(e.work_entries.get("assessment_review", []))
        review_share = min(1.0, reviewed / assessed) if assessed else 0.0
        doctor_min = _triangular_mean(a["active_assessment_minutes"]) + review_share * _triangular_mean(
            a["result_review_minutes"]
        )

        # Staffed service capacity per hour: finite units x 60 / disclosed mean task minutes.
        capacity = {
            "triage": (e.triage.capacity, _triangular_mean(a["triage_dwell_minutes"]), "patients per hour"),
            "assessment": (e.clinicians.capacity, doctor_min, "patients per hour"),
            "lab": (e.lab.capacity, a["lab_turnaround_minutes"]["median"], "tasks per hour"),
            "imaging": (e.imaging.capacity, a["imaging_turnaround_minutes"]["median"], "tasks per hour"),
            "discharge": (
                e.discharge.capacity, _triangular_mean(a["disposition_processing_minutes"]), "patients per hour"
            ),
            "allocation": (
                e.allocation.capacity, _triangular_mean(a["ward_allocation_minutes"]), "patients per hour"
            ),
            "transport": (e.transport.capacity, _triangular_mean(a["transport_minutes"]), "patients per hour"),
        }

        def rates(sid: str, inputs_ok: bool) -> dict[str, Any]:
            # A stopped or delayed feed's rates describe the window its newest data ends at.
            asof = e.gate.observed_as_of(SERVICE_SOURCE[sid], now)
            win = window if asof >= now - 1e-9 else min(asof, float(rule["rate_window_minutes"]))
            entries = [t for t in e.work_entries.get(sid, []) if asof - win < t <= asof + 1e-9]
            done = [t for t in e.work_done.get(sid, []) if asof - win < t <= asof + 1e-9]
            known = inputs_ok and win > 0
            lam = round(len(entries) * 60.0 / win, 2) if known else None
            through = round(len(done) * 60.0 / win, 2) if known else None
            out: dict[str, Any] = {
                "window_min": round(max(win, 0.0), 1),
                "received_per_hour": lam,
                "recent_throughput_per_hour": through,
            }
            if sid in capacity:
                servers, minutes, unit = capacity[sid]
                mu = round(servers * 60.0 / minutes, 2) if servers > 0 else None
                out.update(
                    {
                        "unit": unit,
                        "servers": servers,
                        "capacity_per_hour": mu,
                        "mean_task_min": round(minutes, 2),
                        # Pressure signal only: never a countdown, never divides by zero.
                        "pressure_signal": (lam > mu) if (lam is not None and mu) else None,
                    }
                )
            elif sid == "space":
                out.update({"unit": "patients per hour", "capacity_per_hour": None, "pressure_signal": None})
            else:  # ward_beds
                c = e.ward_beds.counts()
                out.update(
                    {
                        "unit": "transfers per hour",
                        "capacity_per_hour": None,
                        "free_beds": {"ward": c["ward"]["free"], "icu": c["icu"]["free"]},
                        "pressure_signal": None,
                    }
                )
            return out

        readings = e.local_readings()
        services: dict[str, Any] = {}
        for sid, spec in SERVICES.items():
            st = e.local.services[sid]
            r = readings[sid]
            state = "unknown" if st.unknown else st.state
            confirm_in = None
            if st.state == "building" and st.onset_min is not None and not st.unknown:
                confirm_in = round(max(0.0, rule["confirm_after_minutes"] - (now - st.onset_min)), 3)
            services[sid] = {
                "id": sid,
                "zone": spec["zone"],
                "name": spec["name"],
                "category": spec["category"],
                "state": state,
                "queue": r["queue"] if r["inputs_ok"] else None,
                "queue_label": spec["queue_label"],
                "threshold": spec["threshold"],
                "capacity_unavailable": r["capacity_unavailable"] if r["inputs_ok"] else None,
                "inputs_ok": r["inputs_ok"],
                "onset_min": st.onset_min,
                "confirmed_min": st.confirmed_min,
                "elapsed_min": None if st.onset_min is None else round(now - st.onset_min, 3),
                "confirms_in_min": confirm_in,
                "recovery_since_min": st.below_since_min,
                "rates": rates(sid, r["inputs_ok"]),
            }

        urgent_waiting: dict[str, int] = {}
        for p in patients:
            sid = QUEUE_SERVICE.get(p["phase"])
            if sid and p["urgency"] == "urgent":
                urgent_waiting[sid] = urgent_waiting.get(sid, 0) + 1

        zones = []
        for z in (1, 2, 3, 4):
            sids = [s for s in SERVICES if SERVICES[s]["zone"] == z]
            state = e.local.zone_state(z)
            zones.append(
                {
                    "zone": z,
                    "state": state,
                    "label": {"normal": "Normal", "building": "Pressure building",
                              "overloaded": "Overloaded", "unknown": "Cannot assess"}[state],
                    "services": sids,
                }
            )

        alerts = []
        active = [s for s in services.values() if s["state"] in ("building", "overloaded")]
        cats = {s["category"] for s in active}
        for s in active:
            alerts.append(
                {
                    "service": s["id"],
                    "zone": s["zone"],
                    "state": s["state"],
                    "category": s["category"],
                    "category_label": CATEGORY_LABEL[s["category"]],
                    "affected_patients": s["queue"],
                    "urgent_group_waiting": urgent_waiting.get(s["id"], 0),
                    "onset_min": s["onset_min"],
                    "confirmed_min": s["confirmed_min"],
                    # More than one failure category is active across the ED right now.
                    "mixed": len(cats) > 1,
                    "also_active": sorted(CATEGORY_LABEL[c] for c in cats if c != s["category"]),
                    "evidence": (
                        f"{s['queue']} {s['queue_label']}"
                        + (f" (threshold {s['threshold']})" if s["threshold"] is not None else "")
                        + ("; required capacity unavailable" if s["capacity_unavailable"] else "")
                    ),
                }
            )
        return {
            "rule": rule,
            "services": services,
            "zones": zones,
            "alerts": alerts,
            "mixed": len(cats) > 1,
            "mixed_label": CATEGORY_LABEL["mixed"] if len(cats) > 1 else None,
            "any_unknown": any(s["state"] == "unknown" for s in services.values()),
            "episodes": {sid: list(e.local.services[sid].episodes) for sid in SERVICES},
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
            e.gate.flush(e.now)
            return {
                "replay_id": self.id,
                "version": self.version,
                "sim_time_min": round(e.now, 3),
                "total": len(e.gate.received),
                "since": since,
                "events": e.gate.received[since:],
            }

    def ingest(self) -> dict[str, Any]:
        """Everything that was refused, ignored or flagged, with the reason."""
        with self.lock:
            e = self.engine
            e.gate.flush(e.now)
            return {
                "api_version": API_VERSION,
                "replay_id": self.id,
                "run_number": self.run_number,
                "version": self.version,
                "sim_time_min": round(e.now, 3),
                "counts": dict(e.gate.counts),
                "log": list(e.gate.log),
                "sequence_gaps": e.gate.sequence_gaps(),
                "feeds": e.gate.feeds_view(e.now),
            }

    def run_record(self) -> dict[str, Any]:
        """Everything needed to check a run's assumptions later: the fictional profile with its resources,
        the scenario's workload variant, warm-up and scored duration, seed partition and versions. The
        workload variant contains the scenario's hidden future, so this belongs in evidence, never in an
        observation response."""
        d = self.engine.definition
        fixture = bool(d.get("fixture"))
        params = None if fixture else {k: copy.deepcopy(d[k]) for k in SCENARIO_PARAM_KEYS if k in d}
        return {
            "profile": PROFILE,
            "scenario": {
                "id": self.scenario, "name": d.get("name"), "family": d.get("family"), "fixture": fixture,
                "parameters": params,
            },
            "warmup_min": WARMUP_MIN,
            "scored_min": SCORED_MIN,
            "seed": self.seed,
            "seed_partition": seed_partition(self.scenario, self.seed),
            "versions": {
                "api": API_VERSION, "engine": ENGINE_VERSION, "profile": PROFILE_ID, "scenario_catalog": CATALOG_VERSION,
            },
        }

    def save(self, ui: dict[str, Any], settings: dict[str, Any],
             forecast_samples: int = fcast.DEFAULT_SAMPLES) -> dict[str, Any]:
        """Builds and stores a saved run: the received events and announcements, choices, settings, the
        selected zone and camera, and (when the shift is over) the completed results."""
        with self.lock:
            e = self.engine
            e.gate.flush(e.now)
            snap = self.snapshot()
            events = list(e.gate.received)
            completed = e.now >= WARMUP_MIN + SCORED_MIN - 1e-9
            d = e.definition
            record = {
                "format": "pulseahead-saved-run",
                "format_version": 1,
                "saved_id": uuid.uuid4().hex[:12],
                "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "synthetic": True,
                "completed": completed,
                "label": "Completed synthetic run" if completed else "Saved in-progress synthetic run",
                "identity": {
                    "replay_id": self.id,
                    "run_number": self.run_number,
                    "state_version": self.version,
                    "scenario": self.scenario,
                    "scenario_name": d.get("name"),
                    "seed": self.seed,
                    "profile_id": PROFILE_ID,
                    "sim_time_min": round(e.now, 3),
                },
                "run_record": self.run_record(),
                "events": events,
                "event_count": len(events),
                "event_digest": digest_events(events),
                "announcements": snap["ambulance_announcements"],
                # Staff decisions and approvals arrive with the action tickets; none exist yet.
                "choices": [],
                "settings": {
                    "simulation": settings,
                    "forecast": {
                        "samples": forecast_samples, "model_version": fcast.MODEL_VERSION,
                        "horizon_min": fcast.HORIZON_MIN, "tail_min": fcast.TAIL_MIN,
                        "refresh_every_min": fcast.REFRESH_MIN, "seed": fcast.FORECAST_SEED,
                        "warning_threshold": fcast.WARNING_THRESHOLD,
                    },
                },
                "ui": ui,
                "observed": {
                    "counts": snap["counts"],
                    "overall_status": snap["overall_status"]["label"],
                    "zone_states": [z["state"] for z in snap["pressure"]["zones"]],
                    "patients_in_ed": len(snap["patients"]),
                },
                "results": {
                    "label": "Completed synthetic run" if completed else "In-progress synthetic run: no final outcome yet",
                    "completed": completed,
                    "scored_window_min": [WARMUP_MIN, WARMUP_MIN + SCORED_MIN],
                    "time_summary": self._time_summary(),
                    "unfinished": [
                        {"patient_id": p.id, "phase": p.phase, "urgency": p.supplied.urgency,
                         "accrued_ed_min": p.time_parts(e.now)["total_ed_min"]}
                        for p in e.patients.values() if p.departure_min is None
                    ],
                    "congestion_episodes": list(e.monitor.episodes),
                    "local_episodes": {sid: list(st.episodes) for sid, st in e.local.services.items()},
                },
                "note": (
                    "Synthetic demo run. This record is evidence: it carries the scenario's workload "
                    "variant, which is hidden from every observation response of the live replay."
                ),
            }
        saved.put(record)
        return record

    def export(self) -> dict[str, Any]:
        with self.lock:
            e = self.engine
            e.gate.flush(e.now)
            return {
                "api_version": API_VERSION,
                "synthetic": True,
                "replay_id": self.id,
                "run_number": self.run_number,
                "version": self.version,
                "profile": PROFILE,
                "run_record": self.run_record(),
                "scenario": self.scenario,
                "seed": self.seed,
                "sim_time_min": round(e.now, 3),
                "events": list(e.gate.received),
                "ingest": {
                    "counts": dict(e.gate.counts),
                    "log": list(e.gate.log),
                    "sequence_gaps": e.gate.sequence_gaps(),
                    "feeds": e.gate.feeds_view(e.now),
                },
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
                "local_episodes": {sid: list(st.episodes) for sid, st in e.local.services.items()},
            }


def digest_events(events: list[dict[str, Any]]) -> str:
    return hashlib.sha256(json.dumps(events, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class SavedRunMismatch(Exception):
    """A saved run no longer reproduces under the current engine or assumptions."""


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

    def load(self, record: dict[str, Any]) -> ReplaySession:
        """Rebuilds a saved run as a new replay at its saved time and checks that it reproduces the saved
        received events exactly. A run that does not reproduce is refused, never approximated."""
        ident = record["identity"]
        session = ReplaySession(ident["seed"], ident["scenario"])
        target = float(ident["sim_time_min"])
        while session.engine.now < target - 1e-9:
            session.advance(min(MAX_ADVANCE_MIN, target - session.engine.now))
        got = list(session.engine.gate.received)
        if len(got) != record["event_count"] or digest_events(got) != record["event_digest"]:
            why = (
                f"{len(got)} events rebuilt, {record['event_count']} saved"
                if len(got) != record["event_count"]
                else f"all {len(got)} events rebuilt but their digest differs from the saved digest"
            )
            raise SavedRunMismatch(f"saved run {record['saved_id']} does not reproduce: {why}")
        session.saved_run = {
            "id": record["saved_id"],
            "label": record["label"],
            "completed": record["completed"],
            "saved_at": record["saved_at"],
            "ui": record["ui"],
            "settings": record["settings"],
            "choices": record["choices"],
            "results": record["results"],
            "versions": record["run_record"]["versions"],
        }
        with self._lock:
            self._sessions[session.id] = session
        return session
