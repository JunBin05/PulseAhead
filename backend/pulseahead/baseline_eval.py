"""A simple-flow warning baseline against the same episodes, on development and tuning seeds only.

Run: `backend/.venv/Scripts/python.exe -m pulseahead.baseline_eval` from `backend/`.

Rule (no Monte Carlo, no learned parameter): every 15 simulated minutes, for each service that is Normal
with at least one patient waiting, warn when the received demand rate exceeds its capacity (lambda > mu,
`pressure.services[*].rates.pressure_signal`). The matching rule is `evaluation.match_forecasts`, the same one
the forecast is scored with. Compared with the Monte Carlo forecast's tuning numbers
(`evidence/tuning-results.json`, threshold 0.6, same 21 shifts). Nothing here touches test seeds.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from . import evaluation as ev
from .profile import SCENARIOS
from .replay import ReplaySession

EVIDENCE = Path(__file__).resolve().parents[2] / "evidence"


def simple_flow_pass(family: str, seed: int) -> dict[str, Any]:
    s = ReplaySession(seed, family)
    warnings: list[dict[str, Any]] = []
    t = 0.0
    while t < ev.END_MIN - 1e-9:
        s.advance(ev.STEP_MIN)
        t = s.engine.now
        snap = s.snapshot()
        for sid, p in snap["pressure"]["services"].items():
            if not p["inputs_ok"]:
                continue
            if p["state"] == "normal" and (p["queue"] or 0) >= 1 and p["rates"].get("pressure_signal") is True:
                warnings.append({"t": round(t, 3), "key": sid, "kind": "forecast_risk", "chance": 1.0})
            elif p["state"] == "building":
                warnings.append({"t": round(t, 3), "key": sid, "kind": "building", "chance": 1.0})
    while s.engine.now < ev.END_MIN + ev.TRUTH_EXTENSION_MIN - 1e-9:
        s.advance(min(60.0, ev.END_MIN + ev.TRUTH_EXTENSION_MIN - s.engine.now))
    return ev.match_forecasts(ev._episodes(s), warnings)


def main() -> int:
    per = []
    for family, info in SCENARIOS.items():
        for part in ("development", "tuning"):
            for seed in info["seed_partitions"][part]:
                print(f"simple-flow {family} {part} {seed}", flush=True)
                m = simple_flow_pass(family, seed)
                per.append({"family": family, "seed": seed, **m})
    eps = [e for p in per for e in p["episodes"]]
    leads = sorted(e["lead_min"] for e in eps if e["lead_min"] is not None)
    out = {
        "kind": "simple_flow_baseline", "shifts": len(per), "episodes": len(eps),
        "early_warned": sum(1 for e in eps if e["result"] == "early_warned"),
        "early_30_min_or_more": sum(1 for x in leads if x >= ev.EARLY_LEAD_MIN),
        "late_only": sum(1 for e in eps if e["result"] == "late_only"),
        "missed": sum(1 for e in eps if e["result"] == "missed"),
        "lead_median_min": leads[len(leads) // 2] if leads else None,
        "false_warnings_per_shift": round(sum(p["false_warning_runs"] for p in per) / len(per), 2),
        "rule": __doc__,
    }
    tune = json.loads((EVIDENCE / "tuning-results.json").read_text(encoding="utf-8"))
    mc = tune["thresholds"]["0.6"]["summary"]
    out["monte_carlo_threshold_0_6"] = mc
    (EVIDENCE / "simple-flow-baseline.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    md = [
        "# Simple-flow baseline vs Monte Carlo forecast (development and tuning seeds, 21 shifts)", "",
        "| Method | Episodes | Early | Early 30+ | Late only | Missed | Median lead | False warnings / shift |",
        "|---|---|---|---|---|---|---|---|",
        f"| Simple flow (lambda > mu with a queue) | {out['episodes']} | {out['early_warned']} | {out['early_30_min_or_more']} | "
        f"{out['late_only']} | {out['missed']} | {out['lead_median_min']} | {out['false_warnings_per_shift']} |",
        f"| Monte Carlo, threshold 0.6 | {mc['episodes']} | {mc['early_warned']} | {mc['early_30_min_or_more']} | "
        f"{mc['late_only']} | {mc['missed']} | {mc['lead_median_min']} | {mc['false_warnings_per_shift']} |",
        "", "Same episodes, same matching rule. The simple-flow rule is a fixed, untuned rule; the Monte Carlo threshold was "
        "chosen on these same shifts, so its numbers here are in-sample. Descriptive only.",
    ]
    (EVIDENCE / "simple-flow-baseline.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
