"""Finding cards, the stats row and the live announcement (UI-36 to UI-40, UI-68, UI-71, UI-101 to UI-106)."""

import re

import pytest
from flows import open_ready, scan_upload, text_of, wait_settled
from markers import BLUE, GREEN, MAGENTA, RED, MarkerBackend, marker_photo, scaled_rects

from hazard_demo.config import load_config

pytestmark = pytest.mark.ui

CFG = load_config()
SIZE = (1600, 1200)
# A person with no PPE (3 chips), a staircase without a railing, a pile of materials and a cable, apart.
SPOTS = {
    RED: (0.08, 0.15, 0.18, 0.55),
    BLUE: (0.35, 0.30, 0.25, 0.30),
    MAGENTA: (0.68, 0.55, 0.22, 0.25),
    GREEN: (0.36, 0.80, 0.25, 0.08),
}
GRADED = {RED: ("person", 0.91), BLUE: ("staircase", 0.52), MAGENTA: ("pile", 0.33)}
CONF_HIGH, INK_1, INK_2 = "rgb(108, 207, 140)", "rgb(236, 233, 226)", "rgb(164, 169, 176)"


@pytest.fixture(scope="session")
def photos(tmp_path_factory):
    folder = tmp_path_factory.mktemp("panel-photos")

    def photo(name, colours):
        return marker_photo(folder / f"{name}.jpg", SIZE, scaled_rects(SIZE, {c: SPOTS[c] for c in colours}))
    return {
        "three": photo("three", [RED, BLUE, MAGENTA]),            # No PPE, Fall hazard, Materials dumped
        "four": photo("four", [RED, BLUE, MAGENTA, GREEN]),       # the same, plus a trip hazard that is not shown
        "two-categories": photo("two-categories", [RED, MAGENTA]),
    }


def revealed(served_app, page_at, photo, viewport=(1366, 768), backend=None):
    app = served_app(backend_factory=backend)
    page = page_at(viewport)
    open_ready(page, app)
    payload = scan_upload(page, photo)
    return page, payload


def cards(page) -> list[dict]:
    return page.evaluate("""() => [...document.querySelectorAll('[data-card]')].map(card => ({
        id: card.dataset.card,
        text: card.textContent.replace(/\\s+/g, ' ').trim(),
        title: card.querySelector('.card-title').textContent,
        pct: card.querySelector('.card-conf b').textContent,
        colour: getComputedStyle(card.querySelector('.card-conf b')).color,
        chips: [...card.querySelectorAll('.chip')].map(c => c.textContent.replace(/\\s+/g, ' ').trim()),
    }))""")


@pytest.mark.parametrize("viewport", [(1366, 768), (1536, 864), (1920, 1080)], ids=lambda v: f"{v[0]}x{v[1]}")
def test_three_cards_fit(served_app, page_at, photos, viewport):
    page, payload = revealed(served_app, page_at, photos["three"], viewport)
    assert len(payload["findings"]) == 3 and payload["hidden_count"] == 0
    assert len(cards(page)[0]["chips"]) == 3   # the No PPE card: person found, hard hat and safety vest missing
    fit = page.evaluate("() => { const l = document.getElementById('findings-list');"
                        " return [l.scrollHeight, l.clientHeight]; }")
    assert fit[0] <= fit[1], fit


def test_three_cards_reachable_in_a_window(served_app, page_at, photos):
    # R9(c): at 1366x633 the settled card anatomy is taller than the list, so the list scrolls; the page never does.
    page, _ = revealed(served_app, page_at, photos["three"], (1366, 633))
    sizes = page.evaluate("() => [document.documentElement.scrollHeight, innerHeight]")
    assert sizes[0] == sizes[1]
    for card_id in ("01", "02", "03"):
        page.locator(f'[data-card="{card_id}"]').scroll_into_view_if_needed()
        assert page.evaluate("""(id) => {
            const c = document.querySelector(`[data-card="${id}"]`).getBoundingClientRect();
            const l = document.getElementById('findings-list').getBoundingClientRect();
            return c.top >= l.top - 0.5 && c.bottom <= l.bottom + 0.5;
        }""", card_id)


def test_hidden_line_after_the_cards(served_app, page_at, photos):
    page, payload = revealed(served_app, page_at, photos["four"])
    assert payload["hidden_count"] == 1
    assert len(cards(page)) == 3
    last = "#findings-list > :last-child"
    assert page.evaluate("(s) => document.querySelector(s).classList.contains('hidden-line')", last)
    assert text_of(page, "#findings-list > :last-child") == "1 more hazard was flagged in this photo but is not shown."


def test_card_order_and_numbers(served_app, page_at, photos):
    page, payload = revealed(served_app, page_at, photos["four"])
    no_ppe, fall_stair, materials = CFG.hazards["no_ppe"], CFG.hazards["fall_stair"], CFG.hazards["materials"]
    # The global sort: high severity first, then anchor score (person .91, staircase .81); the cable (.64, medium)
    # loses to the pile (.77, medium) and is the hidden one.
    expected = [("01", no_ppe.titles["both"]), ("02", fall_stair.titles["default"]),
                ("03", materials.titles["default"])]
    assert [(c["id"], c["title"]) for c in cards(page)] == expected
    assert [(f["id"], f["title"]) for f in payload["findings"]] == expected
    for card_id, _ in expected:
        finding = next(f for f in payload["findings"] if f["id"] == card_id)
        assert text_of(page, f'[data-card="{card_id}"] .card-cat') == f"{card_id} {finding['category']}"
        assert text_of(page, f'[data-tag="{card_id}"]').startswith(f"{card_id} {finding['category']}")
        assert page.get_attribute(f'[data-box="{card_id}"]', "aria-label").startswith(f"Hazard {card_id}, ")


def test_card_anatomy(served_app, page_at, photos):
    page, payload = revealed(served_app, page_at, photos["three"])
    first = cards(page)[0]
    finding = payload["findings"][0]
    words = [check["item"] for check in finding["checks"]]
    assert first["chips"] == [f"{words[0].capitalize()} found · {finding['confidence']}%",
                              f"{words[1].capitalize()} missing", f"{words[2].capitalize()} missing"]
    assert first["text"].startswith(f"01 {finding['category']} Confidence {finding['confidence']}%")
    assert page.get_attribute('[data-card="01"]', "tabindex") == "0"
    for absent in ("Reason", "YOLO intervention", "Rule:", "Not checked", "detected"):
        assert absent not in page.text_content("#findings-list")


def test_confidence_grade_colours(served_app, page_at, photos):
    page, payload = revealed(served_app, page_at, photos["three"], backend=lambda cfg: MarkerBackend(GRADED))
    by_pct = {c["pct"]: c["colour"] for c in cards(page)}
    assert by_pct == {"91%": CONF_HIGH, "52%": INK_1, "33%": INK_2}
    assert [f["grade"] for f in payload["findings"]] == ["high", "medium", "low"]


def test_headline_equals_chip_and_tag(served_app, page_at, photos):
    page, payload = revealed(served_app, page_at, photos["three"])
    for finding in payload["findings"]:
        card = f'[data-card="{finding["id"]}"]'
        headline = page.text_content(f"{card} .card-conf b")
        anchor_chip = next(c for c in page.locator(f"{card} .chip").all_text_contents()
                           if c.startswith(finding["anchor"]["item"].capitalize()))
        tag = text_of(page, f'[data-tag="{finding["id"]}"]')
        assert headline == f"{finding['confidence']}%"
        assert anchor_chip.endswith(headline) and tag.endswith(headline)


@pytest.mark.parametrize("viewport", [(1366, 768), (1093, 560)], ids=lambda v: f"{v[0]}x{v[1]}")
def test_no_text_below_14px(served_app, page_at, photos, viewport):
    page, _ = revealed(served_app, page_at, photos["four"], viewport)
    small = page.evaluate("""() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const out = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent.trim()) continue;
            const size = parseFloat(getComputedStyle(node.parentElement).fontSize);
            if (size < 14) out.push([node.textContent.trim().slice(0, 30), size]);
        }
        return out;
    }""")
    assert small == []


@pytest.mark.parametrize("photo", ["two-categories", "three"], ids=["2cats", "3cats"])
@pytest.mark.parametrize("viewport", [(1366, 768), (1366, 605)], ids=lambda v: f"{v[0]}x{v[1]}")
def test_stats_row_fits(served_app, page_at, photos, viewport, photo):
    page, payload = revealed(served_app, page_at, photos[photo], viewport)
    row = stats_row(page)
    assert row["scroll"] <= row["client"], row
    assert abs(row["height"] - row["token"]) < 0.5, row
    categories = list(dict.fromkeys(f["category"] for f in payload["findings"]))
    keys = page.locator("#stats .stat-key").all_text_contents()
    assert keys[0] == "Hazards flagged" and "Model time" in keys       # never given way (UI-39)
    assert keys[1:1 + len(categories)] == categories or keys[1] == "Categories"


def stats_row(page) -> dict:
    return page.evaluate("""() => {
        const row = document.getElementById('stats');
        const probe = document.createElement('div');
        probe.style.height = 'var(--stats-h)';
        document.body.append(probe);
        const token = probe.getBoundingClientRect().height;
        probe.remove();
        return {scroll: row.scrollWidth, client: row.clientWidth, height: row.getBoundingClientRect().height, token};
    }""")


@pytest.mark.parametrize("viewport", [(1366, 768), (1366, 605)], ids=lambda v: f"{v[0]}x{v[1]}")
def test_stats_give_way_with_four_categories(served_app, page_at, photos, viewport):
    # R10: the app shows at most 3 findings, so 4 categories only reach the row through renderStats itself.
    page, _ = revealed(served_app, page_at, photos["three"], viewport)
    page.evaluate("""async () => {
        const stats = await import('/js/stats.js');
        const finding = (id, category, severity) => ({id, category, severity});
        stats.renderStats({findings: [finding('01', 'Fall hazard', 'high'), finding('02', 'No PPE', 'high'),
                                      finding('03', 'Trip hazard', 'medium'),
                                      finding('04', 'Materials dumped', 'medium')],
                           modelMs: 48.2, photoName: 'IMG-20241102-WA0042 site visit.jpeg', uploaded: true});
    }""")
    row = stats_row(page)
    keys = page.locator("#stats .stat-key").all_text_contents()
    assert row["scroll"] <= row["client"], (row, keys)
    assert "Categories" in keys and "Fall hazard" not in keys
    assert keys[0] == "Hazards flagged" and "Model time" in keys


def test_stats_tiles(served_app, page_at, photos):
    page, payload = revealed(served_app, page_at, photos["three"])
    tiles = page.evaluate("""() => [...document.querySelectorAll('#stats .stat')].map(t => ({
        key: t.querySelector('.stat-key').textContent, value: t.querySelector('.stat-value').textContent,
        title: t.querySelector('.stat-value').title}))""")
    model = payload["model_ms"]
    expected_time = f"{round(model)} ms" if round(model) < 1000 else None
    assert tiles[0] == {"key": "Hazards flagged", "value": "3", "title": ""}
    assert [(t["key"], t["value"]) for t in tiles[1:4]] == [(f["category"], "1") for f in payload["findings"]]
    assert tiles[4]["key"] == "Model time" and (expected_time is None or tiles[4]["value"] == expected_time)
    assert tiles[5] == {"key": "Photo", "value": "three", "title": "three.jpg"}   # an upload: no extension


def test_hover_card_highlights_box(served_app, page_at, photos):
    page, _ = revealed(served_app, page_at, photos["three"])
    page.hover('[data-card="01"]')
    page.wait_for_function("""() => ['02', '03'].every(id =>
        getComputedStyle(document.querySelector(`[data-box="${id}"]`)).opacity === '0.35')""", timeout=2000)
    assert page.evaluate("() => getComputedStyle(document.querySelector('[data-box=\"01\"]')).opacity") == "1"
    assert page.evaluate("() => getComputedStyle(document.querySelector('[data-tag=\"02\"]')).opacity") == "0.35"
    page.mouse.move(5, 5)
    wait_settled(page)
    page.wait_for_function("""() => ['01', '02', '03'].every(id =>
        getComputedStyle(document.querySelector(`[data-box="${id}"]`)).opacity === '1')""", timeout=2000)


def test_hover_box_marks_its_card(served_app, page_at, photos):
    page, _ = revealed(served_app, page_at, photos["three"])
    page.hover('[data-tag="02"]')
    page.wait_for_function("() => document.querySelector('[data-card=\"02\"]').classList.contains('is-linked')",
                           timeout=2000)
    wait_settled(page)   # the bar eases in; read it once the transition has ended
    shadow = page.evaluate("() => getComputedStyle(document.querySelector('[data-card=\"02\"]')).boxShadow")
    assert "inset" in shadow and "3px" in shadow


def test_live_region_announces(served_app, page_at, photos):
    page, _ = revealed(served_app, page_at, photos["three"])
    text = page.text_content("#live")
    assert re.fullmatch(r"Scan complete\. \d hazards? flagged\. Model time \d+ milliseconds\.", text), text
