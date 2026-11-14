// The controller: every input becomes an event, reduce() decides the next state, and the effects it returns are
// carried out here. Rendering that follows directly from the state (header, selected thumbnail, panel message)
// happens in render().
import * as api from "./api.js";
import * as cards from "./cards.js";
import { countPhrase, displayName, spokenTime } from "./format.js";
import * as stage from "./stage.js";
import { initialState, reduce } from "./state.js";
import * as stats from "./stats.js";
import { S } from "./strings.js";

const POLL_LOADING_MS = 500;
const POLL_READY_MS = 4000;   // within UI-35's 5 s, fetch time included
const RETRY_MS = 500;
const UPLOAD_PREFIX = "upload:";

const $ = (id) => document.getElementById(id);

let state = initialState;
let config = null;
let health = null;
const demoPhotos = new Map();   // id -> {id, scene, image}

// The work in flight: one scan (or prepare), its scene, its timeout, and the file being uploaded.
let request = null;             // AbortController
let scene = null;
let scanTimeout = 0;
let elapsedTimer = 0;
let sceneToken = 0;             // bumped whenever the stage is cleared, so a late reveal never draws
let uploadFile = null;

fillCopy();
wireInputs();
boot();

function dispatch(event) {
  const before = state;
  const out = reduce(state, event);
  state = out.state;
  for (const effect of out.effects) run(effect);
  if (state !== before) render(before);   // after the effects, so a cleared panel still gets its message
}

// --- Effects ---------------------------------------------------------------------------------------------------

function run(effect) {
  switch (effect.type) {
    case "showPhoto": return showPhoto(effect);
    case "clear": return clearStage();
    case "scan": return startScan(effect.imageId, effect.seq);
    case "abort": return stopWork();
    case "prepare": return prepareUpload();
    case "reveal": return reveal(effect.payload);
    case "showEmpty": return settle();
    case "showError": return settle();
    case "showCached": return stage.drawOverlays(effect.payload.findings, { animate: false });
    case "clearCache": return undefined;
    default: return undefined;
  }
}

function showPhoto({ key, image, name }) {
  const alt = key.startsWith(UPLOAD_PREFIX) ? S.uploadAlt(displayName(name)) : S.photoAlt(name);
  stage.showPhoto(image, alt).catch((err) => {
    if (state.photoKey !== key) return;
    const kind = err.message === "size-mismatch" ? "size-mismatch" : "unreadable";
    dispatch({ type: "failed", seq: state.seq, error: { kind } });
  });
}

function clearStage() {
  sceneToken++;
  stage.clearOverlays();
  stats.clearStats();
  cards.clearCards();
  $("live").textContent = "";
}

function startScan(imageId, seq) {
  stopWork();
  const token = ++sceneToken;
  performance.mark("scan-start");
  scene = stage.startScene({ passMs: config.min_scene_ms });
  stats.renderScanLine(config.vocabulary);
  const started = performance.now();
  elapsedTimer = setInterval(() => {
    const seconds = Math.floor((performance.now() - started) / 1000);
    if (seconds > 5) stats.setScanElapsed(seconds);   // UI-30: an elapsed counter after 5 s
  }, 250);
  request = new AbortController();
  scanTimeout = setTimeout(() => dispatch({ type: "timeout", seq }), config.timeout_ms);
  api.scan(imageId, seq, request.signal)
    .then((payload) => dispatch({ type: "response", seq, payload }))
    .catch((err) => {
      if (token === sceneToken) dispatch({ type: "failed", seq, error: errorOf(err) });
    });
}

// Stops whatever is in flight: the request, its timeout and the scene.
function stopWork() {
  request?.abort();
  request = null;
  clearTimeout(scanTimeout);
  clearInterval(elapsedTimer);
  scene?.cancel();
  scene = null;
}

async function reveal(payload) {
  const token = sceneToken;
  await endScene();
  if (token !== sceneToken) return;   // a newer pick cleared the stage while the scene was ending
  stage.drawOverlays(payload.findings, { animate: true });
  cards.renderCards(payload.findings, payload.hidden_count, { animate: true });
  stats.renderStats({ findings: payload.findings, modelMs: payload.model_ms, photoName: state.name,
    uploaded: state.photoKey?.startsWith(UPLOAD_PREFIX) ?? false });
  $("live").textContent = S.liveScanComplete(countPhrase(payload.findings.length), spokenTime(payload.model_ms));
}

async function settle() {
  const token = sceneToken;
  await endScene();
  if (token === sceneToken) stats.clearStats();
}

async function endScene() {
  clearTimeout(scanTimeout);
  clearInterval(elapsedTimer);
  request = null;
  const ending = scene;
  scene = null;
  await ending?.finish();
}

function prepareUpload() {
  stopWork();
  const file = uploadFile;
  request = new AbortController();
  api.prepare(file, request.signal)
    .then((image) => dispatch({ type: "prepared", key: UPLOAD_PREFIX + image.id, image, name: image.name }))
    .catch((err) => dispatch({ type: "prepareFailed", error: errorOf(err) }));
}

const errorOf = (err) => (err instanceof api.ApiError ? { kind: err.kind, ...(err.body?.error ?? {}) }
  : { kind: "unreadable" });

// --- Rendering from state --------------------------------------------------------------------------------------

function render(before) {
  $("app").dataset.state = state.app;
  renderHeader();
  for (const thumb of $("strip").querySelectorAll(".thumb")) {
    const current = thumb.dataset.photo === state.photoKey;
    thumb.setAttribute("aria-current", current ? "true" : "false");
    if (current && before.photoKey !== state.photoKey) thumb.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  if (state.photoKey === null && before.photoKey !== null) stage.clearPhoto();
  if (state.app !== before.app) {
    if (state.app === "booting" || state.app === "warming") cards.renderPanelMessage(S.panelBooting);
    if (state.app === "idle") cards.renderPanelMessage(S.panelIdle);
  }
}

function renderHeader() {
  const label = $("model-label");
  const status = state.app === "server-lost" || state.app === "boot-error" ? "error"
    : state.modelReady ? "ready" : "loading";
  $("status-dot").closest(".model").dataset.health = status;
  if (state.app === "server-lost") label.textContent = S.modelOffline;
  else if (status === "error") label.textContent = S.modelError(health?.message ?? "");
  else if (status === "ready") label.replaceChildren(`${S.modelActive} `, span("checkpoint", health?.model ?? ""));
  else label.textContent = S.modelLoading;
  label.title = status === "error" ? label.textContent : "";
}

// --- Boot ------------------------------------------------------------------------------------------------------

function fillCopy() {
  const words = S.wordmark.split(" ");
  $("wordmark").replaceChildren(`${words.slice(0, -1).join(" ")} `, span("accent", words.at(-1)));
  for (const node of document.querySelectorAll("[data-s]")) node.textContent = S[node.dataset.s];
  $("upload-tile").title = S.uploadTypes;
  cards.renderPanelMessage(S.panelBooting);
  renderHeader();
}

async function boot() {
  let photos;
  for (;;) {
    try {
      [config, photos] = await Promise.all([api.getConfig(), api.getPhotos()]);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
  $("legend").textContent = S.legend(config.threshold_pct);
  $("version").textContent = config.version;
  renderStrip(photos);
  pollHealth();
}

async function pollHealth() {
  try {
    health = await api.getHealth();
    dispatch({ type: "health", health });
  } catch {
    dispatch({ type: "healthFailed" });
  }
  const steady = state.modelReady && state.app !== "server-lost";
  setTimeout(pollHealth, steady ? POLL_READY_MS : POLL_LOADING_MS);
}

function renderStrip(photos) {
  // Missing demo photos get their broken tile later (UI-88); for now they are left out of the strip.
  const shown = photos.filter((photo) => !photo.missing);
  for (const photo of shown) demoPhotos.set(photo.id, photo);
  $("strip").replaceChildren(...shown.map(thumbnail));
}

function thumbnail(photo) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "thumb";
  button.dataset.photo = photo.id;
  button.title = photo.scene;
  button.setAttribute("aria-label", S.thumbName(photo.scene));
  const img = document.createElement("img");
  img.src = photo.image.url;
  img.alt = "";
  img.decoding = "async";
  button.append(img, span("caption", photo.scene));
  return button;
}

function wireInputs() {
  const strip = $("strip");
  strip.addEventListener("click", (event) => {
    const photo = demoPhotos.get(event.target.closest(".thumb")?.dataset.photo);
    if (photo) dispatch({ type: "pick", key: photo.id, image: photo.image, name: photo.scene });
  });
  const fades = () => {
    strip.classList.toggle("fade-start", strip.scrollLeft > 1);
    strip.classList.toggle("fade-end", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
  };
  strip.addEventListener("scroll", fades, { passive: true });
  new ResizeObserver(fades).observe(strip);
  strip.addEventListener("wheel", (event) => {
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    strip.scrollLeft += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  // A box or tag under the pointer highlights itself and marks its card (UI-20).
  const linked = (target) => target?.closest?.("[data-box], [data-tag]");
  for (const layer of document.querySelectorAll(".overlay, .tags")) {
    layer.addEventListener("pointerover", (event) => {
      const node = linked(event.target);
      if (!node) return;
      const id = node.dataset.box ?? node.dataset.tag;
      stage.highlight(id);
      cards.markCard(id);
    });
    layer.addEventListener("pointerout", (event) => {
      if (!linked(event.target) || linked(event.relatedTarget)) return;
      stage.highlight(null);
      cards.markCard(null);
    });
  }

  $("upload-tile").addEventListener("click", () => $("upload-input").click());
  $("upload-input").addEventListener("change", (event) => {
    const [file] = event.target.files;
    event.target.value = "";   // choosing the same file again still counts
    if (!file) return;
    uploadFile = file;
    dispatch({ type: "upload", name: file.name });
  });
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}
