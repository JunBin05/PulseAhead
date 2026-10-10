"""FastAPI application. One public boundary for the UI and for Playwright MCP checks."""

from __future__ import annotations

from pathlib import Path

from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import saved
from .fixtures import FIXTURES
from .profile import (
    CATALOG_VERSION, ENGINE_VERSION, PROFILE, PROFILE_ID, SCENARIOS, SCORED_MIN, WARMUP_MIN, scenario_catalog,
)
from . import demo_case
from . import evaluation
from . import forecast as fcast
from .replay import API_VERSION, MAX_ADVANCE_MIN, ActionError, ReplayStore, SavedRunMismatch

app = FastAPI(title="PulseAhead synthetic ED twin", version=API_VERSION)
store = ReplayStore()

DEFAULT_SEED = 20261010


class CreateReplay(BaseModel):
    profile_id: str = PROFILE_ID
    scenario: str = "normal"
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)


class Advance(BaseModel):
    minutes: float = Field(gt=0, le=MAX_ADVANCE_MIN)
    # When given, the command applies only if the replay is still at this version (409 otherwise),
    # so a late command from an older view can never move a newer run.
    expected_version: int | None = Field(default=None, ge=1)


class Reset(BaseModel):
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)
    scenario: str | None = None


class SaveUi(BaseModel):
    selected_zone: int | None = Field(default=None, ge=1, le=4)
    camera: Literal["overview", "zone-1", "zone-2", "zone-3", "zone-4"] = "overview"
    view_mode: Literal["3d"] = "3d"


class SaveSettings(BaseModel):
    speed: Literal[1, 2, 5, 10] = 2
    step_min: Literal[5] = 5


class SaveForecastSettings(BaseModel):
    samples: Literal[50, 100] = 50


class SaveBody(BaseModel):
    ui: SaveUi = SaveUi()
    settings: SaveSettings = SaveSettings()
    forecast: SaveForecastSettings = SaveForecastSettings()


class ForecastBody(BaseModel):
    samples: Literal[50, 100] = 50
    expected_version: int | None = None
    zone: int | None = Field(default=None, ge=1, le=4)


def _session(replay_id: str):
    s = store.get(replay_id)
    if s is None:
        raise HTTPException(status_code=404, detail="unknown replay id")
    return s


def _check_scenario(scenario: str) -> None:
    if scenario not in SCENARIOS and scenario not in FIXTURES:
        raise HTTPException(status_code=422, detail=f"unknown scenario {scenario!r}")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "api_version": API_VERSION, "synthetic": True}


@app.get("/api/v1/profile")
def profile() -> dict:
    # Staff-facing scenarios only; test fixtures are listed separately. The bed release schedule is
    # hidden replay future: it appears only in a run's export record, never in this live description.
    public = {
        **PROFILE,
        "ward_beds": [{k: v for k, v in b.items() if k != "free_at_min"} for b in PROFILE["ward_beds"]],
    }
    return {"profile": public, "scenarios": [{k: s[k] for k in ("id", "name", "family", "description")} for s in scenario_catalog()]}


@app.get("/api/v1/scenarios")
def scenarios() -> dict:
    """The seven scenario families with their warm-up and scored duration, seed partitions and versions.
    Time windows of a workload variant are the replay's hidden future and appear only in a run record."""
    return {
        "api_version": API_VERSION,
        "catalog_version": CATALOG_VERSION,
        "synthetic": True,
        "warmup_min": WARMUP_MIN,
        "scored_min": SCORED_MIN,
        "versions": {"api": API_VERSION, "engine": ENGINE_VERSION, "profile": PROFILE_ID, "scenario_catalog": CATALOG_VERSION},
        "scenarios": scenario_catalog(),
    }


@app.get("/api/v1/fixtures")
def fixtures() -> dict:
    """Test-only: controlled scenarios for Playwright MCP checks. Not shown in the staff UI."""
    return {"fixtures": [{"id": f["id"], "name": f["name"]} for f in FIXTURES.values()]}


@app.post("/api/v1/replays")
def create_replay(body: CreateReplay) -> dict:
    if body.profile_id != PROFILE_ID:
        raise HTTPException(status_code=422, detail="unknown profile")
    _check_scenario(body.scenario)
    seed = body.seed if body.seed is not None else DEFAULT_SEED
    return store.create(seed, body.scenario).snapshot()


@app.get("/api/v1/replays/{replay_id}/state")
def read_state(replay_id: str) -> dict:
    s = _session(replay_id)
    with s.lock:
        return s.snapshot()


@app.get("/api/v1/replays/{replay_id}/zones/{zone_id}")
def read_zone(replay_id: str, zone_id: int) -> dict:
    """One zone's roster, assigned staff, queues and capacity at the replay's current version."""
    s = _session(replay_id)
    with s.lock:
        detail = s.zone_detail(zone_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="unknown zone")
    return detail


@app.post("/api/v1/replays/{replay_id}/advance")
def advance(replay_id: str, body: Advance) -> dict:
    result = _session(replay_id).advance(body.minutes, body.expected_version)
    if result is None:
        raise HTTPException(status_code=409, detail="replay version changed; reload the state")
    return result


@app.post("/api/v1/replays/{replay_id}/reset")
def reset(replay_id: str, body: Reset | None = None) -> dict:
    s = _session(replay_id)
    body = body or Reset()
    if body.scenario is not None:
        _check_scenario(body.scenario)
    return s.reset(body.seed, body.scenario)


@app.post("/api/v1/replays/{replay_id}/save")
def save_run(replay_id: str, body: SaveBody | None = None) -> dict:
    body = body or SaveBody()
    record = _session(replay_id).save(body.ui.model_dump(), body.settings.model_dump(), body.forecast.samples)
    return saved.summary(record)


@app.get("/api/v1/saved")
def saved_runs() -> dict:
    return {"api_version": API_VERSION, "saved": saved.list_summaries()}


@app.get("/api/v1/saved/{saved_id}")
def saved_run(saved_id: str) -> dict:
    record = saved.get(saved_id)
    if record is None:
        raise HTTPException(status_code=404, detail="unknown saved run")
    return record


@app.post("/api/v1/saved/{saved_id}/load")
def load_saved(saved_id: str) -> dict:
    record = saved.get(saved_id)
    if record is None:
        raise HTTPException(status_code=404, detail="unknown saved run")
    try:
        session = store.load(record)
    except SavedRunMismatch as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return session.snapshot()


@app.post("/api/v1/replays/{replay_id}/forecast")
def forecast(replay_id: str, body: ForecastBody | None = None) -> dict:
    """Independent futures from the received state and history only (see forecast.py)."""
    body = body or ForecastBody()
    result, cached = _session(replay_id).forecast(body.samples, body.expected_version)
    if result is None:
        raise HTTPException(status_code=409, detail="state version changed; request a fresh forecast")
    return {**result, "cached": cached}


@app.post("/api/v1/replays/{replay_id}/forecast/explain")
def forecast_explain(replay_id: str, body: ForecastBody) -> dict:
    """Why one zone's alert appeared: received facts, model statements and a relaxed-constraint comparison."""
    if body.zone is None or body.expected_version is None:
        raise HTTPException(status_code=422, detail="zone and expected_version (the forecast's state version) are required")
    out = _session(replay_id).forecast_explain(body.zone, body.samples, body.expected_version)
    if out is None:
        raise HTTPException(status_code=409, detail="no forecast is held for that state version; request a fresh one")
    return out


class CompareBody(BaseModel):
    samples: Literal[50, 100] = 50
    expected_version: int | None = Field(default=None, ge=1)


class RequestBody(BaseModel):
    preset: str
    target: str | None = None
    role: str | None = None
    expected_version: int | None = Field(default=None, ge=1)


class DecisionBody(BaseModel):
    role: str
    decision: Literal["approve", "reject", "defer"]
    # The decision's identity: a repeat of the same (role, decision_id) returns the stored outcome.
    decision_id: str = Field(min_length=1, max_length=64)
    expected_version: int | None = Field(default=None, ge=1)


@app.post("/api/v1/replays/{replay_id}/compare")
def compare_actions(replay_id: str, body: CompareBody | None = None) -> dict:
    """No action against each feasible action preset on the same keyed futures (see forecast.py)."""
    body = body or CompareBody()
    result, cached = _session(replay_id).compare(body.samples, body.expected_version)
    if result is None:
        raise HTTPException(status_code=409, detail="state version changed; request a fresh comparison")
    return {**result, "cached": cached}


@app.get("/api/v1/replays/{replay_id}/actions")
def read_actions(replay_id: str) -> dict:
    s = _session(replay_id)
    with s.lock:
        snap = s.snapshot()
    return {"api_version": API_VERSION, "source": {"replay_id": snap["replay_id"], "run_number": snap["run_number"],
                                                    "version": snap["version"], "sim_time_min": snap["sim_time_min"]},
            **snap["actions"]}


@app.post("/api/v1/replays/{replay_id}/requests")
def create_action_request(replay_id: str, body: RequestBody) -> dict:
    try:
        return _session(replay_id).create_request(body.preset, body.target, body.expected_version, body.role)
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from exc


@app.post("/api/v1/replays/{replay_id}/requests/{request_id}/decision")
def decide_action_request(replay_id: str, request_id: str, body: DecisionBody) -> dict:
    try:
        return _session(replay_id).decide(request_id, body.role, body.decision, body.decision_id, body.expected_version)
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from exc


class EvaluationBody(BaseModel):
    # Default: the frozen-settings held-out run on the second test seed of every family. A development or
    # tuning partition is for checking the machinery and is labelled as not held-out evidence.
    partition: Literal["development", "tuning", "demo", "test"] = "test"
    seed_index: int | None = Field(default=None, ge=0, le=3)


@app.post("/api/v1/evaluations")
def start_evaluation(body: EvaluationBody | None = None) -> dict:
    """One small evaluation, run in the background (see evaluation.py). Progress via GET."""
    body = body or EvaluationBody()
    idx = body.seed_index if body.seed_index is not None else (evaluation.TEST_SEED_INDEX if body.partition == "test" else 0)
    n_seeds = min(len(v["seed_partitions"][body.partition]) for v in SCENARIOS.values())
    if idx >= n_seeds:
        raise HTTPException(status_code=422, detail=f"{body.partition} has {n_seeds} seed(s) per family")
    if body.partition == "test" and idx != evaluation.TEST_SEED_INDEX:
        # Test seed [0] was seen before tuning; the other test seeds are kept unspent. Only the one frozen run is allowed.
        raise HTTPException(
            status_code=422,
            detail=f"held-out evaluation is limited to test seed index {evaluation.TEST_SEED_INDEX}; "
                   "index 0 was already seen and the rest are kept in reserve",
        )
    try:
        job = evaluation.start(None, body.partition, idx)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return job.progress()


@app.get("/api/v1/evaluations/latest")
def latest_evaluation() -> dict:
    """The newest finished evaluation saved to disk, exactly as measured (declared before the id route)."""
    rec = evaluation.latest_saved()
    if rec is None:
        raise HTTPException(status_code=404, detail="no saved evaluation: run one from the evaluation panel")
    return rec  # served exactly as measured and saved; nothing is filled in


@app.get("/api/v1/demo/case")
def demo_case_info() -> dict:
    """The scanned demo case (development/tuning seed) with its retrospective no-action baseline."""
    return demo_case.case()


class DriversBody(BaseModel):
    expected_version: int = Field(ge=1)
    samples: Literal[50, 100] = 50


@app.post("/api/v1/replays/{replay_id}/demo/drivers")
def demo_drivers(replay_id: str, body: DriversBody) -> dict:
    """Which received pressures support the alert, at one state version (disclosed rules)."""
    s = _session(replay_id)
    result, _ = s.forecast(body.samples, body.expected_version)
    if result is None:
        raise HTTPException(status_code=409, detail="state version changed; request fresh drivers")
    with s.lock:
        if s.version != body.expected_version:
            raise HTTPException(status_code=409, detail="state version changed; request fresh drivers")
        snap = s.snapshot()
    return {"api_version": API_VERSION, "kind": "demo_drivers", "source": result["source"],
            **demo_case.drivers(snap, result)}


@app.get("/api/v1/evaluations/{eval_id}")
def read_evaluation(eval_id: str) -> dict:
    job = evaluation.get(eval_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown evaluation id")
    return job.progress()


@app.post("/api/v1/evaluations/{eval_id}/cancel")
def cancel_evaluation(eval_id: str) -> dict:
    job = evaluation.get(eval_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown evaluation id")
    job.cancel.set()
    return {"api_version": "v1", "id": job.id, "cancel_requested": True, "status": job.status}


@app.get("/api/v1/evaluations/{eval_id}/export")
def export_evaluation(eval_id: str) -> dict:
    job = evaluation.get(eval_id)
    if job is None:
        raise HTTPException(status_code=404, detail="unknown evaluation id")
    return {**job.progress(), "format": "pulseahead-evaluation", "format_version": 1}


@app.get("/api/v1/replays/{replay_id}/ingest")
def ingest(replay_id: str) -> dict:
    """What the feeds delivered that was refused, ignored or flagged, each with its reason."""
    return _session(replay_id).ingest()


@app.get("/api/v1/replays/{replay_id}/events")
def events(replay_id: str, since: int = Query(default=0, ge=0)) -> dict:
    return _session(replay_id).events(since)


@app.get("/api/v1/replays/{replay_id}/export")
def export(replay_id: str) -> dict:
    return _session(replay_id).export()


# -- built frontend, same origin -------------------------------------------------------------
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        # Unknown API routes stay JSON 404s; only UI routes fall back to the app shell.
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (_DIST / path).resolve()
        if path and candidate.is_file() and _DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
