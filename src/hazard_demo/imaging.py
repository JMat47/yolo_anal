"""Image preparation (checks, EXIF rotation, flatten, downscale) and the content-addressed store.

The prepared JPEG is the exact file both the model and the screen use, so boxes align.
"""

import hashlib
import io
import re
import shutil
import tempfile
import threading
import warnings
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Literal

from PIL import Image, ImageOps

MAX_BYTES = 25 * 1024 * 1024
MAX_PIXELS = 50_000_000
MIN_SIDE = 128
MAX_EDGE = 2048
JPEG_QUALITY = 90
FLATTEN = (128, 128, 128)

Format = Literal["jpeg", "png", "webp", "heic"]
_PIL_FORMATS = {"jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}
_HEIC_BRANDS = {b"heic", b"heix", b"hevc", b"mif1", b"msf1"}
_ID = re.compile(r"[0-9a-f]{16}")


class ImageRejected(Exception):
    def __init__(self, kind: Literal["unsupported", "too-large", "too-small", "unreadable"], *,
                 format: str | None = None, limit: str | None = None, value: str | None = None):
        self.kind = kind
        self.format = format
        self.limit = limit
        self.value = value
        detail = ", ".join(f"{k} {v}" for k, v in (("format", format), ("value", value), ("limit", limit)) if v)
        super().__init__(f"{kind} ({detail})" if detail else kind)


def sniff(data: bytes) -> Format | None:
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[4:8] == b"ftyp" and data[8:12] in _HEIC_BRANDS:
        return "heic"
    return None


@dataclass(frozen=True)
class PreparedImage:
    id: str
    path: Path
    width: int
    height: int
    original_width: int    # after EXIF rotation, before downscaling
    original_height: int
    name: str

    def to_json(self) -> dict:
        return {"id": self.id, "url": f"/api/images/{self.id}.jpg", "width": self.width, "height": self.height,
                "original_width": self.original_width, "original_height": self.original_height, "name": self.name}


def default_store_root() -> Path:
    return Path(tempfile.gettempdir()) / "site-hazard-demo"


class ImageStore:
    def __init__(self, root: Path):
        self.root = root
        shutil.rmtree(root, ignore_errors=True)
        root.mkdir(parents=True, exist_ok=True)   # a file another process holds open may survive the clear
        self._images: dict[str, PreparedImage] = {}
        self._lock = threading.Lock()

    def put(self, data: bytes, name: str) -> PreparedImage:
        image_id = hashlib.sha256(data).hexdigest()[:16]
        with self._lock:
            known = self._images.get(image_id)
            if known is None:
                jpeg, size, original = _prepare(data)
                path = self.root / f"{image_id}.jpg"
                path.write_bytes(jpeg)
                known = PreparedImage(image_id, path, *size, *original, name)
            elif known.name != name:
                known = replace(known, name=name)
            self._images[image_id] = known
            return known

    def get(self, image_id: str) -> PreparedImage | None:
        if not _ID.fullmatch(image_id):
            return None
        with self._lock:
            return self._images.get(image_id)


def _prepare(data: bytes) -> tuple[bytes, tuple[int, int], tuple[int, int]]:
    """Returns (JPEG bytes, prepared size, size after EXIF rotation) or raises ImageRejected."""
    if len(data) > MAX_BYTES:
        raise ImageRejected("too-large", limit="25 MB", value=f"{len(data) / (1024 * 1024):.1f} MB")
    fmt = sniff(data)
    if fmt is None or fmt == "heic":
        raise ImageRejected("unsupported", format=fmt)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", Image.DecompressionBombWarning)   # our own pixel limit applies below
            img = Image.open(io.BytesIO(data), formats=[_PIL_FORMATS[fmt]])
    except Image.DecompressionBombError:
        raise ImageRejected("too-large", limit="50 MP") from None
    except (OSError, SyntaxError, ValueError):
        raise ImageRejected("unreadable") from None
    with img:
        w, h = img.size
        if w * h > MAX_PIXELS:
            raise ImageRejected("too-large", limit="50 MP", value=f"{w * h / 1_000_000:.1f} MP")
        if min(w, h) < MIN_SIDE:
            raise ImageRejected("too-small", limit=f"{MIN_SIDE} px", value=f"{min(w, h)} px")
        try:
            img.load()
            upright = ImageOps.exif_transpose(img)
        except (OSError, SyntaxError, ValueError):
            raise ImageRejected("unreadable") from None
    original = upright.size
    rgb = _flatten(upright)
    rgb.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=JPEG_QUALITY)
    return buf.getvalue(), rgb.size, original


def _flatten(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        out = Image.new("RGB", rgba.size, FLATTEN)
        out.paste(rgba, mask=rgba.getchannel("A"))
        return out
    return img.convert("RGB")
