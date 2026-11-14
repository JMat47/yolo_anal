// The photo strip (UI-8, UI-9, UI-33): the demo thumbnails and the uploaded photo's slot before the Upload tile.
// It knows which photo each thumbnail stands for; main.js decides what a pick does.
import { scrollBehavior, span } from "./dom.js";
import { displayName, splitMiddle } from "./format.js";
import { S } from "./strings.js";

export const UPLOAD_PREFIX = "upload:";

const strip = document.getElementById("strip");
const demoPhotos = new Map();   // id -> {id, scene, image}
let uploadSlot = null;          // the uploaded photo's thumbnail: {key, image, name}

export const isUpload = (key) => key?.startsWith(UPLOAD_PREFIX) ?? false;

export function renderStrip(photos) {
  for (const photo of photos) if (!photo.missing) demoPhotos.set(photo.id, photo);
  strip.replaceChildren(...photos.map((photo) => (photo.missing ? missingTile(photo)
    : thumbnail(photo.id, photo.image, photo.scene))));
}

// current: the photo key on stage. locked: nothing can be scanned. waiting: a pick scans once the model is ready
// (PM-13). moved: the photo on stage just changed, so its thumbnail scrolls into view.
export function renderThumbs({ current, locked, waiting, moved }) {
  for (const thumb of strip.querySelectorAll("button.thumb")) {
    const on = thumb.dataset.photo === current;
    thumb.setAttribute("aria-current", on ? "true" : "false");
    thumb.disabled = locked;
    thumb.title = waiting ? S.thumbWaitTitle : thumb.dataset.name;
    if (on && moved) thumb.scrollIntoView({ block: "nearest", inline: "nearest", behavior: scrollBehavior() });
  }
}

// The demo photo `step` places after (1) or before (-1) the one on stage, or null (UI-94). It never wraps, and
// never lands on the uploaded photo or the Upload tile: from the upload slot, back goes to the last demo photo;
// with nothing on stage, forward goes to the first.
export function neighbour(key, step) {
  const ids = [...demoPhotos.keys()];
  const index = ids.indexOf(key);
  if (index !== -1) return ids[index + step] ?? null;
  if (isUpload(key)) return step < 0 ? ids.at(-1) ?? null : null;
  return step > 0 ? ids[0] ?? null : null;
}

// An uploaded photo takes one slot at the end of the strip, just before the Upload tile; a later upload replaces
// it (UI-33). Returns the slot's photo key.
export function setUploadSlot(image) {
  dropUploadSlot();
  uploadSlot = { key: UPLOAD_PREFIX + image.id, image, name: image.name };
  strip.append(thumbnail(uploadSlot.key, image, image.name, { uploaded: true }));
  return uploadSlot.key;
}

export function dropUploadSlot() {
  strip.querySelector(".thumb.is-upload")?.remove();
  uploadSlot = null;
}

// Keyboard focus to a photo's thumbnail. renderThumbs has already scrolled it into view, so focus doesn't scroll.
export function focusThumb(key) {
  for (const thumb of strip.querySelectorAll("button.thumb")) {
    if (thumb.dataset.photo === key) thumb.focus({ preventScroll: true });
  }
}

// {key, image, name} for a thumbnail's photo key, or null.
export function photoFor(key) {
  const photo = demoPhotos.get(key);
  if (photo) return { key: photo.id, image: photo.image, name: photo.scene };
  return uploadSlot?.key === key ? uploadSlot : null;
}

// handler({key, image, name}) runs when a thumbnail is clicked.
export function onPick(handler) {
  strip.addEventListener("click", (event) => {
    const photo = photoFor(event.target.closest(".thumb")?.dataset.photo);
    if (photo) handler(photo);
  });
}

// A scene name is its own caption; an uploaded file loses its extension and keeps its last 10 characters, with
// the full name in the tooltip (UI-33, UI-67).
function thumbnail(key, image, name, { uploaded = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = uploaded ? "thumb is-upload" : "thumb";
  button.dataset.photo = key;
  button.dataset.name = name;
  button.setAttribute("aria-label", S.thumbName(uploaded ? displayName(name) : name));
  const img = document.createElement("img");
  img.src = image.url;
  img.alt = "";
  img.decoding = "async";
  let caption = span("caption", name);
  if (uploaded) {
    const [head, tail] = splitMiddle(displayName(name));
    caption = span("caption is-split", "");
    // CSS never ellipses a line's first character; a zero-width word joiner takes that place, so a thumbnail
    // too narrow for any of the head shows a clean "…" rather than a clipped letter.
    caption.append(span("caption-head", head && `\u2060${head}`), span("caption-tail", tail));
  }
  button.append(img, caption);
  return button;
}

// A demo photo whose file is missing or unreadable (UI-88): a broken tile with the file name. It isn't a button,
// so it can't be clicked or focused, and the arrows skip it.
function missingTile(photo) {
  const tile = document.createElement("div");
  tile.className = "thumb is-missing";
  tile.title = photo.file;
  tile.append(span("missing-box", S.missingFile), span("caption", photo.file));
  return tile;
}

// Edge fades on a scroller with hidden thumbnails, and the mouse wheel scrolling it sideways (UI-9).
function wireScroller() {
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
}

wireScroller();
