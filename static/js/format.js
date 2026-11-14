// Number and name formatting. Pure: no DOM. The wording itself lives in strings.js.
import { S } from "./strings.js";

// UI-38: whole ms under 1 s, then seconds with 2 decimals, then 1 decimal from 10 s.
export function formatModelTime(ms) {
  const whole = Math.round(ms);
  if (whole < 1000) return { value: String(whole), unit: "ms" };
  const seconds = whole / 1000;
  return { value: seconds.toFixed(seconds < 10 ? 2 : 1), unit: "s" };
}

export function spokenTime(ms) {
  const { value, unit } = formatModelTime(ms);
  return unit === "ms" ? S.milliseconds(value) : S.seconds(value);
}

export function countPhrase(n) {
  if (n === 0) return S.countNone;
  return n === 1 ? S.countOne : S.countMany(n);
}

export function hiddenLine(n) {
  return n === 1 ? S.hiddenOne : S.hiddenMany(n);
}

export function displayName(fileName) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

// By code points, so an emoji or an Arabic letter is never cut in half. The tail is the last `keep`.
export function splitMiddle(name, keep = 10) {
  const points = Array.from(name);
  const cut = Math.max(0, points.length - keep);
  return [points.slice(0, cut).join(""), points.slice(cut).join("")];
}

export function sentenceCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function orList(words) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} ${S.or} ${words.at(-1)}`;
}
