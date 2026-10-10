"""Replay sessions: plain-data state, versioning, and the observed-state read model.

A session owns one engine. Observation responses are built only from received state and events;
nothing beyond the current simulated time is ever exposed.
"""

from __future__ import annotations

import threading
import uuid
from typing import Any

from .engine import EDEngine
from .profile import PROFILE, PROFILE_ID, SCENARIOS, ZONES

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
    def advance(self, minutes: float) -> dict[str, Any]:
        with self.lock:
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
        patients = [p.public(now) for p in sorted(active, key=lambda p: p.id)]

        def in_phase(*phases: str) -> list[str]:
            return [p["id"] for p in patients if p["phase"] in phases]

        occupied = e.occupied_spaces()
        total_spaces = PROFILE["regular_spaces"]
        awaiting = e.awaiting_space()
        clin_busy = e.clinicians.count
        clin_total = PROFILE["clinician_slots"]

        zone_defs = {z["id"]: z for z in ZONES}
        zones = []
        for zid in (1, 2, 3, 4):
            if zid == 1:
                ids = in_phase("arrival")
                detail = {"queue": len(ids), "active": 0}
                capacity = None
            elif zid == 2:
                ids = in_phase("awaiting_space", "awaiting_clinician", "assessment_active")
                detail = {
                    "queue": len(in_phase("awaiting_space", "awaiting_clinician")),
                    "active": len(in_phase("assessment_active")),
                    "awaiting_space": len(in_phase("awaiting_space")),
                    "awaiting_clinician": len(in_phase("awaiting_clinician")),
                }
                capacity = {"kind": "ed_spaces", "shared_with_zone": 3}
            elif zid == 3:
                ids = []
                detail = {"queue": 0, "active": 0}
                capacity = {"kind": "ed_spaces", "shared_with_zone": 2}
            else:
                ids = in_phase("disposition_processing")
                detail = {"queue": 0, "active": len(ids)}
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

        return {
            "api_version": API_VERSION,
            "replay_id": self.id,
            "run_number": self.run_number,
            "version": self.version,
            "profile_id": PROFILE_ID,
            "scenario": self.scenario,
            "scenario_name": SCENARIOS[self.scenario]["name"],
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
                    "total": total_spaces,
                    "occupied": occupied,
                    "available_staffed": total_spaces - occupied,
                    "awaiting_space": awaiting,
                    "owner": PROFILE["owners"]["ed_spaces"],
                },
                "clinician_slots": {
                    "total": clin_total,
                    "busy": clin_busy,
                    "waiting": len(e.clinicians.queue),
                    "owner": PROFILE["owners"]["clinician_slots"],
                },
            },
            "counts": {
                "in_ed": len(patients),
                "arrived_total": len(e.patients),
                "departed_total": e.departed_count,
            },
            "zones": zones,
            "patients": patients,
            "inbound_ambulances": [],
            "event_count": len(e.events),
        }

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
                "patients": [p.timestamps() for p in e.patients.values()],
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
