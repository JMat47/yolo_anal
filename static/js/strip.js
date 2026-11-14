// The photo strip (UI-8, UI-9, UI-33): the demo thumbnails and the uploaded photo's slot before the Upload tile.
// It knows which photo each thumbnail stands for; main.js decides what a pick does.
import { span } from "./dom.js";
import { displayName, splitMiddle } from "./format.js";
import { S } from "./strings.js";

export const UPLOAD_PREFIX = "upload:";

const strip = document.getElementById("strip");
const demoPhotos = new Map();   // id -> {id, scene, image}
let uploadSlot = null;          // the uploaded photo's thumbnail: {key, image, name}

export const isUpload = (key) => key?.startsWith(UPLOAD_PREFIX) ?? false;

export function renderStrip(photos) {
  // Missing demo photos get their broken tile later (UI-88); for now they are left out of the strip.
  const shown = photos.filter((photo) => !photo.missing);
  for (const photo of shown) demoPhotos.set(photo.id, photo);
  strip.replaceChildren(...shown.map((photo) => thumbnail(photo.id, photo.image, photo.scene)));
}

// current: the photo key on stage. locked: nothing can be scanned. waiting: a pick scans once the model is ready
// (PM-13). moved: the photo on stage just changed, so its thumbnail scrolls into view.
export function renderThumbs({ current, locked, waiting, moved }) {
  for (const thumb of strip.querySelectorAll(".thumb")) {
    const on = thumb.dataset.photo === current;
    thumb.setAttribute("aria-current", on ? "true" : "false");
    thumb.disabled = locked;
    thumb.title = waiting ? S.thumbWaitTitle : thumb.dataset.name;
    if (on && moved) thumb.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
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
    caption.append(span("caption-head", head && `⁠${head}`), span("caption-tail", tail));
  }
  button.append(img, caption);
  return button;
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
