// The screen's state machine (UI-23). reduce(state, event) -> {state, effects} is pure: no DOM and no fetch.
// Effects are plain objects that the controller in main.js carries out. An event with nothing to do returns the
// same state object and no effects.

export const initialState = Object.freeze({
  app: "booting",       // booting | warming | idle | waiting | preparing | scanning | result | empty | error
                        // | boot-error | server-lost
  modelReady: false,
  bootId: null,
  photoKey: null,       // the photo on stage: a demo photo id, or "upload:<image id>"
  image: null,          // its prepared image (id, url, width, height, …)
  name: null,           // its scene name or file name
  seq: 0,               // the last scan request's number; a response for any other number is stale
  pending: null,        // waiting: the photo that scans once the model is ready
  cached: false,        // result: shown from the revisit cache
  error: null,          // error: {kind, …}
  prev: null,           // server-lost: the state to return to
});

const ABORT = Object.freeze({ type: "abort" });
const CLEAR = Object.freeze({ type: "clear" });
const IGNORED_ERRORS = new Set(["superseded", "aborted"]);   // R21: a newer request replaced this one
const NO_PHOTO = { photoKey: null, image: null, name: null, pending: null, cached: false, error: null };

const keep = (state) => ({ state, effects: [] });
const go = (state, patch, ...effects) => ({ state: { ...state, ...patch }, effects });
const showPhoto = (e) => ({ type: "showPhoto", key: e.key, image: e.image, name: e.name });
const scan = (imageId, seq) => ({ type: "scan", imageId, seq });
const busy = (state) => state.app === "scanning" || state.app === "preparing";

export function reduce(state, event) {
  switch (event.type) {
    case "health": return onHealth(state, event.health);
    case "healthFailed": return onHealthFailed(state, event.timedOut);
    case "pick": return onPick(state, event);
    case "rescan": return onRescan(state);
    case "upload": return onUpload(state, event);
    case "prepared": return onPrepared(state, event);
    case "prepareFailed": return onPrepareFailed(state, event.error);
    case "response": return onResponse(state, event);
    case "failed": return onFailed(state, event);
    case "timeout": return onTimeout(state, event);
    case "photoFailed": return onPhotoFailed(state, event);
    default: return keep(state);
  }
}

function onHealth(s, health) {
  const ready = health.state === "ready";
  const failed = health.state === "error";
  if (s.bootId !== null && health.boot_id !== s.bootId) {
    // The server restarted: its image store and every cached result are gone.
    const app = ready ? "idle" : failed ? "boot-error" : "warming";
    return go(s, { ...NO_PHOTO, app, modelReady: ready, bootId: health.boot_id, prev: null },
      ...(busy(s) ? [ABORT] : []), { type: "clearCache" }, CLEAR);
  }
  const base = { bootId: health.boot_id, modelReady: ready };
  switch (s.app) {
    case "booting":
    case "warming":
      if (ready) return go(s, { ...base, app: "idle" });
      if (failed) return go(s, { ...base, app: "boot-error" });
      return s.app === "booting" ? go(s, { ...base, app: "warming" }) : keep(s);
    case "waiting":
      if (ready) {
        const seq = s.seq + 1;
        return go(s, { ...base, app: "scanning", seq, pending: null }, CLEAR, scan(s.image.id, seq));
      }
      return failed ? go(s, { ...base, ...NO_PHOTO, app: "boot-error" }) : keep(s);
    case "preparing":
      if (failed) return go(s, { ...base, ...NO_PHOTO, app: "boot-error" }, ABORT);
      return ready === s.modelReady ? keep(s) : go(s, base);
    case "boot-error":
      return ready ? go(s, { ...base, app: "idle" }) : keep(s);
    case "server-lost":
      return recover(s, { ...base, prev: null }, ready, failed);
    default:
      // idle, scanning, result, empty or error. An upload rejected before the model was ready leaves `error`
      // with modelReady false, so readiness is still tracked here.
      if (failed) return go(s, { ...base, ...NO_PHOTO, app: "boot-error" }, ...(busy(s) ? [ABORT] : []), CLEAR);
      return ready === s.modelReady ? keep(s) : go(s, base);
  }
}

// The server answers again with the same boot id. Its state decides where the page goes: a result or empty
// screen comes back as it was (R6: it was only hidden), a pick made while loading keeps waiting or now scans,
// and anything else starts over.
function recover(s, base, ready, failed) {
  if (failed) return go(s, { ...base, ...NO_PHOTO, app: "boot-error" }, CLEAR);
  if (!ready) {
    if (s.prev === "waiting") return go(s, { ...base, app: "waiting" });
    // One boot id is one model service, which never goes from ready back to loading; only a server restarted
    // with its old boot id (the test harness) does. Its images are the same, so the hidden result waits for ready.
    if (s.prev === "result" || s.prev === "empty") return keep(s);
    return go(s, { ...base, ...NO_PHOTO, app: "warming" }, CLEAR);
  }
  if (s.prev === "result" || s.prev === "empty") return go(s, { ...base, app: s.prev });
  if (s.prev === "waiting" && s.image) {
    const seq = s.seq + 1;
    return go(s, { ...base, app: "scanning", seq, pending: null }, CLEAR, scan(s.image.id, seq));
  }
  return go(s, { ...base, ...NO_PHOTO, app: "idle" }, CLEAR);
}

function onHealthFailed(s, timedOut) {
  if (s.app === "server-lost") return keep(s);
  // While the model is still loading a busy server can be slow to answer: one timed-out poll is a missed poll.
  // A refused or dropped connection (a crash) still goes to server-lost at once.
  if (timedOut && !s.modelReady) return keep(s);
  return go(s, { app: "server-lost", prev: s.app }, ...(busy(s) ? [ABORT] : []));
}

function onPick(s, e) {
  if (s.app === "boot-error" || s.app === "server-lost") return keep(s);
  if (e.key === s.photoKey && (s.app === "scanning" || s.app === "waiting")) return keep(s);   // UI-32
  const stop = busy(s) ? [ABORT] : [];
  const photo = { photoKey: e.key, image: e.image, name: e.name, pending: null, cached: false, error: null };
  if (!s.modelReady) return go(s, { ...photo, app: "waiting", pending: e.key }, ...stop, showPhoto(e));
  if (e.key === s.photoKey) return scanAgain(s);   // the photo on stage, clicked again: a fresh scan (UI-31)
  if (e.cachedResult) {   // a revisit replays the earlier result, or the earlier empty one (UI-31)
    const app = e.cachedResult.findings.length > 0 ? "result" : "empty";
    return go(s, { ...photo, app, cached: true }, ...stop, CLEAR, showPhoto(e),
      { type: "showCached", payload: e.cachedResult });
  }
  const seq = s.seq + 1;
  return go(s, { ...photo, app: "scanning", seq }, ...stop, CLEAR, showPhoto(e), scan(e.image.id, seq));
}

function onRescan(s) {
  const settled = s.app === "result" || s.app === "empty" || s.app === "error";
  return settled && s.image ? scanAgain(s) : keep(s);
}

function scanAgain(s) {
  const seq = s.seq + 1;
  return go(s, { app: "scanning", seq, cached: false, error: null }, CLEAR, scan(s.image.id, seq));
}

function onUpload(s, e) {
  if (s.app === "boot-error" || s.app === "server-lost") return keep(s);
  const stop = busy(s) ? [ABORT] : [];
  return go(s, { ...NO_PHOTO, app: "preparing", name: e.name }, ...stop, CLEAR, { type: "prepare" });
}

function onPrepared(s, e) {
  if (s.app !== "preparing") return keep(s);   // abandoned by a pick or a newer upload (R13)
  const photo = { photoKey: e.key, image: e.image, name: e.name };
  if (!s.modelReady) return go(s, { ...photo, app: "waiting", pending: e.key }, showPhoto(e));
  const seq = s.seq + 1;
  return go(s, { ...photo, app: "scanning", seq }, showPhoto(e), scan(e.image.id, seq));
}

function onPrepareFailed(s, error) {
  if (s.app !== "preparing" || IGNORED_ERRORS.has(error.kind)) return keep(s);
  if (error.kind === "server-lost") return go(s, { app: "server-lost", prev: s.app });
  return go(s, { app: "error", error }, { type: "showError", error });
}

function onResponse(s, { seq, payload }) {
  if (s.app !== "scanning" || seq !== s.seq) return keep(s);
  if (payload.findings.length > 0) return go(s, { app: "result", cached: false }, { type: "reveal", payload });
  return go(s, { app: "empty" }, { type: "showEmpty", payload });
}

function onFailed(s, { seq, error }) {
  if (s.app !== "scanning" || seq !== s.seq || IGNORED_ERRORS.has(error.kind)) return keep(s);
  if (error.kind === "server-lost") return go(s, { app: "server-lost", prev: s.app }, ABORT);
  return go(s, { app: "error", error }, { type: "showError", error });
}

function onTimeout(s, { seq }) {
  if (s.app !== "scanning" || seq !== s.seq) return keep(s);
  const error = { kind: "timeout" };
  return go(s, { app: "error", error }, ABORT, { type: "showError", error });
}

// The photo on stage couldn't be shown (it didn't decode, or its size isn't the size the server prepared). Its
// boxes could never be drawn, so the page drops the photo and any scan of it; picking it again starts afresh.
const PHOTO_STATES = new Set(["waiting", "scanning", "result", "empty", "error"]);

function onPhotoFailed(s, { key, error }) {
  if (key !== s.photoKey || !PHOTO_STATES.has(s.app)) return keep(s);
  return go(s, { ...NO_PHOTO, app: "error", error }, ...(busy(s) ? [ABORT] : []), CLEAR,
    { type: "showError", error });
}
