import pytest
from PIL import Image

from hazard_demo.config import load_config
from hazard_demo.detector import UltralyticsBackend, sha256_file, sha_path
from hazard_demo.offline import block_network, configure_ultralytics
from hazard_demo.paths import DEMO_DIR

pytestmark = pytest.mark.model

PHOTO = DEMO_DIR / "photos" / "site-ppe.jpg"


def test_built_model_loads_offline():
    cfg = load_config()
    configure_ultralytics(offline=True)
    with block_network() as attempts:
        backend = UltralyticsBackend(cfg)
        with Image.open(PHOTO) as im:
            dets = backend.predict(im.convert("RGB"))
    assert attempts == []
    assert backend.names == cfg.vocabulary
    assert dets, "the model should report at least one candidate at conf_floor"
    assert all(d.role in cfg.prompts for d in dets)


def test_sha_file_matches():
    cfg = load_config()
    assert sha_path(cfg).read_text(encoding="utf-8").strip() == sha256_file(cfg.model_file)
