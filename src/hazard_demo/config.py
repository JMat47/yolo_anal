"""Loads and validates config/hazards.yaml: prompts, thresholds, geometry and card copy."""

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml

from hazard_demo.paths import CONFIG_PATH, REPO_ROOT

ROLES = (
    "person", "hard_hat", "safety_vest", "staircase", "railing",
    "floor_opening", "cable", "debris", "uneven_floor", "pile",
)
REQUIRED_ROLES = ("person", "hard_hat", "safety_vest", "staircase", "railing", "floor_opening", "pile")
TRIP_ROLES = ("cable", "debris", "uneven_floor")
HAZARDS = ("fall_stair", "fall_opening", "trip", "no_ppe", "materials")
SEVERITIES = ("high", "medium")
TITLE_KEYS = {
    "fall_stair": ("default",),
    "fall_opening": ("default",),
    "no_ppe": ("both", "hard_hat", "safety_vest"),
    "materials": ("default",),
}


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class HazardText:
    category: str
    severity: Literal["high", "medium"]
    titles: dict[str, str]
    check_label: str


@dataclass(frozen=True)
class Config:
    port: int
    model_file: Path
    model_base: str
    conf_floor: float
    imgsz: int
    device: str
    min_scene_ms: int
    timeout_ms: int
    prompts: dict[str, str]
    threshold: float
    thresholds: dict[str, float]
    merge_iou: float
    railing_margin: float
    head_region: float
    torso_region: tuple[float, float]
    ppe_margin: float
    confidence_grades: dict[str, int]
    max_findings: int
    hazards: dict[str, HazardText]

    @property
    def model_name(self) -> str:
        return self.model_file.stem

    @property
    def vocabulary(self) -> list[str]:
        return list(self.prompts.values())

    def word(self, role: str) -> str:
        return self.prompts[role]

    def role_of(self, word: str) -> str:
        for role, w in self.prompts.items():
            if w == word:
                return role
        raise KeyError(word)

    def threshold_for(self, role: str) -> float:
        return self.thresholds.get(role, self.threshold)

    @property
    def threshold_pct(self) -> int:
        return round(self.threshold * 100)


def load_config(path: Path = CONFIG_PATH) -> Config:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ConfigError(f"{path}: cannot read config ({exc})") from exc
    return _Loader(path).build(data)


class _Loader:
    def __init__(self, path: Path):
        self.path = path

    def fail(self, message: str) -> ConfigError:
        return ConfigError(f"{self.path}: {message}")

    def get(self, data: Any, key: str, where: str = "") -> Any:
        if not isinstance(data, Mapping) or key not in data:
            raise self.fail(f"missing key '{where}{key}'")
        return data[key]

    def fraction(self, value: Any, key: str) -> float:
        if isinstance(value, bool) or not isinstance(value, int | float) or not 0 < value < 1:
            raise self.fail(f"'{key}' must be a number between 0 and 1 (exclusive), got {value!r}")
        return float(value)

    def build(self, data: Any) -> Config:
        model = self.get(data, "model")
        geometry = self.get(data, "geometry")
        prompts = self.prompts(self.get(data, "prompts"))
        torso = self.get(geometry, "torso_region", "geometry.")
        if not isinstance(torso, list) or len(torso) != 2:
            raise self.fail("'geometry.torso_region' must be a list of two fractions")
        return Config(
            port=int(self.get(self.get(data, "server"), "port", "server.")),
            model_file=REPO_ROOT / str(self.get(model, "file", "model.")),
            model_base=str(self.get(model, "base", "model.")),
            conf_floor=self.fraction(self.get(model, "conf_floor", "model."), "model.conf_floor"),
            imgsz=int(self.get(model, "imgsz", "model.")),
            device=str(self.get(model, "device", "model.")),
            min_scene_ms=int(self.get(self.get(data, "scan"), "min_scene_ms", "scan.")),
            timeout_ms=int(self.get(self.get(data, "scan"), "timeout_ms", "scan.")),
            prompts=prompts,
            threshold=self.fraction(self.get(data, "threshold"), "threshold"),
            thresholds=self.thresholds(self.get(data, "thresholds") or {}, prompts),
            merge_iou=self.fraction(self.get(data, "merge_iou"), "merge_iou"),
            railing_margin=float(self.get(geometry, "railing_margin", "geometry.")),
            head_region=self.fraction(self.get(geometry, "head_region", "geometry."), "geometry.head_region"),
            torso_region=(
                self.fraction(torso[0], "geometry.torso_region"),
                self.fraction(torso[1], "geometry.torso_region"),
            ),
            ppe_margin=float(self.get(geometry, "ppe_margin", "geometry.")),
            confidence_grades=self.grades(self.get(data, "confidence_grades")),
            max_findings=int(self.get(data, "max_findings")),
            hazards=self.hazards(self.get(data, "hazards"), prompts),
        )

    def prompts(self, raw: Any) -> dict[str, str]:
        if not isinstance(raw, Mapping):
            raise self.fail("'prompts' must map roles to prompt words")
        prompts: dict[str, str] = {}
        seen: dict[str, str] = {}
        for role, word in raw.items():
            if role not in ROLES:
                raise self.fail(f"prompts: unknown role '{role}' (known roles: {', '.join(ROLES)})")
            if not isinstance(word, str) or not word.strip():
                raise self.fail(f"prompts: role '{role}' needs a prompt word")
            word = word.strip()
            if word in seen:
                raise self.fail(f"prompts: word '{word}' is used by both '{seen[word]}' and '{role}'")
            seen[word] = role
            prompts[role] = word
        for role in REQUIRED_ROLES:
            if role not in prompts:
                raise self.fail(f"prompts: missing required role '{role}'")
        if not any(role in prompts for role in TRIP_ROLES):
            raise self.fail(f"prompts: needs at least one trip role ({', '.join(TRIP_ROLES)})")
        return prompts

    def thresholds(self, raw: Any, prompts: dict[str, str]) -> dict[str, float]:
        if not isinstance(raw, Mapping):
            raise self.fail("'thresholds' must map roles to thresholds")
        out: dict[str, float] = {}
        for role, value in raw.items():
            if role not in prompts:
                raise self.fail(f"thresholds: '{role}' is not a configured role")
            out[role] = self.fraction(value, f"thresholds.{role}")
        return out

    def grades(self, raw: Any) -> dict[str, int]:
        high = self.get(raw, "high", "confidence_grades.")
        medium = self.get(raw, "medium", "confidence_grades.")
        if not all(isinstance(v, int) and not isinstance(v, bool) and 0 < v < 100 for v in (high, medium)):
            raise self.fail("'confidence_grades' must be whole percentages between 1 and 99")
        if high <= medium:
            raise self.fail(f"'confidence_grades' high ({high}) must be above medium ({medium})")
        return {"high": high, "medium": medium}

    def hazards(self, raw: Any, prompts: dict[str, str]) -> dict[str, HazardText]:
        out: dict[str, HazardText] = {}
        for hazard in HAZARDS:
            entry = self.get(raw, hazard, "hazards.")
            where = f"hazards.{hazard}."
            severity = self.get(entry, "severity", where)
            if severity not in SEVERITIES:
                raise self.fail(f"'{where}severity' must be one of {', '.join(SEVERITIES)}")
            titles = self.get(entry, "titles", where)
            title_keys = TITLE_KEYS.get(hazard) or tuple(r for r in TRIP_ROLES if r in prompts)
            for key in title_keys:
                self.get(titles, key, f"{where}titles.")
            out[hazard] = HazardText(
                category=str(self.get(entry, "category", where)),
                severity=severity,
                titles={str(k): str(v) for k, v in titles.items()},
                check_label=str(self.get(entry, "check_label", where)),
            )
        return out
