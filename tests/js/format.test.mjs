import assert from "node:assert/strict";
import test from "node:test";

import {
  countPhrase, displayName, formatModelTime, hiddenLine, orList, sentenceCase, splitMiddle, spokenTime,
} from "../../static/js/format.js";

test("formatModelTime rounds to whole ms, then picks ms, 2-decimal or 1-decimal seconds", () => {
  assert.deepEqual(formatModelTime(48.4), { value: "48", unit: "ms" });
  assert.deepEqual(formatModelTime(999.4), { value: "999", unit: "ms" });
  assert.deepEqual(formatModelTime(999.6), { value: "1.00", unit: "s" });
  assert.deepEqual(formatModelTime(1240), { value: "1.24", unit: "s" });
  assert.deepEqual(formatModelTime(9999.4), { value: "10.00", unit: "s" });
  assert.deepEqual(formatModelTime(12345), { value: "12.3", unit: "s" });
});

test("spokenTime says the unit in full", () => {
  assert.equal(spokenTime(48), "48 milliseconds");
  assert.equal(spokenTime(1240), "1.24 seconds");
});

test("countPhrase agrees in number", () => {
  assert.equal(countPhrase(0), "No hazards flagged");
  assert.equal(countPhrase(1), "1 hazard flagged");
  assert.equal(countPhrase(3), "3 hazards flagged");
});

test("hiddenLine agrees in number", () => {
  assert.equal(hiddenLine(1), "1 more hazard was flagged in this photo but is not shown.");
  assert.equal(hiddenLine(2), "2 more hazards were flagged in this photo but are not shown.");
});

test("displayName drops only the extension", () => {
  assert.equal(displayName("IMG-20241102-WA0042 site visit.jpeg"), "IMG-20241102-WA0042 site visit");
  assert.equal(displayName("no extension"), "no extension");
  assert.equal(displayName(".jpg"), ".jpg");
});

test("splitMiddle keeps the last 10 code points whole, emoji and Arabic included", () => {
  const name = "موقع البناء 🏗️ site visit 👷🏽‍♀️ ".repeat(4).slice(0, 110) + "مرحبا🧱🦺-42";
  assert.equal([...name].length >= 100, true);
  const [head, tail] = splitMiddle(name);
  assert.equal(head + tail, name);
  assert.deepEqual([...tail], [...name].slice(-10));
  assert.equal([...tail].length, 10);
});

test("splitMiddle on a short name puts it all in the tail", () => {
  assert.deepEqual(splitMiddle("Room"), ["", "Room"]);
  assert.deepEqual(splitMiddle("abcdef", 3), ["abc", "def"]);
});

test("sentenceCase capitalises the first letter only", () => {
  assert.equal(sentenceCase("hard hat"), "Hard hat");
  assert.equal(sentenceCase("pile of materials"), "Pile of materials");
});

test("orList joins with commas and a final or", () => {
  assert.equal(orList(["cable"]), "cable");
  assert.equal(orList(["cable", "debris"]), "cable or debris");
  assert.equal(orList(["cable", "debris", "uneven floor"]), "cable, debris or uneven floor");
});
