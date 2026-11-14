"""Turns detections into hazard findings (design §6.3). Pure functions, no I/O."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from hazard_demo.config import HAZARDS, TRIP_ROLES, Config

Box = tuple[float, float, float, float]   # xyxy, in prepared-image pixels


@dataclass(frozen=True)
class Detection:
    role: str
    score: float
    box: Box


@dataclass(frozen=True)
class Check:
    role: str
    status: Literal["found", "missing"]
    score: float   # for a missing check: the role's best score, kept for debugging and never shown
    kind: Literal["context", "safeguard", "evidence"]


@dataclass(frozen=True)
class Finding:
    hazard: str
    severity: str
    title: str
    anchor: Detection
    checks: tuple[Check, ...]


@dataclass(frozen=True)
class RuleOutcome:
    hazard: str
    fired: bool
    count: int


@dataclass(frozen=True)
class Evaluation:
    findings: tuple[Finding, ...]
    outcomes: tuple[RuleOutcome, ...]
    best: dict[str, float]


def anchor_roles(hazard: str, cfg: Config) -> tuple[str, ...]:
    """The roles whose detection a hazard's box is drawn around."""
    if hazard == "trip":
        return tuple(role for role in TRIP_ROLES if role in cfg.prompts)
    return {"fall_stair": ("staircase",), "fall_opening": ("floor_opening",),
            "no_ppe": ("person",), "materials": ("pile",)}[hazard]


def iou(a: Box, b: Box) -> float:
    iw = min(a[2], b[2]) - max(a[0], b[0])
    ih = min(a[3], b[3]) - max(a[1], b[1])
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def merge_same_role(dets: Sequence[Detection], iou_min: float) -> list[Detection]:
    """Greedy NMS within each role: keep the highest score, drop same-role boxes overlapping it."""
    kept: list[Detection] = []
    for det in sorted(dets, key=lambda x: x.score, reverse=True):
        if all(k.role != det.role or iou(k.box, det.box) < iou_min for k in kept):
            kept.append(det)
    return kept


def evaluate(dets: Sequence[Detection], cfg: Config) -> Evaluation:
    dets = [det for det in dets if det.role in cfg.prompts]
    best = {role: max((det.score for det in dets if det.role == role), default=0.0) for role in cfg.prompts}
    found = {role: [] for role in cfg.prompts}
    for det in merge_same_role([det for det in dets if det.score > cfg.threshold_for(det.role)], cfg.merge_iou):
        found[det.role].append(det)

    per_hazard = {
        "fall_stair": _unguarded_edges("fall_stair", "staircase", found, best, cfg),
        "fall_opening": _unguarded_edges("fall_opening", "floor_opening", found, best, cfg),
        "trip": [_evidence_finding("trip", role, det, cfg)
                 for role in anchor_roles("trip", cfg) for det in found[role]],
        "no_ppe": _people_without_ppe(found, best, cfg),
        "materials": [_evidence_finding("materials", "pile", det, cfg) for det in found["pile"]],
    }
    findings = sorted((f for hazard in HAZARDS for f in per_hazard[hazard]), key=_sort_key)
    outcomes = tuple(RuleOutcome(h, bool(per_hazard[h]), len(per_hazard[h])) for h in HAZARDS)
    return Evaluation(tuple(findings), outcomes, best)


def select(findings: Sequence[Finding], cap: int) -> tuple[tuple[Finding, ...], int]:
    return tuple(findings[:cap]), max(0, len(findings) - cap)


def _sort_key(f: Finding) -> tuple:
    return (0 if f.severity == "high" else 1, -f.anchor.score, HAZARDS.index(f.hazard), f.anchor.box[0], f.anchor.box[1])


def _found(det: Detection, kind: Literal["context", "safeguard", "evidence"]) -> Check:
    return Check(det.role, "found", det.score, kind)


def _unguarded_edges(hazard: str, role: str, found: dict, best: dict, cfg: Config) -> list[Finding]:
    text = cfg.hazards[hazard]
    out = []
    for det in found[role]:
        x1, y1, x2, y2 = det.box
        m = cfg.railing_margin * max(x2 - x1, y2 - y1)
        near = (x1 - m, y1 - m, x2 + m, y2 + m)
        if any(_touches(r.box, near) for r in found["railing"]):
            continue
        checks = (_found(det, "context"), Check("railing", "missing", best["railing"], "safeguard"))
        out.append(Finding(hazard, text.severity, text.titles["default"], det, checks))
    return out


def _people_without_ppe(found: dict, best: dict, cfg: Config) -> list[Finding]:
    text = cfg.hazards["no_ppe"]
    out = []
    for person in found["person"]:
        x1, y1, x2, y2 = person.box
        w, h = x2 - x1, y2 - y1
        m = cfg.ppe_margin * w
        regions = {
            "hard_hat": (x1 - m, y1 - m, x2 + m, y1 + cfg.head_region * h),
            "safety_vest": (x1 - m, y1 + cfg.torso_region[0] * h, x2 + m, y1 + cfg.torso_region[1] * h),
        }
        matched = {role: max((g for g in found[role] if _centre_in(g.box, region)),
                             key=lambda g: g.score, default=None)
                   for role, region in regions.items()}
        missing = [role for role, g in matched.items() if g is None]
        if not missing:
            continue
        checks = (_found(person, "context"),
                  *(_found(g, "safeguard") for g in matched.values() if g is not None),
                  *(Check(role, "missing", best[role], "safeguard") for role in missing))
        title = text.titles["both" if len(missing) == 2 else missing[0]]
        out.append(Finding("no_ppe", text.severity, title, person, checks))
    return out


def _evidence_finding(hazard: str, role: str, det: Detection, cfg: Config) -> Finding:
    text = cfg.hazards[hazard]
    title = text.titles[role] if hazard == "trip" else text.titles["default"]
    return Finding(hazard, text.severity, title, det, (_found(det, "evidence"),))


def _touches(a: Box, b: Box) -> bool:
    return a[0] <= b[2] and a[2] >= b[0] and a[1] <= b[3] and a[3] >= b[1]


def _centre_in(box: Box, region: Box) -> bool:
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    return region[0] <= cx <= region[2] and region[1] <= cy <= region[3]
