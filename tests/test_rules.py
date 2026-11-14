from dataclasses import replace

from hazard_demo.config import HAZARDS, load_config
from hazard_demo.rules import Detection, evaluate, select

CFG = load_config()
PERSON = (100, 100, 200, 400)   # w=100 h=300: head y 100–190 (x 90–210), torso y 160–310
HAT    = (130, 100, 170, 140)   # centre (150,120): in head
VEST   = (110, 200, 190, 300)   # centre (150,250): in torso
STAIR  = (300, 300, 500, 500)   # margin 30 → expanded (270,270,530,530)


def d(role, score, box):
    return Detection(role, score, box)


def kinds(f):
    return [(c.role, c.status, c.kind) for c in f.checks]


def hazards(ev):
    return [f.hazard for f in ev.findings]


def test_staircase_without_railing_fires():
    ev = evaluate([d("staircase", .81, STAIR)], CFG)
    assert len(ev.findings) == 1
    f = ev.findings[0]
    assert (f.hazard, f.severity, f.title) == ("fall_stair", "high", "Staircase without a railing")
    assert kinds(f) == [("staircase", "found", "context"), ("railing", "missing", "safeguard")]
    assert ev.outcomes[0].fired is True and ev.outcomes[0].count == 1


def test_railing_touching_expanded_box_suppresses():
    ev = evaluate([d("staircase", .81, STAIR), d("railing", .5, (520, 300, 560, 500))], CFG)
    assert ev.findings == ()
    assert ev.outcomes[0].fired is False
    edge_to_edge = evaluate([d("staircase", .81, STAIR), d("railing", .5, (530, 300, 560, 500))], CFG)
    assert edge_to_edge.findings == ()


def test_railing_far_away_does_not_suppress():
    ev = evaluate([d("staircase", .81, STAIR), d("railing", .5, (600, 300, 650, 500))], CFG)
    assert hazards(ev) == ["fall_stair"]


def test_score_equal_to_threshold_is_missing():
    ev = evaluate([d("staircase", .81, STAIR), d("railing", .25, (520, 300, 560, 500))], CFG)
    assert hazards(ev) == ["fall_stair"]
    assert evaluate([d("staircase", .25, STAIR)], CFG).findings == ()


def test_floor_opening_without_railing_fires():
    ev = evaluate([d("floor_opening", .47, STAIR)], CFG)
    assert [(f.hazard, f.title) for f in ev.findings] == [("fall_opening", "Gap in the floor without a railing")]
    assert kinds(ev.findings[0]) == [("floor_opening", "found", "context"), ("railing", "missing", "safeguard")]


def test_person_missing_both():
    (f,) = evaluate([d("person", .91, PERSON)], CFG).findings
    assert f.title == "No hard hat or high-visibility vest"
    assert kinds(f) == [("person", "found", "context"), ("hard_hat", "missing", "safeguard"),
                        ("safety_vest", "missing", "safeguard")]


def test_person_with_hat_only():
    (f,) = evaluate([d("person", .91, PERSON), d("hard_hat", .7, HAT)], CFG).findings
    assert f.title == "No high-visibility vest"
    assert kinds(f) == [("person", "found", "context"), ("hard_hat", "found", "safeguard"),
                        ("safety_vest", "missing", "safeguard")]
    assert f.checks[1].score == .7


def test_person_with_vest_only():
    (f,) = evaluate([d("person", .91, PERSON), d("safety_vest", .66, VEST)], CFG).findings
    assert f.title == "No hard hat"
    assert kinds(f) == [("person", "found", "context"), ("safety_vest", "found", "safeguard"),
                        ("hard_hat", "missing", "safeguard")]


def test_person_with_both_not_flagged():
    ev = evaluate([d("person", .91, PERSON), d("hard_hat", .7, HAT), d("safety_vest", .66, VEST)], CFG)
    assert ev.findings == ()


def test_hat_below_head_region_is_missing():
    ev = evaluate([d("person", .91, PERSON), d("safety_vest", .66, VEST),
                   d("hard_hat", .7, (130, 300, 170, 340))], CFG)
    assert [f.title for f in ev.findings] == ["No hard hat"]


def test_hat_within_side_margin_matches():
    ev = evaluate([d("person", .91, PERSON), d("safety_vest", .66, VEST),
                   d("hard_hat", .7, (190, 100, 220, 140))], CFG)   # centre x=205
    assert ev.findings == ()


def test_one_finding_per_person():
    ev = evaluate([d("person", .91, PERSON), d("person", .8, (600, 100, 700, 400))], CFG)
    assert hazards(ev) == ["no_ppe", "no_ppe"]


def test_trip_one_finding_per_detection():
    ev = evaluate([d("cable", .64, (0, 600, 100, 650)), d("debris", .52, (300, 600, 400, 650))], CFG)
    assert [f.title for f in ev.findings] == ["Cable on the floor", "Debris on the floor"]
    assert [kinds(f) for f in ev.findings] == [[("cable", "found", "evidence")],
                                               [("debris", "found", "evidence")]]


def test_same_role_overlap_merged_keeps_higher():
    ev = evaluate([d("cable", .5, (0, 0, 100, 100)), d("cable", .7, (0, 0, 100, 80))], CFG)   # IoU .8
    (f,) = ev.findings
    assert f.hazard == "trip" and f.anchor.score == .7


def test_different_roles_not_merged():
    ev = evaluate([d("cable", .5, (0, 0, 100, 100)), d("debris", .7, (0, 0, 100, 100))], CFG)
    assert hazards(ev) == ["trip", "trip"]


def test_trip_role_removed_from_config_is_skipped():
    cfg = replace(CFG, prompts={r: w for r, w in CFG.prompts.items() if r != "uneven_floor"})
    ev = evaluate([d("uneven_floor", .9, (0, 0, 100, 100))], cfg)
    assert ev.findings == ()
    assert len(ev.outcomes) == 5


def test_materials_fires():
    (f,) = evaluate([d("pile", .77, STAIR)], CFG).findings
    assert (f.hazard, f.severity, f.title) == ("materials", "medium", "Pile of materials")
    assert kinds(f) == [("pile", "found", "evidence")]


def test_outcomes_always_five_in_order():
    ev = evaluate([], CFG)
    assert [o.hazard for o in ev.outcomes] == list(HAZARDS)
    assert all(o.fired is False and o.count == 0 for o in ev.outcomes)


def test_best_scores_include_unfound():
    ev = evaluate([d("hard_hat", .12, HAT)], CFG)
    assert ev.best["hard_hat"] == .12
    assert ev.best["railing"] == 0.0


def test_sort_severity_then_score():
    ev = evaluate([d("cable", .95, (0, 600, 100, 650)), d("pile", .90, (700, 600, 900, 700)),
                   d("staircase", .70, STAIR), d("person", .60, PERSON)], CFG)
    assert hazards(ev) == ["fall_stair", "no_ppe", "trip", "materials"]


def test_tie_breaks_by_hazard_order():
    ev = evaluate([d("person", .7, PERSON), d("staircase", .7, STAIR)], CFG)
    assert hazards(ev) == ["fall_stair", "no_ppe"]


def test_select_caps_at_three():
    f = evaluate([d("person", .9, PERSON), d("staircase", .8, STAIR), d("floor_opening", .7, (600, 0, 700, 50)),
                  d("cable", .6, (0, 600, 100, 650)), d("pile", .5, (700, 600, 900, 700))], CFG).findings
    assert len(f) == 5
    assert select(f, 3) == (f[:3], 2)
