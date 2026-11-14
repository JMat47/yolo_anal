import assert from "node:assert/strict";
import test from "node:test";

import { initialState, reduce } from "../../static/js/state.js";

const A = { key: "site-ppe", image: { id: "aaaa", width: 382, height: 344 }, name: "Column bay" };
const B = { key: "site-stairs", image: { id: "bbbb", width: 380, height: 340 }, name: "Stair flight" };
const U = { key: "upload:cccc", image: { id: "cccc", width: 800, height: 600 }, name: "IMG_0042.jpg" };
const RESULT = { seq: 1, findings: [{ id: "01" }], hidden_count: 0 };
const EMPTY = { seq: 1, findings: [], hidden_count: 0 };

const health = (state, boot = "boot-1") => ({ type: "health", health: { state, boot_id: boot, model: "m", message: "" } });
const pick = (photo, extra = {}) => ({ type: "pick", ...photo, ...extra });
const types = (effects) => effects.map((e) => e.type);

// A state that is already past boot with the model ready, showing photo A unless overridden.
const at = (app, patch = {}) => ({
  ...initialState, app, modelReady: true, bootId: "boot-1", photoKey: A.key, image: A.image, name: A.name, seq: 1,
  ...patch,
});

function step(state, event) {
  const out = reduce(state, event);
  return { state: out.state, effects: out.effects, kinds: types(out.effects) };
}

// Boot (brief rows, plus R4)

test("booting + health loading -> warming", () => {
  const { state, kinds } = step(initialState, health("loading"));
  assert.equal(state.app, "warming");
  assert.equal(state.bootId, "boot-1");
  assert.deepEqual(kinds, []);
});

test("warming + health ready -> idle with the model ready", () => {
  const { state, kinds } = step({ ...initialState, app: "warming" }, health("ready"));
  assert.equal(state.app, "idle");
  assert.equal(state.modelReady, true);
  assert.deepEqual(kinds, []);
});

test("booting + health error -> boot-error", () => {
  const { state, kinds } = step(initialState, health("error"));
  assert.equal(state.app, "boot-error");
  assert.deepEqual(kinds, []);
});

test("R4: booting + health ready -> idle with the model ready", () => {
  const { state } = step(initialState, health("ready"));
  assert.equal(state.app, "idle");
  assert.equal(state.modelReady, true);
});

test("R4: warming + health error -> boot-error", () => {
  assert.equal(step({ ...initialState, app: "warming" }, health("error")).state.app, "boot-error");
});

test("R4: waiting + health error -> boot-error, the pending pick dropped", () => {
  const waiting = { ...initialState, app: "waiting", pending: A.key, photoKey: A.key, image: A.image };
  const { state, kinds } = step(waiting, health("error"));
  assert.equal(state.app, "boot-error");
  assert.equal(state.pending, null);
  assert.deepEqual(kinds, []);
});

test("boot-error + health ready -> idle", () => {
  const { state, kinds } = step({ ...initialState, app: "boot-error", bootId: "boot-1" }, health("ready"));
  assert.equal(state.app, "idle");
  assert.equal(state.modelReady, true);
  assert.deepEqual(kinds, []);
});

// Picks before the model is ready (UI-28)

test("warming + pick A -> waiting with A pending, photo shown", () => {
  const { state, effects } = step({ ...initialState, app: "warming" }, pick(A));
  assert.equal(state.app, "waiting");
  assert.equal(state.pending, A.key);
  assert.deepEqual(effects, [{ type: "showPhoto", key: A.key, image: A.image, name: A.name }]);
});

test("waiting + pick B -> waiting with B pending", () => {
  const waiting = { ...initialState, app: "waiting", pending: A.key, photoKey: A.key, image: A.image };
  const { state, kinds } = step(waiting, pick(B));
  assert.equal(state.app, "waiting");
  assert.equal(state.pending, B.key);
  assert.deepEqual(kinds, ["showPhoto"]);
});

test("waiting + health ready -> scanning seq 1, scanning the pending photo", () => {
  const waiting = { ...initialState, app: "waiting", bootId: "boot-1", pending: B.key, photoKey: B.key,
    image: B.image, name: B.name };
  const { state, effects } = step(waiting, health("ready"));
  assert.equal(state.app, "scanning");
  assert.equal(state.seq, 1);
  assert.equal(state.pending, null);
  assert.deepEqual(effects, [{ type: "clear" }, { type: "scan", imageId: B.image.id, seq: 1 }]);
});

// Picks and scans

test("idle + pick A -> scanning seq 1", () => {
  const idle = { ...initialState, app: "idle", modelReady: true, bootId: "boot-1" };
  const { state, effects } = step(idle, pick(A));
  assert.equal(state.app, "scanning");
  assert.equal(state.seq, 1);
  assert.equal(state.photoKey, A.key);
  assert.deepEqual(types(effects), ["clear", "showPhoto", "scan"]);
  assert.deepEqual(effects[2], { type: "scan", imageId: A.image.id, seq: 1 });
});

test("scanning A/1 + pick B -> scanning seq 2, the old request aborted first", () => {
  const { state, effects } = step(at("scanning"), pick(B));
  assert.equal(state.app, "scanning");
  assert.equal(state.seq, 2);
  assert.equal(state.photoKey, B.key);
  assert.deepEqual(types(effects), ["abort", "clear", "showPhoto", "scan"]);
  assert.deepEqual(effects[3], { type: "scan", imageId: B.image.id, seq: 2 });
});

test("scanning A + pick A -> no change", () => {
  const before = at("scanning");
  const { state, kinds } = step(before, pick(A));
  assert.equal(state, before);
  assert.deepEqual(kinds, []);
});

test("scanning seq 2 + response seq 1 -> dropped", () => {
  const before = at("scanning", { seq: 2 });
  const { state, kinds } = step(before, { type: "response", seq: 1, payload: RESULT });
  assert.equal(state, before);
  assert.deepEqual(kinds, []);
});

test("scanning seq 2 + response seq 2 with findings -> result, reveal", () => {
  const payload = { ...RESULT, seq: 2 };
  const { state, effects } = step(at("scanning", { seq: 2 }), { type: "response", seq: 2, payload });
  assert.equal(state.app, "result");
  assert.equal(state.cached, false);
  assert.deepEqual(effects, [{ type: "reveal", payload }]);
});

test("scanning + response with no findings -> empty", () => {
  const { state, effects } = step(at("scanning"), { type: "response", seq: 1, payload: EMPTY });
  assert.equal(state.app, "empty");
  assert.deepEqual(effects, [{ type: "showEmpty", payload: EMPTY }]);
});

test("scanning + failed model-error -> error", () => {
  const error = { kind: "model-error", detail: "boom" };
  const { state, effects } = step(at("scanning"), { type: "failed", seq: 1, error });
  assert.equal(state.app, "error");
  assert.deepEqual(state.error, error);
  assert.deepEqual(effects, [{ type: "showError", error }]);
});

test("scanning seq 2 + timeout seq 2 -> error of kind timeout, request aborted", () => {
  const { state, effects } = step(at("scanning", { seq: 2 }), { type: "timeout", seq: 2 });
  assert.equal(state.app, "error");
  assert.deepEqual(state.error, { kind: "timeout" });
  assert.deepEqual(effects, [{ type: "abort" }, { type: "showError", error: { kind: "timeout" } }]);
});

test("scanning seq 2 + timeout seq 1 -> dropped", () => {
  const before = at("scanning", { seq: 2 });
  assert.equal(step(before, { type: "timeout", seq: 1 }).state, before);
});

test("result A + pick A -> a fresh scan of the same photo", () => {
  const { state, effects } = step(at("result"), pick(A, { cachedResult: RESULT }));
  assert.equal(state.app, "scanning");
  assert.equal(state.seq, 2);
  assert.deepEqual(effects, [{ type: "clear" }, { type: "scan", imageId: A.image.id, seq: 2 }]);
});

test("idle + pick with a cached result -> result marked cached, no scan", () => {
  const idle = { ...initialState, app: "idle", modelReady: true, bootId: "boot-1" };
  const { state, effects } = step(idle, pick(A, { cachedResult: RESULT }));
  assert.equal(state.app, "result");
  assert.equal(state.cached, true);
  assert.deepEqual(types(effects), ["clear", "showPhoto", "showCached"]);
  assert.deepEqual(effects[2], { type: "showCached", payload: RESULT });
});

test("result + rescan -> scanning", () => {
  const { state, effects } = step(at("result"), { type: "rescan" });
  assert.equal(state.app, "scanning");
  assert.equal(state.seq, 2);
  assert.deepEqual(effects, [{ type: "clear" }, { type: "scan", imageId: A.image.id, seq: 2 }]);
});

// R5: rescan from result, empty and error; pick from idle, result, empty and error

for (const from of ["empty", "error"]) {
  test(`R5: ${from} + rescan -> scanning`, () => {
    const { state, kinds } = step(at(from), { type: "rescan" });
    assert.equal(state.app, "scanning");
    assert.deepEqual(kinds, ["clear", "scan"]);
  });
}

test("R5: idle + rescan -> no change", () => {
  const idle = { ...initialState, app: "idle", modelReady: true };
  assert.equal(step(idle, { type: "rescan" }).state, idle);
});

test("R5: error after a rejected upload has no photo, so rescan does nothing", () => {
  const before = at("error", { photoKey: null, image: null, error: { kind: "unsupported" } });
  assert.equal(step(before, { type: "rescan" }).state, before);
});

for (const from of ["result", "empty", "error"]) {
  test(`R5: ${from} + pick B -> scanning B`, () => {
    const { state, kinds } = step(at(from), pick(B));
    assert.equal(state.app, "scanning");
    assert.equal(state.photoKey, B.key);
    assert.equal(state.error, null);
    assert.deepEqual(kinds, ["clear", "showPhoto", "scan"]);
  });

  test(`R5: ${from} + pick B with a cached result -> result, cached`, () => {
    const { state, kinds } = step(at(from), pick(B, { cachedResult: RESULT }));
    assert.equal(state.app, "result");
    assert.equal(state.cached, true);
    assert.deepEqual(kinds, ["clear", "showPhoto", "showCached"]);
  });
}

test("R5: empty A + pick A -> a fresh scan", () => {
  const { state, kinds } = step(at("empty"), pick(A));
  assert.equal(state.app, "scanning");
  assert.deepEqual(kinds, ["clear", "scan"]);
});

test("R5: scanning A + pick B with a cached result -> abort, then show the cached result", () => {
  const { state, kinds } = step(at("scanning"), pick(B, { cachedResult: RESULT }));
  assert.equal(state.app, "result");
  assert.equal(state.cached, true);
  assert.deepEqual(kinds, ["abort", "clear", "showPhoto", "showCached"]);
});

test("boot-error + pick -> ignored (thumbnails are disabled)", () => {
  const before = { ...initialState, app: "boot-error" };
  assert.equal(step(before, pick(A)).state, before);
});

// Server lost (R6: recovery needs no redraw)

test("result + healthFailed -> server-lost, remembering result", () => {
  const { state, kinds } = step(at("result"), { type: "healthFailed" });
  assert.equal(state.app, "server-lost");
  assert.equal(state.prev, "result");
  assert.deepEqual(kinds, []);
});

test("scanning + healthFailed -> server-lost, the request and scene stopped", () => {
  const { state, kinds } = step(at("scanning"), { type: "healthFailed" });
  assert.equal(state.app, "server-lost");
  assert.equal(state.prev, "scanning");
  assert.deepEqual(kinds, ["abort"]);
});

test("server-lost + healthFailed -> no change", () => {
  const before = at("server-lost", { prev: "result" });
  assert.equal(step(before, { type: "healthFailed" }).state, before);
});

for (const prev of ["result", "empty"]) {
  test(`server-lost + health ready, same boot -> back to ${prev}, nothing redrawn`, () => {
    const { state, kinds } = step(at("server-lost", { prev }), health("ready"));
    assert.equal(state.app, prev);
    assert.equal(state.prev, null);
    assert.deepEqual(kinds, []);
  });
}

test("server-lost + health ready, same boot, from a scan -> idle with the stage cleared", () => {
  const { state, kinds } = step(at("server-lost", { prev: "scanning" }), health("ready"));
  assert.equal(state.app, "idle");
  assert.equal(state.photoKey, null);
  assert.deepEqual(kinds, ["clear"]);
});

test("server-lost + health ready, new boot -> idle, cache and stage cleared", () => {
  const { state, kinds } = step(at("server-lost", { prev: "result" }), health("ready", "boot-2"));
  assert.equal(state.app, "idle");
  assert.equal(state.bootId, "boot-2");
  assert.equal(state.photoKey, null);
  assert.deepEqual(kinds, ["clearCache", "clear"]);
});

test("server-lost + health loading, new boot -> warming, cache and stage cleared", () => {
  const { state, kinds } = step(at("server-lost", { prev: "result" }), health("loading", "boot-2"));
  assert.equal(state.app, "warming");
  assert.equal(state.modelReady, false);
  assert.deepEqual(kinds, ["clearCache", "clear"]);
});

test("result + health ready with a new boot id -> idle, cache and stage cleared", () => {
  const { state, kinds } = step(at("result"), health("ready", "boot-2"));
  assert.equal(state.app, "idle");
  assert.deepEqual(kinds, ["clearCache", "clear"]);
});

test("result + health ready, same boot -> no change", () => {
  const before = at("result");
  assert.equal(step(before, health("ready")).state, before);
});

// Uploads (R13)

test("idle + upload -> preparing, clearing the screen", () => {
  const idle = { ...initialState, app: "idle", modelReady: true };
  const { state, kinds } = step(idle, { type: "upload", name: U.name });
  assert.equal(state.app, "preparing");
  assert.equal(state.name, U.name);
  assert.deepEqual(kinds, ["clear", "prepare"]);
});

for (const from of ["result", "empty", "error"]) {
  test(`R13: ${from} + upload -> preparing`, () => {
    const { state, kinds } = step(at(from), { type: "upload", name: U.name });
    assert.equal(state.app, "preparing");
    assert.equal(state.photoKey, null);
    assert.deepEqual(kinds, ["clear", "prepare"]);
  });
}

test("R13: scanning + upload -> abort, then preparing", () => {
  const { state, kinds } = step(at("scanning"), { type: "upload", name: U.name });
  assert.equal(state.app, "preparing");
  assert.deepEqual(kinds, ["abort", "clear", "prepare"]);
});

test("preparing + prepared with the model ready -> scanning the upload", () => {
  const preparing = at("preparing", { photoKey: null, image: null, name: U.name });
  const { state, effects } = step(preparing, { type: "prepared", ...U });
  assert.equal(state.app, "scanning");
  assert.equal(state.photoKey, U.key);
  assert.deepEqual(effects, [{ type: "showPhoto", key: U.key, image: U.image, name: U.name },
    { type: "scan", imageId: U.image.id, seq: 2 }]);
});

test("preparing + prepared, model not ready -> waiting", () => {
  const preparing = { ...initialState, app: "preparing", name: U.name };
  const { state, kinds } = step(preparing, { type: "prepared", ...U });
  assert.equal(state.app, "waiting");
  assert.equal(state.pending, U.key);
  assert.deepEqual(kinds, ["showPhoto"]);
});

test("preparing + prepareFailed -> error", () => {
  const error = { kind: "unsupported", format: "heic" };
  const { state, effects } = step(at("preparing", { image: null, photoKey: null }), { type: "prepareFailed", error });
  assert.equal(state.app, "error");
  assert.deepEqual(effects, [{ type: "showError", error }]);
});

test("idle + prepared (not preparing) -> dropped", () => {
  const idle = { ...initialState, app: "idle", modelReady: true };
  assert.equal(step(idle, { type: "prepared", ...U }).state, idle);
});

test("R13: preparing + pick -> the prepare abandoned, the pick scanned", () => {
  const { state, kinds } = step(at("preparing", { image: null, photoKey: null }), pick(B));
  assert.equal(state.app, "scanning");
  assert.equal(state.photoKey, B.key);
  assert.deepEqual(kinds, ["abort", "clear", "showPhoto", "scan"]);
});

test("R13: a stale prepared after that pick is dropped", () => {
  const scanningB = step(at("preparing", { image: null, photoKey: null }), pick(B)).state;
  const { state, kinds } = step(scanningB, { type: "prepared", ...U });
  assert.equal(state, scanningB);
  assert.deepEqual(kinds, []);
});

// Error kinds (R21)

for (const kind of ["superseded", "aborted"]) {
  test(`R21: scanning + failed ${kind} -> ignored`, () => {
    const before = at("scanning");
    assert.equal(step(before, { type: "failed", seq: 1, error: { kind } }).state, before);
  });
}

test("R21: scanning + failed server-lost -> server-lost", () => {
  const { state } = step(at("scanning"), { type: "failed", seq: 1, error: { kind: "server-lost" } });
  assert.equal(state.app, "server-lost");
  assert.equal(state.prev, "scanning");
});

test("R21: scanning + failed not-ready -> error with its own kind", () => {
  const { state, kinds } = step(at("scanning"), { type: "failed", seq: 1, error: { kind: "not-ready" } });
  assert.equal(state.app, "error");
  assert.equal(state.error.kind, "not-ready");
  assert.deepEqual(kinds, ["showError"]);
});

test("R21: preparing + prepareFailed aborted -> ignored", () => {
  const before = at("preparing", { image: null, photoKey: null });
  assert.equal(step(before, { type: "prepareFailed", error: { kind: "aborted" } }).state, before);
});
