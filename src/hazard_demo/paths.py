"""Repo-relative locations. Nothing in the app uses an absolute path of its own."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = REPO_ROOT / "config" / "hazards.yaml"
DEMO_DIR = REPO_ROOT / "demo"
MODELS_DIR = REPO_ROOT / "models"
STATIC_DIR = REPO_ROOT / "static"
FONTS_DIR = STATIC_DIR / "fonts"

FONT_FILES: tuple[str, ...] = (
    "atkinson-hyperlegible-next-latin-wght.woff2",
    "atkinson-hyperlegible-mono-latin-wght.woff2",
    "barlow-condensed-latin-600.woff2",
    "barlow-condensed-latin-700.woff2",
)


def display_path(path: Path) -> str:
    """A path as people should read it: repo-relative with forward slashes when inside the repo."""
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)
