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

// A size in MB the way the server writes it ("25 MB"), rounded up to 0.1 so a file just over the limit never
// reads as equal to it.
export function megabytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return S.megabytes(Number.isInteger(mb) ? String(mb) : (Math.ceil(mb * 10) / 10).toFixed(1));
}

// The words for an error the screen shows (UI-33, UI-35, R21): {message, details}. `name` is the uploaded file's
// name; `timeoutMs` is the scan timeout from config. `error.upload` marks a failed upload; any other unknown error
// came from a scan. None of them reads just "Error".
export function errorCopy(error, { name, timeoutMs }) {
  switch (error.kind) {
    case "timeout": return { message: S.scanTimeout(timeoutMs / 1000) };
    case "model-error": return { message: S.scanFailed, details: error.detail ? S.scanDetails(error.detail) : null };
    case "not-ready": return { message: S.scanNotReady };
    case "size-mismatch": return { message: S.scanSizeMismatch };
    // A scan of a photo the server no longer holds (404, after a restart); an upload's own message is the default.
    case "unreadable": return { message: error.upload ? S.unreadable : S.photoGone };
    case "photo-not-shown": return { message: S.photoNotShown };
    case "unsupported": return { message: error.format === "heic" ? S.heic(name) : S.otherType(name) };
    case "too-large":
      if (error.measure !== "pixels") return { message: S.tooManyBytes(name, error.value, error.limit) };
      return { message: error.value ? S.tooManyPixels(name, error.value, error.limit)
        : S.tooManyPixelsOver(name, error.limit) };
    case "too-small": return { message: S.tooSmall(name, error.value, error.limit) };
    default: return { message: error.upload ? S.unreadable : S.scanFailed };
  }
}
