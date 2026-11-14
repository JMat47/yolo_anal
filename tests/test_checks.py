import io
import shutil
import socket
import sys

import pytest
import yaml
from conftest import FakeBackend

from hazard_demo import checks, cli
from hazard_demo.checks import flagged_keys, run_check, run_setup
from hazard_demo.config import DemoPhoto, load_config, load_expected, load_photos
from hazard_demo.paths import CONFIG_PATH
from hazard_demo.paths import FONT_FILES, FONTS_DIR, REPO_ROOT
from hazard_demo.rules import Detection, evaluate

CFG = load_config()
PHOTOS = load_photos()
CABLE = Detection("cable", .64, (10, 200, 120, 230))


@pytest.fixture
def fonts_dir(tmp_path):
    return shutil.copytree(FONTS_DIR, tmp_path / "fonts")


def check(fake, fonts_dir, expected=None, cfg=CFG, photos=PHOTOS):
    out = io.StringIO()
    code = run_check(cfg, backend_factory=lambda c: fake, photos=photos, expected=expected or {},
                     fonts_dir=fonts_dir, out=out)
    summary = out.getvalue().splitlines()[-1]
    assert summary.startswith("check: ")
    assert (" 0 failed" in summary) == (code == 0), "the last line must never read clean when check fails"
    return code, out.getvalue()


def test_check_passes_when_flagged_matches(fonts_dir):
    code, out = check(FakeBackend(dets=[CABLE]), fonts_dir, {p.id: ["trip:cable"] for p in PHOTOS})
    assert code == 0, out
    assert "PASS  site-ppe" in out
    assert f"check: {len(PHOTOS)} passed, 0 failed, 0 without expectation" in out


def test_check_fails_and_names_mismatch(fonts_dir):
    code, out = check(FakeBackend(dets=[CABLE]), fonts_dir, {"site-ppe": ["trip:uneven_floor"]})
    assert code == 1
    line = next(ln for ln in out.splitlines() if "site-ppe" in ln and "flagged" in ln)
    assert line.startswith("FAIL  site-ppe")
    assert "flagged: trip:cable" in line and "expected: trip:uneven_floor" in line


def test_check_todo_without_expectation(fonts_dir):
    code, out = check(FakeBackend(), fonts_dir)
    assert code == 0, out
    photo_lines = [ln for ln in out.splitlines() if "flagged" in ln]
    assert len(photo_lines) == len(PHOTOS)
    assert all(ln.startswith("TODO  ") and " ms  flagged: none" in ln for ln in photo_lines)
    assert f"check: 0 passed, 0 failed, {len(PHOTOS)} without expectation" in out


def test_check_fails_on_missing_font(fonts_dir):
    (fonts_dir / FONT_FILES[2]).unlink()
    code, out = check(FakeBackend(), fonts_dir)
    assert code == 1
    line = next(ln for ln in out.splitlines() if ln.startswith("FAIL fonts"))
    assert FONT_FILES[2] in line
    assert out.splitlines()[-1] == f"check: 0 passed, 1 failed, {len(PHOTOS)} without expectation"


def test_check_reports_network_attempt(fonts_dir):
    class PhoningHome(FakeBackend):
        def predict(self, img):
            socket.create_connection(("example.com", 443))
            return []
    code, out = check(PhoningHome(), fonts_dir)
    assert code == 1
    assert any(ln.startswith("FAIL network") and ln.endswith("tried to reach example.com:443")
               for ln in out.splitlines())
    assert "FAIL  site-ppe" in out


def test_check_marks_check_only_photos(fonts_dir):
    photos = [PHOTOS[0], DemoPhoto("control", PHOTOS[1].file, "Control", strip=False)]
    code, out = check(FakeBackend(), fonts_dir, photos=photos)
    control = next(ln for ln in out.splitlines() if ln.startswith("TODO  control"))
    assert control.endswith("(check only)")


def test_flagged_keys():
    ev = evaluate([Detection("debris", .5, (0, 600, 100, 650)), Detection("cable", .7, (300, 600, 400, 650)),
                   Detection("cable", .6, (700, 600, 800, 650)), Detection("person", .9, (100, 100, 200, 400)),
                   Detection("pile", .8, (900, 0, 999, 99))], CFG)
    assert flagged_keys(ev) == ["materials", "no_ppe", "trip:cable", "trip:debris"]


def test_check_from_non_ascii_root(tmp_path):
    root = tmp_path / "Zoë My Demo"
    shutil.copytree(REPO_ROOT / "config", root / "config")
    shutil.copytree(REPO_ROOT / "demo", root / "demo", ignore=shutil.ignore_patterns("incoming"))
    shutil.copytree(FONTS_DIR, root / "static" / "fonts")
    cfg = load_config(root / "config" / "hazards.yaml")
    photos = load_photos(root / "demo" / "photos.json")
    assert all(root in p.file.parents for p in photos)
    code, out = check(FakeBackend(), root / "static" / "fonts", load_expected(root / "demo" / "expected.json"),
                      cfg=cfg, photos=photos)
    assert code == 0, out


def test_cli_survives_cp1252_stdout(monkeypatch):
    monkeypatch.setenv("YOLO_OFFLINE", "true")       # main() sets these; monkeypatch restores them afterwards
    monkeypatch.setenv("YOLO_AUTOINSTALL", "false")
    raw = io.BytesIO()
    monkeypatch.setattr(sys, "stdout", io.TextIOWrapper(raw, encoding="cp1252"))

    def fake_check(cfg, **kwargs):
        print("Zoë … C:\\Users\\Zoë\\My Demo ✓", file=kwargs["out"])
        return 0
    monkeypatch.setattr(cli, "run_check", fake_check)
    assert cli.main(["check"]) == 0
    sys.stdout.flush()
    assert "Zoë … C:\\Users\\Zoë\\My Demo ✓" in raw.getvalue().decode("utf-8")


class FakeCuda:
    def __init__(self, available, arch=("sm_75", "sm_86")):
        self.available, self.arch = available, list(arch)

    def is_available(self):
        return self.available

    def get_arch_list(self):
        return self.arch


@pytest.fixture
def on_windows(monkeypatch):
    import torch
    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(checks, "run_check", lambda cfg, **kwargs: 0)

    def use(cuda):
        monkeypatch.setattr(torch, "cuda", cuda)
    return use


def test_setup_without_cuda_prints_fixes(on_windows):
    on_windows(FakeCuda(available=False))
    out = io.StringIO()
    assert run_setup(CFG, out=out) == 1
    text = out.getvalue()
    assert "FAIL cuda" in text
    assert "Install or update the NVIDIA driver (Game Ready or Studio, 2024 or newer)" in text
    assert "uv sync --reinstall-package torch --reinstall-package torchvision" in text
    assert 'uv run python -c "import torch; print(torch.version.cuda, torch.cuda.is_available())"' in text
    assert text.splitlines()[-1].startswith("setup: 1 failed")


def test_setup_without_sm75_says_switch_to_cu126(on_windows):
    on_windows(FakeCuda(available=True, arch=("sm_80", "sm_90")))
    out = io.StringIO()
    assert run_setup(CFG, out=out) == 1
    assert "switch the PyTorch index to cu126 in pyproject.toml and run `uv lock`" in out.getvalue()


def _broken_config(tmp_path):
    data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    del data["server"]["port"]
    path = tmp_path / "hazards.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return "load_config", path, "server.port"


def _broken_photos(tmp_path):
    path = tmp_path / "photos.json"
    path.write_text('[{"id": "a", "file": "a.jpg"}]', encoding="utf-8")
    return "load_photos", path, "scene"


def _broken_expected(tmp_path):
    path = tmp_path / "expected.json"
    path.write_text('{"site-ppe": "no_ppe"}', encoding="utf-8")
    return "load_expected", path, "expected.json"


@pytest.mark.parametrize("broken", [_broken_config, _broken_photos, _broken_expected],
                         ids=["config", "photos", "expected"])
def test_cli_reports_config_error_without_traceback(monkeypatch, capsys, tmp_path, broken):
    monkeypatch.setenv("YOLO_OFFLINE", "true")       # main() sets these; monkeypatch restores them afterwards
    monkeypatch.setenv("YOLO_AUTOINSTALL", "false")
    loader, path, key = broken(tmp_path)
    real = getattr(cli, loader)
    monkeypatch.setattr(cli, loader, lambda: real(path))
    monkeypatch.setattr(cli, "run_check", lambda cfg, **kwargs: 0)
    assert cli.main(["check"]) == 1
    err = capsys.readouterr().err.strip()
    assert err.startswith("FAIL config")
    assert key in err and "Traceback" not in err
