"""LLM analyst and planner: proposes causes and actions; the simulator prices them.

The model reads an evidence index built only from the received snapshot, forecast and comparison, and
answers with cited causes and proposed actions. It never produces a number or a rank label:

* causes must cite keys that exist in the evidence index; uncited claims become "unknown";
* a proposal that names a declared reserve can be priced by the existing paired comparison;
* anything else (combinations, ideas outside the model) is an untested idea: no number, no rank,
  no approval path, and no clinical-decision wording.

Plain data in, plain data out. Nothing here touches the engine or the hidden replay future.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"
TIMEOUT_S = 12.0
MAX_CAUSES = 4
MAX_PROPOSALS = 3
MAX_IDEAS = 3
MAX_PATIENTS_IN_EVIDENCE = 20
RECORDED_FILE = Path(__file__).with_name("demo_analysis.json")

DISCLAIMER = (
    "AI-generated analysis of a synthetic demo. Causes are hypotheses tied to cited evidence; only simulated "
    "proposals carry numbers; untested ideas are not simulated and cannot be approved."
)

# Operational advice only. A match drops the item: a clinical decision is never the model's to make.
CLINICAL_WORDING = re.compile(
    r"\b(diagnos\w*|prescrib\w*|medicat\w*|dos(e|age)\b|intubat\w*|"
    r"(perform|schedule|order)\w*\s+(an?\s+)?(surgery|operation|procedure)|"
    r"(admit|discharge|transfer|clear|upgrade|downgrade|re-?triage|reclassify)\s+(patient|pt)\s+[A-Za-z]*\d+|"
    r"change\s+(the\s+)?(acuity|esi|urgency)|override\s+clinical|skip\s+(the\s+)?(test|assessment))",
    re.IGNORECASE,
)
# An untested idea has no simulation behind it, so it cannot state an effect size.
EFFECT_NUMBER = re.compile(r"\d+(\.\d+)?\s*(%|percent|min\b|mins\b|minutes|hours?|patient-min)", re.IGNORECASE)

SYSTEM_PROMPT = """You are the operations analyst for a synthetic emergency department demo.
You advise the ED shift coordinator. You never make clinical decisions: no diagnosis, treatment,
medication, individual patient clearance or acuity change.

You receive JSON with:
- "evidence": a flat object of citable facts, key -> value. These are the ONLY facts you may rely on.
- "reserves": declared reserve units that staff could approve (id, service, owner, feasible, reasons).
- "baseline": the simulator's own comparison of the declared reserves (ranking labels only).

Return ONE JSON object, no prose, exactly:
{
 "causes": [{"statement": str, "confidence": "supported"|"possible"|"unknown", "cited": [evidence keys]}],
 "proposals": [{"title": str, "rationale": str, "kind": "reserve"|"idea",
                "reserve": reserve id or null, "cited": [evidence keys]}]
}

Rules:
- Cite evidence keys exactly as given. If the evidence does not establish a cause, say so with
  confidence "unknown" and cite nothing. Missing or stale feeds are uncertainty, never "low risk".
- Several causes may interact; say how in the statement.
- kind "reserve": propose using exactly one declared reserve id that is feasible now.
- kind "idea": any other operational suggestion, including combinations of reserves or process changes the
  model has no resource for. Do NOT state effect sizes, minutes saved, percentages or probabilities.
- Never state a forecast, saving or ranking yourself; the simulator computes those.
- At most 4 causes and 6 proposals. Be concise and operational."""


# -- environment ----------------------------------------------------------------------------------
def _load_dotenv() -> None:
    """Reads `backend/.env` (git-ignored) once for GROQ_* keys; real environment values win."""
    path = Path(__file__).resolve().parents[1] / ".env"
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except OSError:
        pass


_load_dotenv()


def model_name() -> str:
    return os.environ.get("GROQ_MODEL") or DEFAULT_MODEL


def configured() -> bool:
    return bool(os.environ.get("GROQ_API_KEY") or os.environ.get("PULSEAHEAD_ANALYST_STUB"))


# -- evidence index -------------------------------------------------------------------------------
def _flat(prefix: str, obj: Any, out: dict[str, Any], depth: int = 3) -> None:
    """Scalars of a nested dict as dotted keys. Lists and long strings are not citable facts."""
    if isinstance(obj, dict):
        if depth < 0:
            return
        for k, v in obj.items():
            _flat(f"{prefix}.{k}", v, out, depth - 1)
    elif isinstance(obj, bool) or obj is None or isinstance(obj, (int, float)):
        out[prefix] = obj
    elif isinstance(obj, str) and len(obj) <= 80:
        out[prefix] = obj


WAIT_PHASES = (
    "awaiting_triage", "awaiting_space", "awaiting_clinician", "awaiting_lab", "awaiting_imaging",
    "awaiting_result_review", "awaiting_care_completion", "awaiting_discharge", "awaiting_ward_bed",
    "awaiting_ward_allocation", "awaiting_transport",
)


def build_evidence(snapshot: dict[str, Any], forecast: dict[str, Any] | None,
                   comparison: dict[str, Any] | None) -> dict[str, Any]:
    """The citable facts: received state, the forecast and the simulator's comparison. Flat key -> scalar."""
    ev: dict[str, Any] = {}
    ev["time.sim_min"] = snapshot["sim_time_min"]
    om = snapshot["overall_status"]
    for k in ("state", "label", "recovering", "onset_min", "confirmed_min", "assessable"):
        if k in om:
            ev[f"overall.{k}"] = om[k]
    for i, r in enumerate(om.get("reasons") or []):
        ev[f"overall.reason.{i}"] = str(r)[:80]
    _flat("ed_spaces", snapshot["resources"].get("ed_spaces", {}), ev, 1)
    _flat("resus_spaces", snapshot["resources"].get("resus_spaces", {}), ev, 1)
    for sid, s in snapshot["pressure"]["services"].items():
        for k in ("state", "queue", "queue_label", "threshold", "inputs_ok", "capacity_unavailable"):
            if k in s:
                ev[f"service.{sid}.{k}"] = s[k]
        _flat(f"service.{sid}.rates", s.get("rates", {}), ev, 1)
    for z in snapshot.get("zones", []):
        for k, v in z.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool) and k != "id":
                ev[f"zone.{z['id']}.{k}"] = v
    waiting = [p for p in snapshot["patients"] if p["phase"] in WAIT_PHASES]
    waiting.sort(key=lambda p: -float(p.get("minutes_in_phase") or 0.0))
    for p in waiting[:MAX_PATIENTS_IN_EVIDENCE]:
        pid = p["id"]
        ev[f"patient.{pid}.phase"] = p["phase"]
        ev[f"patient.{pid}.urgency"] = p["urgency"]
        ev[f"patient.{pid}.minutes_in_phase"] = p["minutes_in_phase"]
        ev[f"patient.{pid}.decision_received"] = bool(p["decision_received"])
    disp = snapshot["resources"].get("disposition", {})
    beds = disp.get("beds", {})
    for k in ("ward", "icu"):
        if isinstance(beds.get(k), dict):
            _flat(f"beds.{k}", beds[k], ev, 1)
    if disp.get("boarding") is not None:
        ev["disposition.boarding"] = disp["boarding"]
    for name, feed in (snapshot.get("feeds") or {}).items():
        if isinstance(feed, dict) and "status" in feed:
            ev[f"feed.{name}.status"] = feed["status"]
    if forecast and forecast.get("status") == "ok":
        ev["forecast.status"] = "ok"
        _flat("forecast.overall", forecast.get("overall", {}), ev, 2)
        for sid, s in (forecast.get("services") or {}).items():
            _flat(f"forecast.{sid}", s, ev, 2)
    elif forecast:
        ev["forecast.status"] = forecast.get("status", "unavailable")
    for c in (snapshot.get("actions") or {}).get("catalog", []):
        rid = c["reserve"]["id"]
        ev[f"reserve.{rid}.feasible"] = bool(c["feasible"])
        ev[f"reserve.{rid}.service"] = c["service"]
    if comparison:
        ev["comparison.status"] = comparison.get("status", "unavailable")
        for row in comparison.get("actions", []):
            rid = row["id"]
            ev[f"comparison.{rid}.feasible"] = bool(row.get("feasible"))
            rk = row.get("rank") or {}
            if rk.get("label"):
                ev[f"comparison.{rid}.rank"] = rk["label"]
    return ev


def build_context(evidence: dict[str, Any], catalog: list[dict[str, Any]],
                  comparison: dict[str, Any] | None) -> dict[str, Any]:
    reserves = []
    for c in catalog:
        reserves.append({
            "reserve": c["reserve"]["id"], "name": c["reserve"]["name"], "unit": c["reserve"]["unit"],
            "service": c["service"], "owner": " and ".join(c["owners"]), "catalog_id": c["id"],
            "feasible": bool(c["feasible"]), "reasons": c["reasons"][:2], "effect": c["effect"],
        })
    baseline = []
    for row in (comparison or {}).get("actions", []):
        baseline.append({"catalog_id": row["id"], "label": (row.get("rank") or {}).get("label")})
    return {"evidence": evidence, "reserves": reserves, "baseline": baseline}


# -- model call -----------------------------------------------------------------------------------
class AnalystUnavailable(Exception):
    pass


def _post(body: dict[str, Any], key: str) -> dict[str, Any]:
    req = urllib.request.Request(
        GROQ_URL, data=json.dumps(body).encode("utf-8"), method="POST",
        headers={"content-type": "application/json", "authorization": f"Bearer {key}",
                 "user-agent": "pulseahead-analyst/1"},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:  # noqa: S310 - fixed https endpoint
        return json.loads(r.read().decode("utf-8"))


def _parse_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            raise
        return json.loads(m.group(0))


def call_model(context: dict[str, Any]) -> dict[str, Any]:
    """Raw model output as a dict. Raises AnalystUnavailable on a missing key, a network error, a
    timeout or output that is not a JSON object. `PULSEAHEAD_ANALYST_STUB` (a file path) replaces the
    network call for boundary tests of the validator."""
    stub = os.environ.get("PULSEAHEAD_ANALYST_STUB")
    if stub:
        try:
            return json.loads(Path(stub).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise AnalystUnavailable(f"stub output unreadable: {exc}") from exc
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise AnalystUnavailable("GROQ_API_KEY is not set.")
    model = model_name()
    body: dict[str, Any] = {
        "model": model, "temperature": 0, "max_completion_tokens": 1800,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(context, separators=(",", ":"))},
        ],
    }
    if model.startswith("openai/gpt-oss"):
        body["reasoning_effort"] = "low"
    last: Exception | None = None
    for _attempt in range(2):
        try:
            resp = _post(body, key)
            text = resp["choices"][0]["message"]["content"] or ""
            out = _parse_json(text)
            if not isinstance(out, dict):
                raise ValueError("output is not a JSON object")
            return out
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code in (400, 404, 401, 403):  # a retry cannot fix these
                break
            if exc.code == 429:  # rate limited: wait the advertised time (capped) before the one retry
                try:
                    wait = float(exc.headers.get("retry-after", "3"))
                except (TypeError, ValueError):
                    wait = 3.0
                time.sleep(min(max(wait, 1.0), 8.0))
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, OSError) as exc:
            last = exc
    raise AnalystUnavailable(f"Groq request failed: {type(last).__name__}: {last}")


# -- validation -----------------------------------------------------------------------------------
def _resolve(cites: Any, evidence: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Splits cited keys into (valid, dropped). A key is valid when it is an evidence key or the
    dotted prefix of one (for example `service.transport`)."""
    valid: list[str] = []
    dropped: list[str] = []
    if not isinstance(cites, list):
        return valid, dropped
    keys = list(evidence)
    for c in cites[:12]:
        if not isinstance(c, str):
            continue
        c = c.strip()
        if c in evidence or any(k.startswith(c + ".") for k in keys):
            if c not in valid:
                valid.append(c)
        else:
            dropped.append(c[:60])
    return valid, dropped


def _text(v: Any, limit: int = 300) -> str:
    return " ".join(str(v or "").split())[:limit]


def validate(raw: dict[str, Any], evidence: dict[str, Any], catalog: list[dict[str, Any]]) -> dict[str, Any]:
    """The model's output as the app may show it. Never raises; unusable items are reported in
    `rejected` with the reason, never silently shown."""
    by_reserve = {c["reserve"]["id"]: c for c in catalog}
    rejected: list[dict[str, str]] = []
    causes: list[dict[str, Any]] = []
    for c in (raw.get("causes") or [])[:MAX_CAUSES * 2]:
        if not isinstance(c, dict):
            continue
        stmt = _text(c.get("statement"))
        if not stmt:
            continue
        if CLINICAL_WORDING.search(stmt):
            rejected.append({"item": stmt[:80], "reason": "Clinical-decision wording is not shown."})
            continue
        valid, dropped = _resolve(c.get("cited"), evidence)
        conf = c.get("confidence") if c.get("confidence") in ("supported", "possible", "unknown") else "unknown"
        note = None
        if conf != "unknown" and not valid:
            conf, note = "unknown", "No valid evidence was cited, so this is shown as unknown."
        elif dropped:
            note = f"{len(dropped)} cited key(s) are not in the evidence and were removed."
        causes.append({"statement": stmt, "confidence": conf, "cited": valid,
                       "dropped_citations": dropped, "note": note})
        if len(causes) >= MAX_CAUSES:
            break

    structured: list[dict[str, Any]] = []
    ideas: list[dict[str, Any]] = []
    seen_reserve: set[str] = set()
    for p in (raw.get("proposals") or [])[:MAX_PROPOSALS + MAX_IDEAS + 4]:
        if not isinstance(p, dict):
            continue
        title, why = _text(p.get("title"), 120), _text(p.get("rationale"))
        if not title:
            continue
        if CLINICAL_WORDING.search(title) or CLINICAL_WORDING.search(why):
            rejected.append({"item": title[:80], "reason": "Clinical-decision wording is not shown."})
            continue
        valid, dropped = _resolve(p.get("cited"), evidence)
        reserve = p.get("reserve") if isinstance(p.get("reserve"), str) else None
        row = by_reserve.get(reserve) if reserve else None
        demote: str | None = None
        if p.get("kind") == "reserve" or reserve:
            if row is None:
                demote = "It names a reserve that is not declared in this hospital profile."
            elif not row["feasible"]:
                demote = "Not feasible now: " + " ".join(row["reasons"])
            elif reserve in seen_reserve:
                continue
            elif len(structured) >= MAX_PROPOSALS:
                demote = "Only the first three simulated proposals are priced."
            elif not valid:
                demote = "No valid evidence was cited for this proposal."
        else:
            demote = "No declared reserve to simulate this with."
        if demote is None and row is not None:
            seen_reserve.add(reserve)  # type: ignore[arg-type]
            structured.append({
                "title": title, "rationale": why, "cited": valid, "dropped_citations": dropped,
                "reserve": reserve, "catalog_id": row["id"], "preset": row["preset"], "target": row["target"],
                "service": row["service"], "owners": row["owners"],
            })
            continue
        if EFFECT_NUMBER.search(title) or EFFECT_NUMBER.search(why):
            rejected.append({"item": title[:80], "reason": "An untested idea cannot state an effect size."})
            continue
        if len(ideas) < MAX_IDEAS:
            ideas.append({"title": title, "rationale": why, "cited": valid, "dropped_citations": dropped,
                          "reason_untested": demote or "Not simulated in this build."})
    return {"causes": causes, "structured_proposals": structured, "untested_ideas": ideas, "rejected": rejected}


# -- orchestration --------------------------------------------------------------------------------
def load_recorded(scenario: str, seed: int) -> dict[str, Any] | None:
    """A previously recorded analysis for this scenario and seed, shipped for the demo case."""
    try:
        data = json.loads(RECORDED_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    for rec in data.get("records", []):
        if rec.get("scenario") == scenario and rec.get("seed") == seed:
            return rec
    return None


def analyze(snapshot: dict[str, Any], forecast: dict[str, Any] | None, comparison: dict[str, Any] | None,
            catalog: list[dict[str, Any]], *, allow_recorded: bool = True) -> dict[str, Any]:
    """Evidence -> model -> validated analysis. Falls back to a labeled recorded analysis, then to
    `unavailable` (the comparison is still shown by the caller). Never raises."""
    evidence = build_evidence(snapshot, forecast, comparison)
    base = {"model": model_name(), "disclaimer": DISCLAIMER, "evidence_keys": len(evidence)}
    if comparison is None or comparison.get("status") != "ok":
        return {**base, "status": "cannot_assess", "reason": "Essential data is missing or stale; no analysis.",
                "causes": [], "structured_proposals": [], "untested_ideas": [], "rejected": []}
    context = build_context(evidence, catalog, comparison)
    try:
        raw = call_model(context)
    except AnalystUnavailable as exc:
        rec = load_recorded(snapshot["scenario"], snapshot["seed"]) if allow_recorded else None
        if rec is not None:
            out = validate(rec["raw"], evidence, catalog)
            return {**base, "status": "recorded", "model": rec.get("model", base["model"]),
                    "reason": f"Live analyst unavailable ({exc}). Showing the analysis recorded "
                              f"{rec.get('recorded_on', 'earlier')} for this demo case.", **out}
        return {**base, "status": "unavailable", "reason": f"Analyst unavailable: {exc}",
                "causes": [], "structured_proposals": [], "untested_ideas": [], "rejected": []}
    out = validate(raw, evidence, catalog)
    return {**base, "status": "ok", "reason": None, **out, "_raw": raw}
