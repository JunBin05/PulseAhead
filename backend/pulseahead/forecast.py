"""Monte Carlo congestion forecast built only from received information.

`forecast()` takes a plain observed snapshot (the same read model an operator sees) plus the received
event history, and nothing else. It never touches the replay engine, its patients or its hidden
schedules. Each future is a fresh runner: patients present now resume from their received phase with
elapsed time, work that is not finished is sampled conditional on the elapsed time, test needs and
durations that are still hidden are sampled from the disclosed assumptions, announced ambulances arrive
around their disclosed ETA, and unannounced demand comes from the disclosed rates (nudged by what was
received recently). Every random value is keyed by (forecast seed, future index, patient or source),
never by the replay seed, so two branches of one comparison share patient demand and care needs.

The flow rules mirror `engine.py` (urgency-ordered finite resources, space kept until departure, tests
then result review, care task before disposition, ward bed reserved for the transfer). The shared
building blocks (`SpacePool`, `WardBeds`, `CongestionMonitor`, `LocalMonitor`) are the engine's own.
"""

from __future__ import annotations

import math
import random
import time
from typing import Any

import simpy

from .engine import CongestionMonitor, SpacePool, WardBeds
from .pressure import CATEGORY_LABEL, SERVICES, LocalMonitor
from .profile import CRITICAL_RANK, PROFILE, URGENCY_RANK

MODEL_VERSION = "mc-flow-1"
# Independent of every replay seed and of any hidden completion value (spec: forecast seeds).
FORECAST_SEED = 7310004
HORIZON_MIN = 90.0
TAIL_MIN = 20.0
REFRESH_MIN = 5.0
DEFAULT_SAMPLES = 50
# Provisional warning threshold (spec: start with 0.4, 0.6, 0.8; tuned on tuning shifts in ticket 18).
WARNING_THRESHOLD = 0.4
REVIEW_MIN = 5.0
MARGIN_MIN = 5.0

# Population-level assumptions used only by the forecast (everything else comes from the profile).
FORECAST_ASSUMPTIONS = {
    "arrival_adjustment": (
        "Walk-in and unannounced-ambulance rates start from the disclosed averages and are scaled by "
        "(received arrivals + 2 x expected) / (3 x expected) over the last 30 minutes, within 0.5 to 4, "
        "decaying back to the disclosed rate with a 30-minute half-life."
    ),
    "turnaround_adjustment": (
        "Lab and imaging turnaround are scaled by the received completed turnarounds of the last 60 "
        "minutes, shrunk toward the disclosed mean with three pseudo-observations, within 0.5 to 3."
    ),
    "ambulance_arrival": (
        "An announced ambulance arrives at its ETA plus a normal error with the disclosed ETA "
        "uncertainty as its standard deviation, never before now; a delayed one arrives soon. A "
        "disclosed 7% cancel. Runs not yet announced are announced at the disclosed rate and arrive "
        "10 to 25 minutes later."
    ),
    "ward_bed_release": (
        "Ward and ICU beds occupied by earlier inpatients each free up after a remaining time drawn "
        "uniformly from 10 to 300 minutes; a bed given to an ED patient stays occupied."
    ),
    "staffing": "Nurse and doctor coverage as received now is assumed to continue.",
    "unfinished_work": (
        "Work already underway finishes after its disclosed duration conditional on the elapsed time; "
        "past the disclosed maximum, about five more minutes."
    ),
}

BED_RELEASE_MIN, BED_RELEASE_MAX = 10.0, 300.0
ARRIVAL_PRIOR_WINDOWS = 2.0
ARRIVAL_WINDOW_MIN = 30.0
TURNAROUND_PRIOR_N = 3.0
TURNAROUND_WINDOW_MIN = 60.0
HALF_LIFE_MIN = 30.0

# A provisional action per service, used only to place a deadline until a comparison exists.
PROVISIONAL_ACTION = {
    "triage": ("Open a staffed surge triage desk", 10),
    "assessment": ("Activate reserve physician assessment capacity", 15),
    "space": ("Activate staffed surge spaces", 20),
    "lab": ("Activate or reallocate diagnostics", 15),
    "imaging": ("Activate or reallocate diagnostics", 15),
    "discharge": ("Accelerate cleared ED discharge processing", 10),
    "allocation": ("Coordinate eligible ward transfers", 10),
    "transport": ("Coordinate eligible ward transfers", 10),
    "ward_beds": ("Coordinate eligible ward transfers", 10),
}

# Stage order of a patient's route; a patient resumes at the stage matching its received phase.
_STAGES = (
    "triage_wait", "triage_active", "space_wait", "clin_wait", "assess_active", "test_wait", "test_active",
    "review_wait", "review_active", "care_wait", "disch_wait", "disch_active", "bed_wait", "alloc_wait",
    "alloc_active", "trans_wait", "trans_active",
)
S = {name: i for i, name in enumerate(_STAGES)}
_PHASE_STAGE = {
    "awaiting_triage": "triage_wait", "in_triage": "triage_active", "awaiting_space": "space_wait",
    "awaiting_clinician": "clin_wait", "assessment_active": "assess_active", "awaiting_lab": "test_wait",
    "in_lab": "test_active", "awaiting_imaging": "test_wait", "in_imaging": "test_active",
    "awaiting_result_review": "review_wait", "result_review_active": "review_active",
    "awaiting_care_completion": "care_wait", "awaiting_discharge": "disch_wait",
    "disposition_processing": "disch_active", "awaiting_ward_bed": "bed_wait",
    "awaiting_ward_allocation": "alloc_wait", "ward_allocation_active": "alloc_active",
    "awaiting_transport": "trans_wait", "in_transport": "trans_active",
}
_ACTIVE = {"triage_active", "assess_active", "test_active", "review_active", "disch_active", "alloc_active",
           "trans_active"}
_SERVICE_IDS = tuple(SERVICES)


# -- distributions -----------------------------------------------------------------------------
def _tri_mean(spec: dict[str, float]) -> float:
    return (spec["min"] + spec["mode"] + spec["max"]) / 3.0


def _tri_cdf(x: float, a: float, c: float, b: float) -> float:
    if x <= a:
        return 0.0
    if x >= b:
        return 1.0
    if x <= c:
        return (x - a) ** 2 / ((b - a) * (c - a)) if c > a else 0.0
    return 1.0 - (b - x) ** 2 / ((b - a) * (b - c)) if b > c else 1.0


def _tri_inv(u: float, a: float, c: float, b: float) -> float:
    fc = (c - a) / (b - a)
    if u < fc:
        return a + math.sqrt(u * (b - a) * (c - a))
    return b - math.sqrt((1.0 - u) * (b - a) * (b - c))


def total_time(u: float, spec: dict[str, float], scale: float = 1.0) -> float:
    """A full duration from one uniform value."""
    return max(0.25, _tri_inv(u, spec["min"] * scale, spec["mode"] * scale, spec["max"] * scale))


def remaining_time(u: float, spec: dict[str, float], elapsed: float, scale: float = 1.0) -> float:
    """Time still to run for work that has been going for `elapsed` minutes (never negative)."""
    a, c, b = spec["min"] * scale, spec["mode"] * scale, spec["max"] * scale
    if elapsed >= b:
        # Past the disclosed maximum: about five more minutes (exponential), at least a little.
        return max(0.5, -5.0 * math.log(max(1e-9, 1.0 - u)))
    f = _tri_cdf(elapsed, a, c, b)
    x = _tri_inv(f + (1.0 - f) * u, a, c, b)
    return max(0.25, x - elapsed)


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile of a non-empty list."""
    v = sorted(values)
    return v[max(0, min(len(v) - 1, math.ceil(p * len(v)) - 1))]


# -- the plain observed input ----------------------------------------------------------------------
def build_input(snapshot: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Plain data for one forecast: the received snapshot's relevant parts and the received history
    the model is allowed to use. Nothing here comes from the engine."""
    t0 = float(snapshot["sim_time_min"])
    res = snapshot["resources"]
    staff = res["staff"]
    on_duty = {n["id"] for n in staff["nurses"] if n["on_duty"]}
    coverage = {sp: n["id"] for n in staff["nurses"] for sp in n["covers"]}
    care_start: dict[str, float] = {}
    ed_beds: set[str] = set()
    walk_ins = amb_announced = 0
    turnarounds: dict[str, list[float]] = {"lab": [], "imaging": []}
    for e in events:
        et, t = e["type"], e["event_time_min"]
        if et == "care_started" and e["patient_id"]:
            care_start.setdefault(e["patient_id"], t)
        elif et == "phase_change" and e["payload"].get("to") == "departed" and e["payload"].get("exit") == "ward":
            bed = (e.get("resources") or {}).get("ward_bed")
            if bed:
                ed_beds.add(bed)
        elif et == "arrival" and e["payload"].get("arrival_mode") == "walk-in" and t > t0 - ARRIVAL_WINDOW_MIN:
            walk_ins += 1
        elif et == "ambulance_announced" and t > t0 - ARRIVAL_WINDOW_MIN:
            amb_announced += 1
        elif et == "test_completed" and t > t0 - TURNAROUND_WINDOW_MIN:
            turnarounds.setdefault(e["payload"]["test"], []).append(float(e["payload"]["elapsed_min"]))
    patients = []
    for p in snapshot["patients"]:
        patients.append(
            {
                "id": p["id"], "urgency": p["urgency"], "critical": bool(p["critical_bypass"]),
                "mode": p["arrival_mode"], "ambulance_id": p["ambulance_id"], "phase": p["phase"],
                "since": p["phase_since_min"], "in_phase": float(p["minutes_in_phase"]),
                "space": p["space_id"], "bed": p["ward_bed_id"], "tests_required": p.get("tests_required"),
                "tests_done": list(p["tests_done"]), "tests_status": p["tests_status"],
                "care_status": p["care_status"], "care_start": care_start.get(p["id"]),
                "decision": bool(p["decision_received"]), "disposition": p["disposition"],
            }
        )
    beds = [
        {"id": b["id"], "type": b["type"], "state": b["state"], "ed": b["id"] in ed_beds}
        for b in res["disposition"]["beds"]["list"]
    ]
    inbound = [
        {"id": a["id"], "eta": a["eta_min"], "unc": a["eta_uncertainty_min"], "count": a["patient_count"],
         "acuity": a["acuity"], "status": a["status"], "overdue": a["minutes_overdue"]}
        for a in snapshot["inbound_ambulances"]
    ]
    om = snapshot["overall_status"]
    local = {
        sid: {
            "state": s["state"], "onset": s["onset_min"], "confirmed": s["confirmed_min"],
            "below": s["recovery_since_min"], "inputs_ok": s["inputs_ok"], "queue": s["queue"],
        }
        for sid, s in snapshot["pressure"]["services"].items()
    }
    return {
        "t0": t0,
        "source": {
            "replay_id": snapshot["replay_id"], "run_number": snapshot["run_number"],
            "version": snapshot["version"], "sim_time_min": t0,
        },
        "assessable": bool(om.get("assessable", True)),
        "reasons": list(om.get("reasons", [])),
        "overall": {"state": om["state"], "onset": om["onset_min"], "confirmed": om["confirmed_min"],
                    "below": om["recovery_since_min"]},
        "local": local,
        "patients": patients,
        "servers": {
            "triage": res["triage_desk"]["total"], "assessment": res["clinician_slots"]["total"],
            "lab": res["diagnostics"]["lab"]["servers"], "imaging": res["diagnostics"]["imaging"]["servers"],
            "discharge": res["disposition"]["discharge"]["servers"],
            "allocation": res["disposition"]["allocation"]["servers"],
            "transport": res["disposition"]["transport"]["servers"],
        },
        "general_ids": sorted(s for s in coverage if s.startswith("S")),
        "resus_ids": sorted(s for s in coverage if s.startswith("R")),
        "coverage": coverage,
        "on_duty": sorted(on_duty),
        "held": list(res["ed_spaces"]["held_space_ids"]),
        "beds": beds,
        "inbound": inbound,
        "history": {"walk_ins": walk_ins, "amb_announced": amb_announced, "turnarounds": turnarounds},
        "feeds": {k: v.get("status") for k, v in snapshot.get("feeds", {}).items()},
        "limited": list(snapshot.get("limited_services", [])),
    }


def _arrival_adjustment(inp: dict[str, Any]) -> dict[str, float]:
    """Recent received arrivals against the disclosed expectation (see FORECAST_ASSUMPTIONS)."""
    a = PROFILE["assumptions"]
    t0 = inp["t0"]
    window = min(t0, ARRIVAL_WINDOW_MIN)
    if window < 5.0:
        return {"walk_in": 1.0, "ambulance": 1.0, "window_min": window}
    var = a["arrival_rate_variation"]
    # Expected walk-ins in the window under the disclosed wave, per minute.
    exp_walk = sum(
        a["walk_in_rate_per_hour_average"] / 60.0 * (1.0 + var * math.sin(2 * math.pi * ((t0 - m) / 60.0 - 4.0) / 24.0))
        for m in range(int(window))
    )
    exp_amb = a["ambulance_runs_per_hour_average"] / 60.0 * window
    out = {"window_min": window}
    for key, n, exp in (("walk_in", inp["history"]["walk_ins"], exp_walk),
                        ("ambulance", inp["history"]["amb_announced"], exp_amb)):
        m = (n + ARRIVAL_PRIOR_WINDOWS * exp) / ((1.0 + ARRIVAL_PRIOR_WINDOWS) * exp) if exp > 0 else 1.0
        out[key] = min(4.0, max(0.5, m))
        out[f"{key}_observed"] = n
        out[f"{key}_expected"] = round(exp, 2)
    return out


def _turnaround_scale(inp: dict[str, Any]) -> dict[str, float]:
    a = PROFILE["assumptions"]
    out = {}
    for kind in ("lab", "imaging"):
        mean0 = _tri_mean(a[f"{kind}_turnaround_minutes"])
        obs = inp["history"]["turnarounds"].get(kind, [])
        n = len(obs)
        m = (sum(obs) + TURNAROUND_PRIOR_N * mean0) / (n + TURNAROUND_PRIOR_N) / mean0
        out[kind] = min(3.0, max(0.5, m))
        out[f"{kind}_observed"] = n
    return out


# -- one future ------------------------------------------------------------------------------------
class _P:
    __slots__ = (
        "id", "rank", "urgency", "critical", "source", "stage", "arrive", "space", "bed", "disp", "u", "hold",
        "tests", "had_tests", "first_assess", "effective", "depart", "rem", "care", "mode", "known",
    )


def _hidden_uniforms(base: int, k: int, pid: str) -> list[float]:
    rng = random.Random(f"fc:{base}:{k}:{pid}")
    return [rng.random() for _ in range(12)]


class Future:
    """One independent future from the received state. `extra` adds capacity: {service: slots}."""

    def __init__(self, inp: dict[str, Any], k: int, base: int, adj: dict[str, float], scale: dict[str, float],
                 extra: dict[str, int] | None = None) -> None:
        self.inp, self.k, self.base = inp, k, base
        self.adj, self.scale = adj, scale
        extra = extra or {}
        self.t0 = inp["t0"]
        self.end = HORIZON_MIN + TAIL_MIN
        env = self.env = simpy.Environment()
        a = PROFILE["assumptions"]
        self.a = a
        sv = inp["servers"]
        self.triage = simpy.PriorityResource(env, capacity=sv["triage"] + extra.get("triage", 0))
        self.clin = simpy.PriorityResource(env, capacity=sv["assessment"] + extra.get("assessment", 0))
        self.lab = simpy.PriorityResource(env, capacity=sv["lab"] + extra.get("lab", 0))
        self.imaging = simpy.PriorityResource(env, capacity=sv["imaging"] + extra.get("imaging", 0))
        self.discharge = simpy.PriorityResource(env, capacity=sv["discharge"] + extra.get("discharge", 0))
        self.allocation = simpy.PriorityResource(env, capacity=sv["allocation"] + extra.get("allocation", 0))
        self.transport = simpy.PriorityResource(env, capacity=sv["transport"] + extra.get("transport", 0))
        on_duty = set(inp["on_duty"])
        cover = dict(inp["coverage"])
        held = set(inp["held"])
        general_ids = list(inp["general_ids"])
        for i in range(extra.get("space", 0)):
            sid = f"X{i + 1}"
            general_ids.append(sid)
            cover[sid] = "XN"
        if extra.get("space", 0):
            on_duty = on_duty | {"XN"}
        self.general = SpacePool(env, general_ids, cover, on_duty)
        self.resus = SpacePool(env, list(inp["resus_ids"]), cover, on_duty)
        self.general.held = {s for s in held if s in set(general_ids)}
        self.resus.held = {s for s in held if s in set(inp["resus_ids"])}
        # Ward and ICU beds: free now, reserved for a transfer in progress, kept by an ED patient, or
        # held by an earlier inpatient who leaves at a sampled time.
        rng = random.Random(f"fc:{base}:{k}:beds")
        beds = []
        for b in sorted(inp["beds"], key=lambda x: x["id"]):
            if b["state"] == "free":
                free_at = 0.0
            elif b["state"] == "occupied" and not b["ed"]:
                free_at = rng.uniform(BED_RELEASE_MIN, BED_RELEASE_MAX)
            else:
                free_at = 1e9
            beds.append({"id": b["id"], "type": b["type"], "free_at_min": free_at})
        self.beds = WardBeds(env, beds, lambda *_: None)
        for b in inp["beds"]:
            if b["state"] == "reserved":
                self.beds.beds[b["id"]]["state"] = "reserved"
            elif b["state"] == "occupied" and b["ed"]:
                self.beds.beds[b["id"]]["state"] = "occupied"
        self.overall = CongestionMonitor()
        self.local = LocalMonitor()
        self._seed_monitors()
        self.patients: list[_P] = []
        self.ticks: list[tuple[float, int, int, dict[str, int], int, int]] = []
        self._known_cum = 0
        self._bg_cum = 0
        self._spawn_present()
        self._spawn_future()
        env.process(self._monitor())

    # -- set-up --------------------------------------------------------------------------------
    def _seed_monitors(self) -> None:
        o = self.inp["overall"]
        m = self.overall
        m.state = o["state"]
        m.onset_min, m.confirmed_min, m.below_since_min = o["onset"], o["confirmed"], o["below"]
        if m.state == "confirmed":
            m.episodes.append({"onset_min": o["onset"], "confirmed_min": o["confirmed"], "cleared_min": None,
                               "initial": True})
        for sid, s in self.inp["local"].items():
            st = self.local.services[sid]
            if not s["inputs_ok"]:
                continue
            st.state, st.onset_min, st.confirmed_min, st.below_since_min = (
                s["state"] if s["state"] in ("normal", "building", "overloaded") else "normal",
                s["onset"], s["confirmed"], s["below"],
            )
            if st.state == "overloaded":
                st.episodes.append({"onset_min": s["onset"], "confirmed_min": s["confirmed"], "cleared_min": None,
                                    "initial": True})

    def _make(self, pid: str, urgency: str, critical: bool, mode: str, source: str, stage: str,
              arrive: float, known: dict[str, Any] | None = None) -> _P:
        p = _P()
        p.id, p.urgency, p.critical, p.mode, p.source = pid, urgency, critical, mode, source
        p.rank = CRITICAL_RANK if critical else URGENCY_RANK[urgency]
        p.stage = S[stage]
        p.hold = stage in _ACTIVE
        p.arrive = arrive
        p.space = p.bed = None
        p.first_assess = p.effective = p.depart = None
        p.u = _hidden_uniforms(self.base, self.k, pid)
        p.known = known
        p.rem = 0.0
        a = self.a
        group = "critical" if critical else urgency
        # Disposition is hidden until the decision is received.
        if known and known.get("disposition"):
            p.disp = known["disposition"]
        else:
            dp = a["disposition_probability"][group]
            p.disp = "icu" if p.u[4] < dp["icu"] else ("ward" if p.u[4] < dp["icu"] + dp["ward"] else "home")
        # Tests: kinds known once ordered, otherwise sampled from the disclosed need probabilities.
        need = a["test_need_probability"][group]
        if known and known.get("tests_required") is not None:
            kinds = [kd for kd in known["tests_required"] if kd not in (known.get("tests_done") or [])]
            p.had_tests = bool(known["tests_required"])
        else:
            kinds = []
            if p.u[0] < need["lab"]:
                kinds.append("lab")
            if p.u[2] < need["imaging"]:
                kinds.append("imaging")
            p.had_tests = bool(kinds)
        p.tests = [(kd, self._test_total(kd, p)) for kd in kinds]
        # Stabilization task: urgent group only (disclosed assumption).
        p.care = None
        return p

    def _test_total(self, kind: str, p: _P) -> float:
        u = p.u[1] if kind == "lab" else p.u[3]
        return total_time(u, self.a[f"{kind}_turnaround_minutes"], self.scale[kind])

    def _spawn_present(self) -> None:
        a = self.a
        recs = self.inp["patients"]
        order = sorted(recs, key=lambda r: (0 if _PHASE_STAGE[r["phase"]] in _ACTIVE else 1, r["since"], r["id"]))
        for r in order:
            stage = _PHASE_STAGE[r["phase"]]
            p = self._make(r["id"], r["urgency"], r["critical"], r["mode"], "present", stage, 0.0, r)
            p.space, p.bed = r["space"], r["bed"]
            e = r["in_phase"]
            p.rem = e
            u = p.u
            # Remaining time of work that is under way, conditional on the elapsed time.
            p.depart = None
            if stage == "triage_active":
                p.rem = remaining_time(u[6], a["triage_dwell_minutes"], e)
            elif stage == "assess_active":
                p.rem = remaining_time(u[7], a["active_assessment_minutes"], e)
            elif stage == "test_active":
                # The test under way is the first remaining one; only the time still to run counts.
                kind = "lab" if r["phase"] == "in_lab" else "imaging"
                left = remaining_time(u[1] if kind == "lab" else u[3], a[f"{kind}_turnaround_minutes"], e,
                                      self.scale[kind])
                p.tests = [(kind, left)] + [(kd, m) for kd, m in p.tests if kd != kind]
                p.had_tests = True
            elif stage == "review_active":
                p.rem = remaining_time(u[8], a["result_review_minutes"], e)
            elif stage == "disch_active":
                p.rem = remaining_time(u[9], a["disposition_processing_minutes"], e)
            elif stage == "alloc_active":
                p.rem = remaining_time(u[10], a["ward_allocation_minutes"], e)
            elif stage == "trans_active":
                p.rem = remaining_time(u[11], a["transport_minutes"], e)
            # Stabilization task: running (conditional on elapsed), not yet started, or finished.
            cs = r["care_status"]
            if r["urgency"] == "urgent" and cs in ("not_started", "in_progress"):
                spec = a["stabilization_task_minutes"]
                if cs == "in_progress":
                    started = r["care_start"]
                    el = (self.t0 - started) if started is not None else e
                    p.care = ("running", remaining_time(u[5], spec, max(0.0, el)))
                else:
                    p.care = ("future", total_time(u[5], spec))
            self.patients.append(p)
            self.env.process(self._flow(p))

    def _spawn_future(self) -> None:
        a = self.a
        t0, k, base = self.t0, self.k, self.base
        horizon = self.end
        adj = self.adj

        def mult(rel: float, key: str) -> float:
            m0 = adj[key]
            return 1.0 + (m0 - 1.0) * 0.5 ** (rel / HALF_LIFE_MIN)

        events: list[tuple[float, str, Any]] = []
        # Announced ambulances: arrival around the received ETA.
        for amb in self.inp["inbound"]:
            rng = random.Random(f"fc:{base}:{k}:amb:{amb['id']}")
            if rng.random() < a["ambulance_cancel_probability"]:
                continue
            unc = float(amb["unc"])
            if amb["status"] == "delayed":
                arr = 0.5 + abs(rng.gauss(0.0, unc))
            else:
                arr = max(0.5, (amb["eta"] - t0) + rng.gauss(0.0, unc))
            if arr <= horizon:
                events.append((arr, "amb", {"id": amb["id"], "count": amb["count"], "acuity": amb["acuity"],
                                            "source": "known"}))
        # Unannounced walk-ins (thinning against the largest rate).
        rng = random.Random(f"fc:{base}:{k}:walkin")
        var = a["arrival_rate_variation"]
        base_rate = a["walk_in_rate_per_hour_average"] / 60.0
        ceiling = base_rate * (1.0 + var) * max(1.0, adj["walk_in"])
        t, n = 0.0, 0
        while True:
            t += rng.expovariate(ceiling)
            if t > horizon:
                break
            wave = 1.0 + var * math.sin(2 * math.pi * ((t0 + t) / 60.0 - 4.0) / 24.0)
            if rng.random() <= base_rate * wave * mult(t, "walk_in") / ceiling:
                n += 1
                events.append((t, "walk", {"id": f"FW{n}"}))
        # Unannounced ambulance runs: announced later at the disclosed rate, arriving 10 to 25 min on.
        rng = random.Random(f"fc:{base}:{k}:runs")
        lead = a["ambulance_announce_lead_minutes"]
        amb_rate = a["ambulance_runs_per_hour_average"] / 60.0
        ceiling = amb_rate * max(1.0, adj["ambulance"])
        t, n = 0.0, 0
        while True:
            t += rng.expovariate(ceiling)
            if t > horizon:
                break
            if rng.random() <= amb_rate * mult(t, "ambulance") / ceiling:
                n += 1
                arr = t + rng.uniform(lead["min"], lead["max"]) + rng.gauss(0.0, a["ambulance_eta_uncertainty_minutes"])
                arr = max(t + 3.0, arr)
                cancelled = rng.random() < a["ambulance_cancel_probability"]
                count = 1 if rng.random() < a["ambulance_patients_per_run"]["1"] else 2
                if not cancelled and arr <= horizon:
                    events.append((arr, "amb", {"id": f"FA{n}", "count": count, "acuity": None,
                                                "source": "background"}))
        for at, kind, d in sorted(events, key=lambda x: (x[0], x[2]["id"])):
            self.env.process(self._arrive(at, kind, d))

    def _arrive(self, at: float, kind: str, d: dict[str, Any]):
        yield self.env.timeout(at)
        a = self.a
        if kind == "walk":
            rng = random.Random(f"fc:{self.base}:{self.k}:{d['id']}:mix")
            mix = a["walk_in_urgency_mix"]
            urgency = self._pick(rng, mix)
            self._new_patient(d["id"], urgency, False, "walk-in", "background")
            self._bg_cum += 1
            return
        for i in range(d["count"]):
            pid = f"{d['id']}-{i + 1}"
            rng = random.Random(f"fc:{self.base}:{self.k}:{pid}:mix")
            if d["acuity"] and i < len(d["acuity"]):
                urgency, critical = d["acuity"][i]["urgency"], bool(d["acuity"][i]["critical_bypass"])
            else:
                urgency = self._pick(rng, a["ambulance_urgency_mix"])
                critical = urgency == "urgent" and rng.random() < a["ambulance_critical_given_urgent"]
            self._new_patient(pid, urgency, critical, "ambulance", d["source"])
            if d["source"] == "known":
                self._known_cum += 1
            else:
                self._bg_cum += 1

    @staticmethod
    def _pick(rng: random.Random, mix: dict[str, float]) -> str:
        draw, cum = rng.random(), 0.0
        for group in ("urgent", "medium", "lower"):
            cum += mix[group]
            if draw < cum:
                return group
        return "lower"

    def _new_patient(self, pid: str, urgency: str, critical: bool, mode: str, source: str) -> None:
        stage = "space_wait" if critical else "triage_wait"
        p = self._make(pid, urgency, critical, mode, source, stage, float(self.env.now))
        if urgency == "urgent":
            p.care = ("future", total_time(p.u[5], self.a["stabilization_task_minutes"]))
        self.patients.append(p)
        self.env.process(self._flow(p))

    # -- patient flow (the engine's route, resumed from a received phase) -----------------------------
    def _care_task(self, minutes: float, done: simpy.Event):
        yield self.env.timeout(minutes)
        done.succeed()

    def _flow(self, p: _P):
        env, a, u = self.env, self.a, p.u
        rank, st = p.rank, p.stage
        pool = self.resus if p.critical else self.general
        care_done = None
        if p.care is not None and p.care[0] == "running":
            care_done = env.event()
            env.process(self._care_task(p.care[1], care_done))

        if not p.critical and st <= S["triage_active"]:
            req = self.triage.request(priority=rank)
            yield req
            yield env.timeout(p.rem if st == S["triage_active"] else total_time(u[6], a["triage_dwell_minutes"]))
            self.triage.release(req)
            st = S["space_wait"]
        if st <= S["space_wait"]:
            p.space = yield pool.request(rank)
        if st <= S["assess_active"]:
            req = self.clin.request(priority=rank)
            yield req
            p.first_assess = env.now
            if st < S["assess_active"] and p.care is not None and p.care[0] == "future":
                care_done = env.event()
                env.process(self._care_task(p.care[1], care_done))
            yield env.timeout(p.rem if st == S["assess_active"] else total_time(u[7], a["active_assessment_minutes"]))
            self.clin.release(req)
        if st <= S["test_active"]:
            for i, (kind, minutes) in enumerate(p.tests):
                res = self.lab if kind == "lab" else self.imaging
                req = res.request(priority=rank)
                yield req
                yield env.timeout(minutes)
                res.release(req)
        if p.had_tests and st <= S["review_active"]:
            req = self.clin.request(priority=rank)
            yield req
            yield env.timeout(p.rem if st == S["review_active"] else total_time(u[8], a["result_review_minutes"]))
            self.clin.release(req)
        if care_done is not None and not care_done.triggered:
            yield care_done
        p.effective = env.now
        if p.disp == "home":
            if st <= S["disch_active"]:
                req = self.discharge.request(priority=rank)
                yield req
                yield env.timeout(
                    p.rem if st == S["disch_active"] else total_time(u[9], a["disposition_processing_minutes"])
                )
                self.discharge.release(req)
        else:
            if st <= S["bed_wait"]:
                p.bed = yield self.beds.request(p.disp, rank)
            if st <= S["alloc_active"]:
                req = self.allocation.request(priority=rank)
                yield req
                yield env.timeout(
                    p.rem if st == S["alloc_active"] else total_time(u[10], a["ward_allocation_minutes"])
                )
                self.allocation.release(req)
            if st <= S["trans_active"]:
                req = self.transport.request(priority=rank)
                yield req
                yield env.timeout(
                    p.rem if st == S["trans_active"] else total_time(u[11], a["transport_minutes"])
                )
                self.transport.release(req)
        pool.release(p.space)
        p.depart = env.now
        if p.disp != "home" and p.bed is not None:
            self.beds.occupy(p.bed)

    # -- per-minute monitors -------------------------------------------------------------------------
    def _readings(self) -> dict[str, dict[str, Any]]:
        gp, rp = self.general, self.resus
        space_blocked = (len(gp.waiting) > 0 and not gp.free_staffed()) or (
            len(rp.waiting) > 0 and not rp.free_staffed()
        )
        waiting_beds = len(self.beds.waiting)

        def unit(res: simpy.PriorityResource) -> tuple[int, bool]:
            return len(res.queue), res.capacity == 0

        raw = {
            "triage": unit(self.triage), "assessment": unit(self.clin),
            "space": (len(gp.waiting) + len(rp.waiting), space_blocked),
            "lab": unit(self.lab), "imaging": unit(self.imaging), "discharge": unit(self.discharge),
            "allocation": unit(self.allocation), "transport": unit(self.transport),
            "ward_beds": (waiting_beds, waiting_beds > 0),
        }
        return {sid: {"queue": q, "capacity_unavailable": b, "inputs_ok": True} for sid, (q, b) in raw.items()}

    def _monitor(self):
        first = math.floor(self.t0 + 1e-9) + 1.0 - self.t0
        yield self.env.timeout(first)
        while True:
            now = self.t0 + self.env.now
            avail = len(self.general.free_staffed())
            awaiting = len(self.general.waiting) + len(self.resus.waiting)
            self.overall.tick(now, avail, awaiting)
            readings = self._readings()
            self.local.tick(now, readings)
            self.ticks.append(
                (now, awaiting, avail, {sid: r["queue"] for sid, r in readings.items()}, self._known_cum, self._bg_cum)
            )
            yield self.env.timeout(1.0)

    def run(self) -> "Future":
        self.env.run(until=self.end + 1e-6)
        return self

    # -- extraction ----------------------------------------------------------------------------------
    def outcome(self) -> dict[str, Any]:
        t0 = self.t0
        lim = t0 + HORIZON_MIN

        def episodes(eps: list[dict[str, Any]]) -> dict[str, Any]:
            new = [e["onset_min"] for e in eps if not e.get("initial") and e["onset_min"] is not None
                   and t0 < e["onset_min"] <= lim]
            first_conf = next((e["confirmed_min"] for e in eps if e["onset_min"] is not None and e["onset_min"] <= t0
                               and not e.get("initial")), None)
            cleared = next((e["cleared_min"] for e in eps if e.get("initial") and e["cleared_min"] is not None), None)
            return {"new": new, "confirmed": first_conf, "cleared": cleared}

        loc = {sid: episodes(self.local.services[sid].episodes) for sid in _SERVICE_IDS}
        return {"overall": episodes(self.overall.episodes), "local": loc, "ticks": self.ticks}


def run_future(inp: dict[str, Any], k: int, base: int = FORECAST_SEED, extra: dict[str, int] | None = None,
               adj: dict[str, float] | None = None, scale: dict[str, float] | None = None) -> dict[str, Any]:
    adj = adj or _arrival_adjustment(inp)
    scale = scale or _turnaround_scale(inp)
    return Future(inp, k, base, adj, scale, extra).run().outcome()


# -- aggregation -----------------------------------------------------------------------------------
def _range(values: list[float]) -> dict[str, Any] | None:
    if not values:
        return None
    return {
        "low_min": round(percentile(values, 0.05), 2), "median_min": round(percentile(values, 0.5), 2),
        "high_min": round(percentile(values, 0.95), 2),
    }


def _first(new: list[float]) -> float | None:
    return min(new) if new else None


def _service_summary(inp: dict[str, Any], outs: list[dict[str, Any]], sid: str) -> dict[str, Any]:
    t0 = inp["t0"]
    n = len(outs)
    s0 = inp["local"][sid]
    state = s0["state"] if s0["inputs_ok"] else "unknown"
    rows = [o["local"][sid] for o in outs]
    out: dict[str, Any] = {"id": sid, "zone": SERVICES[sid]["zone"], "state": state, "samples": n}
    if state == "unknown":
        out.update({"kind": "unknown", "chance": None, "note": "Inputs for this service are missing or stale."})
        return out
    if state == "normal":
        onsets = [_first(r["new"]) for r in rows if r["new"]]
        out.update({"kind": "new_onset", "chance": len(onsets) / n, "events": len(onsets),
                    "no_event_fraction": 1.0 - len(onsets) / n})
        rng = _range(onsets)
        out["onset"] = (
            {**rng, "expected_in_min": round(rng["median_min"] - t0, 1),
             "low_in_min": round(rng["low_min"] - t0, 1), "high_in_min": round(rng["high_min"] - t0, 1)}
            if rng else None
        )
    elif state == "building":
        conf = [r["confirmed"] for r in rows if r["confirmed"] is not None]
        out.update({"kind": "confirmation", "chance": len(conf) / n, "events": len(conf),
                    "no_event_fraction": 1.0 - len(conf) / n,
                    "elapsed_min": None if s0["onset"] is None else round(t0 - s0["onset"], 1)})
        out["onset"] = None
    else:  # overloaded now
        cleared = [r["cleared"] for r in rows if r["cleared"] is not None]
        out.update({"kind": "recovery", "chance": len(cleared) / n, "events": len(cleared),
                    "no_event_fraction": 1.0 - len(cleared) / n})
        rng = _range(cleared)
        out["onset"] = (
            {**rng, "expected_in_min": round(rng["median_min"] - t0, 1)} if rng else None
        )
    return out


def _overall_summary(inp: dict[str, Any], outs: list[dict[str, Any]]) -> dict[str, Any]:
    t0, n = inp["t0"], len(outs)
    o = inp["overall"]
    rows = [x["overall"] for x in outs]
    res: dict[str, Any] = {"state": o["state"], "samples": n}
    if o["state"] == "stable":
        onsets = [_first(r["new"]) for r in rows if r["new"]]
        res.update({"kind": "new_onset", "chance": len(onsets) / n, "events": len(onsets),
                    "no_event_fraction": 1.0 - len(onsets) / n})
        rng = _range(onsets)
        res["onset"] = (
            {**rng, "expected_in_min": round(rng["median_min"] - t0, 1),
             "low_in_min": round(rng["low_min"] - t0, 1), "high_in_min": round(rng["high_min"] - t0, 1)}
            if rng else None
        )
        # An interval that begins and never confirms is not a qualifying onset (reported for context).
    elif o["state"] == "building":
        conf = [r["confirmed"] for r in rows if r["confirmed"] is not None]
        res.update({"kind": "confirmation", "chance": len(conf) / n, "events": len(conf),
                    "no_event_fraction": 1.0 - len(conf) / n, "elapsed_min": round(t0 - (o["onset"] or t0), 1),
                    "onset": None})
    else:
        cleared = [r["cleared"] for r in rows if r["cleared"] is not None]
        res.update({"kind": "recovery", "chance": len(cleared) / n, "events": len(cleared),
                    "no_event_fraction": 1.0 - len(cleared) / n, "since_confirmed_min": None if o["confirmed"] is None
                    else round(t0 - o["confirmed"], 1)})
        rng = _range(cleared)
        res["onset"] = {**rng, "expected_in_min": round(rng["median_min"] - t0, 1)} if rng else None
    return res


def _deadline(inp: dict[str, Any], summary: dict[str, Any], sid: str) -> dict[str, Any]:
    """Latest start of a provisional action: lower onset bound minus review, setup and a margin."""
    action, setup = PROVISIONAL_ACTION[sid]
    t0 = inp["t0"]
    out = {"action": action, "setup_min": setup, "review_min": REVIEW_MIN, "margin_min": MARGIN_MIN,
           "basis": "provisional action assumption (no comparison yet)"}
    if summary.get("kind") == "recovery":
        return {**out, "status": "recovery", "latest_start_min": None}
    onset = summary.get("onset")
    if summary.get("kind") != "new_onset" or not onset:
        return {**out, "status": "unavailable", "latest_start_min": None}
    latest = onset["low_min"] - REVIEW_MIN - setup - MARGIN_MIN
    return {**out, "status": "open" if latest >= t0 else "too_late", "latest_start_min": round(latest, 1),
            "in_min": round(latest - t0, 1)}


def _series(inp: dict[str, Any], outs: list[dict[str, Any]]) -> dict[str, Any]:
    """Quantile bands at about five-minute marks across the futures (queue uncertainty, not onset)."""
    if not outs or not outs[0]["ticks"]:
        return {"marks_min": [], "bands": {}}
    t0 = inp["t0"]
    ticks0 = outs[0]["ticks"]
    idx = [i for i in range(len(ticks0)) if (round(ticks0[i][0] - t0) % 5 == 0)]
    keys = {"awaiting_space": lambda t: t[1], "available_spaces": lambda t: t[2]}
    for sid in _SERVICE_IDS:
        keys[sid] = (lambda s: lambda t: t[3][s])(sid)
    bands: dict[str, list[dict[str, float]]] = {}
    for name, fn in keys.items():
        col = []
        for i in idx:
            vals = [fn(o["ticks"][i]) for o in outs if i < len(o["ticks"])]
            if not vals:
                continue
            col.append({"p10": percentile(vals, 0.10), "p50": percentile(vals, 0.5), "p90": percentile(vals, 0.9)})
        bands[name] = col
    return {"marks_min": [round(ticks0[i][0], 1) for i in idx], "bands": bands}


def summarize(inp: dict[str, Any], outs: list[dict[str, Any]]) -> dict[str, Any]:
    t0 = inp["t0"]
    services = {sid: _service_summary(inp, outs, sid) for sid in _SERVICE_IDS}
    overall = _overall_summary(inp, outs)
    # Zone: the service with the strongest signal speaks for the zone.
    zones = []
    for z in (1, 2, 3, 4):
        sids = [s for s in _SERVICE_IDS if SERVICES[s]["zone"] == z]
        rows = [services[s] for s in sids]

        def rank(r: dict[str, Any]) -> tuple:
            order = {"overloaded": 3, "building": 2, "normal": 1, "unknown": 0}
            chance = r.get("chance") or 0.0
            # An overloaded service's chance is the chance it clears, so the one least likely to clear
            # speaks for the zone; for building and normal services a higher chance is the worse signal.
            return (order.get(r["state"], 0), 1.0 - chance if r["state"] == "overloaded" else chance)

        top = max(rows, key=rank)
        # Zone-level chance of a new local overload in the zone (first onset over its services).
        firsts = []
        for o in outs:
            c = [_first(o["local"][s]["new"]) for s in sids if inp["local"][s]["state"] == "normal"
                 and inp["local"][s]["inputs_ok"] and o["local"][s]["new"]]
            c = [x for x in c if x is not None]
            if c:
                firsts.append(min(c))
        zstate = ("overloaded" if any(r["state"] == "overloaded" for r in rows)
                  else "building" if any(r["state"] == "building" for r in rows)
                  else "unknown" if any(r["state"] == "unknown" for r in rows) else "normal")
        zrng = _range(firsts)
        zones.append(
            {
                "zone": z, "state": zstate, "services": sids, "top_service": top["id"],
                "new_overload_chance": len(firsts) / len(outs) if outs else None,
                "events": len(firsts),
                "onset": (
                    {**zrng, "expected_in_min": round(zrng["median_min"] - t0, 1),
                     "low_in_min": round(zrng["low_min"] - t0, 1), "high_in_min": round(zrng["high_min"] - t0, 1)}
                    if zrng else None
                ),
                # A zone warning is the warning of its services (the rule build_alerts applies), so the
                # zone button, the drawer and the alert list always agree.
                "warning": zstate == "normal" and any(
                    r["state"] == "normal" and (r.get("chance") or 0.0) >= WARNING_THRESHOLD for r in rows),
            }
        )
    return {"overall": overall, "services": services, "zones": zones, "series": _series(inp, outs)}


def build_alerts(inp: dict[str, Any], snapshot: dict[str, Any], summary: dict[str, Any]) -> dict[str, Any]:
    """Alerts for forecast risks, building intervals and confirmed overloads, in the spec's order."""
    t0 = inp["t0"]
    press = snapshot["pressure"]["services"]
    urgent_wait: dict[str, int] = {}
    from .engine import QUEUE_SERVICE  # phase -> queue service (plain mapping)

    for p in snapshot["patients"]:
        sid = QUEUE_SERVICE.get(p["phase"])
        if sid and p["urgency"] == "urgent":
            urgent_wait[sid] = urgent_wait.get(sid, 0) + 1
    actionable, recovery, unknown = [], [], []
    cats: set[str] = set()
    for sid, s in summary["services"].items():
        state = s["state"]
        if state == "unknown":
            unknown.append({"service": sid, "zone": s["zone"], "kind": "unknown",
                            "name": SERVICES[sid]["name"], "text": "Cannot assess: inputs missing or stale."})
            continue
        chance = s.get("chance")
        risky = state == "normal" and chance is not None and chance >= WARNING_THRESHOLD
        if not (risky or state in ("building", "overloaded")):
            continue
        cats.add(SERVICES[sid]["category"])
        q = press[sid]["queue"]
        item = {
            "id": f"{s['kind']}:{sid}", "service": sid, "zone": s["zone"], "name": SERVICES[sid]["name"],
            "category": SERVICES[sid]["category"], "category_label": CATEGORY_LABEL[SERVICES[sid]["category"]],
            "kind": {"new_onset": "forecast_risk", "confirmation": "building", "recovery": "overloaded"}[s["kind"]],
            "state": state, "chance": chance, "onset": s.get("onset"), "events": s.get("events"),
            "samples": s["samples"], "affected_patients": q, "urgent_group_waiting": urgent_wait.get(sid, 0),
            "impact": None, "impact_note": "Not available until an action comparison completes.",
            "deadline": _deadline(inp, s, sid),
        }
        (recovery if state == "overloaded" else actionable).append(item)
    for item in actionable + recovery:
        item["mixed"] = len(cats) > 1
        item["also_active"] = sorted(CATEGORY_LABEL[c] for c in cats if c != item["category"])
    # Earliest intervention deadline first; those without a deadline follow, ordered by affected patients.
    def key(it: dict[str, Any]) -> tuple:
        d = it["deadline"]["latest_start_min"]
        return (0 if d is not None else 1, d if d is not None else 0.0, -(it["affected_patients"] or 0), it["id"])

    actionable.sort(key=key)
    recovery.sort(key=lambda it: (-(it["affected_patients"] or 0), it["id"]))
    return {"actionable": actionable, "recovery": recovery, "unknown": unknown,
            "mixed": len(cats) > 1, "categories": sorted(CATEGORY_LABEL[c] for c in cats)}


def next_step(summary: dict[str, Any], assessable: bool, reasons: list[str],
              alerts: dict[str, Any] | None = None) -> dict[str, str]:
    """The next step from the current state and the forecast (spec: dashboard next-step rules)."""
    o = summary.get("overall")
    if not assessable:
        return {"code": "inspect_inputs", "text": "Cannot assess: inspect the missing or stale inputs first."}
    state = o["state"]
    zones = lambda items: ", ".join(sorted({f"zone {a['zone']}" for a in items}))  # noqa: E731
    local_recovery = (alerts or {}).get("recovery", [])
    local_actionable = (alerts or {}).get("actionable", [])
    if state == "stable":
        if (o.get("chance") or 0) >= WARNING_THRESHOLD:
            return {"code": "compare_preventive",
                    "text": "Congestion risk is at or above the warning level: compare preventive actions."}
        if local_actionable:
            return {"code": "compare_local_preventive",
                    "text": f"Overall ED is stable, but {zones(local_actionable)} shows a local risk: select its alert "
                            "and compare actions with their timing."}
        if local_recovery:
            return {"code": "compare_local_recovery",
                    "text": f"Overall ED is stable; {zones(local_recovery)} is overloaded: select its alert to see "
                            "the cause and recovery."}
        return {"code": "monitor", "text": "Stable and below the warning level: monitor."}
    if state == "building":
        return {"code": "compare_timing", "text": "Congestion is building: compare actions with their timing."}
    return {"code": "compare_recovery", "text": "Congestion is confirmed: compare recovery actions."}


# -- top level -------------------------------------------------------------------------------------
def model_settings(samples: int) -> dict[str, Any]:
    """The settings a forecast is computed with; a saved run records them and Load compares them."""
    return {
        "samples": samples, "model_version": MODEL_VERSION, "horizon_min": HORIZON_MIN, "tail_min": TAIL_MIN,
        "refresh_every_min": REFRESH_MIN, "seed": FORECAST_SEED, "warning_threshold": WARNING_THRESHOLD,
    }


def forecast_from_input(inp: dict[str, Any], snapshot: dict[str, Any], samples: int, base: int,
                        started: float | None = None, keep: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """`keep`, when given, receives the sampled futures so the explanation can reuse them."""
    started = started if started is not None else time.perf_counter()
    adj, scale = _arrival_adjustment(inp), _turnaround_scale(inp)
    model = {
        "version": MODEL_VERSION,
        "settings": {
            "samples": samples, "horizon_min": HORIZON_MIN, "tail_min": TAIL_MIN, "refresh_every_min": REFRESH_MIN,
            "seed": base, "warning_threshold": WARNING_THRESHOLD, "onset_range": "conditional 5th to 95th percentile "
            "of the onset time among futures with an onset",
        },
        "assumptions": FORECAST_ASSUMPTIONS,
    }
    out: dict[str, Any] = {
        "api_version": "v1", "kind": "forecast", "source": inp["source"], "forecast_time_min": inp["t0"],
        "model": model, "synthetic": True,
    }
    if not inp["assessable"]:
        out.update(
            {"status": "cannot_assess", "reasons": inp["reasons"], "overall": None, "zones": [], "services": {},
             "alerts": {"actionable": [], "recovery": [], "unknown": [], "mixed": False, "categories": []},
             "series": {"marks_min": [], "bands": {}}, "limitations": [
                 "Essential data is missing or older than ten simulated minutes: no forecast is shown."],
             "next_step": next_step({}, False, inp["reasons"]),
             "compute": {"ms": round((time.perf_counter() - started) * 1000, 1), "futures": 0}})
        return out
    outs = [run_future(inp, k, base, adj=adj, scale=scale) for k in range(samples)]
    if keep is not None:
        keep.extend(outs)
    summary = summarize(inp, outs)
    alerts = build_alerts(inp, snapshot, summary)
    limits = [
        "Synthetic demonstration: test needs, durations and dispositions that are not yet received are "
        "sampled from the disclosed assumptions, never from the replay's hidden future.",
    ]
    if adj["walk_in"] != 1.0 or adj["ambulance"] != 1.0:
        limits.append(
            f"Arrival rates are adjusted from received arrivals (walk-ins x{adj['walk_in']:.2f}, "
            f"unannounced ambulances x{adj['ambulance']:.2f})."
        )
    if inp["limited"]:
        limits.append("Services with missing inputs are not forecast: " + ", ".join(inp["limited"]) + ".")
    stale = [f for f, s in inp["feeds"].items() if s not in (None, "fresh")]
    if stale:
        limits.append("Feeds not current: " + ", ".join(sorted(stale)) + ". Figures are as last received.")
    ov = summary["overall"]
    if ov.get("kind") == "new_onset" and 0 < ov["events"] < 5:
        limits.append(f"Only {ov['events']} of {samples} futures had an onset; its range rests on few samples.")
    out.update(
        {
            "status": "ok", "reasons": [], "overall": summary["overall"], "zones": summary["zones"],
            "services": summary["services"], "alerts": alerts, "series": summary["series"], "limitations": limits,
            "next_step": next_step(summary, True, [], alerts),
            "inputs": {
                "present_patients": len(inp["patients"]), "announced_ambulances": len(inp["inbound"]),
                "announced_patients": sum(a["count"] for a in inp["inbound"]), "arrival_adjustment": adj,
                "turnaround_scale": scale,
                # Work under way is resumed conditional on its received elapsed time (never restarted).
                "in_progress": [
                    {"id": p["id"], "phase": p["phase"], "elapsed_min": p["in_phase"]}
                    for p in inp["patients"] if _PHASE_STAGE[p["phase"]] in _ACTIVE
                ],
                # Ward and ICU beds as received: free now, reserved for a transfer, kept by an ED patient
                # (never released in the model), or held by an earlier inpatient (release time sampled).
                "ward_beds": {
                    "free": sum(1 for b in inp["beds"] if b["state"] == "free"),
                    "reserved": sum(1 for b in inp["beds"] if b["state"] == "reserved"),
                    "ed_patient": sum(1 for b in inp["beds"] if b["state"] == "occupied" and b["ed"]),
                    "inpatient_release_sampled": sum(1 for b in inp["beds"] if b["state"] == "occupied" and not b["ed"]),
                },
            },
            "compute": {"ms": round((time.perf_counter() - started) * 1000, 1), "futures": samples},
        }
    )
    return out


# -- explanation of one zone's alert -------------------------------------------------------------
_RELAX = {
    "triage": ("triage", "one more triage desk slot"),
    "assessment": ("assessment", "one more doctor work slot"),
    "space": ("space", "one more staffed treatment space"),
    "lab": ("lab", "one more lab slot"),
    "imaging": ("imaging", "one more imaging slot"),
    "discharge": ("discharge", "one more discharge processing slot"),
    "allocation": ("allocation", "one more ward allocation slot"),
    "transport": ("transport", "one more transport team"),
}


def explain_zone(inp: dict[str, Any], snapshot: dict[str, Any], result: dict[str, Any], zone: int,
                 samples: int, base: int = FORECAST_SEED,
                 base_outs: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Why a zone's alert appeared: received facts kept apart from model statements, plus how the
    estimate moves when one constraint is relaxed (same futures, one more unit of the bottleneck).
    `base_outs` are the futures the forecast already sampled; without them they are sampled again
    (the same keyed futures, so the result is identical)."""
    started = time.perf_counter()
    z = next(x for x in result["zones"] if x["zone"] == zone)
    sid = z["top_service"]
    s = result["services"][sid]
    press = snapshot["pressure"]["services"][sid]
    res = snapshot["resources"]
    t0 = inp["t0"]
    spec = SERVICES[sid]
    rates = press["rates"]
    observed: list[dict[str, Any]] = []
    if press["queue"] is not None:
        thr = f" (threshold {press['threshold']})" if press["threshold"] is not None else ""
        observed.append({"label": spec["queue_label"].capitalize(), "value": f"{press['queue']}{thr}"})
    if sid in ("lab", "imaging"):
        d = res["diagnostics"][sid]
        observed.append({"label": f"{spec['name']} units busy", "value": f"{d['busy']} of {d['servers']}"})
    elif sid == "triage":
        d = res["triage_desk"]
        observed.append({"label": "Triage desk busy", "value": f"{d['busy']} of {d['total']}"})
    elif sid == "assessment":
        d = res["clinician_slots"]
        observed.append({"label": "Doctor work slots busy", "value": f"{d['busy']} of {d['total']}"})
    elif sid == "space":
        sp = res["ed_spaces"]
        observed.append({"label": "Available staffed spaces",
                         "value": f"{sp['available_staffed']} of {sp['staffed_total']} staffed"})
        observed.append({"label": "Patients awaiting a space", "value": str(sp["awaiting_space"])})
    elif sid in ("discharge", "allocation", "transport"):
        d = res["disposition"][sid]
        observed.append({"label": f"{spec['name']} busy", "value": f"{d['busy']} of {d['servers']}"})
    elif sid == "ward_beds":
        b = res["disposition"]["beds"]
        observed.append({"label": "Free ward / ICU beds", "value": f"{b['ward']['free']} ward, {b['icu']['free']} ICU"})
    if rates.get("received_per_hour") is not None:
        unit = rates["unit"].replace(" per hour", "/h")
        line = f"{rates['received_per_hour']} {unit} received (last {rates['window_min']:g} min)"
        if rates.get("capacity_per_hour"):
            line += f", staffed capacity {rates['capacity_per_hour']} {unit}"
        observed.append({"label": "Incoming work and capacity", "value": line})
        if rates.get("pressure_signal"):
            observed.append({"label": "Pressure signal",
                             "value": "Incoming work exceeds staffed capacity (a signal, not a countdown)"})
    soon = [a for a in inp["inbound"] if a["eta"] - t0 <= 30.0]
    observed.append({
        "label": "Announced ambulances due within 30 min",
        "value": f"{len(soon)} ({sum(a['count'] for a in soon)} patients)" if soon else "none",
    })
    model: list[str] = []
    n = s["samples"]
    if s["kind"] == "new_onset":
        if s["events"]:
            o = s["onset"]
            model.append(
                f"In {s['events']} of {n} simulated futures this service reaches its overload condition and keeps "
                f"it for 10 minutes within the next {int(HORIZON_MIN)} minutes ({round(s['chance'] * 100)}%)."
            )
            model.append(
                f"Typical start about {o['expected_in_min']:g} simulated minutes from now "
                f"(90% range {o['low_in_min']:g} to {o['high_in_min']:g})."
            )
        else:
            model.append(f"No onset in {n} sampled futures: no countdown is shown.")
    elif s["kind"] == "confirmation":
        ran = f"{s['elapsed_min']:g} minutes" if s["elapsed_min"] is not None else "an unknown time"
        model.append(
            f"This interval has run {ran}; in {s['events']} of {n} futures it reaches "
            f"confirmation ({round(s['chance'] * 100)}%)."
        )
    elif s["kind"] == "recovery":
        model.append(
            f"Overloaded now; it clears within {int(HORIZON_MIN)} minutes in {s['events']} of {n} futures "
            f"({round(s['chance'] * 100)}%)."
        )
    else:
        model.append("This service cannot be assessed: its inputs are missing or stale.")
    # Where demand comes from in the futures that reach an onset: announced versus unannounced.
    sensitivity = None
    breakdown = None
    if s["kind"] in ("new_onset", "confirmation") and s.get("events"):
        adj, scale = _arrival_adjustment(inp), _turnaround_scale(inp)
        if base_outs is None:
            base_outs = [run_future(inp, k, base, adj=adj, scale=scale) for k in range(samples)]
        known, bg = [], []
        for o in base_outs:
            first = _first(o["local"][sid]["new"]) if s["kind"] == "new_onset" else o["local"][sid]["confirmed"]
            if first is None:
                continue
            tick = next((t for t in o["ticks"] if t[0] >= first - 1e-9), None)
            if tick:
                known.append(tick[4])
                bg.append(tick[5])
        if known:
            breakdown = {"known_median": percentile(known, 0.5), "background_median": percentile(bg, 0.5)}
            model.append(
                f"By the typical start the futures include about {breakdown['known_median']:g} patients from "
                f"announced ambulances and {breakdown['background_median']:g} from unannounced demand."
            )
        if sid in _RELAX:
            key, label = _RELAX[sid]
            relaxed = [run_future(inp, k, base, extra={key: 1}, adj=adj, scale=scale) for k in range(samples)]
            r = _service_summary(inp, relaxed, sid)
            sensitivity = {
                "relaxed": label, "chance_before": s["chance"], "chance_after": r["chance"],
                "events_before": s["events"], "events_after": r["events"], "samples": n,
                "note": "Model sensitivity on the same futures. It is not an action and not a recommendation.",
            }
            model.append(
                f"With {label} the same futures give {round(r['chance'] * 100)}% instead of "
                f"{round(s['chance'] * 100)}% (model sensitivity, not an action)."
            )
        else:
            sensitivity = {"relaxed": None, "note": "Ward and ICU beds cannot be created by this model."}
    return {
        "api_version": "v1", "kind": "forecast_explanation", "source": inp["source"], "forecast_time_min": t0,
        "zone": zone, "service": sid, "service_name": spec["name"], "state": s["state"],
        "category": spec["category"], "category_label": CATEGORY_LABEL[spec["category"]],
        "why_this_alert": {"observed": observed, "model": model, "sensitivity": sensitivity,
                           "demand_breakdown": breakdown},
        "technical": {
            "rates": rates, "samples": n, "model_version": MODEL_VERSION, "seed": base,
            "horizon_min": HORIZON_MIN, "tail_min": TAIL_MIN,
            "arrival_adjustment": _arrival_adjustment(inp), "turnaround_scale": _turnaround_scale(inp),
        },
        "compute": {"ms": round((time.perf_counter() - started) * 1000, 1)},
    }
