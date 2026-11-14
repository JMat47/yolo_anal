import io
import re
import socket
import threading
import time
from dataclasses import replace

import pytest
from conftest import FakeBackend
from fastapi.testclient import TestClient
from PIL import Image

from hazard_demo import cli
from hazard_demo.api import create_app
from hazard_demo.config import DemoPhoto, load_config, load_photos
from hazard_demo.detector import WeightsError
from hazard_demo.imaging import MAX_BYTES, ImageStore
from hazard_demo.paths import FONT_FILES
from hazard_demo.rules import Detection

CFG = load_config()
CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'"
PERSON = Detection("person", 0.91, (100.0, 50.0, 200.0, 300.0))


def jpeg(size=(640, 480), colour=(90, 90, 90)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, colour).save(buf, "JPEG")
    return buf.getvalue()


def wait_state(client, *states, timeout=5.0) -> dict:
    deadline = time.monotonic() + timeout
    while True:
        health = client.get("/health").json()
        if health["state"] in states or time.monotonic() > deadline:
            return health
        time.sleep(0.02)


@pytest.fixture
def make_client(tmp_path):
    """Builds a TestClient around create_app, enters it, and waits until the model reports `ready`."""
    clients = []

    def make(fake=None, *, factory=None, photos=None, wait=True):
        fake = fake or FakeBackend()
        app = create_app(CFG, backend_factory=factory or (lambda cfg: fake),
                         store=ImageStore(tmp_path / "s"), photos=photos)
        client = TestClient(app)
        client.__enter__()
        clients.append(client)
        if wait:
            assert wait_state(client, "ready", "error")["state"] == "ready"
        return client

    yield make
    for client in clients:
        client.__exit__(None, None, None)


def upload(client, data: bytes, name: str = "photo.jpg"):
    return client.post("/api/prepare", files={"file": (name, data, "application/octet-stream")})


def scanned_image_id(client) -> str:
    return upload(client, jpeg()).json()["id"]


def test_health_ready_after_warmup(make_client):
    health = make_client().get("/health").json()
    assert health["state"] == "ready"
    assert re.fullmatch(r"[0-9a-f]{32}", health["boot_id"])


def test_health_error_when_weights_bad(make_client, capsys):
    def factory(cfg):
        raise WeightsError("Model file missing: models/yolov8s-worldv2.pt. Re-clone the repo")
    client = make_client(factory=factory, wait=False)
    health = wait_state(client, "error")
    assert health["state"] == "error"
    assert "models/yolov8s-worldv2.pt" in health["message"]
    deadline = time.monotonic() + 2
    err = ""
    while "models/yolov8s-worldv2.pt" not in err and time.monotonic() < deadline:
        err += capsys.readouterr().err
        time.sleep(0.02)
    assert "\033[31m" in err and "models/yolov8s-worldv2.pt" in err   # loud, in red, in the server window


def test_boot_id_can_be_fixed(tmp_path):
    app = create_app(CFG, backend_factory=lambda cfg: FakeBackend(), store=ImageStore(tmp_path / "s"),
                     boot_id="a" * 32)
    with TestClient(app) as client:
        assert client.get("/health").json()["boot_id"] == "a" * 32


def test_csp_header_exact(make_client):
    client = make_client()
    for path in ("/", "/health", "/api/photos"):
        response = client.get(path)
        assert response.headers["content-security-policy"] == CSP, path
        assert response.headers["cache-control"] == "no-cache", path


def test_config_endpoint(make_client):
    body = make_client().get("/api/config").json()
    assert body == {"vocabulary": CFG.vocabulary, "threshold_pct": 25, "min_scene_ms": 1500, "timeout_ms": 20000,
                    "max_findings": 3, "max_upload_bytes": 26214400, "version": "v0.1"}


def test_photos_listed_with_prepared_image(make_client):
    photos = make_client().get("/api/photos").json()
    first = photos[0]
    assert (first["id"], first["scene"]) == ("noppe-1", "Tulaghi site")
    assert first["image"]["url"].startswith("/api/images/")
    assert [p["id"] for p in photos] == [p.id for p in load_photos() if p.strip]


def test_missing_photo_listed_as_missing(make_client, tmp_path):
    photos = [DemoPhoto("x", tmp_path / "nope.jpg", "X"), *load_photos()[:2]]
    listed = make_client(photos=photos).get("/api/photos").json()
    assert listed[0] == {"id": "x", "scene": "X", "file": "nope.jpg", "missing": True}
    assert [p["id"] for p in listed[1:]] == [p.id for p in photos[1:]]
    assert all("image" in p for p in listed[1:])


def test_check_only_photos_not_listed(make_client):
    demo = load_photos()
    photos = [demo[0], replace(demo[1], strip=False)]
    listed = make_client(photos=photos).get("/api/photos").json()
    assert [p["id"] for p in listed] == [demo[0].id]


def test_warmup_uses_first_prepared_strip_photo(make_client, tmp_path):
    seen = []

    class Recording(FakeBackend):
        def predict(self, img):
            seen.append(img.size)
            return super().predict(img)
    demo = load_photos()
    photos = [DemoPhoto("x", tmp_path / "nope.jpg", "X"), replace(demo[0], strip=False), demo[1]]
    make_client(Recording(), photos=photos)
    with Image.open(demo[1].file) as im:
        assert seen == [im.size, im.size]


def test_prepare_upload_ok(make_client):
    name = "IMG-20241102-WA0042 site visit.jpeg"
    response = upload(make_client(), jpeg((800, 600)), name)
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == name
    assert (body["width"], body["height"]) == (800, 600)
    assert body["url"] == f"/api/images/{body['id']}.jpg"


def test_prepare_heic_415(make_client):
    heic = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 64
    response = upload(make_client(), heic, "IMG_0001.HEIC")
    assert response.status_code == 415
    assert response.json() == {"error": {"kind": "unsupported", "format": "heic"}}


def test_prepare_too_large_413(make_client):
    big = b"\xff\xd8\xff" + b"\x00" * MAX_BYTES
    response = upload(make_client(), big, "big.jpg")
    assert response.status_code == 413
    error = response.json()["error"]
    assert (error["kind"], error["limit"], error["measure"]) == ("too-large", "25 MB", "bytes")


def test_prepare_too_many_pixels_413(make_client):
    buf = io.BytesIO()
    Image.new("L", (8000, 6400)).save(buf, "PNG")   # 51.2 MP, tiny file
    error = upload(make_client(), buf.getvalue(), "huge.png").json()["error"]
    assert (error["kind"], error["limit"], error["measure"]) == ("too-large", "50 MP", "pixels")


def test_prepare_too_small_422(make_client):
    response = upload(make_client(), jpeg((100, 100)), "tiny.jpg")
    assert response.status_code == 422
    assert response.json()["error"]["kind"] == "too-small"


def test_prepare_unreadable_422(make_client):
    response = upload(make_client(), b"\xff\xd8\xff" + b"not a jpeg" * 20, "broken.jpg")
    assert response.status_code == 422
    assert response.json() == {"error": {"kind": "unreadable"}}


def test_scan_payload_and_seq(make_client):
    client = make_client(FakeBackend([PERSON]))
    image_id = scanned_image_id(client)
    response = client.post("/api/scan", json={"image_id": image_id, "seq": 7})
    assert response.status_code == 200
    payload = response.json()
    assert payload["seq"] == 7
    assert payload["image"]["id"] == image_id
    assert [(f["id"], f["hazard"], f["confidence"]) for f in payload["findings"]] == [("01", "no_ppe", 91)]
    assert payload["model"] == "fake-model" and payload["device"] == "cpu"


def test_scan_unknown_image_404(make_client):
    response = make_client().post("/api/scan", json={"image_id": "0123456789abcdef", "seq": 1})
    assert response.status_code == 404
    assert response.json() == {"error": {"kind": "unreadable"}}


def test_scan_before_ready_503(make_client):
    gate = threading.Event()

    def slow_factory(cfg):
        gate.wait(5)
        return FakeBackend()
    client = make_client(factory=slow_factory, wait=False)
    try:
        image_id = scanned_image_id(client)
        response = client.post("/api/scan", json={"image_id": image_id, "seq": 1})
        assert response.status_code == 503
        assert response.json() == {"error": {"kind": "not-ready"}}
    finally:
        gate.set()


def test_scan_superseded_409(make_client):
    client = make_client(FakeBackend([PERSON], delay=0.5))
    image_id = scanned_image_id(client)
    results = {}

    def scan(seq):
        results[seq] = client.post("/api/scan", json={"image_id": image_id, "seq": seq})
    threads = []
    for seq in (1, 2, 3):
        threads.append(threading.Thread(target=scan, args=(seq,)))
        threads[-1].start()
        time.sleep(0.05)
    for t in threads:
        t.join(5)
    assert [results[s].status_code for s in (1, 2, 3)] == [200, 409, 200]
    assert results[2].json() == {"error": {"kind": "superseded"}}
    assert results[3].json()["seq"] == 3


def test_scan_model_error_500_without_traceback(make_client, caplog):
    fake = FakeBackend()
    client = make_client(fake)
    image_id = scanned_image_id(client)
    fake.fail = True
    response = client.post("/api/scan", json={"image_id": image_id, "seq": 1})
    assert response.status_code == 500
    assert response.json() == {"error": {"kind": "model-error", "detail": "fake backend failure"}}
    assert "Traceback" not in response.text
    logged = [r for r in caplog.records if r.name == "hazard_demo" and r.exc_info]
    assert len(logged) == 1 and image_id in logged[0].getMessage()   # the traceback goes to the log, with the id


def test_image_served_as_jpeg(make_client):
    client = make_client()
    image = client.get("/api/photos").json()[0]["image"]
    response = client.get(image["url"])
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.content[:3] == b"\xff\xd8\xff"
    assert client.get("/api/images/0123456789abcdef.jpg").status_code == 404


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def run_env(monkeypatch):
    """Lets `main(["run", …])` run without a model, a server or a browser."""
    monkeypatch.setenv("YOLO_OFFLINE", "true")       # main() sets these; monkeypatch restores them afterwards
    monkeypatch.setenv("YOLO_AUTOINSTALL", "false")
    calls = {}

    def use_port(port):
        monkeypatch.setattr(cli, "load_config", lambda: replace(CFG, port=port))
    monkeypatch.setattr(cli.uvicorn, "run", lambda app, **kwargs: calls.update(kwargs))
    monkeypatch.setattr(cli, "open_browser_when_up", lambda port: calls.setdefault("browser", port))
    monkeypatch.setattr(cli, "_log_to_console", lambda: None)   # its handler would outlive this test's stderr
    use_port(free_port())
    return calls, use_port


def test_run_warns_when_font_missing(run_env, monkeypatch, tmp_path, capsys):
    calls, _ = run_env
    monkeypatch.setattr(cli, "FONTS_DIR", tmp_path)
    assert cli.main(["run", "--no-browser"]) == 0
    err = capsys.readouterr().err
    for name in FONT_FILES:
        assert f"Missing font {tmp_path / name}. Re-clone the repo." in err
    assert "\033[31m" in err
    assert calls["host"] == "127.0.0.1"   # it keeps going, so the page can show its font banner
    assert "browser" not in calls


def test_run_prints_url_and_serves_on_loopback(run_env, capsys):
    calls, use_port = run_env
    use_port(port := free_port())
    assert cli.main([]) == 0                  # run is the default command
    out = capsys.readouterr().out
    assert f"Site Hazard Detection: http://127.0.0.1:{port}  (Ctrl+C to stop)" in out
    assert (calls["host"], calls["port"]) == ("127.0.0.1", port)
    assert calls["browser"] == port


def test_run_exits_when_port_busy(run_env, capsys):
    _, use_port = run_env
    with socket.socket() as held:
        held.bind(("127.0.0.1", 0))
        held.listen()
        port = held.getsockname()[1]
        use_port(port)
        assert cli.main(["run", "--no-browser"]) == 1
    err = capsys.readouterr().err
    assert (f"Port {port} is already in use. Close the other copy of the demo, "
            "or change server.port in config/hazards.yaml.") in err


def test_browser_opens_once_the_port_answers(monkeypatch):
    opened = []
    monkeypatch.setattr(cli.webbrowser, "open", opened.append)
    with socket.socket() as server:
        server.bind(("127.0.0.1", 0))
        port = server.getsockname()[1]
        thread = cli.open_browser_when_up(port, poll_s=0.02, give_up_s=5)
        time.sleep(0.15)
        assert opened == []          # nothing is listening yet: no "can't connect" page
        server.listen()
        thread.join(2)
    assert opened == [f"http://127.0.0.1:{port}"]
