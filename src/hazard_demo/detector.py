"""The model: weights check, the ultralytics backend, a one-at-a-time inference queue and the load lifecycle."""

import hashlib
import threading
import uuid
from collections.abc import Callable
from pathlib import Path
from time import perf_counter
from typing import Protocol, TypeVar

from PIL import Image

from hazard_demo.config import Config
from hazard_demo.paths import display_path
from hazard_demo.rules import Detection

T = TypeVar("T")
WEIGHTS_FIX = "Re-clone the repo, or run `git checkout -- models/`"
WARMUP_SIZE = (1280, 960)


class WeightsError(Exception):
    pass


class NotReady(Exception):
    pass


class Superseded(Exception):
    pass


class ModelError(Exception):
    pass


def sha_path(cfg: Config) -> Path:
    return cfg.model_file.with_name(cfg.model_file.name + ".sha256")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_weights(cfg: Config) -> None:
    model, pin = cfg.model_file, sha_path(cfg)
    if not model.is_file():
        raise WeightsError(f"Model file missing: {display_path(model)}. {WEIGHTS_FIX}")
    if not pin.is_file():
        raise WeightsError(f"Checksum file missing: {display_path(pin)}. {WEIGHTS_FIX}")
    expected = pin.read_text(encoding="utf-8").strip()
    actual = sha256_file(model)
    if actual != expected:
        raise WeightsError(f"Model file {display_path(model)} does not match {pin.name} "
                           f"(sha256 {actual[:12]}…, expected {expected[:12]}…). {WEIGHTS_FIX}")


class Backend(Protocol):
    name: str
    device: str
    names: list[str]

    def predict(self, img: Image.Image) -> list[Detection]: ...


def pick_device(pref: str) -> str:
    if pref != "auto":
        return pref
    import torch

    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def device_label(device: str) -> str:
    if device.startswith("cuda"):
        import torch

        return f"{device} {torch.cuda.get_device_name(torch.device(device))}"
    return device


class UltralyticsBackend:
    def __init__(self, cfg: Config):
        verify_weights(cfg)
        from ultralytics import YOLOWorld

        self._cfg = cfg
        self._roles = list(cfg.prompts)
        self.name = cfg.model_name
        self.device = pick_device(cfg.device)
        self._model = YOLOWorld(cfg.model_file)
        self.names = list(self._model.names.values())
        if self.names != cfg.vocabulary:
            raise WeightsError("Model vocabulary differs from config/hazards.yaml. "
                               "On the Mac: uv run --group build hazard-demo build-model")

    def predict(self, img: Image.Image) -> list[Detection]:
        # A PIL image, not numpy: ultralytics reads numpy arrays as BGR.
        result = self._model.predict(img, conf=self._cfg.conf_floor, imgsz=self._cfg.imgsz,
                                     device=self.device, verbose=False)[0]
        boxes = result.boxes
        return [Detection(self._roles[int(cls)], float(score), tuple(float(v) for v in box))
                for box, score, cls in zip(boxes.xyxy.tolist(), boxes.conf.tolist(), boxes.cls.tolist(), strict=True)]


class InferenceQueue:
    """One call runs at a time and at most one waits; a newer arrival supersedes the waiting call."""

    def __init__(self):
        self._cond = threading.Condition()
        self._running = False
        self._waiting: object | None = None

    def run(self, fn: Callable[[], T]) -> T:
        ticket = object()
        with self._cond:
            if self._running or self._waiting is not None:
                self._waiting = ticket
                self._cond.notify_all()
                while self._running and self._waiting is ticket:
                    self._cond.wait()
                if self._waiting is not ticket:
                    raise Superseded()
                self._waiting = None
            self._running = True
        try:
            return fn()
        finally:
            with self._cond:
                self._running = False
                self._cond.notify_all()


class ModelService:
    """Loads the backend in the background (loading → warming → ready | error) and serialises scans."""

    def __init__(self, cfg: Config, backend_factory: Callable[[Config], Backend], warmup_image: Path | None,
                 *, boot_id: str | None = None):
        self.cfg = cfg
        self.boot_id = boot_id or uuid.uuid4().hex   # fixed only by tests that restart a server on the same boot
        self._factory = backend_factory
        self._warmup_image = warmup_image
        self._queue = InferenceQueue()
        self._settled = threading.Event()
        self._state = "loading"
        self._message = ""
        self._backend: Backend | None = None
        self._device = ""

    def start(self) -> None:
        threading.Thread(target=self._load, name="model-loader", daemon=True).start()

    def wait_ready(self, timeout: float | None) -> bool:
        self._settled.wait(timeout)
        return self._state == "ready"

    def health(self) -> dict:
        backend = self._backend
        return {"state": self._state, "model": backend.name if backend else self.cfg.model_name,
                "device": self._device, "message": self._message, "boot_id": self.boot_id}

    def scan(self, image_path: Path) -> tuple[list[Detection], float]:
        backend = self._backend
        if self._state != "ready" or backend is None:
            raise NotReady(self._state)
        try:
            with Image.open(image_path) as im:
                img = im.convert("RGB")
        except OSError as exc:
            raise ModelError(f"cannot read {image_path.name}: {exc}") from exc

        def call() -> tuple[list[Detection], float]:
            start = perf_counter()
            try:
                dets = backend.predict(img)
            except Exception as exc:
                raise ModelError(str(exc) or type(exc).__name__) from exc
            return dets, (perf_counter() - start) * 1000

        return self._queue.run(call)

    def _load(self) -> None:
        try:
            backend = self._factory(self.cfg)
            self._backend, self._device = backend, device_label(backend.device)
            self._state = "warming"
            img = self._warmup()
            for _ in range(2):
                backend.predict(img)
            self._state = "ready"
        except Exception as exc:
            self._message = str(exc) or type(exc).__name__
            self._state = "error"
        finally:
            self._settled.set()

    def _warmup(self) -> Image.Image:
        if self._warmup_image is None:
            return Image.new("RGB", WARMUP_SIZE, (128, 128, 128))
        with Image.open(self._warmup_image) as im:
            return im.convert("RGB")
