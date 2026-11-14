"""The local web app: health, config, demo photos, upload preparation, scans, prepared images and the page."""

import logging
import sys
import threading
from collections.abc import Callable, Sequence
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from hazard_demo.config import Config, DemoPhoto, load_photos
from hazard_demo.detector import Backend, ModelError, ModelService, NotReady, Superseded, UltralyticsBackend
from hazard_demo.imaging import MAX_BYTES, ImageRejected, ImageStore, default_store_root, too_many_bytes
from hazard_demo.paths import STATIC_DIR, display_path
from hazard_demo.results import scan_payload
from hazard_demo.rules import evaluate

VERSION = "v0.1"
CSP = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'"
REJECTION_STATUS = {"unsupported": 415, "too-large": 413, "too-small": 422, "unreadable": 422}

log = logging.getLogger("hazard_demo")


def red(text: str) -> str:
    return f"\033[31m{text}\033[0m"


def error_response(status: int, kind: str, **fields: str | None) -> JSONResponse:
    """Every error body is {"error": {"kind": …, plus whichever of format/limit/value/measure/detail apply}}."""
    body = {"kind": kind, **{key: value for key, value in fields.items() if value is not None}}
    return JSONResponse({"error": body}, status_code=status)


def rejection_response(exc: ImageRejected) -> JSONResponse:
    return error_response(REJECTION_STATUS[exc.kind], exc.kind, format=exc.format, limit=exc.limit,
                          value=exc.value, measure=exc.measure)


class ScanRequest(BaseModel):
    image_id: str
    seq: int


def create_app(cfg: Config, *, backend_factory: Callable[[Config], Backend] = UltralyticsBackend,
               store: ImageStore | None = None, photos: Sequence[DemoPhoto] | None = None,
               boot_id: str | None = None) -> FastAPI:
    store = store or ImageStore(default_store_root())
    strip = [photo for photo in (load_photos() if photos is None else photos) if photo.strip]
    listed: list[dict] = []

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        listed[:] = [_prepare_demo_photo(photo, store) for photo in strip]
        warmup = next((store.get(item["image"]["id"]) for item in listed if "image" in item), None)
        service = ModelService(cfg, backend_factory, warmup.path if warmup else None, boot_id=boot_id)
        app.state.service = service
        service.start()
        threading.Thread(target=_report_load_failure, args=(service,), name="load-watch", daemon=True).start()
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = CSP
        response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/health")
    def health() -> dict:
        return app.state.service.health()

    @app.get("/api/config")
    def config() -> dict:
        return {"vocabulary": cfg.vocabulary, "threshold_pct": cfg.threshold_pct, "min_scene_ms": cfg.min_scene_ms,
                "timeout_ms": cfg.timeout_ms, "max_findings": cfg.max_findings, "max_upload_bytes": MAX_BYTES,
                "version": VERSION}

    @app.get("/api/photos")
    def demo_photos() -> list[dict]:
        return listed

    @app.post("/api/prepare")
    async def prepare(file: UploadFile):
        data = await file.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            return rejection_response(too_many_bytes(file.size or len(data)))
        try:
            image = await run_in_threadpool(store.put, data, file.filename or "photo")
        except ImageRejected as exc:
            return rejection_response(exc)
        return image.to_json()

    @app.post("/api/scan")
    async def scan(request: ScanRequest):
        image = store.get(request.image_id)
        if image is None:
            return error_response(404, "unreadable")
        service: ModelService = app.state.service
        try:
            dets, model_ms = await run_in_threadpool(service.scan, image.path)
        except NotReady:
            return error_response(503, "not-ready")
        except Superseded:
            return error_response(409, "superseded")
        except ModelError as exc:
            log.error("Scan failed for image %s (%s)", image.id, image.name, exc_info=True)
            return error_response(500, "model-error", detail=str(exc))
        status = service.health()
        return scan_payload(seq=request.seq, ev=evaluate(dets, cfg), image=image, model_ms=model_ms,
                            model=status["model"], device=status["device"], cfg=cfg)

    @app.get("/api/images/{image_id}.jpg")
    def prepared_image(image_id: str):
        image = store.get(image_id)
        if image is None:
            return error_response(404, "unreadable")
        return FileResponse(image.path, media_type="image/jpeg")

    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
    return app


def _prepare_demo_photo(photo: DemoPhoto, store: ImageStore) -> dict:
    try:
        image = store.put(photo.file.read_bytes(), photo.file.name)
    except (OSError, ImageRejected) as exc:
        log.warning("Demo photo %s can't be shown: %s", display_path(photo.file), exc)
        return {"id": photo.id, "scene": photo.scene, "file": photo.file.name, "missing": True}
    return {"id": photo.id, "scene": photo.scene, "image": image.to_json()}


def _report_load_failure(service: ModelService) -> None:
    """The model failing to load is loud in the server window too; the message names the path and the fix."""
    if not service.wait_ready(timeout=None):
        print(red(f"Model not loaded: {service.health()['message']}"), file=sys.stderr, flush=True)
