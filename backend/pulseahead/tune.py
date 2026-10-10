"""Choose the warning threshold and the reactive trigger on development and tuning seeds only.

Run: `backend/.venv/Scripts/python.exe -m pulseahead.tune` from `backend/`.

One no-action replay per shift (21 shifts: 1 development + 2 tuning seeds x 7 families) is forecast every
15 simulated minutes at 50 futures; the raw chance of each service and of the overall ED is recorded, and the
candidate thresholds (0.4, 0.6, 0.8) are applied afterwards, which gives exactly the alerts a forecast with
that threshold would have shown (an alert is a Normal service whose chance is at or above the threshold).
Forecasts and episodes never see the test partition. The reactive baseline is run on the same shifts with
each trigger (act when the service is Building / when it is Overloaded). Nothing here changes the engine.

Rule, fixed before the run: the threshold is the one that keeps false warnings per shift at or below 1 and,
among those, warns the most episodes early (ties: lower threshold); if none is at or below 1 the one with the
fewest false warnings is chosen and the target is reported as not met. The trigger is the one with the lower
total ED patient-minutes (ties: Overloaded).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

from . import evaluation as ev
from . import forecast as fcast
from .profile import ENGINE_VERSION, SCENARIOS
from .replay import ReplaySession

THRESHOLDS = (0.4, 0.6, 0.8)
TRIGGERS = ("overloaded", "building")
EVIDENCE = Path(__file__).resolve().parents[2] / "evidence"


class _NoCancel:
    """The policy runner expects an EvalJob for its cancel flag and progress; tuning has neither."""

    import threading

    cancel = threading.Event()
    lock = threading.Lock()
    current: dict[str, Any] | None = None


def raw_warnings(f: dict[str, Any], t: float) -> list[dict[str, Any]]:
    """Every forecast the model could warn on, with its chance, regardless of any threshold."""
    if f.get("status") != "ok":
        return []
    out = []
    o = f.get("overall")
    if o and o.get("kind") == "new_onset":
        out.append({"t": t, "key": "overall", "kind": "forecast_risk", "chance": o.get("chance") or 0.0})
    elif o and o.get("kind") == "confirmation":
        out.append({"t": t, "key": "overall", "kind": "building", "chance": round(o.get("chance") or 0, 3)})
    for sid, s in f["services"].items():
        if s.get("state") == "normal" and s.get("kind") == "new_onset" and s.get("chance") is not None:
            out.append({"t": t, "key": sid, "kind": "forecast_risk", "chance": s["chance"]})
    for a in f["alerts"]["actionable"]:
        if a["kind"] == "building":
            out.append({"t": t, "key": a["service"], "kind": "building", "chance": round(a.get("chance") or 0, 3)})
    return out


def forecast_pass(family: str, seed: int) -> dict[str, Any]:
    s = ReplaySession(seed, family)
    raw: list[dict[str, Any]] = []
    t = 0.0
    while t < ev.END_MIN - 1e-9:
        s.advance(ev.STEP_MIN)
        t = s.engine.now
        f, _ = s.forecast(ev.SAMPLES, None)
        if f is not None:
            raw.extend(raw_warnings(f, round(t, 3)))
    rows = ev._cohort(s)
    no_action = ev.policy_metrics(rows, [])
    while s.engine.now < ev.END_MIN + ev.TRUTH_EXTENSION_MIN - 1e-9:
        s.advance(min(60.0, ev.END_MIN + ev.TRUTH_EXTENSION_MIN - s.engine.now))
    return {"raw": raw, "episodes": ev._episodes(s), "no_action": no_action}


def at_threshold(raw: list[dict[str, Any]], threshold: float) -> list[dict[str, Any]]:
    out = []
    for w in raw:
        if w["kind"] == "forecast_risk":
            if w["chance"] >= threshold:
                out.append({"t": w["t"], "key": w["key"], "kind": "forecast_risk", "chance": round(w["chance"], 3)})
        else:
            out.append(w)
    return out


def summarize(per_shift: list[dict[str, Any]]) -> dict[str, Any]:
    eps = [e for s in per_shift for e in s["episodes"]]
    leads = sorted(e["lead_min"] for e in eps if e["lead_min"] is not None)
    n = len(per_shift)
    return {
        "shifts": n, "episodes": len(eps),
        "early_warned": sum(1 for e in eps if e["result"] == "early_warned"),
        "early_30_min_or_more": sum(1 for x in leads if x >= ev.EARLY_LEAD_MIN),
        "late_only": sum(1 for e in eps if e["result"] == "late_only"),
        "missed": sum(1 for e in eps if e["result"] == "missed"),
        "lead_median_min": leads[len(leads) // 2] if leads else None,
        "false_warning_runs": sum(s["false_warning_runs"] for s in per_shift),
        "false_warnings_per_shift": round(sum(s["false_warning_runs"] for s in per_shift) / n, 2),
    }


def main() -> int:
    t0 = time.time()
    shifts: list[dict[str, Any]] = []
    for family, info in SCENARIOS.items():
        for part in ("development", "tuning"):
            for seed in info["seed_partitions"][part]:
                print(f"forecast pass {family} {part} {seed}", flush=True)
                shifts.append({"family": family, "partition": part, "seed": seed, **forecast_pass(family, seed)})

    by_threshold: dict[float, dict[str, Any]] = {}
    for th in THRESHOLDS:
        per = []
        for sh in shifts:
            m = ev.match_forecasts(sh["episodes"], at_threshold(sh["raw"], th))
            per.append({"family": sh["family"], "seed": sh["seed"], **m})
        by_threshold[th] = {"summary": summarize(per), "per_shift_false_runs": [p["false_warning_runs"] for p in per]}

    job = _NoCancel()
    by_trigger: dict[str, dict[str, Any]] = {}
    for trig in TRIGGERS:
        tot, unf, hrs, acts = 0.0, 0, 0.0, 0
        per_shift = []
        for sh in shifts:
            print(f"reactive[{trig}] {sh['family']} {sh['seed']}", flush=True)
            res, _ = ev._policy_run(job, sh["family"], sh["seed"], "reactive", trig)  # type: ignore[arg-type]
            m = res["metrics"]
            tot += m["total_ed_patient_min"]
            unf += m["unfinished_stays"]
            hrs += m["resource_hours"]
            acts += m["actions_approved"]
            per_shift.append(round(sh["no_action"]["total_ed_patient_min"] - m["total_ed_patient_min"], 1))
        by_trigger[trig] = {
            "total_ed_patient_min": round(tot, 1), "unfinished_stays": unf, "resource_hours": round(hrs, 3),
            "actions_approved": acts, "saving_vs_no_action_by_shift": per_shift,
        }
    no_action_total = round(sum(sh["no_action"]["total_ed_patient_min"] for sh in shifts), 1)

    ok = [th for th in THRESHOLDS if by_threshold[th]["summary"]["false_warnings_per_shift"] <= 1.0]
    if ok:
        threshold = sorted(ok, key=lambda th: (-by_threshold[th]["summary"]["early_warned"], th))[0]
        met = True
    else:
        threshold = sorted(THRESHOLDS, key=lambda th: (by_threshold[th]["summary"]["false_warnings_per_shift"], th))[0]
        met = False
    trigger = sorted(TRIGGERS, key=lambda k: (by_trigger[k]["total_ed_patient_min"], 0 if k == "overloaded" else 1))[0]

    result = {
        "kind": "tuning_results", "engine_version": ENGINE_VERSION, "forecast_model_at_run": fcast.MODEL_VERSION,
        "partitions": ["development", "tuning"], "shifts": len(shifts), "elapsed_s": round(time.time() - t0, 1),
        "thresholds": {str(k): v for k, v in by_threshold.items()},
        "reactive_triggers": by_trigger, "no_action_total_ed_patient_min": no_action_total,
        "chosen": {"warning_threshold": threshold, "false_warning_target_met": met, "reactive_trigger": trigger},
        "rule": __doc__,
    }
    (EVIDENCE / "tuning-results.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    md = ["# Tuning on development and tuning seeds (21 shifts; test seeds untouched)", "",
          "| Threshold | Episodes | Early | Early 30+ | Late only | Missed | Median lead | False warnings / shift |",
          "|---|---|---|---|---|---|---|---|"]
    for th in THRESHOLDS:
        s = by_threshold[th]["summary"]
        md.append(f"| {th} | {s['episodes']} | {s['early_warned']} | {s['early_30_min_or_more']} | {s['late_only']} | "
                  f"{s['missed']} | {s['lead_median_min']} | {s['false_warnings_per_shift']} |")
    md += ["", f"No action total: {no_action_total} patient-min.", "",
           "| Reactive trigger | Total ED patient-min | Unfinished | Reserve hours | Actions |", "|---|---|---|---|---|"]
    for k in TRIGGERS:
        r = by_trigger[k]
        md.append(f"| {k} | {r['total_ed_patient_min']} | {r['unfinished_stays']} | {r['resource_hours']} | {r['actions_approved']} |")
    md += ["", f"**Chosen:** threshold {threshold} (false-warning target of at most 1 per shift "
           f"{'met' if met else 'NOT met by any candidate'}), reactive trigger {trigger}.", "",
           "Rule fixed before the run: the threshold with at most 1 false warning per shift that warns the most "
           "episodes early (ties: lower); otherwise the fewest false warnings. The trigger with the lower total ED "
           "patient-minutes (ties: Overloaded)."]
    (EVIDENCE / "tuning-results.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps(result["chosen"]), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
