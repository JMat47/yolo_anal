// The controller: every input becomes an event, reduce() decides the next state, and the effects it returns are
// carried out here. Rendering that follows directly from the state (header, thumbnails, Upload tile, stage
// message, panel message) happens in render(); CSS keyed on the root's data-state hides what a state hides (R6).
import * as api from "./api.js";
import * as cards from "./cards.js";
import { onMotionChange, reducedMotion, span } from "./dom.js";
import { checkFonts, showFontBanner } from "./fonts.js";
import { countPhrase, displayName, errorCopy, megabytes, spokenTime } from "./format.js";
import { bindKeys } from "./keys.js";
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
const CACHED_FADE_MS = 200;      // UI-31: a revisit fades in, with no scene
const LOCKED = new Set(["boot-error", "server-lost"]);   // nothing can be scanned: thumbnails are disabled

const $ = (id) => document.getElementById(id);

let state = initialState;
let config = null;
let health = null;
const results = new Map();      // the revisit cache (UI-31): demo photo id -> its last result payload
let photoShown = Promise.resolve();   // settles once the photo on stage has decoded
let boxesShown = true;          // the overlay toggle (UI-21)
let boxesDrawn = false;         // a result's boxes are on the photo: the scene has ended and the reveal begun
let motionNoticeDismissed = false;

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
checkFonts().then(showFontBanner);
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
    case "showCached": return showCached(effect.payload);
    case "clearCache": return clearCache();
    default: return undefined;
  }
}

function showPhoto({ key, image, name }) {
  const alt = strip.isUpload(key) ? S.uploadAlt(displayName(name)) : S.photoAlt(name);
  photoShown = stage.showPhoto(image, alt);
  photoShown.catch((err) => {
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
  resetToggle(false);
  $("live").textContent = "";
}

// The server restarted: its image store and every result it gave are gone (UI-31).
function clearCache() {
  results.clear();
  strip.dropUploadSlot();
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

// The revisit cache keeps a demo photo's last result, with or without hazards; uploads always scan afresh, and
// errors never get here (UI-31).
function remember(payload) {
  if (!strip.isUpload(state.photoKey)) results.set(state.photoKey, payload);
}

async function reveal(payload) {
  remember(payload);
  const token = sceneToken;
  await endScene();
  if (token !== sceneToken) return;   // a newer pick cleared the stage while the scene was ending
  resetToggle(true);
  stage.drawOverlays(payload.findings, { animate: true });
  cards.renderCards(payload.findings, payload.hidden_count, { animate: true });
  stats.renderStats({ findings: payload.findings, modelMs: payload.model_ms, photoName: state.name,
    uploaded: strip.isUpload(state.photoKey) });
  $("live").textContent = S.liveScanComplete(countPhrase(payload.findings.length), spokenTime(payload.model_ms));
}

// No hazards (UI-34): the photo stays at full brightness, the stats row keeps "Hazards flagged" 0, Model time
// and Photo, and the panel lists what was checked.
async function showEmpty(payload) {
  remember(payload);
  const token = sceneToken;
  await endScene();
  if (token !== sceneToken) return;
  stats.renderStats({ findings: [], modelMs: payload.model_ms, photoName: state.name,
    uploaded: strip.isUpload(state.photoKey) });
  cards.renderEmpty(payload);
  $("live").textContent = S.liveScanComplete(countPhrase(0), spokenTime(payload.model_ms));
}

// A revisit (UI-31): no scene. The photo decodes first, so no box is ever drawn over the photo before it; then the
// boxes, tags and cards (or the empty panel, with the toggle still hidden) and the stats fade in together, and the
// stats row marks the model time as an earlier run.
async function showCached(payload) {
  const token = sceneToken;
  const shown = await photoShown.then(() => true, () => false);
  if (!shown || token !== sceneToken) return;
  if (payload.findings.length > 0) {
    resetToggle(true);
    stage.drawOverlays(payload.findings, { animate: false });
    cards.renderCards(payload.findings, payload.hidden_count, { animate: false });
  } else {
    cards.renderEmpty(payload, { animate: false });
  }
  stats.renderStats({ findings: payload.findings, modelMs: payload.model_ms, photoName: state.name, cached: true });
  const duration = reducedMotion() ? stage.REVEAL.still : CACHED_FADE_MS;
  for (const layer of document.querySelectorAll(".overlay, .tags, #stats, #findings-list")) {
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: "ease-out" });
  }
  $("live").textContent = S.liveEarlierRun(countPhrase(payload.findings.length), spokenTime(payload.model_ms));
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
// A photo with a cached result shows it again (the reducer re-scans the photo already on stage instead).
function pick(photo) {
  clearUploadMessage();
  dispatch({ type: "pick", ...photo, cachedResult: results.get(photo.key) });
}

// The arrow keys and the clicker's forward and back buttons step through the demo photos (UI-94).
function stepPhoto(step) {
  const key = strip.neighbour(state.photoKey, step);
  if (key) pick(strip.photoFor(key));
}

// The overlay toggle (UI-21, PM-9) shows once a result's boxes are drawn: the reducer enters result when the
// response arrives, while the scene may still be running. Every reveal, cached or not, resets it to "shown".
function resetToggle(drawn) {
  boxesDrawn = drawn;
  setBoxesShown(true);
  renderToggle();
}

function renderToggle() {
  $("overlay-toggle").hidden = !(boxesDrawn && state.app === "result");
}

function setBoxesShown(shown) {
  boxesShown = shown;
  stage.setOverlaysVisible(shown);
  const toggle = $("overlay-toggle");
  toggle.setAttribute("aria-pressed", String(!shown));
  toggle.textContent = shown ? S.hideBoxes : S.showBoxes;
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
  renderToggle();
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
    case "idle": return renderIdlePanel();
    case "waiting":
    case "preparing":
    case "boot-error": return cards.clearCards();
    default: return undefined;
  }
}

// UI-93: with reduced motion on, idle also says the sweep won't play, until the presenter dismisses it.
function renderIdlePanel() {
  cards.renderPanelMessage(S.panelIdle);
  if (reducedMotion() && !motionNoticeDismissed) {
    cards.renderNotice(S.reducedMotion, () => { motionNoticeDismissed = true; });
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
  bindKeys({
    next: () => stepPhoto(1),
    prev: () => stepPhoto(-1),
    rescan: () => dispatch({ type: "rescan" }),
    toggle: () => { if (!$("overlay-toggle").hidden) setBoxesShown(!boxesShown); },
  });
  $("overlay-toggle").addEventListener("click", () => setBoxesShown(!boxesShown));
  onMotionChange(() => { if (state.app === "idle") renderIdlePanel(); });

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
