"""Dev-machine only: bakes the prompt vocabulary into the model file, so the demo never needs CLIP or a network."""

from pathlib import Path
from unittest import mock

from hazard_demo.config import Config
from hazard_demo.detector import sha256_file, sha_path
from hazard_demo.offline import configure_ultralytics
from hazard_demo.paths import MODELS_DIR


def build_model(cfg: Config, base: str | None = None) -> Path:
    configure_ultralytics(offline=False)
    from ultralytics import YOLOWorld
    from ultralytics.nn import text_model

    base_dir = MODELS_DIR / ".base"   # git-ignored: downloaded base weights and the CLIP text encoder
    base_dir.mkdir(parents=True, exist_ok=True)
    model = YOLOWorld(base_dir / (base or cfg.model_base))
    with mock.patch.object(text_model, "WEIGHTS_DIR", base_dir):
        model.set_classes(cfg.vocabulary)
    cfg.model_file.parent.mkdir(parents=True, exist_ok=True)
    model.save(cfg.model_file)
    sha_path(cfg).write_text(sha256_file(cfg.model_file) + "\n", encoding="utf-8", newline="\n")
    return cfg.model_file
