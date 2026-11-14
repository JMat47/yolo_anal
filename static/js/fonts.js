// The font-failure check (UI-85). After document.fonts.ready every bundled face is loaded with load(); a face that
// rejects, or one the stylesheet no longer declares, is reported. document.fonts.check() is never used: it returns
// true for families that were never declared.
import { S } from "./strings.js";

const FACES = [
  { family: "Atkinson Hyperlegible Next", weight: "200 800", file: "atkinson-hyperlegible-next-latin-wght.woff2" },
  { family: "Atkinson Hyperlegible Mono", weight: "200 800", file: "atkinson-hyperlegible-mono-latin-wght.woff2" },
  { family: "Barlow Condensed", weight: "600", file: "barlow-condensed-latin-600.woff2" },
  { family: "Barlow Condensed", weight: "700", file: "barlow-condensed-latin-700.woff2" },
];

const unquote = (name) => name.replace(/^["']|["']$/g, "");

// Resolves to the faces that failed, as {family, weight, file}: Barlow Condensed has two files, so the family alone
// wouldn't say which one to restore.
export async function checkFonts() {
  await document.fonts.ready;
  const declared = [...document.fonts];
  const results = await Promise.all(FACES.map(async (want) => {
    const face = declared.find((f) => unquote(f.family) === want.family && f.weight === want.weight);
    if (!face) return want;
    try {
      await face.load();
      return null;
    } catch {
      return want;
    }
  }));
  return results.filter(Boolean);
}

// A red line per failed face, naming the family and the file to restore. One click anywhere on it dismisses it.
export function showFontBanner(failed) {
  if (failed.length === 0) return;
  const banner = document.getElementById("banner");
  const lines = document.createElement("div");
  lines.className = "banner-text";
  for (const { family, file } of failed) {
    const line = document.createElement("p");
    line.textContent = S.fontFailed(family, file);
    lines.append(line);
  }
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "banner-dismiss";
  dismiss.textContent = S.dismiss;
  banner.replaceChildren(lines, dismiss);
  banner.hidden = false;
  banner.addEventListener("click", () => { banner.hidden = true; }, { once: true });
}
