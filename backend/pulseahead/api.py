"""FastAPI application. One public boundary for the UI and for Playwright MCP checks."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .fixtures import FIXTURES
from .profile import PROFILE, PROFILE_ID, SCENARIOS
from .replay import API_VERSION, MAX_ADVANCE_MIN, ReplayStore

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
    return {"profile": public, "scenarios": list(SCENARIOS.values())}


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
