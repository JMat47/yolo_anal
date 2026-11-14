import threading
import time
from dataclasses import replace

import pytest
from conftest import FakeBackend
from PIL import Image

from hazard_demo.config import load_config
from hazard_demo.detector import (
    InferenceQueue,
    ModelError,
    ModelService,
    NotReady,
    Superseded,
    WeightsError,
    pick_device,
    sha256_file,
    sha_path,
    verify_weights,
)
from hazard_demo.rules import Detection

CFG = load_config()


@pytest.fixture
def photo(tmp_path):
    path = tmp_path / "photo.jpg"
    Image.new("RGB", (640, 480), (90, 90, 90)).save(path)
    return path


def ready_service(fake):
    svc = ModelService(CFG, lambda cfg: fake, None)
    svc.start()
    assert svc.wait_ready(5)
    return svc


def test_health_reaches_ready_after_two_warmups():
    fake = FakeBackend()
    svc = ready_service(fake)
    health = svc.health()
    assert health["state"] == "ready"
    assert (health["model"], health["device"], health["message"]) == ("fake-model", "cpu", "")
    assert health["boot_id"] == svc.boot_id and len(svc.boot_id) == 32
    assert fake.calls == 2


def test_health_error_when_factory_raises():
    def factory(cfg):
        raise WeightsError("missing models/x.pt …")
    svc = ModelService(CFG, factory, None)
    svc.start()
    assert svc.wait_ready(5) is False
    assert svc.health()["state"] == "error"
    assert "models/x.pt" in svc.health()["message"]


def test_scan_before_ready_raises_not_ready(photo):
    gate = threading.Event()
    fake = FakeBackend()

    def factory(cfg):
        gate.wait(5)
        return fake
    svc = ModelService(CFG, factory, None)
    svc.start()
    assert svc.health()["state"] == "loading"
    with pytest.raises(NotReady):
        svc.scan(photo)
    gate.set()
    assert svc.wait_ready(5)


def test_scan_times_model_call_only(photo):
    dets = [Detection("person", .9, (1, 2, 3, 4))]
    fake = FakeBackend(dets=dets, delay=.05)
    svc = ready_service(fake)
    found, ms = svc.scan(photo)
    assert found == dets == fake.dets
    assert 50 <= ms < 400


def test_scan_wraps_backend_error(photo):
    fake = FakeBackend()
    svc = ready_service(fake)
    fake.fail = True
    with pytest.raises(ModelError):
        svc.scan(photo)


def test_queue_supersedes_waiting():
    queue = InferenceQueue()
    release_a = threading.Event()
    order, errors = [], {}

    def job(name, gate=None):
        def fn():
            if gate:
                gate.wait(5)
            order.append(name)
        return fn

    def call(name, fn):
        try:
            queue.run(fn)
        except Superseded as exc:
            errors[name] = exc

    def wait_until(predicate):
        deadline = time.monotonic() + 2
        while not predicate():
            assert time.monotonic() < deadline, "timed out"
            time.sleep(.005)

    a = threading.Thread(target=call, args=("A", job("A", release_a)))
    a.start()
    wait_until(lambda: queue._running)                        # A holds the model
    b = threading.Thread(target=call, args=("B", job("B")))
    b.start()
    wait_until(lambda: queue._waiting is not None)            # B is the one waiting call
    c = threading.Thread(target=call, args=("C", job("C")))
    c.start()
    b.join(2)
    assert isinstance(errors.get("B"), Superseded)            # B is dropped while A still runs
    assert order == []
    release_a.set()
    for t in (a, c):
        t.join(2)
    assert order == ["A", "C"]
    assert set(errors) == {"B"}


def write_model(tmp_path, data=b"weights"):
    cfg = replace(CFG, model_file=tmp_path / "models" / "x.pt")
    cfg.model_file.parent.mkdir()
    cfg.model_file.write_bytes(data)
    return cfg


def test_verify_weights_missing(tmp_path):
    cfg = replace(CFG, model_file=tmp_path / "models" / "x.pt")
    with pytest.raises(WeightsError) as info:
        verify_weights(cfg)
    assert str(cfg.model_file) in str(info.value)
    assert "git checkout -- models/" in str(info.value)


def test_verify_weights_mismatch(tmp_path):
    cfg = write_model(tmp_path)
    sha_path(cfg).write_text("0" * 64 + "\n", encoding="utf-8")
    with pytest.raises(WeightsError) as info:
        verify_weights(cfg)
    assert str(cfg.model_file) in str(info.value)
    assert "git checkout -- models/" in str(info.value)


def test_verify_weights_ok(tmp_path):
    cfg = write_model(tmp_path)
    assert sha_path(cfg) == tmp_path / "models" / "x.pt.sha256"
    sha_path(cfg).write_text(sha256_file(cfg.model_file) + "\n", encoding="utf-8")
    verify_weights(cfg)


def test_pick_device_auto_falls_back_to_cpu(monkeypatch):
    import torch
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: False)
    assert pick_device("auto") == "cpu"
    assert pick_device("cuda:1") == "cuda:1"
