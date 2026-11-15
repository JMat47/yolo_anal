"""Builds the scan response the page renders (findings, checks, rule outcomes). Pure, no I/O."""

import math
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, Literal

from hazard_demo.config import HAZARDS, Config
from hazard_demo.rules import Check, Evaluation, Finding, RuleOutcome, anchor_roles, select

if TYPE_CHECKING:
    from hazard_demo.imaging import PreparedImage


def pct(score: float) -> int:
    # round() first so float error can't drop a whole percent: .29 * 100 is 28.999999999999996
    return min(99, max(1, math.floor(round(score * 100, 6))))


def grade(p: int, grades: Mapping[str, int]) -> Literal["high", "medium", "low"]:
    if p >= grades["high"]:
        return "high"
    if p >= grades["medium"]:
        return "medium"
    return "low"


def scan_payload(*, seq: int, ev: Evaluation, image: "PreparedImage", model_ms: float, model: str, device: str,
                 cfg: Config) -> dict:
    shown, hidden = select(ev.findings, cfg.max_findings)
    above = sorted((role for role in cfg.prompts if ev.best[role] > cfg.threshold_for(role)),
                   key=lambda role: ev.best[role], reverse=True)
    return {
        "seq": seq,
        "model": model,
        "device": device,
        "vocabulary": cfg.vocabulary,
        "threshold_pct": cfg.threshold_pct,
        "image": image.to_json(),
        "model_ms": round(model_ms, 1),
        "findings": [_finding(f"{i:02d}", f, image, cfg) for i, f in enumerate(shown, start=1)],
        "hidden_count": hidden,
        "rules": [_rule(o, ev, cfg) for o in ev.outcomes],
        "best_scores": {cfg.word(role): round(score, 3) for role, score in ev.best.items()},
        "objects_found": [{"item": cfg.word(role), "pct": pct(ev.best[role])} for role in above],
    }


def _finding(fid: str, f: Finding, image: "PreparedImage", cfg: Config) -> dict:
    x1, y1, x2, y2 = f.anchor.box
    confidence = pct(f.anchor.score)
    return {
        "id": fid,
        "hazard": f.hazard,
        "category": cfg.hazards[f.hazard].category,
        "severity": f.severity,
        "title": f.title,
        "confidence": confidence,
        "grade": grade(confidence, cfg.confidence_grades),
        "anchor": {
            "item": cfg.word(f.anchor.role),
            "score": round(f.anchor.score, 3),
            "box": [round(v, 1) for v in f.anchor.box],
            "box_norm": [round(x1 / image.width, 4), round(y1 / image.height, 4),
                         round(x2 / image.width, 4), round(y2 / image.height, 4)],
        },
        "checks": [_check(c, cfg) for c in f.checks],
    }


def _check(c: Check, cfg: Config) -> dict:
    out: dict[str, Any] = {"item": cfg.word(c.role), "status": c.status, "kind": c.kind}
    if c.status == "found":
        out["pct"] = pct(c.score)
    else:
        out["best"] = round(c.score, 3)
    return out


def check_list(cfg: Config) -> list[dict]:
    """The five hazard checks, in HAZARDS order, as the idle screen lists them (and each scan's rules repeat)."""
    return [_check_text(hazard, cfg) for hazard in HAZARDS]


def _check_text(hazard: str, cfg: Config) -> dict:
    return {
        "hazard": hazard,
        "category": cfg.hazards[hazard].category,
        "check_label": cfg.hazards[hazard].check_label,
        "anchor_items": [cfg.word(role) for role in anchor_roles(hazard, cfg)],
    }


def _rule(o: RuleOutcome, ev: Evaluation, cfg: Config) -> dict:
    roles = anchor_roles(o.hazard, cfg)
    return {
        **_check_text(o.hazard, cfg),
        "anchor_found": any(ev.best[role] > cfg.threshold_for(role) for role in roles),
        "fired": o.fired,
        "count": o.count,
    }
