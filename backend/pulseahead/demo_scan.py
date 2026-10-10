"""In-process scan that chooses the demo case from development and tuning seeds only.

Run: `backend/.venv/Scripts/python.exe -m pulseahead.demo_scan` from `backend/`.

For every development and tuning seed of every family: replay with no action, forecast every 15
simulated minutes at 50 futures, match forecasts to the replay's own episodes with
`evaluation.match_forecasts`. A candidate needs a forecast-risk alert with lead >= 30 min, at least
two supported drivers at that alert (`demo_case.drivers`) and a feasible, supported action for the
alerted zone at that moment. Test seeds are never touched. Nothing here changes a parameter.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

from . import demo_case
from . import evaluation as ev
from .pressure import SERVICES
from .profile import ENGINE_VERSION, SCENARIOS
from .replay import ReplaySession
from . import forecast as fcast

MIN_LEAD_MIN = 30.0
EVIDENCE = Path(__file__).resolve().parents[2] / "evidence"
LABEL_RANK = {"best_action": 0, "supported_not_top": 1}


def scan_shift(family: str, seed: int, partition: str, log) -> dict[str, Any]:
    s = ReplaySession(seed, family)
    warnings: list[dict[str, Any]] = []
    at_alert: dict[tuple[float, str], dict[str, Any]] = {}
    t = 0.0
    while t < ev.END_MIN - 1e-9:
        s.advance(ev.STEP_MIN)
        t = s.engine.now
        f, _ = s.forecast(ev.SAMPLES, None)
        if f is None:
            continue
        warnings.extend(ev._warnings_from(f, round(t, 3)))
        risky = [a for a in f["alerts"]["actionable"] if a["kind"] == "forecast_risk"]
        if not risky:
            continue
        snap = s.snapshot()
        d = demo_case.drivers(snap, f)
        if d["supported_count"] < 2:
            for a in risky:
                at_alert[(round(t, 3), a["service"])] = {"drivers": d, "compare": None, "overall": snap["overall_status"]["label"]}
            continue
        cmp, _ = s.compare(ev.SAMPLES, None)
        rows = []
        if cmp and cmp.get("status") == "ok":
            for r in cmp["actions"]:
                rows.append({
                    "id": r["id"], "preset": r["preset"], "target": r["target"], "zone": r["zone"], "service": r["service"],
                    "feasible": r["feasible"], "label": r.get("rank", {}).get("label"), "order": r.get("order"),
                    "owner": r["owners"][0],
                    "saving_mean": r.get("rank", {}).get("rule", {}).get("saving_mean"),
                    "saving_lower_90": r.get("rank", {}).get("rule", {}).get("saving_lower_90"),
                })
        for a in risky:
            at_alert[(round(t, 3), a["service"])] = {
                "drivers": d, "compare": rows, "overall": snap["overall_status"]["label"], "chance": a["chance"],
                "onset": a["onset"], "zone": a["zone"], "category": a["category_label"],
            }
        log(f"  {family}/{seed} T+{t:.0f}: alerts {[a['service'] for a in risky]} drivers {d['supported_count']}")
    while s.engine.now < ev.END_MIN + ev.TRUTH_EXTENSION_MIN - 1e-9:
        s.advance(min(60.0, ev.END_MIN + ev.TRUTH_EXTENSION_MIN - s.engine.now))
    eps = ev._episodes(s)
    m = ev.match_forecasts(eps, warnings)
    out: dict[str, Any] = {
        "family": family, "seed": seed, "partition": partition, "episodes": m["episodes"],
        "false_warning_runs": m["false_warning_runs"], "warning_runs": m["warning_runs"], "candidates": [],
    }
    for ep in m["episodes"]:
        if ep["result"] != "early_warned" or ep["lead_min"] is None:
            continue
        # The earliest forecast-risk warning that preceded this episode (the one match_forecasts credited).
        t_alert = min(
            w["t"] for w in warnings
            if w["key"] == ep["key"] and w["kind"] == "forecast_risk" and w["t"] < ep["onset"] <= w["t"] + fcast.HORIZON_MIN
        )
        info = at_alert.get((t_alert, ep["key"]))
        row = {"key": ep["key"], "onset_min": ep["onset"], "confirmed_min": ep["confirmed"], "alert_time_min": t_alert,
               "lead_min": ep["lead_min"], "qualifies": False, "reason": None}
        if ep["key"] == "overall":
            row["reason"] = "overall-ED episode: the demo case is a local service alert"
        elif info is None:
            row["reason"] = "no alert record at the matched time"
        elif ep["lead_min"] < MIN_LEAD_MIN:
            row["reason"] = f"lead {ep['lead_min']} min is under {MIN_LEAD_MIN:.0f}"
        else:
            row.update(
                drivers=[d["id"] for d in info["drivers"]["drivers"]], driver_count=info["drivers"]["supported_count"],
                overall_label=info["overall"], chance=info.get("chance"), onset=info.get("onset"),
            )
            if info["drivers"]["supported_count"] < 2:
                row["reason"] = "fewer than two supported drivers"
            elif not info.get("compare"):
                row["reason"] = "no comparison available"
            else:
                zone = SERVICES[ep["key"]]["zone"]
                supported = [r for r in info["compare"] if r["feasible"] and r["label"] in LABEL_RANK and r["zone"] == zone]
                supported.sort(key=lambda r: (LABEL_RANK[r["label"]], r["order"] or 99))
                row["actions"] = info["compare"]
                if not supported:
                    row["reason"] = "no feasible, supported action for the alerted zone"
                else:
                    row.update(qualifies=True, top_action=supported[0], reason="qualifies")
        out["candidates"].append(row)
    return out


def main() -> int:
    t0 = time.time()
    lines: list[str] = []

    def log(msg: str) -> None:
        print(msg, flush=True)
        lines.append(msg)

    shifts = []
    for family, info in SCENARIOS.items():
        for part in ("development", "tuning", "demo"):
            for seed in info["seed_partitions"][part]:
                log(f"shift {family} {part} seed {seed}")
                shifts.append(scan_shift(family, seed, part, log))
    cands = []
    for sh in shifts:
        for c in sh["candidates"]:
            if c["qualifies"]:
                cands.append({**c, "family": sh["family"], "seed": sh["seed"], "partition": sh["partition"]})

    def rank(c: dict[str, Any]) -> tuple:
        return (-c["driver_count"], LABEL_RANK[c["top_action"]["label"]], 0 if c["overall_label"] == "Stable" else 1,
                -c["lead_min"], c["seed"], c["family"])

    cands.sort(key=rank)
    result = {
        "kind": "demo_case_scan", "engine_version": ENGINE_VERSION, "forecast_model": fcast.MODEL_VERSION,
        "warning_threshold": fcast.WARNING_THRESHOLD, "partitions": ["development", "tuning", "demo"],
        "min_lead_min": MIN_LEAD_MIN, "driver_rules": demo_case.DRIVER_RULES,
        "ranking": "more supported drivers, then best_action over supported_not_top, then overall status Stable, "
                   "then longer lead, then lower seed",
        "shifts": [{k: v for k, v in sh.items() if k != "candidates"} | {"candidates": [
            {k: v for k, v in c.items() if k != "actions"} for c in sh["candidates"]]} for sh in shifts],
        "qualifying": [{k: v for k, v in c.items() if k != "actions"} for c in cands],
        "elapsed_s": round(time.time() - t0, 1),
    }
    (EVIDENCE / "demo-case-scan.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
    if not cands:
        # A stale case from other settings must not linger: the demo then says plainly that none qualifies.
        if demo_case.CASE_FILE.exists():
            demo_case.CASE_FILE.unlink()
        reasons: dict[str, int] = {}
        for sh in shifts:
            for c in sh["candidates"]:
                reasons[c["reason"]] = reasons.get(c["reason"], 0) + 1
        (EVIDENCE / "demo-case-scan.md").write_text(
            "# Demo case scan (non-test seeds only: development, tuning, demo)\n\n"
            f"Scanned {len(shifts)} shifts at warning threshold {fcast.WARNING_THRESHOLD} (model {fcast.MODEL_VERSION}). "
            "**No episode qualified** (lead >= 30 min, >= 2 supported drivers, a feasible supported action). "
            "No demo case is written; the demo reports that honestly.\n\n"
            + "\n".join(f"- {n} early-warned episode(s): {r}" for r, n in sorted(reasons.items())) + "\n",
            encoding="utf-8",
        )
        log("NO qualifying candidate; demo_case.json removed")
        return 1
    best = cands[0]
    top = best["top_action"]
    chosen = {
        "scenario": best["family"], "seed": best["seed"], "partition": best["partition"], "service": best["key"],
        "service_name": SERVICES[best["key"]]["name"], "alert_time_min": best["alert_time_min"],
        "why": (
            f"Chosen from {len(cands)} qualifying early-warned episodes on development/tuning seeds "
            f"({len(shifts)} shifts scanned): {best['driver_count']} supported drivers "
            f"({', '.join(best['drivers'])}), a forecast-risk alert {best['lead_min']:.0f} min before onset, and a "
            f"{top['label'].replace('_', ' ')} for zone {top['zone']}. A demo case, not held-out evidence."
        ),
        "scan": {
            "file": "evidence/demo-case-scan.json", "shifts_scanned": len(shifts), "qualifying": len(cands),
            "lead_min": best["lead_min"], "onset_min": best["onset_min"], "confirmed_min": best["confirmed_min"],
            "chance": best.get("chance"), "drivers": best["drivers"], "overall_label": best["overall_label"],
            "top_action": top, "engine_version": ENGINE_VERSION, "forecast_model": fcast.MODEL_VERSION,
        },
    }
    demo_case.CASE_FILE.write_text(json.dumps(chosen, indent=1), encoding="utf-8")
    md = ["# Demo case scan (non-test seeds only: development, tuning, demo)", "",
          f"Scanned {len(shifts)} shifts, forecast every {ev.STEP_MIN} min at {ev.SAMPLES} futures; "
          f"{len(cands)} qualifying early-warned episodes (lead >= {MIN_LEAD_MIN:.0f} min, >= 2 supported drivers, "
          "a feasible supported action for the alerted zone).", "", "## Chosen", "", chosen["why"], "",
          "## Qualifying", ""]
    for c in cands:
        md.append(f"- {c['family']} seed {c['seed']} ({c['partition']}): {c['key']} onset T+{c['onset_min']:.0f}, "
                  f"alert T+{c['alert_time_min']:.0f} (lead {c['lead_min']:.0f}), drivers {c['drivers']}, "
                  f"overall {c['overall_label']}, action {c['top_action']['id']} {c['top_action']['label']}")
    md += ["", "## Not qualifying (early-warned episodes)", ""]
    for sh in shifts:
        for c in sh["candidates"]:
            if not c["qualifies"]:
                md.append(f"- {sh['family']} seed {sh['seed']}: {c['key']} onset T+{c['onset_min']:.0f}: {c['reason']}")
    (EVIDENCE / "demo-case-scan.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    log(chosen["why"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
