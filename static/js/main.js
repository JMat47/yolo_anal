// The controller: every input becomes an event, reduce() decides the next state, and the effects it returns are
// carried out here. Rendering that follows directly from the state (header, thumbnails, Upload tile, stage
// message, panel message) happens in render(); CSS keyed on the root's data-state hides what a state hides (R6).
import * as api from "./api.js";
import * as cards from "./cards.js";
import { span } from "./dom.js";
import { countPhrase, displayName, errorCopy, megabytes, spokenTime } from "./format.js";
import * as stage from "./stage.js";
import { initialState, reduce } from "./state.js";
import * as stats from "./stats.js";
import { S } from "./strings.js";
import * as strip from "./strip.js";

const POLL_LOADING_MS = 500;
const POLL_READY_MS = 4000;      // within UI-35's 5 s, fetch time included
const RETRY_MS = 500;
const LOADING_LONG_MS = 45000;   // UI-27: the label then adds "still loading, check the server window"
const PREPARE_LIMIT_MS = 10000;  // UI-33: preparation over 10 s enters error
const UPLOAD_MSG_MS = 8000;      // UI-33: a rejection checked in the page shows by the Upload tile for 8 s
const LOCKED = new Set(["boot-error", "server-lost"]);   // nothing can be scanned: thumbnails are disabled

const $ = (id) => document.getElementById(id);

let state = initialState;
let config = null;
let health = null;

// The work in flight: one scan (or prepare), its scene, its time limit, and the file being uploaded.
let request = null;             // AbortController
let scene = null;
let workTimer = 0;              // the scan timeout or the prepare limit
let elapsedTimer = 0;
let sceneToken = 0;             // bumped whenever the stage is cleared, so late work never draws
let uploadFile = null;
let uploadMsgTimer = 0;
let loadingTimer = 0;
let loadingLong = false;

fillCopy();
wireInputs();
watchLoading();
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
    case "abort": return stopWork({ keepScene: state.app === "error" });   // a timeout lifts its scene gently
    case "prepare": return prepareUpload();
    case "reveal": return reveal(effect.payload);
    case "showEmpty": return showEmpty(effect.payload);
    case "showError": return showError(effect.error);
    case "showCached": return stage.drawOverlays(effect.payload.findings, { animate: false });
    case "clearCache": return strip.dropUploadSlot();   // the server's image store was cleared with its cache
    default: return undefined;
  }
}

function showPhoto({ key, image, name }) {
  const alt = strip.isUpload(key) ? S.uploadAlt(displayName(name)) : S.photoAlt(name);
  stage.showPhoto(image, alt).catch((err) => {
    const kind = err.message === "size-mismatch" ? "size-mismatch" : "photo-not-shown";
    dispatch({ type: "photoFailed", key, error: { kind } });
  });
}

// Every new selection (a pick, an upload or a re-scan) clears what the last one drew, and any upload message
// (UI-24).
function clearStage() {
  sceneToken++;
  stage.clearOverlays();
  stats.clearStats();
  cards.clearCards();
  clearUploadMessage();
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
  workTimer = setTimeout(() => dispatch({ type: "timeout", seq }), config.timeout_ms);
  api.scan(imageId, seq, request.signal)
    .then((payload) => dispatch({ type: "response", seq, payload }))
    .catch((err) => {
      if (token === sceneToken) dispatch({ type: "failed", seq, error: errorOf(err) });
    });
}

// Stops whatever is in flight: the request, its timers and, unless kept for a gentle finish, the scene.
function stopWork({ keepScene = false } = {}) {
  request?.abort();
  request = null;
  clearTimeout(workTimer);
  clearInterval(elapsedTimer);
  if (keepScene) return;
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
    uploaded: strip.isUpload(state.photoKey) });
  $("live").textContent = S.liveScanComplete(countPhrase(payload.findings.length), spokenTime(payload.model_ms));
}

// No hazards (UI-34): the photo stays at full brightness, the stats row keeps "Hazards flagged" 0, Model time
// and Photo, and the panel lists what was checked.
async function showEmpty(payload) {
  const token = sceneToken;
  await endScene();
  if (token !== sceneToken) return;
  stats.renderStats({ findings: [], modelMs: payload.model_ms, photoName: state.name,
    uploaded: strip.isUpload(state.photoKey) });
  cards.renderEmpty(payload);
  $("live").textContent = S.liveScanComplete(countPhrase(0), spokenTime(payload.model_ms));
}

// The scene lifts, the error bar takes the stats slot, and the panel says there are no results (UI-35).
async function showError(error) {
  const token = sceneToken;
  await endScene();
  if (token !== sceneToken) return;
  const copy = errorCopy(error, { name: state.name, timeoutMs: config?.timeout_ms ?? 0 });
  const onRetry = state.image ? () => dispatch({ type: "rescan" }) : null;
  stats.renderErrorBar({ ...copy, onRetry });
  cards.renderPanelMessage(S.panelError);
}

async function endScene() {
  clearTimeout(workTimer);
  clearInterval(elapsedTimer);
  request = null;
  const ending = scene;
  scene = null;
  await ending?.finish();
}

// Sends the chosen file to be checked and prepared. A pick or a newer upload clears the stage, which makes this
// one stale; after 10 s it gives up as unreadable (UI-33).
function prepareUpload() {
  stopWork();
  const file = uploadFile;
  const token = sceneToken;
  let settled = false;
  const live = () => !settled && token === sceneToken;
  const finish = () => {
    settled = true;
    clearTimeout(workTimer);
    request = null;
  };
  request = new AbortController();
  workTimer = setTimeout(() => {
    if (!live()) return;
    stopWork();
    finish();
    dispatch({ type: "prepareFailed", error: { kind: "unreadable", upload: true } });
  }, PREPARE_LIMIT_MS);
  api.prepare(file, request.signal)
    .then((image) => {
      if (!live()) return;
      finish();
      const key = strip.setUploadSlot(image);
      renderThumbs();
      dispatch({ type: "prepared", key, image, name: image.name });
    })
    .catch((err) => {
      if (!live()) return;
      finish();
      dispatch({ type: "prepareFailed", error: { ...errorOf(err), upload: true } });
    });
}

const errorOf = (err) => (err instanceof api.ApiError ? { kind: err.kind, ...(err.body?.error ?? {}) }
  : { kind: "unreadable" });

// A thumbnail chosen: a pick before the model is ready clears nothing on stage, but the upload message still goes.
function pick(photo) {
  clearUploadMessage();
  dispatch({ type: "pick", ...photo });
}

// --- Rendering from state --------------------------------------------------------------------------------------

function render(before) {
  const { app } = state;
  $("app").dataset.state = app;
  if (state.modelReady !== before.modelReady) watchLoading();
  renderHeader();
  renderThumbs(before);
  const upload = $("upload-tile");
  upload.disabled = app === "preparing" || LOCKED.has(app);   // other thumbnails stay clickable (UI-33)
  upload.setAttribute("aria-busy", String(app === "preparing"));
  if (state.photoKey === null && before.photoKey !== null) stage.clearPhoto();
  stage.setMessage(...stageMessage());
  if (app !== before.app) renderPanel();
}

function renderHeader() {
  const label = $("model-label");
  const status = LOCKED.has(state.app) ? "error" : state.modelReady ? "ready" : "loading";
  $("status-dot").closest(".model").dataset.health = status;
  if (state.app === "server-lost") label.textContent = S.modelOffline;
  else if (status === "error") label.textContent = S.modelError((health?.message ?? "").replaceAll("`", ""));
  else if (status === "ready") label.replaceChildren(`${S.modelActive} `, span("checkpoint", health?.model ?? ""));
  else label.textContent = loadingLong ? S.modelLoadingLong : S.modelLoading;
  label.title = status === "error" ? label.textContent : "";
}

function renderThumbs(before = null) {
  const locked = LOCKED.has(state.app);
  strip.renderThumbs({
    current: state.photoKey,
    locked,
    waiting: !state.modelReady && !locked,   // a pick now scans once the model is ready (PM-13)
    moved: before !== null && before.photoKey !== state.photoKey,
  });
}

// UI-23: the sentence a state puts on the stage, and the detail line under it.
function stageMessage() {
  switch (state.app) {
    case "waiting": return [S.stageWaiting];
    case "preparing": return [S.stagePreparing(state.name)];
    case "boot-error": return [S.stageBootError, health?.message || null];
    case "server-lost": return [S.stageServerLost];
    default: return [null];
  }
}

// The panel's own message on entering a state. empty and error fill it once their scene has ended; result
// draws cards; server-lost only hides what is there (R6).
function renderPanel() {
  switch (state.app) {
    case "booting":
    case "warming": return cards.renderPanelMessage(S.panelBooting);
    case "idle": return cards.renderPanelMessage(S.panelIdle);
    case "waiting":
    case "preparing":
    case "boot-error": return cards.clearCards();
    default: return undefined;
  }
}

// UI-27: "Model loading…" grows a hint once loading has taken 45 s. The clock restarts whenever the model stops
// being ready (a restarted server loads again).
function watchLoading() {
  clearTimeout(loadingTimer);
  loadingLong = false;
  if (state.modelReady) return;
  loadingTimer = setTimeout(() => {
    loadingLong = true;
    renderHeader();
  }, LOADING_LONG_MS);
}

function showUploadMessage(text) {
  $("upload-msg").textContent = text;
  clearTimeout(uploadMsgTimer);
  uploadMsgTimer = setTimeout(clearUploadMessage, UPLOAD_MSG_MS);
}

function clearUploadMessage() {
  clearTimeout(uploadMsgTimer);
  $("upload-msg").textContent = "";
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
  strip.renderStrip(photos);
  renderThumbs();
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

function wireInputs() {
  strip.onPick(pick);

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

  $("upload-tile").addEventListener("click", () => {
    if (config) $("upload-input").click();
  });
  $("upload-input").addEventListener("change", (event) => {
    const [file] = event.target.files;
    event.target.value = "";   // choosing the same file again still counts
    if (!file) return;
    if (file.size > config.max_upload_bytes) {
      // Checked here first: the current result stays, and nothing is sent (UI-33).
      showUploadMessage(S.tooManyBytes(file.name, megabytes(file.size), megabytes(config.max_upload_bytes)));
      return;
    }
    uploadFile = file;
    dispatch({ type: "upload", name: file.name });
  });

  // A file dropped anywhere is swallowed, so the browser never navigates away from the demo (UI-33).
  for (const type of ["dragover", "drop"]) window.addEventListener(type, (event) => event.preventDefault());
}
