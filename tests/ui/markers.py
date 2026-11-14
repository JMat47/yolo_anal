"""Marker photos and a fake model that finds them: solid colour rectangles stand in for objects, so a test knows
exactly where every box must land."""

import time
from pathlib import Path

import numpy as np
from PIL import Image

from hazard_demo.config import load_config
from hazard_demo.rules import Detection

Colour = tuple[int, int, int]
Rect = tuple[int, int, int, int]   # x, y, w, h in the upright photo's pixels

RED, BLUE, GREEN, MAGENTA, CYAN = (230, 30, 30), (30, 30, 230), (30, 200, 30), (200, 30, 200), (30, 200, 200)
DEFAULT_MARKERS: dict[Colour, tuple[str, float]] = {
    RED: ("person", 0.91),
    BLUE: ("staircase", 0.81),
    GREEN: ("cable", 0.64),
    MAGENTA: ("pile", 0.77),
    CYAN: ("railing", 0.71),
}
BACKGROUND = (128, 128, 128)
TOLERANCE = 40


class MarkerBackend:
    """Stands in for the model: one detection per marker colour found in the photo, boxed tight to the marker."""

    name = "marker-model"
    device = "cpu"

    def __init__(self, markers: dict[Colour, tuple[str, float]] | None = None, delay: float = 0.0):
        self.markers = DEFAULT_MARKERS if markers is None else markers
        self.delay = delay
        self.calls = 0
        self.names = load_config().vocabulary

    def predict(self, img: Image.Image) -> list[Detection]:
        self.calls += 1
        if self.delay:
            time.sleep(self.delay)
        pixels = np.asarray(img.convert("RGB"), dtype=np.int16)
        dets = []
        for colour, (role, score) in self.markers.items():
            box = _marker_box(pixels, colour)
            if box is not None:
                dets.append(Detection(role, score, box))
        return dets


def _marker_box(pixels: np.ndarray, colour: Colour) -> tuple[float, float, float, float] | None:
    mask = (np.abs(pixels - np.array(colour, dtype=np.int16)) <= TOLERANCE).all(axis=-1)
    if mask.sum() < 64:
        return None
    # Rows and columns that are mostly marker: JPEG ringing and stray pixels don't stretch the box.
    cols, rows = mask.sum(axis=0), mask.sum(axis=1)
    xs = np.flatnonzero(cols >= cols.max() / 2)
    ys = np.flatnonzero(rows >= rows.max() / 2)
    return float(xs[0]), float(ys[0]), float(xs[-1] + 1), float(ys[-1] + 1)


def marker_photo(path: Path, size: tuple[int, int], rects: dict[Colour, Rect],
                 exif_orientation: int | None = None) -> Path:
    """Draws the markers on an upright photo of `size`. With orientation 6 the pixels are stored rotated a quarter
    turn back, the way a phone saves a portrait, so only EXIF rotation puts the markers where `rects` says."""
    upright = Image.new("RGB", size, BACKGROUND)
    for colour, (x, y, w, h) in rects.items():
        upright.paste(colour, (x, y, x + w, y + h))
    if exif_orientation is None:
        upright.save(path, "JPEG", quality=95)
        return path
    assert exif_orientation == 6, "only orientation 6 (a phone portrait) is drawn"
    stored = upright.transpose(Image.Transpose.ROTATE_90)
    exif = Image.Exif()
    exif[0x0112] = exif_orientation
    stored.save(path, "JPEG", quality=95, exif=exif)
    return path


Fractions = tuple[float, float, float, float]   # x, y, w, h as shares of the photo


def scaled_rects(size: tuple[int, int], fractions: dict[Colour, Fractions]) -> dict[Colour, Rect]:
    w, h = size
    return {colour: (round(fx * w), round(fy * h), round(fw * w), round(fh * h))
            for colour, (fx, fy, fw, fh) in fractions.items()}
