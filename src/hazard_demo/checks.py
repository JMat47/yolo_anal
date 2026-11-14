"""Preflight commands: `check` (offline, every demo photo against demo/expected.json) and `setup` (one-time)."""

import importlib.metadata
import platform
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from time import perf_counter
from typing import TextIO

from PIL import Image

from hazard_demo.config import Config, DemoPhoto, load_expected, load_photos
from hazard_demo.detector import Backend, UltralyticsBackend, WeightsError, device_label, sha_path, verify_weights
from hazard_demo.imaging import ImageRejected, ImageStore, PreparedImage, default_store_root
from hazard_demo.offline import block_network
from hazard_demo.paths import FONT_FILES, FONTS_DIR, display_path
from hazard_demo.rules import Evaluation, evaluate

SHARP_EDGE = 1600   # UI-11: demo photos are at least this long on the long edge
CUDA_FIXES = (
    "1. Install or update the NVIDIA driver (Game Ready or Studio, 2024 or newer)",
    "2. uv sync --reinstall-package torch --reinstall-package torchvision",
    '3. Confirm: uv run python -c "import torch; print(torch.version.cuda, torch.cuda.is_available())"',
)


def flagged_keys(ev: Evaluation) -> list[str]:
    return sorted({f"trip:{f.anchor.role}" if f.hazard == "trip" else f.hazard for f in ev.findings})


class _Report:
    def __init__(self, out: TextIO):
        self.out = out
        self.failed = False

    def item(self, status: str, label: str, detail: str) -> None:
        self.failed |= status == "FAIL"
        self.line(f"{status:<5}{label:<13}{detail}")

    def photo(self, status: str, photo: DemoPhoto, detail: str) -> None:
        self.failed |= status == "FAIL"
        tag = "  (check only)" if not photo.strip else ""
        self.line(f"{status:<6}{photo.id:<16}{photo.scene:<20}{detail}{tag}")

    def line(self, text: str) -> None:
        print(text, file=self.out, flush=True)


def run_check(cfg: Config, *, backend_factory: Callable[[Config], Backend], photos: Sequence[DemoPhoto],
              expected: Mapping[str, list[str]], fonts_dir: Path, out: TextIO) -> int:
    report = _Report(out)
    _check_dependencies(report)
    _check_weights(cfg, report)
    counts = {"PASS": 0, "FAIL": 0, "TODO": 0}
    with block_network() as attempts:
        backend = _load_backend(cfg, backend_factory, report)
        _check_fonts(fonts_dir, report)
        prepared = _prepare_photos(photos, report)
        if backend is not None:
            _check_device(backend, prepared, report)
        for photo in photos:
            counts[_run_photo(photo, prepared.get(photo.id), backend, expected, cfg, report)] += 1
    for target in dict.fromkeys(attempts):
        report.item("FAIL", "network", f"tried to reach {target}")
    report.line(f"check: {counts['PASS']} passed, {counts['FAIL']} failed, {counts['TODO']} without expectation")
    return 1 if report.failed else 0


def run_setup(cfg: Config, *, out: TextIO) -> int:
    report = _Report(out)
    import torch

    report.item("OK", "python", platform.python_version())
    report.item("OK", "torch", f"{torch.__version__} (CUDA {torch.version.cuda or 'none'})")
    if sys.platform == "win32":
        _check_cuda(torch, report)
    code = run_check(cfg, backend_factory=UltralyticsBackend, photos=load_photos(), expected=load_expected(),
                     fonts_dir=FONTS_DIR, out=out)
    return 1 if report.failed or code else 0


def _check_dependencies(report: _Report) -> None:
    try:
        import torch

        parts = [f"python {platform.python_version()}", f"torch {torch.__version__} (CUDA {torch.version.cuda or 'none'})"]
        parts += [f"{name} {importlib.metadata.version(name)}" for name in ("ultralytics", "fastapi", "pillow")]
    except (ImportError, importlib.metadata.PackageNotFoundError) as exc:
        report.item("FAIL", "dependencies", f"{exc}. Run: uv sync")
        return
    report.item("OK", "dependencies", ", ".join(parts))


def _check_weights(cfg: Config, report: _Report) -> None:
    try:
        verify_weights(cfg)
    except WeightsError as exc:
        report.item("FAIL", "weights", str(exc))
        return
    digest = sha_path(cfg).read_text(encoding="utf-8").strip()
    report.item("OK", "weights", f"sha256 {digest[:12]}… {display_path(cfg.model_file)}")


def _load_backend(cfg: Config, backend_factory: Callable[[Config], Backend], report: _Report) -> Backend | None:
    try:
        backend = backend_factory(cfg)
    except Exception as exc:   # a preflight reports every failure instead of stopping at the first
        report.item("FAIL", "vocabulary", f"model did not load: {exc}")
        return None
    if list(backend.names) != cfg.vocabulary:
        report.item("FAIL", "vocabulary", f"model has {backend.names}, config has {cfg.vocabulary}. "
                                          "On the Mac: uv run --group build hazard-demo build-model")
        return None
    report.item("OK", "vocabulary", f"{len(cfg.vocabulary)} prompts, same as config: {', '.join(cfg.vocabulary)}")
    return backend


def _check_fonts(fonts_dir: Path, report: _Report) -> None:
    problems = []
    for name in FONT_FILES:
        path = fonts_dir / name
        if not path.is_file():
            problems.append(f"missing {name}")
        elif path.read_bytes()[:4] != b"wOF2":
            problems.append(f"not a WOFF2 file: {name}")
    where = display_path(fonts_dir)
    if problems:
        report.item("FAIL", "fonts", f"{'; '.join(problems)} (in {where})")
    else:
        report.item("OK", "fonts", f"{len(FONT_FILES)} files in {where}")


def _prepare_photos(photos: Sequence[DemoPhoto], report: _Report) -> dict[str, PreparedImage]:
    store = ImageStore(default_store_root().with_name("site-hazard-demo-check"))
    prepared = {}
    for photo in photos:
        try:
            image = store.put(photo.file.read_bytes(), photo.file.name)
        except OSError:
            report.item("FAIL", "photo", f"{photo.id:<16}cannot read {display_path(photo.file)}")
            continue
        except ImageRejected as exc:
            report.item("FAIL", "photo", f"{photo.id:<16}{display_path(photo.file)} rejected: {exc}")
            continue
        size = f"{photo.id:<16}{image.width}x{image.height}"
        if max(image.width, image.height) < SHARP_EDGE:
            report.item("WARN", "photo", f"{size}, long edge under {SHARP_EDGE} px, so it looks soft on screen")
        else:
            report.item("OK", "photo", size)
        prepared[photo.id] = image
    return prepared


def _check_device(backend: Backend, prepared: Mapping[str, PreparedImage], report: _Report) -> None:
    """Reports the device and warms the model up twice, as the server does, so photo times are steady."""
    try:
        label = device_label(backend.device)
        first = next(iter(prepared.values()), None)
        img = _load(first.path) if first else Image.new("RGB", (1280, 960), (128, 128, 128))
        for _ in range(2):
            backend.predict(img)
    except Exception as exc:
        report.item("FAIL", "device", f"{backend.device}: warm-up failed: {exc}")
        return
    report.item("OK", "device", label)


def _run_photo(photo: DemoPhoto, image: PreparedImage | None, backend: Backend | None,
               expected: Mapping[str, list[str]], cfg: Config, report: _Report) -> str:
    if backend is None or image is None:
        report.photo("FAIL", photo, f"not run: {'the model did not load' if backend is None else 'photo did not load'}")
        return "FAIL"
    try:
        img = _load(image.path)
        start = perf_counter()
        dets = backend.predict(img)
        ms = (perf_counter() - start) * 1000
    except Exception as exc:
        report.photo("FAIL", photo, f"error: {exc}")
        return "FAIL"
    keys = flagged_keys(evaluate(dets, cfg))
    detail = f"{ms:>6.0f} ms  flagged: {_keys(keys)}"
    if photo.id not in expected:
        status = "TODO"
    elif keys == expected[photo.id]:
        status = "PASS"
    else:
        status = "FAIL"
        detail += f"  expected: {_keys(expected[photo.id])}"
    report.photo(status, photo, detail)
    return status


def _load(path: Path) -> Image.Image:
    with Image.open(path) as im:
        return im.convert("RGB")


def _keys(keys: Sequence[str]) -> str:
    return ", ".join(keys) or "none"


def _check_cuda(torch, report: _Report) -> None:
    if not torch.cuda.is_available():
        rule = "=" * 72
        report.line(rule)
        report.item("FAIL", "cuda", "CUDA is not available, so the model would run on the CPU. Fix:")
        for step in CUDA_FIXES:
            report.line(" " * 18 + step)
        report.line(rule)
        return
    arch = torch.cuda.get_arch_list()
    if "sm_75" not in arch:
        report.item("FAIL", "cuda", f"this torch build has no sm_75 kernels for the RTX 2060 (it has {', '.join(arch)}): "
                                    "switch the PyTorch index to cu126 in pyproject.toml and run `uv lock`")
        return
    try:
        a = torch.randn(512, 512, device="cuda:0")
        (a @ a).sum().item()
    except Exception as exc:
        report.item("FAIL", "cuda", f"a 512x512 matmul on cuda:0 failed: {exc}")
        return
    report.item("OK", "cuda", f"{torch.cuda.get_device_name(0)}: sm_75 kernels present, 512x512 matmul ran")
