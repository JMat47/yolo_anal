"""The hazard-demo command."""

import argparse
import sys

from hazard_demo.config import load_config
from hazard_demo.paths import display_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hazard-demo", description="Site hazard detection demo.")
    commands = parser.add_subparsers(dest="command", metavar="command")
    build = commands.add_parser("build-model", help="bake the prompt words into the model file (dev machine only)")
    build.add_argument("--base", metavar="NAME", help="base weights to start from (default: model.base in config)")
    args = parser.parse_args(argv)

    if args.command == "build-model":
        from hazard_demo.build_model import build_model
        from hazard_demo.detector import sha256_file

        path = build_model(load_config(), args.base)
        print(f"{display_path(path)}  sha256 {sha256_file(path)}")
        return 0
    parser.print_usage(sys.stderr)
    return 2
