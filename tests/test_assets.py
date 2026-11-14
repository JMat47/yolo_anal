import json

from hazard_demo.config import load_expected, load_photos
from hazard_demo.paths import DEMO_DIR, FONT_FILES, FONTS_DIR

OFL_FILES = ("OFL-atkinson-hyperlegible-next.txt", "OFL-atkinson-hyperlegible-mono.txt", "OFL-barlow-condensed.txt")


def test_photos_json_matches_files():
    photos = load_photos()
    assert [p.id for p in photos] == ["noppe-1", "opening-open-1", "materials-3", "stair-railed-1", "ppe-ok-1",
                                      "clean-floor-1", "clean-floor-2"]
    assert all(p.file.is_file() and p.file.parent == DEMO_DIR / "photos" for p in photos)
    assert photos[0].id == "noppe-1"
    assert all(p.scene for p in photos)
    assert [p.id for p in photos if not p.strip] == ["stair-railed-1", "clean-floor-1", "clean-floor-2"]


def test_fonts_bundled():
    for name in FONT_FILES:
        data = (FONTS_DIR / name).read_bytes()
        assert data[:4] == b"wOF2", name
        assert len(data) < 60 * 1024, name
    for name in OFL_FILES:
        assert (FONTS_DIR / name).is_file(), name


def test_expected_json_loads():
    assert isinstance(load_expected(), dict)


def test_check_only_flag(tmp_path):
    (tmp_path / "photos").mkdir()
    path = tmp_path / "photos.json"
    path.write_text(json.dumps([{"id": "a", "file": "a.jpg", "scene": "Room"},
                                {"id": "b", "file": "b.jpg", "scene": "Stair", "strip": False}]), encoding="utf-8")
    a, b = load_photos(path)
    assert (a.strip, b.strip) == (True, False)
    assert b.file == tmp_path / "photos" / "b.jpg"
