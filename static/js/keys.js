// Keyboard and presentation clicker (UI-94 to UI-96). The clicker's forward and back buttons send PageDown and
// PageUp; its start, stop and blank buttons send F5, Esc, B or "." and are swallowed so they can't reload the page
// or blank it. F11 passes through, and so does any key held with Ctrl, Alt or Meta.

const SWALLOWED = new Set(["F5", "Escape", "b", "."]);
const NO_REPEAT = new Set(["r", "h"]);   // a held key re-scans or flips the boxes once

export function bindKeys({ next, prev, rescan, toggle }) {
  const actions = { ArrowRight: next, PageDown: next, ArrowLeft: prev, PageUp: prev, r: rescan, h: toggle };
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const action = actions[key];
    if (action) {
      event.preventDefault();
      if (!(event.repeat && NO_REPEAT.has(key))) action();
    } else if (SWALLOWED.has(key)) {
      event.preventDefault();
    }
  });
}
