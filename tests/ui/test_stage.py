"""The scan flow on stage: the scene, then boxes and tags that land on the objects (UI-5, UI-13, UI-16, UI-29)."""

import pytest
from markers import BLUE, RED, MarkerBackend, marker_photo, scaled_rects

from hazard_demo.config import load_config

pytestmark = pytest.mark.ui

VIEWPORTS = [(1366, 768), (1536, 864), (1920, 1080)]
ASPECTS = {"4x3": (4032, 3024), "3x4": (3024, 4032), "16x9": (1920, 1080)}
# A person (No PPE) and a staircase (Fall hazard), clear of each other and of the edges.
MARKERS = {RED: (0.10, 0.20, 0.25, 0.55), BLUE: (0.55, 0.45, 0.30, 0.35)}
CFG = load_config()


@pytest.fixture(scope="session")
def photos(tmp_path_factory):
    """aspect -> (path, upright size, marker rects in upright pixels)."""
    folder = tmp_path_factory.mktemp("marker-photos")
    out = {}
    for name, size in ASPECTS.items():
        rects = scaled_rects(size, MARKERS)
        out[name] = (marker_photo(folder / f"markers-{name}.jpg", size, rects), size, rects)
    upright = (3024, 4032)
    rects = scaled_rects(upright, MARKERS)
    out["exif6"] = (marker_photo(folder / "markers-exif6.jpg", upright, rects, exif_orientation=6), upright, rects)
    small = (1200, 900)
    rects = scaled_rects(small, {RED: MARKERS[RED]})
    out["person"] = (marker_photo(folder / "person.jpg", small, rects), small, rects)
    return out


def open_ready(page, app):
    page.goto(app.url)
    page.wait_for_function("() => document.querySelector('.model')?.dataset.health === 'ready'", timeout=15000)


def scan_upload(page, path) -> dict:
    """Uploads a photo, returns the scan payload once the reveal has finished."""
    with page.expect_response("**/api/scan", timeout=20000) as response:
        page.set_input_files("#upload-input", str(path))
    payload = response.value.json()
    page.wait_for_selector('[data-box="01"]', state="attached", timeout=10000)
    wait_settled(page)
    return payload


def wait_settled(page):
    page.wait_for_function("() => document.getAnimations().every(a => a.playState !== 'running')", timeout=10000)


def mark_gap(page, start, end) -> float:
    return page.evaluate(f"""() => performance.getEntriesByName('{end}').at(-1).startTime
                                   - performance.getEntriesByName('{start}').at(-1).startTime""")


def text_of(page, selector) -> str:
    return page.evaluate(f"() => document.querySelector('{selector}').textContent.replace(/\\s+/g, ' ').trim()")


MATRIX = [pytest.param(vp, aspect, id=f"{vp[0]}x{vp[1]}-{aspect}") for vp in VIEWPORTS for aspect in ASPECTS]


@pytest.mark.parametrize(("viewport", "aspect"), MATRIX)
def test_no_page_scroll(served_app, page_at, photos, viewport, aspect):
    app = served_app()
    page = page_at(viewport)
    open_ready(page, app)
    scan_upload(page, photos[aspect][0])
    sizes = page.evaluate("""() => ({sh: document.documentElement.scrollHeight, ih: innerHeight,
                                     sw: document.documentElement.scrollWidth, iw: innerWidth})""")
    assert (sizes["sh"], sizes["sw"]) == (sizes["ih"], sizes["iw"])


@pytest.mark.parametrize(("viewport", "aspect"),
                         [*MATRIX, pytest.param((1366, 768), "exif6", id="1366x768-exif6")])
def test_boxes_align_with_markers(served_app, page_at, photos, viewport, aspect):
    path, (width, height), rects = photos[aspect]
    app = served_app()
    page = page_at(viewport)
    open_ready(page, app)
    payload = scan_upload(page, path)
    geometry = page.evaluate("""() => {
        const img = document.getElementById('photo');
        const r = img.getBoundingClientRect();
        const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
        const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
        const frame = document.querySelector('.frame').getBoundingClientRect();
        const boxes = Object.fromEntries([...document.querySelectorAll('[data-box]')].map(g => {
            const b = g.getBoundingClientRect();
            return [g.dataset.box, [b.left, b.top, b.right, b.bottom]];
        }));
        return {content: [r.left + (r.width - w) / 2, r.top + (r.height - h) / 2, w, h],
                frame: [frame.left, frame.top, frame.width, frame.height], natural: [img.naturalWidth, img.naturalHeight],
                boxes};
    }""")
    cx, cy, cw, ch = geometry["content"]
    fx, fy, fw, fh = geometry["frame"]
    nw, nh = geometry["natural"]
    # UI-13: the frame has the photo's aspect, and no pixel of the photo is cropped.
    assert abs((fw / fh) / (nw / nh) - 1) <= 0.005
    assert cx >= fx - 0.5 and cy >= fy - 0.5 and cx + cw <= fx + fw + 0.5 and cy + ch <= fy + fh + 0.5
    assert len(payload["findings"]) == len(rects)
    for finding in payload["findings"]:
        colour = next(c for c, (role, _) in MarkerBackend().markers.items()
                      if CFG.word(role) == finding["anchor"]["item"])
        x, y, w, h = rects[colour]
        expected = [cx + x / width * cw, cy + y / height * ch, cx + (x + w) / width * cw, cy + (y + h) / height * ch]
        actual = geometry["boxes"][finding["id"]]
        assert all(abs(a - e) <= 1 for a, e in zip(actual, expected, strict=True)), (finding["id"], actual, expected)


def test_scene_lasts_one_pass(served_app, page_at, photos):
    app = served_app()
    page = page_at((1366, 768))
    open_ready(page, app)
    scan_upload(page, photos["person"][0])
    gap = mark_gap(page, "scan-start", "first-box")
    assert 1500 <= gap <= 1500 + 200 + 100, gap


def test_slow_response_extends_scene(served_app, page_at, photos):
    app = served_app(backend_factory=lambda cfg: MarkerBackend(delay=2.2))
    page = page_at((1366, 768))
    open_ready(page, app)
    page.set_input_files("#upload-input", str(photos["person"][0]))
    page.wait_for_function("() => performance.getEntriesByName('scan-start').length > 0", timeout=10000)
    page.wait_for_function("() => performance.now() - performance.getEntriesByName('scan-start').at(-1).startTime >= 1800")
    band = page.evaluate("""() => {
        const band = document.querySelector('.scene-band');
        const r = band.getBoundingClientRect(), f = document.querySelector('.frame').getBoundingClientRect();
        return {opacity: getComputedStyle(document.querySelector('.scene')).opacity,
                running: band.getAnimations().some(a => a.playState === 'running'),
                inside: r.bottom > f.top && r.top < f.bottom};
    }""")
    assert band == {"opacity": "1", "running": True, "inside": True}
    page.wait_for_selector('[data-box="01"]', state="attached", timeout=10000)
    gap = mark_gap(page, "scan-start", "first-box")
    assert gap <= 2200 + 150 + 200 + 150 + 100, gap


def test_scan_line_lists_vocabulary(served_app, page_at, photos):
    app = served_app(backend_factory=lambda cfg: MarkerBackend(delay=1.0))
    page = page_at((1366, 768))
    open_ready(page, app)
    vocabulary = page.evaluate("() => fetch('/api/config').then(r => r.json()).then(c => c.vocabulary)")
    page.set_input_files("#upload-input", str(photos["person"][0]))
    page.wait_for_function("() => performance.getEntriesByName('scan-start').length > 0", timeout=10000)
    line = text_of(page, "#stats")
    assert line.startswith(f"Scanning for {', '.join(vocabulary[:3])},"), line
    assert line.endswith("…") and line.count("…") == 1, line
    assert line == f"Scanning for {', '.join(vocabulary)}…"


def test_tag_text_format(served_app, page_at, photos):
    app = served_app()
    page = page_at((1366, 768))
    open_ready(page, app)
    finding = scan_upload(page, photos["person"][0])["findings"][0]
    text = text_of(page, '[data-tag="01"]')
    assert f"{finding['id']} {finding['category']}" in text
    anchor = f"{finding['anchor']['item'].capitalize()} {finding['confidence']}%"
    assert text == f"{finding['id']} {finding['category']} {anchor}"   # nothing else: no chips on tags (UI-16)


def test_forced_colors_keep_boxes_and_tags(served_app, page_at, photos):
    app = served_app()
    page = page_at((1366, 768))
    page.emulate_media(forced_colors="active")
    open_ready(page, app)
    scan_upload(page, photos["person"][0])
    colours = page.evaluate("""() => ({
        stroke: getComputedStyle(document.querySelector('[data-box="01"] .box-line')).stroke,
        dash: getComputedStyle(document.querySelector('[data-box="01"] .box-line')).strokeDasharray,
        tag: getComputedStyle(document.querySelector('[data-tag="01"]')).backgroundColor,
        text: getComputedStyle(document.querySelector('[data-tag="01"]')).color})""")
    assert colours == {"stroke": "rgb(192, 57, 43)", "dash": "8px, 4px", "tag": "rgb(192, 57, 43)",
                       "text": "rgb(255, 255, 255)"}
