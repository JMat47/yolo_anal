"""In-browser test harness: the real app served by uvicorn in a thread, and Playwright driving the installed Chrome."""

import socket
import threading
import time
import uuid
from dataclasses import replace

import pytest

pytest.importorskip("playwright")

import uvicorn  # noqa: E402
from markers import MarkerBackend  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

from hazard_demo.api import create_app  # noqa: E402
from hazard_demo.config import load_config  # noqa: E402
from hazard_demo.imaging import ImageStore  # noqa: E402


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class ServedApp:
    """One app on a fixed port. stop() and start() restart it there, with the same boot id unless told otherwise."""

    def __init__(self, make_app, port: int, boot_id: str):
        self._make_app = make_app
        self.port = port
        self.url = f"http://127.0.0.1:{port}"
        self.boot_id = boot_id
        self._server: uvicorn.Server | None = None
        self._thread: threading.Thread | None = None

    def start(self, boot_id: str | None = None) -> "ServedApp":
        self.boot_id = boot_id or self.boot_id
        config = uvicorn.Config(self._make_app(self.boot_id), host="127.0.0.1", port=self.port,
                                log_level="warning", lifespan="on")
        self._server = uvicorn.Server(config)
        self._thread = threading.Thread(target=self._server.run, name=f"uvicorn-{self.port}", daemon=True)
        self._thread.start()
        deadline = time.monotonic() + 15
        while not self._server.started:
            if not self._thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError(f"test server on port {self.port} did not start")
            time.sleep(0.02)
        return self

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
            self._thread.join(10)
            self._server = None


@pytest.fixture
def served_app(tmp_path):
    """served_app(cfg_overrides, backend_factory, photos=, store=, boot_id=) -> a started ServedApp."""
    handles: list[ServedApp] = []

    def serve(cfg_overrides: dict | None = None, backend_factory=None, *, photos=None, store=None,
              boot_id: str | None = None) -> ServedApp:
        cfg = replace(load_config(), **(cfg_overrides or {}))
        factory = backend_factory or (lambda cfg: MarkerBackend())
        root = tmp_path / f"store-{len(handles)}"

        def make_app(boot: str):
            return create_app(cfg, backend_factory=factory, store=store or ImageStore(root), photos=photos,
                              boot_id=boot)
        handle = ServedApp(make_app, free_port(), boot_id or uuid.uuid4().hex)
        handles.append(handle)
        return handle.start()

    yield serve
    for handle in handles:
        handle.stop()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as playwright:
        chrome = playwright.chromium.launch(channel="chrome")
        yield chrome
        chrome.close()


@pytest.fixture
def page_at(browser):
    """page_at((width, height), reduced_motion=None) -> a fresh page in its own context."""
    contexts = []

    def open_page(viewport=(1366, 768), reduced_motion: str | None = None):
        width, height = viewport
        context = browser.new_context(viewport={"width": width, "height": height},
                                      reduced_motion=reduced_motion or "no-preference")
        contexts.append(context)
        return context.new_page()

    yield open_page
    for context in contexts:
        context.close()
