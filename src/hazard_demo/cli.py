"""The hazard-demo command."""

import argparse
import logging
import socket
import sys
import threading
import time
import webbrowser

import uvicorn

from hazard_demo.api import create_app, red
from hazard_demo.checks import run_check, run_setup
from hazard_demo.config import Config, ConfigError, load_config, load_expected, load_photos
from hazard_demo.detector import UltralyticsBackend
from hazard_demo.offline import configure_ultralytics
from hazard_demo.paths import FONT_FILES, FONTS_DIR, display_path


def main(argv: list[str] | None = None) -> int:
    # The Windows console may be cp1252; paths like C:\Users\Zoë\ must still print.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _enable_console_colours()

    parser = argparse.ArgumentParser(prog="hazard-demo", description="Site hazard detection demo.")
    parser.set_defaults(no_browser=False)
    commands = parser.add_subparsers(dest="command", metavar="command")
    run = commands.add_parser("run", help="start the demo and open it in the browser (the default)")
    run.add_argument("--no-browser", action="store_true", help="don't open the browser")
    commands.add_parser("check", help="offline preflight: run every demo photo against demo/expected.json")
    commands.add_parser("setup", help="one-time setup: versions, CUDA on Windows, then check")
    build = commands.add_parser("build-model", help="bake the prompt words into the model file (dev machine only)")
    build.add_argument("--base", metavar="NAME", help="base weights to start from (default: model.base in config)")
    args = parser.parse_args(argv)
    args.command = args.command or "run"

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
    if args.command == "run":
        return run_demo(cfg, open_browser=not args.no_browser)
    if args.command == "setup":
        return run_setup(cfg, out=sys.stdout)
    return run_check(cfg, backend_factory=UltralyticsBackend, photos=load_photos(), expected=load_expected(),
                     fonts_dir=FONTS_DIR, out=sys.stdout)


def run_demo(cfg: Config, *, open_browser: bool) -> int:
    port = cfg.port
    if not _port_is_free(port):
        print(f"Port {port} is already in use. Close the other copy of the demo, "
              "or change server.port in config/hazards.yaml.", file=sys.stderr)
        return 1
    for name in FONT_FILES:   # keep going: the page shows its own font banner
        if not (FONTS_DIR / name).is_file():
            print(red(f"Missing font {display_path(FONTS_DIR / name)}. Re-clone the repo."), file=sys.stderr)
    _log_to_console()
    print(f"Site Hazard Detection: http://127.0.0.1:{port}  (Ctrl+C to stop)", flush=True)
    app = create_app(cfg)
    if open_browser:
        open_browser_when_up(port)
    uvicorn.run(app, host="127.0.0.1", port=port, access_log=False)
    return 0


def open_browser_when_up(port: int, *, poll_s: float = 0.2, give_up_s: float = 60.0) -> threading.Thread:
    """Opens the page on the first successful connect. Uvicorn listens only once the demo photos are prepared,
    so a fixed timer could open the browser onto "can't connect"."""
    url = f"http://127.0.0.1:{port}"

    def wait_then_open() -> None:
        deadline = time.monotonic() + give_up_s
        while time.monotonic() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=poll_s):
                    pass
            except OSError:
                time.sleep(poll_s)
                continue
            webbrowser.open(url)
            return

    thread = threading.Thread(target=wait_then_open, name="browser-opener", daemon=True)
    thread.start()
    return thread


def _port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        if sys.platform != "win32":   # a just-closed copy's TIME_WAIT isn't "in use"; on Windows this would steal
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


def _enable_console_colours() -> None:
    """The red error lines are ANSI escapes. A legacy Windows console prints them as text ("←[31m") unless
    virtual-terminal processing is on, so switch it on for stdout and stderr. Redirected output has no console
    mode to change; any failure leaves the console as it was."""
    if sys.platform != "win32":
        return
    try:
        import ctypes
        from ctypes import wintypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.GetStdHandle.restype = wintypes.HANDLE
        kernel32.GetStdHandle.argtypes = [wintypes.DWORD]
        kernel32.GetConsoleMode.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel32.SetConsoleMode.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        for std_handle in (-11, -12):   # STD_OUTPUT_HANDLE, STD_ERROR_HANDLE
            handle = kernel32.GetStdHandle(wintypes.DWORD(std_handle).value)
            mode = wintypes.DWORD()
            if handle and kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
                kernel32.SetConsoleMode(handle, mode.value | 0x0004)   # ENABLE_VIRTUAL_TERMINAL_PROCESSING
    except (AttributeError, OSError, ValueError):
        pass


def _log_to_console() -> None:
    """Missing demo photos and scan tracebacks (with the image id) go to the server window."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(levelname)s:  %(message)s"))
    logger = logging.getLogger("hazard_demo")
    if logger.handlers:
        return
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
