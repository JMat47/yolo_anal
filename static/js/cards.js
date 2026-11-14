// The findings panel: at most 3 hazard cards (UI-101 to UI-105), the hidden-count line and the panel messages.
// Text goes in with textContent only. Card titles and category labels come from the payload (config).
import { hiddenLine, sentenceCase } from "./format.js";
import { REVEAL, highlight, revealDelay } from "./stage.js";
import { S } from "./strings.js";

const list = document.getElementById("findings-list");
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

export function renderCards(findings, hiddenCount, { animate }) {
  const cards = findings.map(card);
  const nodes = hiddenCount > 0 ? [...cards, paragraph("hidden-line", hiddenLine(hiddenCount))] : cards;
  list.replaceChildren(...nodes);
  list.scrollTop = 0;   // each reveal starts at the top (UI-43)
  if (!animate) return;
  nodes.forEach((node, index) => {
    // A card fades in and rises once its box has wiped in and its tag has appeared (UI-91).
    const delay = revealDelay(Math.min(index, findings.length - 1), findings.length) + REVEAL.wipe + REVEAL.fade;
    node.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
      { duration: REVEAL.card, delay, easing: EASE_OUT, fill: "backwards" });
  });
}

export function renderPanelMessage(text) {
  list.replaceChildren(paragraph("panel-msg", text));
}

export function clearCards() {
  list.replaceChildren();
}

// A box or tag under the pointer: its card gets the inset bar and scrolls into view (UI-20). null clears.
export function markCard(id) {
  for (const node of list.querySelectorAll("[data-card]")) {
    const on = node.dataset.card === id;
    node.classList.toggle("is-linked", on);
    if (on) node.scrollIntoView({ block: "nearest" });
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
