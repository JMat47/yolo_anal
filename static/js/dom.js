// Small DOM helpers shared by the page modules.

export function span(className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  return node;
}

// Reduced motion (UI-93), read at the moment of use, so a change in the system setting applies to the next scan.
const motion = matchMedia("(prefers-reduced-motion: reduce)");
export const reducedMotion = () => motion.matches;
export const onMotionChange = (handler) => motion.addEventListener("change", handler);

// Scrolling something into view is smooth, or instant under reduced motion (UI-20, UI-93).
export const scrollBehavior = () => (motion.matches ? "auto" : "smooth");
