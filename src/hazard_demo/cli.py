"""The hazard-demo command."""

import argparse
import sys

from hazard_demo.checks import run_check, run_setup
from hazard_demo.config import ConfigError, load_config, load_expected, load_photos
from hazard_demo.detector import UltralyticsBackend
from hazard_demo.offline import configure_ultralytics
from hazard_demo.paths import FONTS_DIR, display_path


def main(argv: list[str] | None = None) -> int:
    # The Windows console may be cp1252; paths like C:\Users\Zoë\ must still print.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(prog="hazard-demo", description="Site hazard detection demo.")
    commands = parser.add_subparsers(dest="command", metavar="command")
    commands.add_parser("check", help="offline preflight: run every demo photo against demo/expected.json")
    commands.add_parser("setup", help="one-time setup: versions, CUDA on Windows, then check")
    build = commands.add_parser("build-model", help="bake the prompt words into the model file (dev machine only)")
    build.add_argument("--base", metavar="NAME", help="base weights to start from (default: model.base in config)")
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_usage(sys.stderr)
        return 2
    try:
        return _run(args)
    except ConfigError as exc:   # a typo in a config file gets one clear line, not a traceback
        print(f"{'FAIL':<5}{'config':<13}{exc}", file=sys.stderr)
        return 1


def _run(args: argparse.Namespace) -> int:
    if args.command == "build-model":
        from hazard_demo.build_model import build_model
        from hazard_demo.detector import sha256_file

        path = build_model(load_config(), args.base)
        print(f"{display_path(path)}  sha256 {sha256_file(path)}")
        return 0

    configure_ultralytics(offline=True)
    cfg = load_config()
    if args.command == "setup":
        return run_setup(cfg, out=sys.stdout)
    return run_check(cfg, backend_factory=UltralyticsBackend, photos=load_photos(), expected=load_expected(),
                     fonts_dir=FONTS_DIR, out=sys.stdout)
