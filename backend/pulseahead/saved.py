"""Saved runs: JSON files under backend/saved_runs, so they survive a backend restart.

A saved run holds the received events, announcements, choices, settings, selected zone and camera,
and results. It is evidence: it also carries the scenario's workload variant (hidden from the live
replay's observation responses). Loading rebuilds the run from its seed and checks the received events.
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import Any

SAVE_DIR = Path(__file__).resolve().parents[1] / "saved_runs"
_ID = re.compile(r"^[0-9a-f]{12}$")
_lock = threading.Lock()


def put(record: dict[str, Any]) -> None:
    with _lock:
        SAVE_DIR.mkdir(parents=True, exist_ok=True)
        (SAVE_DIR / f"{record['saved_id']}.json").write_text(json.dumps(record, indent=1), encoding="utf-8")


def get(saved_id: str) -> dict[str, Any] | None:
    if not _ID.match(saved_id):
        return None
    path = SAVE_DIR / f"{saved_id}.json"
    with _lock:
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))


def summary(record: dict[str, Any]) -> dict[str, Any]:
    ident = record["identity"]
    return {
        "saved_id": record["saved_id"],
        "label": record["label"],
        "completed": record["completed"],
        "saved_at": record["saved_at"],
        "scenario": ident["scenario"],
        "scenario_name": ident["scenario_name"],
        "seed": ident["seed"],
        "sim_time_min": ident["sim_time_min"],
        "event_count": record["event_count"],
        "ui": record["ui"],
    }


def list_summaries() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    with _lock:
        if not SAVE_DIR.is_dir():
            return out
        for path in SAVE_DIR.glob("*.json"):
            try:
                out.append(summary(json.loads(path.read_text(encoding="utf-8"))))
            except (OSError, ValueError, KeyError):
                continue
    return sorted(out, key=lambda s: s["saved_at"], reverse=True)
