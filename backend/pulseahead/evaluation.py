"""One small held-out evaluation (ticket 18 merged with 19, reduced by the scope amendment).

7 scenario families x the first held-out test seed of each, scored window T+120 to T+600. For each
shift: a no-action replay that is forecast every 15 simulated minutes (forecast quality is measured
against the replay's own monitor episodes), and two decision policies on the same seed:

- **PulseAhead**: every 15 minutes, when no action is in flight, compare the feasible actions and have
  the resource owner approve the top action only if it is labelled Best action (the real request and
  decision commands).
- **Reactive**: the same catalog, owners and delays, but the owner approves a feasible action only once
  its service is already Overloaded. It uses no comparison.

Everything is descriptive: one shift per family, no threshold tuning, no confidence claim. Unfavourable
and no-help results are kept. Nothing here changes the engine; sessions are ordinary `ReplaySession`s
that are never registered with the replay store.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import actions as act
from . import forecast as fcast
from .profile import ENGINE_VERSION, SCENARIOS, SCORED_MIN, WARMUP_MIN
from .pressure import SERVICES
from .replay import ReplaySession

STEP_MIN = 15
SAMPLES = 50
END_MIN = WARMUP_MIN + SCORED_MIN  # 600
TRUTH_EXTENSION_MIN = 110  # so a warning near the end of the window can still meet its episode
EARLY_LEAD_MIN = 30.0
COORDINATOR = act.DEMO_COORDINATOR

# The held-out partition is "test"; seed index 0 was evaluated and its results seen before any tuning, so
# the one frozen-settings evaluation uses index 1.
TEST_SEED_INDEX = 1
PARTITIONS = ("development", "tuning", "demo", "test")
# Reactive baseline: the owner approves a feasible action once its service is at one of these states.
REACTIVE_TRIGGER = "building"  # chosen with the threshold on development/tuning seeds (evidence/tuning-results.md)
REACTIVE_STATES = {"overloaded": {"overloaded"}, "building": {"building", "overloaded"}}

EVAL_DIR = Path(__file__).resolve().parents[1] / "saved_runs" / "evaluations"

JOBS: dict[str, "EvalJob"] = {}
_JOBS_LOCK = threading.Lock()


class Cancelled(Exception):
    pass


class EvalJob:
    def __init__(self) -> None:
        self.id = uuid.uuid4().hex[:10]
        self.created = datetime.now(timezone.utc).isoformat(timespec="seconds")
        self.status = "running"  # running | done | cancelled | failed
        self.cancel = threading.Event()
        self.families: list[str] = []
        self.partition = "test"
        self.seed_index = TEST_SEED_INDEX
        self.done: list[dict[str, Any]] = []
        self.current: dict[str, Any] | None = None
        self.error: str | None = None
        self.started = time.time()
        self.finished: float | None = None
        self.lock = threading.Lock()

    # -- read models ---------------------------------------------------------------------
    def progress(self) -> dict[str, Any]:
        with self.lock:
            return {
                "api_version": "v1", "kind": "evaluation", "id": self.id, "status": self.status,
                "synthetic": True, "created": self.created, "partition": self.partition, "seed_index": self.seed_index, "families_total": len(self.families),
                "families_done": len(self.done), "current": self.current, "error": self.error,
                "elapsed_s": round((self.finished or time.time()) - self.started, 1),
                "complete": self.status == "done",
                "label": (
                    (
                        "Synthetic, 7 shifts (1 held-out seed per family), descriptive only"
                        if self.partition == "test"
                        else f"Synthetic, 7 shifts on {self.partition} seeds: NOT held-out evidence, descriptive only"
                    )
                    if self.status == "done"
                    else "Unfinished: partial results are not a complete evaluation"
                ),
                "results": self.results(),
            }

    def results(self) -> dict[str, Any]:
        shifts = list(self.done)
        return {"shifts": shifts, "aggregate": aggregate(shifts), "settings": settings(self.partition, self.seed_index), "complete": self.status == "done"}


def settings(partition: str = "test", seed_index: int = TEST_SEED_INDEX) -> dict[str, Any]:
    return {
        "families": list(SCENARIOS), "partition": f"{partition} (seed index {seed_index} of each family)", "warmup_min": WARMUP_MIN,
        "scored_min": SCORED_MIN, "forecast_every_min": STEP_MIN, "forecast_samples": SAMPLES,
        "warning_threshold": fcast.WARNING_THRESHOLD, "threshold_tuned": fcast.THRESHOLD_TUNED, "reactive_trigger": REACTIVE_TRIGGER,
        "engine_version": ENGINE_VERSION, "forecast_model": fcast.MODEL_VERSION, "forecast_seed": fcast.FORECAST_SEED,
        "matching_rule": (
            "An early warning is a forecast-risk alert (chance at or above the threshold) for a service, or the "
            "overall ED, made at time t when that service's confirmed episode has its onset in (t, t+90]. Each "
            "episode is matched by its earliest such warning (one to one). A building alert made before "
            "confirmation, with no earlier forecast-risk match, is late only. An episode with neither is missed. "
            "Consecutive forecast-risk alerts for one service form one warning run; a run with no matching "
            "episode in (first time, last time + 90] is a false warning. Building or current alerts earn no "
            "early-detection credit."
        ),
        "policies": {
            "no_action": "No action is ever requested.",
            "reactive": f"Same catalog, owners and delays; the owner approves a feasible action once its service is {REACTIVE_TRIGGER.capitalize()} (trigger chosen on development/tuning seeds). No comparison is used.",
            "pulseahead": "Every 15 min with no action in flight, compare actions; the owner approves the top action only if it is labelled Best action.",
        },
        "exposure": (
            "Test seed [0] of every family was evaluated by an earlier run (threshold 0.4, reactive trigger Overloaded) and its "
            "results were seen: it is exposed, not an untouched final test. The warning threshold and the reactive trigger "
            "were then chosen on development/tuning seeds only and frozen; the held-out run uses test seed [1], evaluated once."
        ),
        "limits": [
            "One shift per family: results are descriptive and carry no confidence interval.",
            f"Warning threshold {fcast.WARNING_THRESHOLD} and reactive trigger {REACTIVE_TRIGGER} were chosen on development/tuning seeds only (21 shifts, 42 episodes) and frozen; a tuning choice made on few shifts may not transfer.",
            "Total ED minutes accrue unfinished stays to T+600 and count them apart.",
            "Synthetic scenarios and disclosed assumptions only; not a hospital validation.",
        ],
    }


# -- metrics -----------------------------------------------------------------------------------
def _cohort(session: ReplaySession) -> list[dict[str, Any]]:
    """Patients who arrived in the scored window, with the times a total and an initial wait need."""
    e = session.engine
    rows = []
    for p in e.patients.values():
        if WARMUP_MIN <= p.arrival_min < END_MIN:
            rows.append({
                "id": p.id, "urgency": p.supplied.urgency, "arrival": round(p.arrival_min, 3),
                "first_assessment": None if p.first_assessment_min is None else round(p.first_assessment_min, 3),
                "departure": None if p.departure_min is None else round(p.departure_min, 3),
            })
    rows.sort(key=lambda r: r["id"])
    return rows


def policy_metrics(rows: list[dict[str, Any]], actions: list[dict[str, Any]], at: float = END_MIN) -> dict[str, Any]:
    total = sum((r["departure"] if r["departure"] is not None else at) - r["arrival"] for r in rows)
    urgent = [r for r in rows if r["urgency"] == "urgent"]
    waits = [(r["first_assessment"] if r["first_assessment"] is not None else at) - r["arrival"] for r in urgent]
    hours = sum((a["review_min"] + a["setup_min"] + a["active_min"]) / 60.0 for a in actions)
    return {
        "cohort_patients": len(rows), "unfinished_stays": sum(1 for r in rows if r["departure"] is None),
        "total_ed_patient_min": round(total, 1), "urgent_patients": len(urgent),
        "urgent_initial_wait_mean_min": round(sum(waits) / len(waits), 2) if waits else None,
        "actions_approved": len(actions), "resource_hours": round(hours, 3),
    }


def _episodes(session: ReplaySession) -> list[dict[str, Any]]:
    e = session.engine
    out = []
    for ep in e.monitor.episodes:
        if ep.get("onset_min") is not None:
            out.append({"key": "overall", "onset": ep["onset_min"], "confirmed": ep.get("confirmed_min")})
    for sid, st in e.local.services.items():
        for ep in st.episodes:
            if ep.get("onset_min") is not None:
                out.append({"key": sid, "onset": ep["onset_min"], "confirmed": ep.get("confirmed_min")})
    return out


def _warnings_from(f: dict[str, Any], t: float) -> list[dict[str, Any]]:
    if f.get("status") != "ok":
        return []
    out = []
    o = f.get("overall")
    if o and o.get("kind") == "new_onset" and (o.get("chance") or 0) >= fcast.WARNING_THRESHOLD:
        out.append({"t": t, "key": "overall", "kind": "forecast_risk", "chance": round(o["chance"], 3)})
    elif o and o.get("kind") == "confirmation":
        out.append({"t": t, "key": "overall", "kind": "building", "chance": round(o.get("chance") or 0, 3)})
    for a in f["alerts"]["actionable"]:
        if a["kind"] in ("forecast_risk", "building"):
            out.append({"t": t, "key": a["service"], "kind": a["kind"], "chance": round(a.get("chance") or 0, 3)})
    return out


def match_forecasts(episodes: list[dict[str, Any]], warnings: list[dict[str, Any]], horizon: float = fcast.HORIZON_MIN
                    ) -> dict[str, Any]:
    """The matching rule written in `settings()["matching_rule"]`, applied to recorded warnings/episodes."""
    scored = [e for e in episodes if WARMUP_MIN <= e["onset"] < END_MIN]
    rows = []
    for ep in scored:
        early = sorted(
            w["t"] for w in warnings
            if w["key"] == ep["key"] and w["kind"] == "forecast_risk" and w["t"] < ep["onset"] <= w["t"] + horizon
        )
        building = sorted(
            w["t"] for w in warnings
            if w["key"] == ep["key"] and w["kind"] == "building" and ep["onset"] <= w["t"]
            and (ep["confirmed"] is None or w["t"] < ep["confirmed"])
        )
        if early:
            rows.append({**ep, "result": "early_warned", "lead_min": round(ep["onset"] - early[0], 1)})
        elif building:
            rows.append({**ep, "result": "late_only", "lead_min": None})
        else:
            rows.append({**ep, "result": "missed", "lead_min": None})
    # Warning runs: consecutive forecast-risk alerts for one key.
    false_runs = 0
    runs = 0
    keys = sorted({w["key"] for w in warnings if w["kind"] == "forecast_risk"})
    for k in keys:
        ts = sorted(w["t"] for w in warnings if w["key"] == k and w["kind"] == "forecast_risk" and WARMUP_MIN <= w["t"] <= END_MIN)
        run: list[float] = []
        for t in ts + [None]:
            if run and (t is None or t - run[-1] > STEP_MIN + 1e-9):
                runs += 1
                lo, hi = run[0], run[-1]
                hit = any(e["key"] == k and lo < e["onset"] <= hi + horizon for e in episodes)
                if not hit:
                    false_runs += 1
                run = []
            if t is not None:
                run.append(t)
    return {"episodes": rows, "warning_runs": runs, "false_warning_runs": false_runs}


def aggregate(shifts: list[dict[str, Any]]) -> dict[str, Any]:
    if not shifts:
        return {"shifts": 0}
    eps = [e for s in shifts for e in s["forecast"]["episodes"]]
    leads = sorted(e["lead_min"] for e in eps if e["lead_min"] is not None)
    out: dict[str, Any] = {
        "shifts": len(shifts),
        "episodes": len(eps),
        "early_warned": sum(1 for e in eps if e["result"] == "early_warned"),
        "late_only": sum(1 for e in eps if e["result"] == "late_only"),
        "missed": sum(1 for e in eps if e["result"] == "missed"),
        "early_30_min_or_more": sum(1 for x in leads if x >= EARLY_LEAD_MIN),
        "lead_min": {"min": leads[0], "median": leads[len(leads) // 2], "max": leads[-1], "n": len(leads)} if leads else None,
        "false_warning_runs_total": sum(s["forecast"]["false_warning_runs"] for s in shifts),
        "false_warnings_per_shift": round(sum(s["forecast"]["false_warning_runs"] for s in shifts) / len(shifts), 2),
        "target_false_warnings_per_shift": 1,
    }
    pol: dict[str, Any] = {}
    for name in ("no_action", "reactive", "pulseahead"):
        ms = [s["policies"][name] for s in shifts if name in s["policies"]]
        if not ms:
            continue
        pol[name] = {
            "shifts": len(ms),
            "total_ed_patient_min": round(sum(m["total_ed_patient_min"] for m in ms), 1),
            "unfinished_stays": sum(m["unfinished_stays"] for m in ms),
            "resource_hours": round(sum(m["resource_hours"] for m in ms), 3),
            "actions_approved": sum(m["actions_approved"] for m in ms),
            "urgent_initial_wait_mean_min": (
                round(sum(m["urgent_initial_wait_mean_min"] for m in ms if m["urgent_initial_wait_mean_min"] is not None)
                      / max(1, sum(1 for m in ms if m["urgent_initial_wait_mean_min"] is not None)), 2)
            ),
        }
    out["policies"] = pol
    for name in ("reactive", "pulseahead"):
        deltas = [
            round(s["policies"]["no_action"]["total_ed_patient_min"] - s["policies"][name]["total_ed_patient_min"], 1)
            for s in shifts if name in s["policies"] and "no_action" in s["policies"]
        ]
        if deltas:
            out.setdefault("saving_vs_no_action_by_shift", {})[name] = {
                "per_shift_patient_min": deltas, "better": sum(1 for d in deltas if d > 0),
                "worse": sum(1 for d in deltas if d < 0), "same": sum(1 for d in deltas if d == 0),
            }
    return out


# -- the three runs of one shift -----------------------------------------------------------------
def _check(job: EvalJob) -> None:
    if job.cancel.is_set():
        raise Cancelled()


def _forecast_run(job: EvalJob, family: str, seed: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """No-action replay forecast every 15 minutes; metrics are taken at T+600 and truth runs on."""
    s = ReplaySession(seed, family)
    warnings: list[dict[str, Any]] = []
    t = 0.0
    while t < END_MIN - 1e-9:
        _check(job)
        s.advance(STEP_MIN)
        t = s.engine.now
        with job.lock:
            job.current = {"family": family, "stage": "forecast", "sim_time_min": round(t)}
        f, _ = s.forecast(SAMPLES, None)
        if f is not None:
            warnings.extend(_warnings_from(f, round(t, 3)))
    rows = _cohort(s)
    no_action = policy_metrics(rows, [])
    while s.engine.now < END_MIN + TRUTH_EXTENSION_MIN - 1e-9:
        _check(job)
        s.advance(min(60.0, END_MIN + TRUTH_EXTENSION_MIN - s.engine.now))
    eps = _episodes(s)
    m = match_forecasts(eps, warnings)
    return {
        "warnings": warnings, "episodes_all": eps, **m,
        "records_no_action": rows, "metrics_no_action": no_action,
    }, rows


def _approve(s: ReplaySession, preset: str, target: str, owner: str, tag: str) -> bool:
    from .replay import ActionError

    try:
        rq = s.create_request(preset, target, None, COORDINATOR, record=True)
        s.decide(rq["request"]["id"], owner, "approve", f"eval-{tag}-{rq['request']['id']}", None, record=True)
        return True
    except ActionError:
        return False


def _policy_run(job: EvalJob, family: str, seed: int, policy: str, trigger: str | None = None
                ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    states = REACTIVE_STATES[trigger or REACTIVE_TRIGGER]
    s = ReplaySession(seed, family)
    t = 0.0
    log: list[dict[str, Any]] = []
    while t < END_MIN - 1e-9:
        _check(job)
        s.advance(STEP_MIN)
        t = s.engine.now
        with job.lock:
            job.current = {"family": family, "stage": policy, "sim_time_min": round(t)}
        if t >= END_MIN - 1e-9:
            break
        if s._in_flight() is not None or any(r["status"] in ("pending", "deferred") for r in s.requests.values()):
            continue
        if policy == "pulseahead":
            cmp, _ = s.compare(SAMPLES, None)
            if not cmp or cmp.get("status") != "ok":
                continue
            top = cmp["actions"][0]
            if top.get("rank", {}).get("label") == "best_action" and _approve(s, top["preset"], top["target"], top["owners"][0], policy):
                log.append({"at_min": round(t, 3), "preset": top["preset"], "target": top["target"],
                            "review_min": top["review_min"], "setup_min": top["setup_min"],
                            "active_min": top["active_min"], "label": "best_action",
                            "saving_mean": top["rank"]["rule"].get("saving_mean"),
                            "saving_lower_90": top["rank"]["rule"].get("saving_lower_90")})
        else:  # reactive
            snap = s.snapshot()
            press = snap["pressure"]["services"]
            for c in snap["actions"]["catalog"]:
                if c["feasible"] and press.get(c["service"], {}).get("state") in states:
                    if _approve(s, c["preset"], c["target"], c["owners"][0], policy):
                        log.append({"at_min": round(t, 3), "preset": c["preset"], "target": c["target"],
                                    "review_min": c["review_min"], "setup_min": c["setup_min"],
                                    "active_min": c["active_min"], "label": f"service {press[c['service']]['state']} (reactive trigger)"})
                    break
    rows = _cohort(s)
    return {"metrics": policy_metrics(rows, log), "actions": log, "records": rows}, rows


def run_job(job: EvalJob) -> None:
    try:
        for family in job.families:
            _check(job)
            seed = SCENARIOS[family]["seed_partitions"][job.partition][job.seed_index]
            fc, _ = _forecast_run(job, family, seed)
            pulse, _ = _policy_run(job, family, seed, "pulseahead")
            react, _ = _policy_run(job, family, seed, "reactive")
            shift = {
                "family": family, "name": SCENARIOS[family]["name"], "seed": seed,
                "forecast": {k: fc[k] for k in ("episodes", "warning_runs", "false_warning_runs", "warnings", "episodes_all")},
                "policies": {"no_action": fc["metrics_no_action"], "reactive": react["metrics"], "pulseahead": pulse["metrics"]},
                "actions": {"reactive": react["actions"], "pulseahead": pulse["actions"]},
                "records": {"no_action": fc["records_no_action"], "reactive": react["records"], "pulseahead": pulse["records"]},
            }
            with job.lock:
                job.done.append(shift)
        with job.lock:
            job.status = "done"
            job.current = None
    except Cancelled:
        with job.lock:
            job.status = "cancelled"
            job.current = None
    except Exception as exc:  # noqa: BLE001 - reported to the caller, never swallowed silently
        with job.lock:
            job.status = "failed"
            job.error = f"{type(exc).__name__}: {exc}"
            job.current = None
    finally:
        job.finished = time.time()
        if job.status == "done":
            try:
                save(job)
            except OSError:
                pass  # the in-memory job still serves its results


def save(job: EvalJob) -> None:
    """Persist a finished evaluation exactly as served, so the demo can show real numbers instantly."""
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    payload = {**job.progress(), "format": "pulseahead-evaluation", "format_version": 1}
    (EVAL_DIR / f"{job.id}.json").write_text(json.dumps(payload, indent=1), encoding="utf-8")


def latest_saved() -> dict[str, Any] | None:
    """The newest finished evaluation on disk (by its created time), or None."""
    if not EVAL_DIR.is_dir():
        return None
    best: dict[str, Any] | None = None
    for path in EVAL_DIR.glob("*.json"):
        try:
            rec = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        # Only held-out (test partition) evaluations count as "the latest evaluation" for the demo.
        if rec.get("status") == "done" and rec.get("partition", "test") == "test" and (best is None or rec.get("created", "") > best.get("created", "")):
            best = rec
    return best


def start(families: list[str] | None = None, partition: str = "test", seed_index: int = TEST_SEED_INDEX) -> EvalJob:
    with _JOBS_LOCK:
        if any(j.status == "running" for j in JOBS.values()):
            raise RuntimeError("an evaluation is already running")
        job = EvalJob()
        job.families = [f for f in (families or list(SCENARIOS)) if f in SCENARIOS]
        job.partition, job.seed_index = partition, seed_index
        JOBS[job.id] = job
    threading.Thread(target=run_job, args=(job,), daemon=True, name=f"eval-{job.id}").start()
    return job


def get(job_id: str) -> EvalJob | None:
    with _JOBS_LOCK:
        return JOBS.get(job_id)
