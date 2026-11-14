import time

from hazard_demo.config import load_config


class FakeBackend:
    """Stands in for UltralyticsBackend: returns fixed detections and counts its calls."""

    name = "fake-model"
    device = "cpu"

    def __init__(self, dets=(), delay=0.0, fail=False):
        self.dets = list(dets)
        self.delay = delay
        self.fail = fail
        self.calls = 0
        self.names = load_config().vocabulary

    def predict(self, img):
        self.calls += 1
        if self.delay:
            time.sleep(self.delay)
        if self.fail:
            raise RuntimeError("fake backend failure")
        return list(self.dets)
