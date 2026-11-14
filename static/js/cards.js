// The findings panel: at most 3 hazard cards (UI-101 to UI-105), the hidden-count line, the zero-hazard result
// (UI-34, PM-7) and the panel messages. Text goes in with textContent only. Card titles, category labels, check
// labels and prompt words come from the payload (config).
import { reducedMotion, scrollBehavior } from "./dom.js";
import { hiddenLine, orList, sentenceCase } from "./format.js";
import { REVEAL, highlight, revealDelay } from "./stage.js";
import { S } from "./strings.js";

const list = document.getElementById("findings-list");
const heading = document.getElementById("panel-heading");
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const RISE = [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }];
const FADE = [{ opacity: 0 }, { opacity: 1 }];
const SLOT = "\u0000";   // where a template's value goes when that value is built from nodes

export function renderCards(findings, hiddenCount, { animate }) {
  const cards = findings.map(card);
  const nodes = hiddenCount > 0 ? [...cards, paragraph("hidden-line", hiddenLine(hiddenCount))] : cards;
  list.replaceChildren(...nodes);
  list.scrollTop = 0;   // each reveal starts at the top (UI-43)
  if (!animate) return;
  if (reducedMotion()) {   // UI-93: the cards fade in with the boxes, with no rise or stagger
    for (const node of nodes) node.animate(FADE, { duration: REVEAL.still, easing: EASE_OUT, fill: "backwards" });
    return;
  }
  nodes.forEach((node, index) => {
    // A card fades in and rises once its box has wiped in and its tag has appeared (UI-91).
    const delay = revealDelay(Math.min(index, findings.length - 1), findings.length) + REVEAL.wipe + REVEAL.fade;
    node.animate(RISE, { duration: REVEAL.card, delay, easing: EASE_OUT, fill: "backwards" });
  });
}

// No rule fired (UI-34, PM-7, R22): the heading says so, then what the model did find, then every check that
// ran, then the sign-off line. Neutral colours only: nothing here reads as "safe".
export function renderEmpty(payload) {
  heading.textContent = S.panelHeadingEmpty;
  const objects = paragraph("empty-objects", "");
  if (payload.objects_found.length > 0) {
    const items = payload.objects_found.flatMap((object, index) => [index > 0 ? ", " : "",
      `${sentenceCase(object.item)} `, span("num", `${object.pct}%`)]);
    objects.append(...slotted(S.objectsFound(SLOT), items));
  } else {
    objects.textContent = S.noObjects(payload.threshold_pct);
  }

  const checks = document.createElement("div");
  checks.className = "empty-checks";
  const rules = document.createElement("ul");
  rules.className = "check-list";
  rules.append(...payload.rules.map((rule) => {
    const items = orList(rule.anchor_items);
    const line = document.createElement("li");
    line.append(...slotted(rule.anchor_found ? S.checkFound(SLOT, items) : S.checkMissing(SLOT, items),
      [span("check-label", rule.check_label)]));
    return line;
  }));
  checks.append(paragraph("checks-head", S.checkedHeading), rules);

  const nodes = [objects, checks, paragraph("empty-signoff", S.signOff)];
  list.replaceChildren(...nodes);
  list.scrollTop = 0;
  const [frames, duration] = reducedMotion() ? [FADE, REVEAL.still] : [RISE, REVEAL.card];
  nodes.forEach((node) => node.animate(frames, { duration, easing: EASE_OUT, fill: "backwards" }));
}

export function renderPanelMessage(text) {
  heading.textContent = S.panelHeading;
  list.replaceChildren(paragraph("panel-msg", text));
}

// A notice under the panel message, with a Dismiss button (UI-93's reduced-motion notice in idle).
export function renderNotice(text, onDismiss) {
  const notice = document.createElement("div");
  notice.className = "notice";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "text-button";
  dismiss.textContent = S.dismiss;
  dismiss.addEventListener("click", () => {
    notice.remove();
    onDismiss();
  });
  notice.append(paragraph("notice-text", text), dismiss);
  list.append(notice);
}

export function clearCards() {
  heading.textContent = S.panelHeading;
  list.replaceChildren();
}

// A box or tag under the pointer: its card gets the inset bar and scrolls into view (UI-20). null clears.
export function markCard(id) {
  for (const node of list.querySelectorAll("[data-card]")) {
    const on = node.dataset.card === id;
    node.classList.toggle("is-linked", on);
    if (on) node.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }
}

// Number, category and confidence; then the observed title; then one chip per object the rule checked (UI-102).
function card(finding) {
  const node = document.createElement("article");
  node.className = `card sev-${finding.severity === "high" ? "high" : "med"}`;
  node.dataset.card = finding.id;
  node.tabIndex = 0;

  const category = paragraph("card-cat", "");
  category.append(span("card-num num", finding.id), " ", finding.category);   // the space keeps R8's "01 No PPE"
  const confidence = paragraph(`card-conf grade-${finding.grade}`, S.confidence);
  const pct = document.createElement("b");
  pct.className = "num";
  pct.textContent = `${finding.confidence}%`;
  confidence.append(" ", pct);
  const top = document.createElement("div");
  top.className = "card-top";
  top.append(category, " ", confidence);   // read as text: "01 No PPE Confidence 91%"

  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = finding.title;

  const chips = document.createElement("ul");
  chips.className = "chips";
  chips.append(...finding.checks.map(chip));

  node.append(top, title, chips);
  const on = () => highlight(finding.id);
  const off = () => highlight(null);
  node.addEventListener("pointerenter", on);
  node.addEventListener("pointerleave", off);
  node.addEventListener("focus", on);
  node.addEventListener("blur", off);
  return node;
}

// "Person found · 91%" or "Hard hat missing" (UI-103). Missing safeguards and trigger evidence carry the
// severity border; context and found safeguards stay neutral (UI-54).
function chip(check) {
  const found = check.status === "found";
  const role = !found ? "missing" : check.kind === "evidence" ? "evidence" : "neutral";
  const node = document.createElement("li");
  node.className = `chip chip-${role}`;
  const status = document.createElement("b");
  status.textContent = found ? S.chipFound : S.chipMissing;
  node.append(`${sentenceCase(check.item)} `, status);
  if (found) node.append(" · ", span("num", `${check.pct}%`));
  return node;
}

// A template's text around its SLOT, with `nodes` in its place.
function slotted(text, nodes) {
  const [before, after] = text.split(SLOT);
  return [before, ...nodes, after].filter((part) => part !== "");
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
