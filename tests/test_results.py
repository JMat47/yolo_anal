from dataclasses import replace

from hazard_demo.config import load_config
from hazard_demo.results import grade, pct, scan_payload
from hazard_demo.rules import Detection, evaluate

CFG = load_config()
PERSON = (100, 100, 200, 400)
STAIR = (300, 300, 500, 500)


class StandInImage:
    width = 2000
    height = 1000

    def to_json(self):
        return {"id": "abc", "width": self.width, "height": self.height}


def payload(dets, cfg=CFG, model_ms=48.237):
    return scan_payload(seq=3, ev=evaluate(dets, cfg), image=StandInImage(), model_ms=model_ms,
                        model=cfg.model_name, device="cpu", cfg=cfg)


def test_pct_floors_and_clamps():
    assert pct(.919) == 91
    assert pct(.999) == 99
    assert pct(1.0) == 99
    assert pct(.004) == 1
    assert pct(.25) == 25
    assert pct(.29) == 29      # .29 * 100 == 28.999999999999996
    assert pct(.57) == 57      # .57 * 100 == 56.99999999999999


def test_grade_cutoffs():
    grades = CFG.confidence_grades
    assert [grade(p, grades) for p in (60, 59, 40, 39, 26)] == ["high", "medium", "medium", "low", "low"]


def test_payload_shape():
    p = payload([Detection("person", .9, PERSON), Detection("staircase", .8, STAIR),
                 Detection("floor_opening", .7, (600, 0, 700, 50)), Detection("cable", .6, (0, 600, 100, 650)),
                 Detection("pile", .5, (700, 600, 900, 700))])
    assert [f["id"] for f in p["findings"]] == ["01", "02", "03"]
    assert p["hidden_count"] == 2
    first = p["findings"][0]
    assert first["anchor"]["item"] == "person"
    assert first["anchor"]["box_norm"] == [round(100 / 2000, 4), round(100 / 1000, 4),
                                           round(200 / 2000, 4), round(400 / 1000, 4)]
    assert (first["category"], first["confidence"], first["grade"]) == ("No PPE", 90, "high")
    assert p["threshold_pct"] == 25
    assert p["vocabulary"] == CFG.vocabulary
    assert len(p["rules"]) == 5
    assert p["model_ms"] == 48.2
    assert p["image"] == StandInImage().to_json()
    assert (p["seq"], p["model"], p["device"]) == (3, "yolov8s-worldv2", "cpu")


def test_payload_missing_check_has_no_pct():
    p = payload([Detection("person", .91, PERSON), Detection("hard_hat", .12, (130, 100, 170, 140))])
    checks = p["findings"][0]["checks"]
    assert checks[0] == {"item": "person", "status": "found", "kind": "context", "pct": 91}
    assert checks[1] == {"item": "hard hat", "status": "missing", "kind": "safeguard", "best": 0.12}
    assert "pct" not in checks[1]


def test_payload_rules_carry_empty_state_data():
    p = payload([Detection("staircase", .81, STAIR), Detection("railing", .5, (520, 300, 560, 500))])
    keys = {"hazard", "category", "check_label", "anchor_items", "anchor_found", "fired", "count"}
    assert all(set(rule) == keys for rule in p["rules"])
    rules = {rule["hazard"]: rule for rule in p["rules"]}
    assert rules["trip"]["anchor_items"] == ["cable", "debris", "uneven floor"]
    assert rules["trip"]["anchor_found"] is False
    assert rules["fall_stair"] == {"hazard": "fall_stair", "category": "Fall hazard",
                                   "check_label": "Staircase without a railing", "anchor_items": ["staircase"],
                                   "anchor_found": True, "fired": False, "count": 0}


def test_payload_uses_config_words():
    cfg = replace(CFG, prompts={**CFG.prompts, "hard_hat": "helmet"})
    p = payload([Detection("person", .91, PERSON)], cfg=cfg)
    assert "helmet" in p["vocabulary"]
    assert [c["item"] for c in p["findings"][0]["checks"]] == ["person", "helmet", "safety vest"]


def test_objects_found_sorted():
    p = payload([Detection("railing", .712, (600, 300, 650, 500)), Detection("staircase", .845, STAIR),
                 Detection("hard_hat", .12, (0, 0, 10, 10))])
    assert p["objects_found"] == [{"item": "staircase", "pct": 84}, {"item": "railing", "pct": 71}]
