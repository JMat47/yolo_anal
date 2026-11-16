from pathlib import Path

import pytest
import yaml

from hazard_demo.config import ConfigError, load_config
from hazard_demo.paths import CONFIG_PATH, REPO_ROOT


def write_config(tmp_path: Path, edit) -> Path:
    data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    edit(data)
    path = tmp_path / "hazards.yaml"
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return path


def test_vocabulary_order():
    assert load_config().vocabulary == [
        "person", "hard hat", "high-visibility vest", "concrete stairs", "railing",
        "gap in the floor", "cable", "debris", "uneven floor", "pile of materials",
    ]


def test_threshold_override(tmp_path):
    cfg = load_config(write_config(tmp_path, lambda d: d.update(thresholds={"floor_opening": 0.2})))
    assert cfg.threshold_for("floor_opening") == 0.2
    assert cfg.threshold_for("cable") == 0.25
    assert cfg.threshold_pct == 25


def test_model_paths_resolve_from_repo():
    cfg = load_config()
    assert cfg.model_file == REPO_ROOT / "models/yoloe-11s-seg.pt"
    assert cfg.model_name == "yoloe-11s-seg"


def test_uneven_floor_may_be_removed(tmp_path):
    cfg = load_config(write_config(tmp_path, lambda d: d["prompts"].pop("uneven_floor")))
    assert "uneven_floor" not in cfg.prompts


def _unknown_role(d):
    d["prompts"]["ladder"] = "ladder"


def _duplicate_word(d):
    d["prompts"]["debris"] = "cable"


def _missing_person(d):
    d["prompts"].pop("person")


def _no_trip_role(d):
    for role in ("cable", "debris", "uneven_floor"):
        d["prompts"].pop(role)


def _threshold_out_of_range(d):
    d["thresholds"] = {"railing": 1.5}


def _grades_inverted(d):
    d["confidence_grades"] = {"high": 40, "medium": 60}


def _missing_hazard(d):
    d["hazards"].pop("materials")


def _margin_not_a_number(d):
    d["geometry"]["railing_margin"] = "wide"


def _port_not_an_integer(d):
    d["server"]["port"] = "eighty"


@pytest.mark.parametrize(
    ("edit", "key"),
    [
        (_unknown_role, "ladder"),
        (_duplicate_word, "cable"),
        (_missing_person, "person"),
        (_no_trip_role, "cable"),
        (_threshold_out_of_range, "railing"),
        (_grades_inverted, "confidence_grades"),
        (_missing_hazard, "materials"),
        (_margin_not_a_number, "geometry.railing_margin"),
        (_port_not_an_integer, "server.port"),
    ],
    ids=["unknown-role", "duplicate-word", "missing-person", "no-trip-role",
         "threshold-range", "grades-inverted", "missing-hazard", "margin-not-a-number", "port-not-an-integer"],
)
def test_rejects_bad_config(tmp_path, edit, key):
    with pytest.raises(ConfigError, match=key):
        load_config(write_config(tmp_path, edit))


def test_gitattributes_marks_binaries():
    lines = (REPO_ROOT / ".gitattributes").read_text(encoding="utf-8").splitlines()
    assert "*.pt binary" in lines
    assert "*.woff2 binary" in lines
