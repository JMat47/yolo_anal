// Boot: fills the static copy, renders the photo strip and keeps the header in step with /health.
import * as api from "./api.js";
import { S } from "./strings.js";

const POLL_LOADING_MS = 500;
const POLL_READY_MS = 4000;
const RETRY_MS = 500;

const $ = (id) => document.getElementById(id);
let modelReady = false;

fillCopy();
wireStrip();
boot();

function fillCopy() {
  const words = S.wordmark.split(" ");
  $("wordmark").replaceChildren(`${words.slice(0, -1).join(" ")} `, span("accent", words.at(-1)));
  for (const node of document.querySelectorAll("[data-s]")) node.textContent = S[node.dataset.s];
  $("upload-tile").title = S.uploadTypes;
  showPanelMessage(S.panelBooting);
  renderHeader({ state: "loading" });
}

async function boot() {
  let config, photos;
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
    const health = await api.getHealth();
    renderHeader(health);
    if (health.state === "ready" && !modelReady) showPanelMessage(S.panelIdle);
    modelReady = health.state === "ready";
  } catch {
    // The server-lost state arrives with the state machine; until then the next poll simply retries.
  }
  setTimeout(pollHealth, modelReady ? POLL_READY_MS : POLL_LOADING_MS);
}

function renderHeader(health) {
  const status = health.state === "ready" ? "ready" : health.state === "error" ? "error" : "loading";
  const label = $("model-label");
  $("status-dot").closest(".model").dataset.health = status;
  if (status === "ready") label.replaceChildren(`${S.modelActive} `, span("checkpoint", health.model));
  else if (status === "error") label.textContent = S.modelError(health.message);
  else label.textContent = S.modelLoading;
  label.title = status === "error" ? label.textContent : "";
}

function renderStrip(photos) {
  // Missing demo photos get their broken tile later (UI-88); for now they are left out of the strip.
  $("strip").replaceChildren(...photos.filter((photo) => !photo.missing).map(thumbnail));
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

function wireStrip() {
  const strip = $("strip");
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
  $("upload-tile").addEventListener("click", () => $("upload-input").click());
}

function showPanelMessage(text) {
  const message = document.createElement("p");
  message.className = "panel-msg";
  message.textContent = text;
  $("findings-list").replaceChildren(message);
}

function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}
