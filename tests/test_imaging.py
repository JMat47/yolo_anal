import io

import pytest
from PIL import Image

from hazard_demo.imaging import MAX_BYTES, ImageRejected, ImageStore


def encode(img: Image.Image, fmt: str, **kw) -> bytes:
    buf = io.BytesIO()
    img.save(buf, fmt, **kw)
    return buf.getvalue()


@pytest.fixture
def store(tmp_path):
    return ImageStore(tmp_path / "store")


def rejected(store, data: bytes) -> ImageRejected:
    with pytest.raises(ImageRejected) as info:
        store.put(data, "upload")
    return info.value


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_accepts_jpeg_png_webp(store, fmt):
    image = store.put(encode(Image.new("RGB", (320, 240), (10, 120, 200)), fmt), f"photo.{fmt.lower()}")
    assert (image.width, image.height) == (320, 240)
    assert (image.original_width, image.original_height) == (320, 240)
    assert image.name == f"photo.{fmt.lower()}"
    assert image.to_json()["url"] == f"/api/images/{image.id}.jpg"


def test_heic_rejected(store):
    exc = rejected(store, b"\x00\x00\x00\x18ftypheic" + bytes(64))
    assert (exc.kind, exc.format) == ("unsupported", "heic")


def test_unknown_type_rejected(store):
    exc = rejected(store, b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n" + bytes(64))
    assert (exc.kind, exc.format) == ("unsupported", None)


def test_too_many_bytes(store):
    exc = rejected(store, b"\xff\xd8\xff" + bytes(MAX_BYTES - 2))
    assert (exc.kind, exc.limit, exc.value) == ("too-large", "25 MB", "25.0 MB")


def test_too_many_pixels(store):
    exc = rejected(store, encode(Image.new("1", (8000, 6400)), "PNG"))
    assert (exc.kind, exc.limit, exc.value) == ("too-large", "50 MP", "51.2 MP")


def test_too_small(store):
    exc = rejected(store, encode(Image.new("RGB", (100, 300)), "PNG"))
    assert (exc.kind, exc.limit, exc.value) == ("too-small", "128 px", "100 px")


def test_corrupt_jpeg_unreadable(store, tmp_path):
    exc = rejected(store, b"\xff\xd8\xff\xe0" + b"not really a jpeg" * 50)
    assert exc.kind == "unreadable"
    assert list((tmp_path / "store").iterdir()) == []


def test_exif_orientation_6_is_upright(store):
    img = Image.new("RGB", (400, 300), (255, 255, 255))
    img.paste((255, 0, 0), (0, 0, 100, 80))       # red block in the stored top-left
    exif = Image.Exif()
    exif[0x0112] = 6                               # rotate 90° clockwise to display
    prepared = store.put(encode(img, "JPEG", exif=exif.tobytes()), "portrait.jpg")
    assert (prepared.width, prepared.height) == (300, 400)
    assert (prepared.original_width, prepared.original_height) == (300, 400)
    with Image.open(prepared.path) as shown:
        r, g, b = shown.convert("RGB").getpixel((280, 40))
        assert r > 200 and g < 60 and b < 60, "red block should be top-right"
        assert shown.convert("RGB").getpixel((20, 40))[1] > 200, "top-left should be white"


def test_alpha_flattened_to_808080(store):
    prepared = store.put(encode(Image.new("RGBA", (200, 200), (255, 0, 0, 0)), "PNG"), "clear.png")
    with Image.open(prepared.path) as shown:
        assert all(abs(c - 128) <= 3 for c in shown.convert("RGB").getpixel((100, 100)))


def test_long_edge_capped(store):
    prepared = store.put(encode(Image.new("RGB", (4032, 3024), (90, 90, 90)), "JPEG"), "big.jpg")
    assert (prepared.width, prepared.height) == (2048, 1536)
    assert (prepared.original_width, prepared.original_height) == (4032, 3024)
    with Image.open(prepared.path) as saved:
        assert saved.format == "JPEG"
        assert saved.size == (2048, 1536)


def test_store_cleared_on_init(tmp_path):
    root = tmp_path / "store"
    root.mkdir()
    (root / "stray.jpg").write_bytes(b"old")
    ImageStore(root)
    assert root.is_dir()
    assert list(root.iterdir()) == []


def test_put_is_idempotent(store):
    data = encode(Image.new("RGB", (300, 200), (1, 2, 3)), "PNG")
    first = store.put(data, "a.png")
    second = store.put(data, "a.png")
    assert first.id == second.id
    assert len(first.id) == 16
    assert store.get(first.id) == second


def test_get_rejects_bad_ids(store):
    assert store.get("../x") is None
    assert store.get("ABC") is None
    assert store.get("0123456789abcdef") is None


def test_store_under_non_ascii_path(tmp_path):
    store = ImageStore(tmp_path / "Zoë My Demo")
    prepared = store.put(encode(Image.new("RGB", (300, 200)), "JPEG"), "Zoë’s photo.jpg")
    assert store.get(prepared.id) == prepared
    assert prepared.path.is_file()
    assert prepared.path.parent == tmp_path / "Zoë My Demo"
