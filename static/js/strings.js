// Every user-facing string, in sentence case (CSS uppercases where the design says so). Prompt words, category
// labels, card titles and thresholds come from the server's config and payload, never from here.

export const S = {
  wordmark: "Site Hazard Detection",   // the last word is set in hi-vis (UI-79)

  // Header (UI-23, UI-27, UI-66)
  modelLoading: "Model loading…",
  modelLoadingLong: "Model loading… still loading, check the server window",
  modelActive: "Model active:",
  modelError: (cause) => `Model not loaded: ${cause}`,
  modelOffline: "Model offline",

  // Strip (UI-67, PM-8, PM-13, UI-88)
  thumbName: (scene) => `Scan photo: ${scene}`,
  thumbWaitTitle: "Scans when the model is ready",
  uploadCaption: "Upload photo",
  uploadTypes: "JPG, PNG or WebP",
  missingFile: "Missing file",

  // Stage (UI-23, UI-67, PM-13, UI-30)
  photoAlt: (scene) => `${scene}, site photo`,
  uploadAlt: (name) => `${name}, uploaded photo`,
  stageWaiting: "Model is loading. This photo will scan when it's ready.",
  stagePreparing: (name) => `Opening ${name}…`,
  stageBootError: "The model didn't load, so photos can't be scanned. Restart the app; setup steps are in the README.",
  stageServerLost: "Can't reach the detection server. Is its window still open?",
  scanLine: (words) => `Scanning for ${words.join(", ")}…`,
  scanElapsed: (seconds) => ` · ${seconds} s`,

  // Upload rejections (UI-33, PM-8)
  heic: (name) => `Can't open ${name}: HEIC photos aren't supported. Save it as JPG and upload it again.`,
  otherType: (name) => `Can't open ${name}. Choose a JPG, PNG or WebP photo.`,
  tooManyBytes: (name, value, limit) => `Can't open ${name}: the file is ${value}; the limit is ${limit}.`,
  tooManyPixels: (name, value, limit) => `Can't open ${name}: the photo is ${value}; the limit is ${limit}.`,
  tooManyPixelsOver: (name, limit) => `Can't open ${name}: the photo is over the ${limit} limit.`,
  tooSmall: (name, value, limit) => `Can't open ${name}: its shortest side is ${value}; the minimum is ${limit}.`,
  unreadable: "This file couldn't be read as a photo.",
  megabytes: (value) => `${value} MB`,

  // Scan errors (UI-35, R21)
  scanFailed: "Scan failed. The model returned an error for this photo. Scan again, or choose another photo.",
  scanDetails: (text) => `Details: ${text}`,
  scanTimeout: (seconds) => `Scan stopped: no result after ${seconds} s. Scan again; if it happens twice, restart the app.`,
  scanNotReady: "The model isn't ready yet. Scan again in a moment.",
  scanSizeMismatch: "The photo on screen doesn't match the size the model scanned, so its boxes can't be drawn. " +
    "Choose the photo again.",
  photoGone: "That photo is no longer on the server. Choose it again.",
  photoNotShown: "The photo couldn't be shown. Choose it again, or choose another photo.",
  scanAgain: "Scan again",

  // Stats row (UI-37, UI-38, UI-39, UI-31)
  statHazards: "Hazards flagged",
  statModelTime: "Model time",
  statModelTimeEarlier: "Model time, earlier run",
  statPhoto: "Photo",
  statCategories: "Categories",

  // Findings panel (UI-23, UI-42, UI-46, UI-101, UI-21)
  panelHeading: "Hazards flagged",
  panelHeadingEmpty: "No hazards flagged",
  panelHeadingChecks: "Hazard checks",   // neutral: loading, idle, scanning and errors say nothing was flagged yet
  checkLooksFor: (category, items) => `${category} · looks for ${items}`,
  askedToFind: (words) => `The model is asked to find: ${words}.`,
  legend: (thresholdPct) => "Confidence is the model's score per object, not the chance a hazard is real. " +
    `${thresholdPct}% or less counts as missing.`,
  panelBooting: "Loading the model. Photos can be scanned once it's ready.",
  panelIdle: "Choose a site photo above, or upload one.",
  panelError: "No results for this photo",
  limits: "Limits: the model often misses surfaces like gaps in the floor and uneven floors, mixes up debris and " +
    "piles of materials, and can't tell where materials may be stored.",   // 3 lines from 1280
  confidence: "Confidence",
  chipFound: "found",
  chipMissing: "missing",
  hideBoxes: "Hide boxes",
  showBoxes: "Show boxes",
  dismiss: "Dismiss",

  // Counts and times, used by format.js (UI-65, UI-68, UI-101)
  countNone: "No hazards flagged",
  countOne: "1 hazard flagged",
  countMany: (n) => `${n} hazards flagged`,
  hiddenOne: "1 more hazard was flagged in this photo but is not shown.",
  hiddenMany: (n) => `${n} more hazards were flagged in this photo but are not shown.`,
  milliseconds: (value) => `${value} milliseconds`,
  seconds: (value) => `${value} seconds`,
  or: "or",

  // Empty result (UI-34, PM-7)
  objectsFound: (list) => `Objects found: ${list}. No rule matched them.`,
  noObjects: (thresholdPct) => `No object scored above ${thresholdPct}%, so no rule could run.`,
  checkedHeading: "Checked:",
  checkFound: (label, items) => `${label}: ${items} found, not flagged`,
  checkMissing: (label, items) => `${label}: no ${items} found`,
  signOff: "Only 5 hazard checks run, so this is not a safety sign-off.",

  // Screen reader (UI-68)
  liveScanComplete: (count, time) => `Scan complete. ${count}. Model time ${time}.`,
  liveEarlierRun: (count, time) => `Earlier run. ${count}. Model time ${time}.`,
  boxName: (id, category, title, anchor, pct) => `Hazard ${id}, ${category}: ${title}. ${anchor} ${pct}%.`,

  // Notices (UI-93, T16)
  reducedMotion: "Reduced motion is on: the scan sweep won't play",
  fontFailed: (family, file) => `Font failed to load: ${family}. Expected file: static/fonts/${file}`,
};
