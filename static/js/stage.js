// The photo stage: the photo, the scan scene, and the boxes, leaders and tags drawn over it (UI-11 to UI-20,
// UI-29, UI-91). Text goes in with textContent only.
import { sentenceCase } from "./format.js";
import { placeTags } from "./placement.js";
import { S } from "./strings.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_BOX = 16;           // UI-14
const SAME_SPOT_IOU = 0.9;    // boxes of different types this close: the later one is inset
const SAME_SPOT_INSET = 4;
const STROKE = 3;
const DOT_RADIUS = 3.5;       // the 7px leader dot
const CATCH_UP_MS = 150;      // a late response: the sweep finishes its pass within this
const FADE_MS = 150;          // the dim and grid fade before the first box
const BAND_SHARE = 0.12;      // the sweep band is 12% of the frame height
export const REVEAL = { maxStagger: 300, window: 1500, wipe: 240, fade: 120, card: 200 };
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

const stage = document.getElementById("stage");
const frame = stage.querySelector(".frame");
const overlay = frame.querySelector(".overlay");
const tagLayer = frame.querySelector(".tags");
const scene = sceneLayer();

let photoToken = 0;
let drawn = null;             // {findings, nodes: Map(id -> {box, leader, tag})}
let layoutQueued = false;

new ResizeObserver(() => {
  if (!drawn || layoutQueued) return;
  layoutQueued = true;
  requestAnimationFrame(() => {
    layoutQueued = false;
    layout();
  });
}).observe(frame);

// --- Photo -----------------------------------------------------------------------------------------------------

export async function showPhoto(image, alt) {
  const token = ++photoToken;
  const img = photoElement();
  img.alt = alt;
  img.src = image.url;
  try {
    await img.decode();
  } catch (err) {
    if (token !== photoToken) return;   // replaced by a newer photo before it decoded
    throw err;
  }
  if (token !== photoToken) return;
  const off = (natural, sent) => Math.abs(natural / sent - 1) > 0.01;
  if (off(img.naturalWidth, image.width) || off(img.naturalHeight, image.height)) throw new Error("size-mismatch");
  stage.style.setProperty("--ar", String(img.naturalWidth / img.naturalHeight));
  stage.style.setProperty("--frame-max", `${2 * img.naturalWidth}px`);
  stage.classList.add("has-photo");
}

export function clearPhoto() {
  photoToken++;
  const img = document.getElementById("photo");
  if (img) {
    img.removeAttribute("src");
    img.alt = "";
  }
  stage.style.removeProperty("--ar");
  stage.style.removeProperty("--frame-max");
  stage.classList.remove("has-photo");
}

function photoElement() {
  let img = document.getElementById("photo");
  if (!img) {
    img = document.createElement("img");
    img.id = "photo";
    img.decoding = "async";
    frame.prepend(img);
  }
  return img;
}

// --- Scan scene (UI-29) ----------------------------------------------------------------------------------------

function sceneLayer() {
  const layer = document.createElement("div");
  layer.className = "scene";
  layer.setAttribute("aria-hidden", "true");
  const dim = document.createElement("div");
  dim.className = "scene-dim";
  const band = document.createElement("div");
  band.className = "scene-band";
  layer.append(dim, band);
  frame.querySelector(".overlay").before(layer);
  return layer;
}

const BAND_START = "translateY(-100%)";
const BAND_END = `translateY(${(1 / BAND_SHARE - 1) * 100}%)`;   // the leading edge on the frame's bottom

// Starts the dim, grid and sweep. finish() lets the first pass complete (or catches a later pass up within
// 150 ms), marks scene-end, fades the dim and grid out, then resolves. cancel() stops it at once.
export function startScene({ passMs }) {
  const band = scene.querySelector(".scene-band");
  scene.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  scene.classList.add("is-on");
  let sweep = band.animate([{ transform: BAND_START }, { transform: BAND_END }],
    { duration: passMs, iterations: Infinity, easing: "linear" });
  let stopped = false;
  let release = () => {};
  const cancelled = new Promise((resolve) => { release = resolve; });

  async function finish() {
    if (stopped) return;
    const elapsed = sweep.currentTime ?? 0;
    if (elapsed < passMs) {
      sweep.effect.updateTiming({ iterations: 1, fill: "forwards" });
    } else {
      const progress = (elapsed % passMs) / passMs;
      const from = `translateY(${(-1 + progress / BAND_SHARE) * 100}%)`;
      sweep.cancel();
      sweep = band.animate([{ transform: from }, { transform: BAND_END }],
        { duration: Math.min(CATCH_UP_MS, (1 - progress) * passMs), easing: "ease-out", fill: "forwards" });
    }
    if (!(await Promise.race([sweep.finished.then(() => true, () => false), cancelled]))) return;
    performance.mark("scene-end");
    const fade = scene.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: "ease-out" });
    if (!(await Promise.race([fade.finished.then(() => true, () => false), cancelled]))) return;
    stop();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    release(false);
    scene.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    scene.classList.remove("is-on");
  }

  return { finish, cancel: stop };
}

// --- Boxes, leaders and tags -----------------------------------------------------------------------------------

export function clearOverlays() {
  drawn = null;
  overlay.replaceChildren();
  tagLayer.replaceChildren();
}

// findings: the payload's shown findings, in card order. With animate, each box wipes in, then its leader and
// tag fade in, staggered so the whole reveal takes at most 1.5 s (UI-91).
export function drawOverlays(findings, { animate }) {
  clearOverlays();
  const nodes = new Map();
  for (const finding of findings) {
    nodes.set(finding.id, { box: boxNode(finding), leader: leaderNode(finding), tag: tagNode(finding) });
  }
  drawn = { findings, nodes };
  layout();
  if (animate) reveal(findings, nodes);
}

export function revealDelay(index, count) {
  return index * Math.min(REVEAL.maxStagger, REVEAL.window / count);
}

function reveal(findings, nodes) {
  findings.forEach((finding, index) => {
    const { box, leader, tag } = nodes.get(finding.id);
    const delay = revealDelay(index, findings.length);
    box.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0)" }],
      { duration: REVEAL.wipe, delay, easing: EASE_OUT, fill: "backwards" });
    for (const node of [leader, tag]) {
      node.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: REVEAL.fade, delay: delay + REVEAL.wipe, easing: EASE_OUT, fill: "backwards" });
    }
  });
  performance.mark("first-box");   // box 01's wipe starts now (R17)
}

export function setOverlaysVisible(visible) {
  overlay.classList.toggle("is-hidden", !visible);
  tagLayer.classList.toggle("is-hidden", !visible);
}

// Hovering or focusing a card: its box gets the solid outline and comes to the top with its tag; everything
// else fades to 35% (UI-20). null restores.
export function highlight(id) {
  if (!drawn) return;
  const lowered = overlay.querySelector(".box.is-highlighted");
  for (const [key, { box, leader, tag }] of drawn.nodes) {
    const on = key === id;
    const dim = id !== null && !on;
    box.classList.toggle("is-highlighted", on);
    tag.classList.toggle("is-highlighted", on);
    for (const node of [box, leader, tag]) node.classList.toggle("is-dimmed", dim);
  }
  // Only the raised box moves: a moved SVG node restarts its style, so a box fading to 35% would snap.
  const raised = id === null ? null : drawn.nodes.get(id)?.box;
  if (lowered && lowered !== raised) overlay.insertBefore(lowered, slotFor(lowered));
  if (raised) overlay.append(raised);
}

// Where a box belongs among the others, largest first, below the leaders.
function slotFor(box) {
  const area = Number(box.dataset.area);
  const below = [...overlay.querySelectorAll(".box:not(.is-highlighted)")]
    .find((other) => other !== box && Number(other.dataset.area) < area);
  return below ?? overlay.querySelector(".leader");
}

function boxNode(finding) {
  const g = svg("g", { class: `box sev-${severityClass(finding)}`, "data-box": finding.id, role: "img" });
  const anchor = finding.anchor;
  g.setAttribute("aria-label", S.boxName(finding.id, finding.category, finding.title, sentenceCase(anchor.item),
    finding.confidence));
  g.append(svg("rect", { class: "box-keyline" }), svg("rect", { class: "box-line" }),
    svg("rect", { class: "box-outline" }));
  return g;
}

function leaderNode(finding) {
  const g = svg("g", { class: `leader sev-${severityClass(finding)}`, "data-leader": finding.id,
    "aria-hidden": "true" });
  g.append(svg("polyline", { class: "leader-line" }), svg("circle", { class: "leader-dot", r: DOT_RADIUS }));
  return g;
}

function tagNode(finding) {
  const tag = document.createElement("div");
  tag.className = `tag sev-${severityClass(finding)}`;
  tag.dataset.tag = finding.id;
  tag.setAttribute("aria-hidden", "true");   // the box carries the accessible name
  return tag;
}

// Fills a tag in one of its three forms (UI-16, UI-17, PM-10). The space text nodes keep textContent readable
// as "01 No PPE" (R8).
function fillTag(tag, finding, form) {
  const number = textSpan("tag-num num", finding.id);
  const pct = textSpan("num", `${finding.confidence}%`);
  tag.dataset.form = form;
  if (form === "badge") {
    tag.replaceChildren(number);
  } else if (form === "short") {
    const line = textSpan("tag-cat", `${finding.category} `);
    line.append(pct);
    tag.replaceChildren(number, " ", line);
  } else {
    const anchor = textSpan("tag-anchor", `${sentenceCase(finding.anchor.item)} `);
    anchor.append(pct);
    tag.replaceChildren(number, " ", textSpan("tag-cat", finding.category), " ", anchor);
  }
}

// Positions every box, measures each tag's three forms off-screen, places the tags and draws the leaders.
// Runs on draw and, once per frame, on every resize of the frame (no transitions).
function layout() {
  if (!drawn) return;
  const size = { w: frame.clientWidth, h: frame.clientHeight };
  const rects = boxRects(drawn.findings, size);
  for (const finding of drawn.findings) setBoxRect(drawn.nodes.get(finding.id).box, rects.get(finding.id));
  stackBoxes();

  const items = drawn.findings.map((finding) => ({ id: finding.id, box: rects.get(finding.id),
    sizes: measureTag(finding) }));
  for (const placement of placeTags(size, items)) {
    const { leader, tag } = drawn.nodes.get(placement.id);
    fillTag(tag, drawn.findings.find((f) => f.id === placement.id), placement.form);
    tag.style.translate = `${placement.x}px ${placement.y}px`;
    tagLayer.append(tag);
    drawLeader(leader, placement.leader);
  }
}

function boxRects(findings, size) {
  const rects = new Map();
  const placed = [];
  for (const finding of findings) {
    const [x1, y1, x2, y2] = finding.anchor.box_norm;
    let rect = atLeast({ x: x1 * size.w, y: y1 * size.h, w: (x2 - x1) * size.w, h: (y2 - y1) * size.h }, size);
    if (placed.some((p) => p.hazard !== finding.hazard && iou(p.rect, rect) >= SAME_SPOT_IOU)) {
      rect = { x: rect.x + SAME_SPOT_INSET, y: rect.y + SAME_SPOT_INSET, w: rect.w - 2 * SAME_SPOT_INSET,
        h: rect.h - 2 * SAME_SPOT_INSET };
    }
    placed.push({ hazard: finding.hazard, rect });
    rects.set(finding.id, rect);
  }
  return rects;
}

function atLeast(rect, size) {
  const grow = (start, length, limit) => {
    if (length >= MIN_BOX) return [start, length];
    const centred = start - (MIN_BOX - length) / 2;
    return [Math.min(Math.max(centred, 0), limit - MIN_BOX), MIN_BOX];
  };
  const [x, w] = grow(rect.x, rect.w, size.w);
  const [y, h] = grow(rect.y, rect.h, size.h);
  return { x, y, w, h };
}

// The 3px stroke sits inside the box, the 1px keyline just outside it, and the highlight outline outside the
// stroke, so a box on the photo's edge keeps its whole outline (UI-14, UI-20).
function setBoxRect(g, r) {
  const [keyline, line, outline] = g.children;
  setRect(keyline, r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
  setRect(line, r.x + STROKE / 2, r.y + STROKE / 2, r.w - STROKE, r.h - STROKE);
  setRect(outline, r.x - STROKE / 2, r.y - STROKE / 2, r.w + STROKE, r.h + STROKE);
  g.dataset.area = String(r.w * r.h);
}

// Largest box at the bottom; leaders above the boxes; a highlighted box above everything in the layer (UI-15).
function stackBoxes() {
  if (!drawn) return;
  const boxes = [...drawn.nodes.values()].map((n) => n.box)
    .sort((a, b) => Number(b.dataset.area) - Number(a.dataset.area));
  const raised = boxes.filter((box) => box.classList.contains("is-highlighted"));
  const leaders = [...drawn.nodes.values()].map((n) => n.leader);
  overlay.append(...boxes.filter((box) => !raised.includes(box)), ...leaders, ...raised);
}

function measureTag(finding) {
  const probe = document.createElement("div");
  probe.className = "tag-probe";
  const forms = ["full", "short", "badge"].map((form) => {
    const tag = tagNode(finding);
    fillTag(tag, finding, form);
    probe.append(tag);
    return [form, tag];
  });
  tagLayer.append(probe);
  const sizes = Object.fromEntries(forms.map(([form, tag]) => [form, { w: tag.offsetWidth, h: tag.offsetHeight }]));
  probe.remove();
  return sizes;
}

function drawLeader(g, leader) {
  const [line, dot] = g.children;
  g.style.display = leader === null ? "none" : "";
  if (leader === null) return;
  line.setAttribute("points", leader.points.map(([x, y]) => `${x},${y}`).join(" "));
  dot.setAttribute("cx", leader.points[0][0]);
  dot.setAttribute("cy", leader.points[0][1]);
}

// --- Helpers ---------------------------------------------------------------------------------------------------

const severityClass = (finding) => (finding.severity === "high" ? "high" : "med");

function svg(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function setRect(rect, x, y, w, h) {
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", Math.max(0, w));
  rect.setAttribute("height", Math.max(0, h));
}

function textSpan(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

function iou(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.w * a.h + b.w * b.h - inter);
}
