import os
import socket

import pytest

from hazard_demo.offline import NetworkBlocked, block_network, configure_ultralytics


def test_block_network_raises_and_records():
    original = socket.create_connection
    with block_network() as attempts:
        with pytest.raises(NetworkBlocked):
            socket.create_connection(("example.com", 443))
        with pytest.raises(NetworkBlocked):
            socket.getaddrinfo("pypi.org", 80)
        with socket.socket() as sock, pytest.raises(NetworkBlocked):
            sock.connect(("10.0.0.1", 8080))
    assert attempts == ["example.com:443", "pypi.org:80", "10.0.0.1:8080"]
    assert socket.create_connection is original


def test_configure_ultralytics_offline(monkeypatch):
    monkeypatch.setenv("YOLO_OFFLINE", "unset-by-test")      # restored after the test
    monkeypatch.setenv("YOLO_AUTOINSTALL", "unset-by-test")
    configure_ultralytics(offline=True)
    import ultralytics
    assert os.environ["YOLO_OFFLINE"] == "true"
    assert os.environ["YOLO_AUTOINSTALL"] == "false"
    assert ultralytics.settings["sync"] is False
