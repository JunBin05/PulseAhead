"""Records one live analyst answer for the demo case into `demo_analysis.json`.

Run once with a real key, from `backend/`:

    GROQ_API_KEY=... .venv/Scripts/python.exe -m pulseahead.record_analysis <scenario> <seed> <sim_minutes>

The file is shipped so the deployed demo can show a clearly labeled, recorded analysis when the live
call fails. The raw model output is stored and re-validated against the live evidence on every load.
"""

from __future__ import annotations

import json
import sys
from datetime import date

from . import analyst
from . import forecast as fcast
from .replay import ReplayStore


def main(scenario: str, seed: int, at_min: float) -> None:
    s = ReplayStore().create(seed, scenario)
    while s.engine.now < at_min:
        s.advance(min(60.0, at_min - s.engine.now))
    comp, _ = s.compare(fcast.DEFAULT_SAMPLES, None)
    snap = s.snapshot()
    fc, _ = s.forecast(fcast.DEFAULT_SAMPLES, snap["version"])
    res = analyst.analyze(snap, fc, comp, snap["actions"]["catalog"], allow_recorded=False)
    if res["status"] != "ok":
        raise SystemExit(f"live analysis failed: {res.get('reason')}")
    try:
        data = json.loads(analyst.RECORDED_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {"records": []}
    data["records"] = [r for r in data["records"] if not (r["scenario"] == scenario and r["seed"] == seed)]
    data["records"].append({
        "scenario": scenario, "seed": seed, "sim_time_min": at_min, "model": res["model"],
        "recorded_on": date.today().isoformat(), "raw": res["_raw"],
    })
    analyst.RECORDED_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"recorded {scenario} seed {seed} at T+{at_min:g} with {res['model']}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: python -m pulseahead.record_analysis <scenario> <seed> <sim_minutes>")
    main(sys.argv[1], int(sys.argv[2]), float(sys.argv[3]))
