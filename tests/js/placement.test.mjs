import assert from "node:assert/strict";
import test from "node:test";

import { placeTags } from "../../static/js/placement.js";

const SIZES = { full: { w: 150, h: 52 }, short: { w: 140, h: 30 }, badge: { w: 28, h: 28 } };
const INSET = 8;
const GAP = 8;

const item = (id, box) => ({ id, box, sizes: SIZES });
const rectOf = (p, items) => ({ x: p.x, y: p.y, ...items.find((i) => i.id === p.id).sizes[p.form] });

// UI-18 fixture, in fractions of the frame: two boxes overlapping, one on each frame edge, one covering 85%.
const FIXTURE = [
  [0.00, 0.45, 0.18, 0.30],   // left edge
  [0.80, 0.18, 0.20, 0.30],   // right edge, overlapping the top-edge box below
  [0.62, 0.00, 0.26, 0.24],   // top edge
  [0.30, 0.78, 0.30, 0.22],   // bottom edge
  [0.04, 0.04, 0.92, 0.92],   // 85% of the frame
];

function fixtureItems(frame) {
  return FIXTURE.map(([x, y, w, h], i) =>
    item(`0${i + 1}`, { x: x * frame.w, y: y * frame.h, w: w * frame.w, h: h * frame.h }));
}

function onBorder([px, py], b) {
  const eps = 1e-6;
  const inX = px >= b.x - eps && px <= b.x + b.w + eps;
  const inY = py >= b.y - eps && py <= b.y + b.h + eps;
  const onV = Math.abs(px - b.x) < eps || Math.abs(px - (b.x + b.w)) < eps;
  const onH = Math.abs(py - b.y) < eps || Math.abs(py - (b.y + b.h)) < eps;
  return (onV && inY) || (onH && inX);
}

function gapBetween(a, b) {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
  return Math.max(dx, dy);
}

test("a single centred box gets a full tag on its right", () => {
  const frame = { w: 701, h: 526 };
  const [p] = placeTags(frame, [item("01", { x: 250, y: 200, w: 120, h: 120 })]);
  assert.equal(p.side, "right");
  assert.equal(p.form, "full");
  assert.equal(p.x, 250 + 120 + 24);
  assert.equal(p.y, 200);
  assert.deepEqual(p.leader.points, [[370, 226], [394, 226]]);
});

test("a box touching the right edge puts its tag on the left", () => {
  const frame = { w: 701, h: 526 };
  const [p] = placeTags(frame, [item("01", { x: 560, y: 200, w: 141, h: 120 })]);
  assert.equal(p.side, "left");
  assert.equal(p.x, 560 - 24 - 150);
});

test("an 85% box gets a placement fully inside the 8px inset", () => {
  const frame = { w: 701, h: 526 };
  const box = { x: 0.04 * frame.w, y: 0.04 * frame.h, w: 0.92 * frame.w, h: 0.92 * frame.h };
  const [p] = placeTags(frame, [item("01", box)]);
  const size = SIZES[p.form];
  assert.ok(p.x >= INSET && p.y >= INSET && p.x + size.w <= frame.w - INSET && p.y + size.h <= frame.h - INSET);
  assert.equal(p.side, "inside");
  assert.equal(p.leader, null);
});

for (const frame of [{ w: 701, h: 526 }, { w: 394, h: 526 }, { w: 617, h: 347 }]) {
  test(`UI-18 fixture on ${frame.w}x${frame.h}: tags apart, inside the inset, leaders start on their boxes`, () => {
    const items = fixtureItems(frame);
    const placed = placeTags(frame, items);
    assert.deepEqual(placed.map((p) => p.id), items.map((i) => i.id));
    const rects = placed.map((p) => rectOf(p, items));
    for (const r of rects) {
      assert.ok(r.x >= INSET - 1e-9 && r.y >= INSET - 1e-9, JSON.stringify(r));
      assert.ok(r.x + r.w <= frame.w - INSET + 1e-9 && r.y + r.h <= frame.h - INSET + 1e-9, JSON.stringify(r));
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        assert.ok(gapBetween(rects[i], rects[j]) >= GAP - 1e-9, `${placed[i].id} and ${placed[j].id} too close`);
      }
    }
    for (const p of placed) {
      if (p.leader) assert.ok(onBorder(p.leader.points[0], items.find((i) => i.id === p.id).box), p.id);
    }
    assert.equal(placed[4].form, "badge");   // finding 5 and later are always badges (UI-17)
  });
}

test("placement is deterministic", () => {
  const frame = { w: 617, h: 347 };
  assert.deepEqual(placeTags(frame, fixtureItems(frame)), placeTags(frame, fixtureItems(frame)));
});

test("a frame under 600px wide uses a 16px leader", () => {
  const frame = { w: 560, h: 420 };
  const [p] = placeTags(frame, [item("01", { x: 150, y: 150, w: 100, h: 100 })]);
  assert.equal(p.side, "right");
  assert.equal(p.x, 150 + 100 + 16);
});

test("a gap under 12px hides the leader", () => {
  const frame = { w: 560, h: 420 };
  const [p] = placeTags(frame, [item("01", { x: 150, y: 150, w: 100, h: 100 })], { leader: 10 });
  assert.equal(p.x, 260);
  assert.equal(p.leader, null);
});

test("a tag clamped clear of its box gets one 90-degree bend from the box border", () => {
  const frame = { w: 701, h: 526 };
  const box = { x: 300, y: 519, w: 40, h: 6 };   // a thin box inside the bottom 8px band
  const [p] = placeTags(frame, [item("01", box)]);
  assert.equal(p.side, "right");
  assert.equal(p.y, 526 - INSET - 52);
  assert.equal(p.leader.points.length, 3);
  assert.ok(onBorder(p.leader.points[0], box));
});

test("the second tag avoids the first", () => {
  const frame = { w: 701, h: 526 };
  const items = [item("01", { x: 100, y: 100, w: 100, h: 100 }), item("02", { x: 100, y: 130, w: 100, h: 100 })];
  const placed = placeTags(frame, items);
  assert.ok(gapBetween(rectOf(placed[0], items), rectOf(placed[1], items)) >= GAP);
});

test("when nothing fits, the badge goes inside the box's top-left corner", () => {
  const frame = { w: 60, h: 60 };   // no room around the box, and the badge would cover 49% of it
  const [p] = placeTags(frame, [item("01", { x: 10, y: 10, w: 40, h: 40 })]);
  assert.deepEqual(p, { id: "01", form: "badge", x: 18, y: 18, side: "inside", leader: null });
});
