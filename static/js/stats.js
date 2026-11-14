// The stats slot under the photo: the "Scanning for …" line during a scan, then one row of tiles (UI-36 to
// UI-40, PM-2, PM-4), or the error bar (UI-35). Text goes in with textContent only.
import { displayName, formatModelTime, splitMiddle } from "./format.js";
import { S } from "./strings.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const row = document.getElementById("stats");
const PHOTO_MIN = 160;   // the Photo tile ellipsises down to this before anything gives way (UI-39, R20)
let shown = null;        // the last renderStats() arguments, so the row can re-fit when the frame resizes
let fitQueued = false;

new ResizeObserver(() => {
  if (!shown || fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    fitStats();
  });
}).observe(row);

// findings: the shown findings. photoName: the scene name, or the uploaded file's name when `uploaded`.
export function renderStats({ findings, modelMs, photoName, uploaded = false, cached = false }) {
  shown = { findings, modelMs, photoName, uploaded, cached };
  fitStats();
}

// Lays the row out in full, then gives way while it overflows: first the categories merge into one tile,
// then the Photo tile goes (PM-2). "Hazards flagged" and "Model time" always stay.
export function fitStats() {
  if (!shown) return;
  for (const mode of ["full", "merged", "no-photo"]) {
    draw(shown, mode);
    if (row.scrollWidth <= row.clientWidth) return;
  }
}

export function clearStats() {
  shown = null;
  row.replaceChildren();
}

// The prompt words from config, one line with an ellipsis; the full list in the tooltip (UI-30).
export function renderScanLine(vocabulary) {
  shown = null;
  const words = S.scanLine(vocabulary);
  const line = document.createElement("p");
  line.className = "scan-line";
  line.title = words;
  line.append(span("scan-words", words), span("scan-elapsed", ""));
  row.replaceChildren(line);
}

// In `error` an inline bar takes the slot (UI-35, UI-40): the message, the details line if there is one, and
// "Scan again" when there is a photo to scan again (R21: upload rejections have none).
export function renderErrorBar({ message, details = null, onRetry = null }) {
  shown = null;
  const bar = document.createElement("div");
  bar.className = "error-bar";
  bar.setAttribute("role", "alert");
  const text = document.createElement("div");
  text.className = "error-text";
  text.append(paragraph("error-msg", message));
  if (details) {
    const line = paragraph("error-details", details);
    line.title = details;   // one line on screen; the whole text in the tooltip and the server window
    text.append(line);
  }
  const dot = span("error-dot", "");   // the header's failure red (UI-27), drawn in CSS
  dot.setAttribute("aria-hidden", "true");
  bar.append(dot, text);
  if (onRetry) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "error-retry";
    retry.textContent = S.scanAgain;
    retry.addEventListener("click", onRetry);
    bar.append(retry);
  }
  row.replaceChildren(bar);
}

export function setScanElapsed(seconds) {
  const counter = row.querySelector(".scan-elapsed");
  if (counter) counter.textContent = S.scanElapsed(seconds);
}

function draw({ findings, modelMs, photoName, uploaded, cached }, mode) {
  const categories = new Map();
  for (const finding of findings) {
    const entry = categories.get(finding.category) ?? { severity: finding.severity, count: 0 };
    entry.count += 1;
    categories.set(finding.category, entry);
  }
  const tiles = [tile(S.statHazards, String(findings.length))];
  if (mode === "full") {
    for (const [category, { severity, count }] of categories) tiles.push(categoryTile(category, severity, count));
  } else if (categories.size > 0) {   // an empty result has no category tiles to merge (UI-34)
    tiles.push(tile(S.statCategories, String(categories.size)));
  }
  tiles.push(timeTile(modelMs, cached));
  if (mode !== "no-photo") tiles.push(photoTile(photoName, uploaded));
  row.replaceChildren(...tiles);
  const photo = row.querySelector(".stat-photo");
  if (photo) {   // a short name never shrinks; a long one ellipsises down to PHOTO_MIN
    photo.style.flexShrink = "0";
    photo.style.minWidth = `${Math.min(PHOTO_MIN, photo.offsetWidth)}px`;
    photo.style.flexShrink = "";
  }
}

function tile(key, value, className = "") {
  const node = document.createElement("div");
  node.className = `stat ${className}`.trim();
  node.append(span("stat-key", key), span("stat-value num", value));
  return node;
}

// The label in severity ink, after a 24×4 sample of its box's dash (UI-37, UI-80).
function categoryTile(category, severity, count) {
  const node = tile(category, String(count));
  const key = node.querySelector(".stat-key");
  key.classList.add(severity === "high" ? "sev-high" : "sev-med");
  key.prepend(lineSample());
  return node;
}

function timeTile(modelMs, cached) {
  const { value, unit } = formatModelTime(modelMs);
  const node = tile(cached ? S.statModelTimeEarlier : S.statModelTime, value);
  // The no-break space sits in the unit's own small type, so the gap before "ms" is a normal space (UI-38).
  node.querySelector(".stat-value").append(span("stat-unit", `\u00a0${unit}`));
  return node;
}

// A scene name ends in an ellipsis; a file name loses its extension and keeps its last 10 characters (UI-33).
function photoTile(name, uploaded) {
  const node = document.createElement("div");
  node.className = "stat stat-photo";
  const value = span("stat-value", "");
  value.title = name;
  if (uploaded) {
    const [head, tail] = splitMiddle(displayName(name));
    value.append(span("photo-head", head), span("photo-tail", tail));
  } else {
    value.append(span("photo-head", name));
  }
  node.append(span("stat-key", S.statPhoto), value);
  return node;
}

// The box's own stroke, 24×4: the same dash pattern and colour token as the boxes on the photo.
function lineSample() {
  const sample = document.createElementNS(SVG_NS, "svg");
  sample.setAttribute("class", "stat-sample");
  sample.setAttribute("viewBox", "0 0 24 4");
  sample.setAttribute("aria-hidden", "true");
  const line = document.createElementNS(SVG_NS, "line");
  for (const [name, value] of Object.entries({ x1: 0, y1: 2, x2: 24, y2: 2 })) line.setAttribute(name, value);
  sample.append(line);
  return sample;
}

function paragraph(className, text) {
  const node = document.createElement("p");
  node.className = className;
  node.textContent = text;
  return node;
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}
