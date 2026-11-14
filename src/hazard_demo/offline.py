"""Keeps the demo offline: ultralytics flags, and a socket guard that records and refuses connections."""

import contextlib
import os
import socket
from collections.abc import Iterator
from unittest import mock


class NetworkBlocked(RuntimeError):
    pass


def configure_ultralytics(*, offline: bool) -> None:
    """Must run before ultralytics is first imported: it reads these variables at import time."""
    os.environ["YOLO_OFFLINE"] = "true" if offline else "false"
    os.environ["YOLO_AUTOINSTALL"] = "false"
    from ultralytics import settings

    settings.update({"sync": False})


@contextlib.contextmanager
def block_network() -> Iterator[list[str]]:
    attempts: list[str] = []

    def refuse(target: str):
        attempts.append(target)
        raise NetworkBlocked(f"network access blocked: {target}")

    def address(addr) -> str:
        return f"{addr[0]}:{addr[1]}" if isinstance(addr, tuple) and len(addr) >= 2 else str(addr)

    def connect(self, addr):
        refuse(address(addr))

    def create_connection(addr, *args, **kwargs):
        refuse(address(addr))

    def getaddrinfo(host, port, *args, **kwargs):
        refuse(f"{host}:{port}")

    with contextlib.ExitStack() as stack:
        stack.enter_context(mock.patch.object(socket.socket, "connect", connect))
        stack.enter_context(mock.patch.object(socket, "create_connection", create_connection))
        stack.enter_context(mock.patch.object(socket, "getaddrinfo", getaddrinfo))
        yield attempts
