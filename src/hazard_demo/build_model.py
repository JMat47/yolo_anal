"""Dev-machine only: bakes the prompt vocabulary into the model file, so the demo never needs a text encoder or a network."""

from pathlib import Path
from unittest import mock

from hazard_demo.config import Config
from hazard_demo.detector import sha256_file, sha_path
from hazard_demo.offline import configure_ultralytics
from hazard_demo.paths import MODELS_DIR


def build_model(cfg: Config, base: str | None = None) -> Path:
    configure_ultralytics(offline=False)
    from ultralytics.nn import text_model
    from ultralytics.utils import downloads

    base_dir = MODELS_DIR / ".base"   # git-ignored: downloaded base weights and the text encoder
    base_dir.mkdir(parents=True, exist_ok=True)
    name = base or cfg.model_base
    fetch = downloads.attempt_download_asset

    def into_base_dir(file, *args, **kwargs):
        # YOLOE asks for its MobileCLIP encoder by bare file name, which would download into the working directory.
        path = Path(str(file))
        return fetch(path if path.is_absolute() else base_dir / path.name, *args, **kwargs)

    with mock.patch.object(text_model, "WEIGHTS_DIR", base_dir), \
            mock.patch.object(downloads, "attempt_download_asset", into_base_dir):
        if name.startswith("yoloe"):
            from ultralytics import YOLOE

            model = YOLOE(base_dir / name)
            model.set_classes(cfg.vocabulary, model.get_text_pe(cfg.vocabulary))
        else:
            from ultralytics import YOLOWorld

            model = YOLOWorld(base_dir / name)
            model.set_classes(cfg.vocabulary)
    cfg.model_file.parent.mkdir(parents=True, exist_ok=True)
    model.save(cfg.model_file)
    sha_path(cfg).write_text(sha256_file(cfg.model_file) + "\n", encoding="utf-8", newline="\n")
    return cfg.model_file
