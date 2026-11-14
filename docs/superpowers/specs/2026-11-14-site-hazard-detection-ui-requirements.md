# Site Hazard Detection: consolidated UI requirements (v1, 2026-11-14)

Merged from five lane specs: `harden.md` (H#), `clarify.md` (C#), `layout.md` (L#), `typeset.md` (T-#, F-#, C-#, N-#, D-#, E-#; prefixed **ty** where it could be confused with clarify or distill) and `distill.md` (D#). Product facts are in `PRODUCT.md`, and the approved look is `screen-v5.html` (cited as "mockup").

**Precedence:** locked user decisions (LD) beat resolutions (R), which beat lane specs. Where lanes overlap they are merged into one requirement, with the source IDs in brackets. Copy in "straight quotes" is exact. Strings marked *interim* are placeholders until clarify writes final wording (see U13).

**ID collisions:** clarify's C1–C50 and typeset's C-1–C-3 (case/tracking) are told apart by the hyphen. Distill's D1–D24 and typeset's D-1–D-5 (colour) are told apart the same way.

**Measurement note:** values marked *(measured)* come from a throwaway prototype rendered in headless Chrome on macOS with the four bundled font files: `spec/merge-work/m.html`. On Windows the thin scrollbar can take a few px from the card width, which makes cards the same height or taller, never shorter.

---

## 1. Purpose

The screen exists so a jury can watch one site photo go in and see, for each hazard the model flags, **where it is and why**: what the model found and what was missing. Two things serve that directly. The first is the **photo with its dashed boxes and callout tags**. The second is each **hazard card's title, reason and found/missing chips**. A second tier supports them: the category label, the confidence %, the scan scene and the stats row's honest timing. Everything else is the operator's chrome and should recede: the photo strip, the upload tile, the model name and v0.1. Prominence runs from most to least: photo, card evidence, category/title, confidence, run readout, chrome. There is one primary action: choose a photo. *(Source: D, "Essential purpose", adjusted for LD-2, LD-5 and LD-7.)*

## 2. Locked decisions

| ID | Decision | Decided |
|---|---|---|
| LD-1 | Dark theme, shown on a Windows laptop screen (no projector), fully offline. The laptop has an NVIDIA RTX 2060: inference uses CUDA there and falls back to CPU elsewhere. | user |
| LD-2 | Header wordmark "SITE HAZARD DETECTION" in Barlow Condensed, with **"DETECTION" in hi-vis yellow**. Distill's single-colour wordmark (D3) is rejected. | user |
| LD-3 | An "Upload photo" tile in the strip. | user |
| LD-4 | The scan scene: the photo dimmed, a faint grid, a yellow sweep and a "Scanning for …" line. | user |
| LD-5 | The stats row sits under the photo, as tiles. | user |
| LD-6 | **Amended 2026-11-14 (user): see §8.** Originally option D cards. Now each card is a top row with the number, the category and the confidence, then a short title, then found/missing chips. | user |
| LD-7 | The confidence % is shown on the photo tags too. | user |
| LD-8 | "v0.1" sits in the bottom-right corner. | user |
| LD-9 | Fonts: Barlow Condensed, Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono, and no others. | user |
| LD-10 | **Scan scene timing (formerly TBD-A), option (a).** The scan scene always runs for at least about 1.5 s, so the jury sees it. The real model time is shown separately and honestly in the stats row, e.g. "Model time 48 ms". If inference takes longer than the scene, the scene continues until the result arrives, using harden's loop and its 20 s timeout. | user, 2026-11-14 |
| LD-11 | **Obsolete 2026-11-14 (user): the YOLO intervention row is removed (§8).** Originally: The row describes what the app actually does, using clarify's draft copy (UI-56). It never quotes the slide's claims about alerting a person in charge, gloves, or colour and texture analysis. | user, 2026-11-14 |

## 3. Resolved conflicts

| # | Resolution (decided by Claude unless noted) | Overrides |
|---|---|---|
| R1 | Stats row: tiles in one fixed-height row that never wraps, using layout's give-way order. Labels come from clarify. Zero counts are hidden. No image resolution is shown. The photo name appears in the row. Thumbnail captions are place names, hidden below a 700px viewport height. | D10 (the single-line form, including its removal of tiles, dividers and stacked keys). D11 (merged counts as the default). L6.4 label "Analysed in". C36 "4032 × 3024 px" secondary text. C18. Mockup filename captions. |
| R2 | Photo tags keep the confidence %. They use clarify's format ("01 No PPE" / "Person 91%") and layout's shrink sequence (full → title+confidence → number badge). | D6 (title-only tags). L5.1 "full" with chips. H60/H61 chips on tags. ty D-3 tag chip colours (now moot). Mockup "91% confidence". |
| R3 | "01"-style numbers on cards, with the same number on the box's tag. | D17 ("1", "2"). Accepts layout conflict 1 / L9.3. |
| R4 | Chips use typeset's colour tokens: no green, found is filled, missing is hollow, a severity border marks trigger evidence and a neutral border marks context. Wording comes from clarify. | C22 (green for a found safeguard). Mockup `.chip.ok` green. |
| R5 | `--fs-body: clamp(1rem, 0.3rem + 0.81vw, 1.375rem)`. The minimum for any text is **14px**. Typeset's role multiples, tokens and font files are kept. | ty type-scale base `clamp(1.125rem, calc(0.5rem + 0.9vw), 1.75rem)`. T-1 15px floor. Typeset table values. |
| R6 | Panel width `clamp(420px, 36vw, 640px)`. | L2.4 (`clamp(400px, 34vw, 640px)`). Typeset conflict 4 (about 40vw). |
| R7 | Both severities have dashed boxes: red is a long dash (8px on / 4px off), amber a short dash (3px / 3px). Typeset's line-sample swatch and greyscale test are kept. | E-3 (red solid; amber 10/6). Typeset conflict 3. |
| R8 | Hi-vis yellow is limited to "DETECTION", the scan sweep and grid, and the selected-thumbnail marker. It never marks a hazard or a confidence value. | E-1's wider allowed list (see U6). Mockup's yellow confidence bars. |
| R9 | Model status follows harden's state model: "Model loading…" with a pulsing ring, then "Model active: <model>", and red with the cause on failure. Accepts harden conflict 1. | C32/C41 "Model loading: {checkpoint}" / "Model not loaded: {checkpoint}". H2 "[Warming up: X]". D1 "no pulse". |
| R10 | Remove: the glow halo, mini confidence bars, IBM Plex Mono, the sort aside, the "waiting for model…" panel placeholder, the box tint, the strip and panel tints, the card header divider and the dashed chip divider. **Keep** the staggered reveal (cards fade and rise in ≤ 200 ms). | L8.3 bar, L8.4 divider, L8.5 dashed rule, L7.2 sort label, C16 "Highest confidence first", the sort-label part of C39, ty D-5 confidence bar, surface-1 as the panel/strip fill, D9 "remove the card slide-up". |
| R11 | v0.1 sits bottom right in the panel's last row, with clarify's limits line beside it. | C49 "in the footer". L7.7's fixed 32px row height (the row is now content height, UI-46). |
| R12 | The heading "Findings" becomes "Hazards flagged", as a real `<h2>`. | L7.2, the typeset table and mockup "Findings". |
| R13 | Clarify's glossary is used everywhere ("person", never "worker"). | PRODUCT.md example title "Worker without hard hat or vest". Mockup "helmet", "rubble", "handrail", "Worker on site". |
| R14 | Revisits show cached results instantly, marked as an earlier run; R re-runs the scan. | (Confirms H28.) |
| R15 | Scan sweep duration was TBD-A; **decided by the user as LD-10**. | H30 (T = median clamped to 0.4–3 s). H32 click-to-box target. H33 0.4 s floor. H7 "seeds the sweep estimate". C37 "shows only for the real length of the scan". C17/C36 "Scan time" / "0.42 s". D8 "one pass per analysis". |
| R16 | YOLO intervention text was TBD-B; **decided by the user as LD-11**. | The slide's intervention text. |
| R17 | Keep "uneven floor" as a config prompt, verify it against the demo photos, and drop it if it is unreliable. | Clarify open question 3. |
| R18 | Scene names come from a photos config file, with placeholders until the user supplies real ones. | Clarify open question 2. |
| R19 | The README recommends full screen (F11) for the demo. | Confirms L0.3. |

**Lane-ownership tie-breaks.** Harden's header assigns ownership: wording → clarify, geometry → layout, sizes and contrast → typeset. I applied those assignments, without guessing, to settle these small conflicts:

- **H61 → L5.1.** The tag max width is 42% of the frame, clamped to 140–320px, not 40%.
- **H63 → L4.6.** Box edges must land within 1px of the target, not 2px.
- **H60/H61 → L5.3/L5.4.** Tag placement uses layout's rules. Harden's leader-crossing rule is kept as an extra check.
- **H20 → F-1.** The preflight checks 4 font files, not 3.
- **Harden bracketed copy → clarify strings** wherever clarify gives a string.
- **F-6's `fonts.check()` test → H16's `load()` check.** Harden shows that `check()` returns true for undeclared families.

## 4. Open decisions

None. TBD-A and TBD-B were decided by the user on 2026-11-14 and are now LD-10 and LD-11. Items that still need a decision are listed under **Unresolved** at the end.

---

## 5. Requirements by area

### 5.1 Shell & layout

**UI-1** Every requirement holds at all of these viewports, in CSS px, in Edge and Chrome ≥ 120 on Windows 11, with Wi-Fi off. Each is tested with 4:3 (4032×3024), 3:4 (3024×4032) and 16:9 (1920×1080) fixture photos.
- F11: 1366×768, 1536×864, 1920×1080.
- Windowed: 1366×633, 1536×729, 1920×945.
- Windowed with the bookmarks bar: 1366×605.
- 1280×720.
- The floor: 1093×560 (1366 at 125% zoom).

`[L0.1, L0.2, H79]`

**UI-2** Spacing comes only from these tokens.
- Scale: `--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px; --space-8:32px; --space-12:48px`.
- Roles: `--gap-tight:4px`, `--gap-item:8px`, `--gap-group:12px`, `--gap-card:16px`, and `--gutter:24px` (32px at `min-width:1800px`).
- Margin, padding and gap use only these tokens. The exceptions are 1px rules and 3px indicator bars.
- Test: grep the CSS for any other px value in those properties.

`[L1.1–L1.3]`

**UI-3** App shell:
- `.app{height:100dvh; display:grid; grid-template-columns:minmax(0,1fr) var(--panel-w); grid-template-rows:48px auto minmax(0,1fr); overflow:hidden}`.
- The header and strip span both columns. `html,body{margin:0; overflow:hidden}`.
- No `calc(100vh - N)` anywhere. Every grid or flex child that contains a scroller sets `min-height:0` or `min-width:0`.
- There is no full-width footer row.

`[L2.1–L2.3, D5]`

**UI-4** `--panel-w: clamp(420px, 36vw, 640px)` gives 420px at the 1093 floor, 460.8px at 1280, 491.8px at 1366, 553px at 1536 and 640px at 1920 *(measured)*. It changes only when the viewport resizes, never on a photo switch or a scan. `[R6, L2.4]`

**UI-5** No page scroll. At every viewport, `scrollHeight === innerHeight` and `scrollWidth === innerWidth`, and no element's bottom edge is below `innerHeight`. *(Measured: holds at all 8 layout viewports with R5 and R6 applied.)* `[L2.5, H53]`

**UI-6** DOM order and focus order follow the visual order:
- Regions: header, strip, stage, stats, panel.
- Tab order: thumbnails → upload → overlay toggle → cards.

`[L2.6, H74]`

**UI-7** Header:
- 48px tall, with `padding-inline:var(--gutter)` and items centred vertically.
- At least 24px between the wordmark and the model label.
- The model label never wraps; it truncates with an ellipsis past 50% of the header width.
- The wordmark source string is "Site Hazard Detection", uppercased by CSS. Its type is in UI-69 and its colours are in UI-79.

`[L3.1, LD-2, C3, C32]`

**UI-8** The strip scales with viewport height. Padding is 12px top and bottom and the gutter at the sides, with a 1px `--rule` bottom border and no background tint.

| Viewport height | Thumbnail | Captions | Strip height *(measured with R5 caption sizes)* |
|---|---|---|---|
| < 700px | 72×48 | Hidden visually; kept as the accessible name and `title` | 73px |
| 700–899px | 84×56 | Shown, one line | 102.5px (layout's estimate was ≤ 101) |
| ≥ 900px | 108×72 | Shown, one line | 120.1px at 1920 (layout's estimate was ≤ 117) |

`[L3.2, R1, R10, D-2]`

**UI-9** Strip contents:
- Order: a scrolling list of thumbnails, an 8px gap, a 1px rule, an 8px gap, then the "Upload photo" tile. The Upload tile sits outside the scroller, is thumbnail-sized and is always visible.
- The scroller uses `overflow-x:auto` with its scrollbar hidden and `scroll-snap-type:x proximity`. The mouse wheel scrolls it horizontally. A 32px fade shows on any edge with hidden thumbnails.
- At 1366, at least 12 thumbnails fit before it scrolls. The selected thumbnail scrolls into view (`inline:'nearest'`).
- Thumbnails are 3:2 with `object-fit:cover`. The strip is the only place a photo is cropped.
- Captions are one line, as wide as the thumbnail, with an ellipsis and the full text in `title`.
- The selected thumbnail gets a 3px `--hivis` bar 4px below it, drawn with `::after`; its box size doesn't change.
- Unselected thumbnails show `filter: grayscale(.35) brightness(.78)`. The selected one is full colour, and its caption colour doesn't change.
- The hit target covers both the image and the caption.

`[L3.3–L3.7, D4, R8, mockup]`

**UI-10** The README tells the presenter to run the demo in full screen (F11). The layout must still meet UI-1 to UI-5 in a window. `[R19, L0.3]`

### 5.2 Photo stage & overlays

**UI-11** Stage and frame:
- The stage cell has 16px padding at top and bottom and the gutter at the sides, with a 1px `--rule` on its right.
- Inside it, the photo well is `container-type:size`, a flex column centred both ways. The frame and the stats row move as one group.
- After `img.decode()`, set `--ar = naturalWidth/naturalHeight`. The frame is `width:min(100cqw, calc((100cqh - var(--stats-h) - 12px) * var(--ar))); aspect-ratio:var(--ar)`.
- The image uses `object-fit:contain`, never `cover`.
- The frame is never wider than 2 × naturalWidth. Demo photos are at least 1600px on the long edge.

`[L4.1–L4.3]`

**UI-12** Frame sizes after R5 and R6, in px *(measured)*. Changes from layout's reference table are in **bold**.

| Viewport | 4:3 | 16:9 | 3:4 | Stats-row width (4:3 / 3:4) |
|---|---|---|---|---|
| 1366×768 | 701×526 | **825×464** (was 853×480) | 394×526 | 701 / 560 |
| 1366×633 | 560×420 | 747×420 | 315×420 | 560 / 560 |
| 1366×605 | 523×392 | 697×392 | 294×392 | 560 / 560 |
| 1536×864 | 829×622 | **934×525** (was 965×543) | 466×622 | 829 / 560 |
| 1536×729 | 649×487 | 865×487 | 365×487 | 649 / 560 |
| 1920×1080 | 1083×812 | 1215×683 | 609×812 | 1083 / 609 |
| 1920×945 | 903×677 | 1203×677 | 508×677 | 903 / 560 |
| 1093×560 | 463×347 | 617×347 | 260×347 | 560 / 560 |

Re-check for R6: layout's photo math still holds. For 4:3 photos height is still the limit at every target, so the 4:3 frame is narrower than the well at every viewport (e.g. 701 vs 825 at 1366×768). R6 changes only the width-limited 16:9 frames, at 1366×768 and 1536×864, by about −3%. At the 1093 floor the 16:9 frame (617px) now has only 7px to spare in the well (624px). The 2–5px shrink on 4:3 and 3:4 frames at heights ≥ 700 comes from R5, whose 14–15.3px captions make the strip taller, not from R6. `[R6, L ref table]`

**UI-13** Overlay geometry:
- The overlay is `position:absolute; inset:0` on the frame. Boxes are positioned in % of W×H, the size the model ran on: `left=x1/W`, `top=y1/H`, `width=(x2−x1)/W`, `height=(y2−y1)/H`.
- The backend applies EXIF rotation before inference and returns W and H with the boxes. If W/H differs from naturalWidth/naturalHeight by more than 1%, the page shows the error state instead of drawing boxes.
- After a resize (e.g. F11), tags are re-placed within 100 ms by a ResizeObserver, no more than once per frame and without transitions.
- Test with marker-rectangle fixtures at every viewport and aspect ratio:
  - each box edge is within **1px** of the marker
  - the frame's aspect ratio is within 0.5% of the photo's
  - no pixel of the photo is cropped

`[L4.4–L4.6, H63, H42]`

**UI-14** Boxes:
- Both severities are dashed, with a 3px stroke:
  - red: `--sev-high-fill` #c0392b, 8px on / 4px off
  - amber: `--sev-med` #e8912d, 3px on / 3px off
- Draw them with SVG `stroke-dasharray`, because CSS `border-style:dashed` can't set dash lengths.
- The stroke sits inside the box, so a box at the image edge keeps its whole outline. Every box also gets a 1px keyline outside it in black at 55%.
- No tint fill.
- Boxes are drawn largest area first, and each is at least 16×16 px. When boxes of different types have IoU ≥ 0.9, the later one is inset 4px.
- Under `forced-colors: active`, boxes and tags stay visible.

`[R7, E-3, H58, H59, H78, L4.7, R10, D7]`

**UI-15** Stacking order, from the bottom: image, dim/grid, scan band, boxes, leaders, tags, then the highlighted box and tag. The frame's `overflow:hidden` exists only to clip the scan band and grid. `[L4.7, L4.9]`

**UI-16** Tag content and colour:
- A tag has two lines: "{NN} {Category label}", then "{Anchor} {NN}%" (e.g. "01 No PPE" / "Person 91%"). The number and % match the card exactly.
- The number sits in a 28px square cell at the start of line 1.
- Tags carry no chips and never the word "detected".
- Tags have opposite polarity:
  - red: white text (`--on-sev-high` #ffffff) on #c0392b, 5.44:1
  - amber: `--on-sev-med` #16110a on #e8912d, 7.62:1
- No text on a tag uses opacity.

`[C29, L9.3, R2, R3, LD-7, E-2, T-6]`

**UI-17** **[Amended by §8: at most 3 findings, so at most 3 tags]**  Tag sizes:
- Max width is `clamp(140px, 42% of frame width, 320px)`. The title is at most 2 lines.
- Each tag tries three forms in order:
  1. **Full:** the two lines of UI-16.
  2. **Short:** one line, "{NN} {Category label} {NN}%" (see U10).
  3. **Badge:** a 28×28 number cell only.
- Only findings 1–4 can be full or short. Finding 5 and later always use a badge, and hovering or focusing its card shows its full tag.
- A badge sits just outside the box's top-left corner, or inside it if there is no room.

`[R2, L5.1, L5.5, H54, H61]`

**UI-18** Tag placement:
- Tags are placed in card order. Every box, and every tag already placed, is an obstacle.
- Candidates, in order: right of the box, left, above, below. Each is a leader length away (24px, or 16px when the frame is narrower than 600px), aligned to the box edge and clamped 8px inside the frame.
- Last resort: inside the box's top-left corner, 8px in, and only if the tag covers 25% of the box or less.
- Reject a candidate that:
  - crosses the 8px inset
  - is within 8px of another tag
  - overlaps its own box (except at the last-resort corner)
  - covers more than 20% of another box
  - would need a leader that crosses another tag
- Of the rest, pick the one that overlaps other boxes least, then the earliest in order.
- Placement is deterministic.
- Test fixture: 5 detections, with overlapping boxes, a box on each frame edge and one covering 85% of the frame. At every viewport and aspect ratio, no tags overlap and every leader dot stays visible.

`[L5.2–L5.4, L5.7, L5.8, H60, H61]`

**UI-19** Leaders:
- A leader runs from a 7px dot on the box border to the nearest edge of the tag: horizontal for left and right, vertical for above and below. One 90° bend is allowed when the tag was clamped.
- It is hidden when the gap is under 12px.
- It uses its box's colour, dash pattern and stroke.

`[L5.6, E-3, R7]`

**UI-20** Linking a card to its box:
- Hovering or focusing a card highlights its box with a solid 3px outline, added outside the dashed stroke, and raises its tag.
- Hovering or focusing a box or tag shows the card's 3px inset left bar (`box-shadow`, in the card's severity ink) and scrolls the card into view with `block:'nearest'`. The scroll is smooth unless reduced motion is on.
- All other boxes and tags fade to 35% over 120 ms.
- Nothing changes size or position.

`[H62, L9.2, L8.7, L7.6]`

**UI-21** Overlay toggle:
- A toggle button with `aria-pressed`, and the H key, hide or show the boxes, leaders, tags and badges with a 150 ms fade. The cards stay.
- It is disabled in `scanning` and `preparing`, and hidden in `idle`, `empty` and `error`.
- It resets to "shown" on every reveal, including cached revisits.
- Interim copy: "Hide boxes" / "Show boxes". Its position is open (U9).

`[H69, H70]`

**UI-22** Many findings:
- The server merges same-type findings with IoU ≥ 0.6, keeping the higher confidence.
- It caps results at 20. Any excess shows as a line in the panel, interim "+N more not shown".

`[H54, H57]`

### 5.3 Scan & states

**UI-23** One `appState` drives the screen, with exactly one state at a time: `booting → warming → idle → (preparing →) scanning → result | empty | error`, plus `waiting`, `boot-error` and `server-lost`. `result` carries a `cached` flag. Each state renders as follows:

| State | Header dot + label | Stage | Stats slot | Findings panel |
|---|---|---|---|---|
| booting, warming | pulsing hollow ring; "Model loading…" | empty frame | empty | "Loading the model. Photos can be scanned once it's ready." |
| idle | solid `--state-ready`; "Model active: {checkpoint}" | empty frame | empty | "Choose a site photo above, or upload one." |
| waiting | pulsing ring; "Model loading…" | photo dimmed, no sweep, *interim* "Waiting for model…" (U13) | empty | empty |
| preparing | ready | "Opening {file name}…" | empty | empty |
| scanning | ready | dim, grid and sweep (UI-29) | "Scanning for …" line (UI-30) | empty: no second scan message |
| result | ready | boxes, leaders, tags | tiles (5.4) | cards |
| empty | ready | photo at full brightness, no overlays | "Hazards flagged" 0, Model time, Photo | UI-34 |
| error | ready | photo without overlays | error bar with "Scan again" (UI-35) | *interim* "No results for this photo" |
| boot-error | solid red; "Model not loaded: {cause}" (U13) | C46 message, the cause and the fix command | none | none |
| server-lost | solid red; *interim* "Model offline" | "Can't reach the detection server. Is its window still open?" | none | none |

`[H1, H2, R9, C40–C42, C46, H67, R10/D14]`

**UI-24** Any new selection (a thumbnail, an upload or a re-scan) clears the previous boxes, tags, cards and stats in the same frame. Photo A's results are never drawn over photo B. `[H3]`

**UI-25** Every detect response carries:
- the seq id and model name
- the vocabulary actually sent
- display and original w×h
- the model time in ms
- the findings (type, conf, normalised box, found/missing checks)
- the outcome of all 5 rules, whether or not they fired

`[H4]`

**UI-26** Boot:
- The server serves the page within 2 s of launch and loads the model in a background thread. The browser never shows "can't connect".
- `GET /health` returns `{state, model, message, boot_id}`. The page polls it every 500 ms until ready, then every 5 s.
- Warm-up runs 2 inferences on demo photo 1 at the production size and discards the results. Health reports `ready` only after both finish.

`[H5–H7]`

**UI-27** Status dot:
- A 7px dot with no glow halo.
- Loading or warming: a hollow ring pulsing in opacity 1 → 0.35 → 1 over 1.2 s.
- Ready: solid `--state-ready` #4f9a64, static.
- Failed or server lost: solid `--sev-high-ink` #f0604f, with the label in the same colour (5.70:1 on surface-0).
- The label text changes with the colour, so hue never carries state alone.
- The dot and label don't change during a scan.
- After 45 s of loading, the label adds *interim* "still loading, check the server window". There is no hard timeout.

`[H8, H9, H11, R9, R10, D1]`

**UI-28** Before the model is ready, thumbnails can be clicked: the photo shows in `waiting` and its scan starts automatically once the model is ready. Only the last pick is kept. Once ready, no photo is auto-selected. A page reload returns to `idle` within 2 s with the model still warm, and no state persists. `[H10, H12, H13]`

**UI-29** Scan scene:
- **Look:**
  - The dim layer is `rgba(12,14,16,.55)`.
  - The grid has 1px lines every 28px in `--hivis` at 7%.
  - The sweep band is 12% of the frame height, a gradient from hivis at 0% to 22%, with a 1.5px `--hivis` leading edge.
  - All of it stays inside the frame. No glow, no animated grid lines, no second band.
- **Timing:**
  - Each pass runs top to bottom in 1500 ms (config `scan.min_scene_ms = 1500`).
  - The first pass always completes.
  - If the response has arrived by then, the scene ends at the end of that pass.
  - If not, the sweep loops with the same pass length. When the response arrives mid-pass, the sweep finishes the remaining distance in ≤ 150 ms with ease-out.
- **Hand-off to the reveal:**
  - The dim and grid fade out fully before the first box draws, so yellow and amber are never on the photo together.
  - The reveal starts ≤ 200 ms after the scene ends.
  - Test with `performance.mark`: click to first box ≤ max(1500 ms, response + 150 ms) + 200 ms.

`[LD-4, LD-10, H31, H32 (re-targeted), D8, L4.8, E-1, mockup]`

**UI-30** "Scanning for …" line:
- It reads "Scanning for person, hard hat, safety vest, staircase, railing, floor opening, cable, debris, uneven floor, pile of materials…". The list comes from the server response or config, never terms hard-coded in the page, and it ends in a single "…" character.
- It fills the stats slot at the stats row's height and stays for the whole scene (LD-10 overrides C37's "only for the real length").
- It fits on one line with an ellipsis, and the full list is in a tooltip.
- After 5 s it appends an elapsed counter " · 6 s". At 20 s the request times out and the app enters `error`.

`[C37, H34, H35, L6.5, LD-10]`

**UI-31** Revisits:
- Results are cached in page memory per photo id for the session. A revisit shows the result with a 200 ms fade and no scene.
- The stats row keeps the originally measured model time and adds an *interim* "earlier run" marker.
- Errors are never cached, and the cache clears when `boot_id` changes.
- R, or clicking the active thumbnail while it shows a result, runs a fresh scan with the full scene.
- Uploads always get a fresh scan.

`[R14, H24, H28, H29]`

**UI-32** Concurrency:
- Last click wins: the page aborts the old fetch, shows the new photo and restarts the scene. A response with a stale seq is dropped unrendered.
- Clicking the active thumbnail mid-scan does nothing.
- The server runs one inference at a time with a queue depth of 1; a newer request replaces a queued one, which returns `superseded`.
- The reported model time covers the model call only: no queue, loading or upload time.

`[H25–H27, C17]`

**UI-33** Upload:
- **File picker and type checks:**
  - `accept=".jpg,.jpeg,.png,.webp"` (see U8).
  - The server checks the real type by magic bytes.
  - HEIC/HEIF (`ftyp` brands heic, heix, hevc, mif1, msf1) → "Can't open {file name}: HEIC photos aren't supported. Save it as JPG and upload it again."
  - Other types → "Can't open {file name}. Choose a JPG or PNG photo."
- **Limits and bad files:**
  - Limits: ≤ 25 MB (checked in the page and on the server), ≤ 50 MP and shortest side ≥ 128px. Each rejection names the limit and the file's actual value (*interim* copy).
  - A corrupt file gets *interim* "This file couldn't be read as a photo." and no partial image is shown.
  - Client-side rejections leave the current result untouched and show an inline message by the Upload tile for 8 s. Server-side rejections enter `error`.
- **Normalisation** (server, once per image, demo photos included):
  - Apply EXIF orientation.
  - Convert to RGB, flattening alpha onto #808080.
  - Cap the longest edge at 2048px and save as JPEG q90.
  - Test: an EXIF-6 portrait shows upright with its boxes on the right objects.
- **Preparing and the upload slot:**
  - While preparing, the Upload tile shows a busy state and is disabled, but other thumbnails stay clickable. Preparation over 10 s enters `error`.
  - A successful upload takes one thumbnail slot just before the Upload tile. A later upload replaces it.
- **File names:**
  - Files are stored by content hash in a temp folder cleared at start-up.
  - Names are rendered with `textContent` only.
  - The shown name drops the extension, and is middle-truncated keeping the last 10 characters, both in the caption and in the stats row. The full name is in a tooltip.
  - Test with a 42-character WhatsApp name and a 120-character name containing emoji and Arabic.
- **Drag and drop:** files dropped anywhere on the window are swallowed.

`[H37–H48, C35, C42, C43]`

**UI-34** Zero hazards (`empty`):
- It is a designed result in neutral colours, with no green and no "safe" signal. The photo shows at full brightness without overlays.
- Panel: the heading "No hazards flagged", then one of:
  - "Objects found: Staircase 84%, Railing 71%. No rule matched them."
  - "No object scored above 25%, so no rule could run."
- Then, always: "Only 5 hazard checks run, so this is not a safety sign-off." Whether to also list all 5 checks is open (U7).
- Stats: "Hazards flagged" 0, Model time and Photo, with no category tiles. The overlay toggle is hidden.

`[H49–H51, C36, C47, C48]`

**UI-35** Errors:
- Kinds: `timeout` (20 s), `model-error` (HTTP 500), `server-lost`, `unreadable`, `unsupported`, `too-large`, `too-small`. Each has its own message, and none reads just "Error".
- On a scan error the scene lifts, and an inline bar replaces the stats row:
  - Scan error: "Scan failed. The model returned an error for this photo. Scan again, or choose another photo." Below it, smaller: "Details: {error text}".
  - Timeout: "Scan stopped: no result after {T} s. Scan again; if it happens twice, restart the app."
  - The button reads "Scan again", and R does the same.
- There is no modal or `alert()`. The strip stays usable.
- Server lost: the dot turns red within 5 s, and the page recovers without a reload once `/health` answers again.
- The server logs a traceback with the photo id. The page never shows a stack trace. Retry is manual only.

`[H64–H68, C44, C45]`

### 5.4 Stats row

**UI-36** Geometry:
- One line (`flex-wrap:nowrap`) of fixed height `--stats-h`: 48px, or 56px at `min-height:900px` (see U3). No top rule.
- Width: `max(min(100%, 560px), frame width)`, centred under the frame and aligned with its edges for landscape photos.
- It is a size container (`container-type:inline-size`).
- Test at 1366×768 and 1366×605, with 2 and 4 categories: `scrollWidth ≤ clientWidth`, and the height equals the token.

`[L6.1, L6.2, L6.6, R1, LD-5]`

**UI-37** Tiles, left to right:
1. "Hazards flagged" with the count.
2. One tile per category with at least one hazard, labelled exactly "Fall hazard", "Trip hazard", "No PPE" or "Materials dumped". The label is in severity ink and starts with a 24×4px line sample of the box stroke (UI-80).
3. "Model time" with the value (UI-38).
4. "Photo" with the scene name or uploaded file name, in Next 400 at 1×, `--ink-2`. It is pushed right with `margin-left:auto`.

Layout and content rules:
- Each tile puts its label 4px above its value. Tiles are 24px apart, with a 1px `--rule` divider centred in the gap.
- No image resolution is shown.
- A category with a zero count gets no tile.

`[R1, C36, L6.3, D12, E-4, H56, LD-10]`

**UI-38** Values:
- Counts are digits in Mono 600 at 1.4×.
- Model time is the model call only:
  - under 1000 ms, an integer in ms: "48 ms"
  - from 1000 ms to under 10 s, seconds with 2 decimals: "1.24 s"
  - from 10 s, seconds with 1 decimal: "12.3 s"
- Units ("ms", "s") are set at label size in `--ink-2`, after a no-break space. The ms/s rule merges LD-10's example with H36.
- The stats row always shows the true model time, even though the scene lasts at least 1.5 s.

`[LD-10, H33, H36, C17, N-3]`

**UI-39** When the contents don't fit, the row gives way in this order:
1. The Photo tile truncates (middle ellipsis for file names, end ellipsis for scene names) down to 160px.
2. The Photo tile is hidden.
3. The category tiles merge into one, with *interim* label "Categories" and the number of categories as its value.

"Hazards flagged" and "Model time" are never hidden. Content widths needed *(measured; uppercase keys / sentence-case keys; photo name "Column bay")*:

| Content | 1366 | 1536 | 1920 |
|---|---|---|---|
| 1 category + photo | 483 / 418 | 490 / 425 | 533 / 461 |
| 2 categories + photo | 641 / 548 | 648 / 555 | 700 / 598 |
| 2 categories, no photo | 534 / 441 | 534 / 441 | 570 / 468 |
| 4 categories + photo | 1009 / 852 | 1015 / 858 | 1091 / 919 |

Compare these with the row widths in UI-12. Consequences are in U2.

`[L6.4, R1]`

**UI-40** The stats slot is shared:
- During a scan, the "Scanning for …" line fills it at the same height.
- In `error`, the error bar replaces it.
- On a cached revisit, it shows the "earlier run" marker.
- Nothing moves when results replace the scan line.

`[L6.5, H65, H28]`

### 5.5 Findings panel & cards

**UI-41** Panel structure:
- A grid with `grid-template-rows:auto minmax(0,1fr) auto`: the heading block, the list, then the last row.
- The background is `--surface-0` (no tint), separated from the stage by the stage's 1px `--rule`.

`[L7.1, R10, D23]`

**UI-42** Heading block:
- Padding: 16px top, 12px bottom, the gutter at the sides.
- An `<h2>` reading "Hazards flagged". Directly under it, a plain text line (no box, no swatches): "Confidence is the model's score for one object, not the chance a hazard is real. Scores of 25% or less count as missing." The 25% comes from config.
- No sort label.
- The block measures 86px at 1366 *(measured)*.

`[R12, C15, C39, C50, L7.2, R10, D13, D15, D24]`

**UI-43** List:
- `overflow-y:auto; overscroll-behavior:contain; scrollbar-gutter:stable; scrollbar-width:thin; padding:0 var(--gutter) 24px; gap:16px`.
- Card width stays the same whether or not the list scrolls.
- The page itself never scrolls, and each reveal starts with the list scrolled to the top.

`[L7.3, H53]`

**UI-44** **[Superseded by §8: at most 3 cards always fit, so no cues are needed. Keep `overflow-y:auto` as a fallback only.]**  Scroll cues:
- While `scrollTop + clientHeight < scrollHeight − 4`, show a 48px fade at the bottom (`mask-image`). Also show a 28px pill reading "{N} more" plus an SVG down-arrow, centred 8px above the bottom, where N counts the cards whose top edge is out of view.
- While `scrollTop > 0`, show a 24px fade at the top.
- Hide each cue as soon as it no longer applies.
- Test with 1, 3 and 5 cards (see U1).

`[L7.4, F-5]`

**UI-45** List heights *(measured, with the UI-42 heading block and the UI-46 last row)*: 463px at 1366×768, 357px at 1366×633, 329px at 1366×605, 557px at 1536×864, 422px at 1536×729, 744px at 1920×1080, 609px at 1920×945 and 249px at 1093×560. Layout's L7.5 figures (530/423/626/826) no longer apply, because of the legend and the limits line. `[L7.5, R11, C15]`

**UI-46** Last row:
- The limits line on the left: "Limits: floor openings and uneven floors are often missed, as they are surfaces, not objects. Debris and piles of materials can be mistaken for each other." Meta size, `--ink-2`.
- "v0.1" on the right in Mono 400, right-aligned at the gutter, so it sits in the viewport's bottom-right corner.
- Padding 8px with the gutter at the sides; the height follows the content (68.5px at 1366, a 3-line limits text, *measured*).
- Neither the limits line nor v0.1 is ever hidden behind hover, a toggle or a scroll fold.

`[R11, LD-8, L7.7, C49, C50, D5, N-1]`

**UI-47** Order and numbering:
- Cards are sorted by anchor confidence, descending. Ties follow PRODUCT.md's hazard order: fall (stair), fall (opening), trip, no PPE, materials.
- Numbers are "01", "02", … in that order.
- One sort order sets the card order, the numbers, the tag numbers and the tag placement order.

`[H52, C20, L9.1, R3]`

**UI-48** One card per anchor object. The anchors are staircase, floor opening, the highest-scoring trip object, person and pile of materials. All trip evidence in a photo shares one Trip card. `[C14, C28]`

**UI-49** Card container:
- One surface, `--surface-2`, with a 1px `--rule` border and 16px side padding. No min or fixed height.
- No divider under the header and no rule above the chips: groups are separated by spacing.

`[L8.1, R10, D18, D-2]`

**UI-50** **[Superseded by §8, card anatomy]**  Card header:
- **Grid:** `grid-template-columns: 2ch 1fr 64px`, a 12px column gap, 12px 16px padding and items centred vertically.
- **Number:** "01" in Mono 600 at 2.2×, `--ink-3`. The column is a fixed two numerals wide.
- **Category label:**
  - The exact category label, in Next 700 uppercase with +0.06em tracking.
  - Coloured `--sev-high-ink` or `--sev-med`.
  - Starts with a 24×4px line sample in the box's dash pattern.
  - Sits 4px above the title.
- **Title:** Next 700 at 1.2×, at most 2 lines, `text-wrap:balance`. It never runs under the confidence column.
- **Confidence column:**
  - 64px wide, right-aligned.
  - "91%" in Mono 600 at 1×, `--ink-1`.
  - The anchor name directly under it ("Person") at meta size, `--ink-2`. It may wrap to 2 lines and never overflows (*measured*: "Pile of materials" (101px natural width) and "Floor opening" (86px) wrap to 2 lines).
  - No bar.
- **Test:** the headline % equals the anchor chip's %.

`[LD-6, L8.2, L8.3, C14, R10, E-4, R7]`

**UI-51** **[Removed by §8]**  Card body:
- Padding 12px 16px 0, with rows 12px apart.
- Two rows, "Reason" and "YOLO intervention". In each, the label sits 4px above the text (label styling: U4).
- Text: Next 400 at 1×, `--ink-1`, line height 1.45, `letter-spacing:.01em`, `text-wrap:pretty`, `max-width:34em`, no opacity.
- At 1366 the text column is 410px, about 60 characters per line *(measured)*.

`[L8.4, T-2, T-4, D19]`

**UI-52** **[Removed by §8]**  Rule line:
- A single line between the body rows and the chips, in Next 400 at the .85× role, `--ink-1`.
- Format: "Rule: … → {Category label}", using only glossary words plus "found" and "missing".
- The arrow is an inline SVG, because the font subset has no U+2192.
- Location words ("at the staircase", "on the person", "around the opening") appear only if `rules.py` really checks box overlap; otherwise the text says "in the photo".

`[C24, C25, F-5]`

**UI-53** **[Amended by §8]**  Chips row:
- 12px top margin, then padding 12px 16px 0, with no rule above it.
- Chips wrap with an 8px gap and are never truncated.
- Order: context first, then safeguards or evidence. Trip and Materials cards list only the evidence that was found.

`[L8.5, R10, C23]`

**UI-54** **[Amended by §8: missing chips carry no threshold text]**  Chip wording and style:
- Text is "{Object} found · {NN}%" or "{Object} missing · none above {T}%", with the object in sentence case.
- The status word is lowercase, weight 700, at the noun's size and colour. No nested uppercase, tracking or opacity.
- Chips use the .85× role, a 3px radius and padding 4px 10px (raised from 2px 8px after the detector flagged cramped padding).
- Text is always `--ink-1`. No chip is green.

| Chip role | Border | Fill | Example |
|---|---|---|---|
| Context found (person, staircase, floor opening) | `--rule` #6b737d | `--surface-3` #2e333a | "Person found · 91%" |
| Safeguard found (hard hat, safety vest, railing) | `--rule` | `--surface-3` | "Safety vest found · 66%" |
| Safeguard missing (trigger) | severity ink: #f0604f red / #e8912d amber | transparent | "Hard hat missing · none above 25%" |
| Evidence found (trigger: cable, debris, uneven floor, pile of materials) | severity ink | severity tint: #483133 red / #43382d amber | "Cable found · 64%" |

`[R4, C21, C22 (green overridden), D-4, C-3, D20]`

**UI-55** **[Removed by §8]**  Every card ends with one line, "Not checked: …", of at most 8 words, at meta size in `--ink-2`, with padding 12px 16px 16px. It is never hidden behind hover or a toggle (but see U1 on the scroll fold). `[C27, C50]`

**UI-56** **[Superseded by §8: only the category labels and the title rules carry over; titles are replaced by §8's table]**  Card copy is exact. The YOLO intervention text describes what this app does, per LD-11. Titles name what was seen in glossary words, at most 7 words, with no blame or intent ("negligence", "careless", "violation").

| Card | Category | Title | Headline anchor | Reason | YOLO intervention | Rule line | Chips (example values) | Not checked |
|---|---|---|---|---|---|---|---|---|
| Fall, staircase | Fall hazard | "Staircase without a railing" | "Staircase" | "No railing at an open stair edge, so a person can fall from it." | 'Asks the model for "staircase" and "railing", then checks for a railing at the staircase.' | "Rule: staircase found + railing missing → Fall hazard" | "Staircase found · 81%", "Railing missing · none above 25%" | "Not checked: Railing height or type." |
| Fall, floor opening | Fall hazard | "Floor opening without a railing" | "Floor opening" | "No railing at the edge of an opening or shaft, so a person can fall through." | 'Asks the model for "floor opening" and "railing", then checks for a railing around the opening.' | "Rule: floor opening found + railing missing → Fall hazard" | "Floor opening found · 47%", "Railing missing · none above 25%" | "Not checked: Covers or nets over the opening." |
| Trip | Trip hazard | By evidence found: "Cable on the floor" / "Cables on the floor" / "Debris on the floor" / "Cables and debris on the floor" / "Uneven floor surface" / "Uneven floor with cables and debris" | highest-scoring trip object | "Loose items or level changes on a walking surface can trip people." | 'Asks the model for "cable", "debris" and "uneven floor"; any one found is flagged.' | "Rule: cable, debris or uneven floor found → Trip hazard" | "Cable found · 64%", "Debris found · 52%" | "Not checked: Whether this is a walking route." |
| No PPE | No PPE | "Person without a hard hat or safety vest" / "Person without a hard hat" / "Person without a safety vest" | "Person" | "A hard hat guards against falling objects; a safety vest keeps a person visible." | 'Asks the model for "person", "hard hat" and "safety vest", then checks for each on the person.' | "Rule: person found + hard hat or safety vest missing → No PPE" | "Person found · 91%", "Hard hat missing · none above 25%", "Safety vest missing · none above 25%" (or "Safety vest found · 66%", neutral) | "Not checked: Gloves, boots, or how PPE is worn." |
| Materials | Materials dumped | "Pile of materials" | "Pile of materials" | "Materials left outside a storage area can block routes and cause trips." | 'Asks the model for "pile of materials" and flags any pile it finds.' | "Rule: pile of materials found → Materials dumped" | "Pile of materials found · 77%" | "Not checked: Whether this spot is a storage area." |

`[C26, C28, F-section copy, LD-6, LD-11, R13]`

### 5.6 Wording & glossary

**UI-57** All user-facing strings live in one strings file. Prompt words, display names, thresholds and category labels are read from the same config that drives the model and the rules. Test: renaming a prompt in config changes the scan line, the intervention text and the chips, with no other edits. `[C1, H34]`

**UI-58** Voice: plain words in the present tense, with "the model" as the subject.
- Never "AI", "the system", "the detector" or "we".
- No exclamation marks or emoji.
- Never "smart", "AI-powered", "real-time", "accuracy", "safe" on its own ("safety vest" is fine), "compliant", "verified", "proof of concept" or "dissertation".

`[C2, PRODUCT]`

**UI-59** Banned-word test: in every state, the rendered DOM text contains none of these:
- helmet
- hi-vis
- rubble
- handrail
- guardrail
- worker
- negligence
- detected
- probability
- finding
- "vest" without "safety" in front of it

`[C4, R13]`

**UI-60** Strings are written in sentence case in the source. Uppercase comes only from CSS `text-transform`. `[C3, C-1]`

**UI-61** Glossary: one name per thing, used everywhere.

| Use | Never | Note |
|---|---|---|
| person | worker, human, man, labourer | the model finds a person; it can't tell a worker from a visitor |
| hard hat | helmet, safety helmet | |
| safety vest | vest, hi-vis, reflective jacket | |
| staircase | stairs, stair, stairway | |
| railing | handrail, guardrail, barrier | the slide's word, for both stairs and openings |
| floor opening | hole, open shaft | "shaft" is allowed only in card 2's Reason |
| cable | wire, loose cable | |
| debris | rubble, litter, waste | |
| uneven floor | uneven surface, level difference | |
| pile of materials | material pile, dumped materials | "Materials dumped" is the separate category label |
| found | detected, present, seen, OK | scored above the threshold |
| missing | absent, not detected | nothing scored above the threshold; always followed by the threshold |
| flagged | detected, alert, violation | objects are *found*; hazards are *flagged* |
| hazard | finding, issue, risk | one card = one hazard |
| confidence | probability, certainty, score | the model's score for one object |
| scan | analysis, inference, run | one model pass plus the rules, on one photo |
| photo | image, picture | "file" appears only in upload errors |

`[C glossary, R13]`

**UI-62** Category labels are exactly "Fall hazard", "Trip hazard", "No PPE" and "Materials dumped". The slide's "Human negligence" is never shown. `[C5, PRODUCT]`

**UI-63** Prompt vocabulary: the model receives exactly these 10 prompts, and each display name is the prompt string itself.

| Hazard | Prompts | Role |
|---|---|---|
| Fall hazard, stairs | staircase, railing | staircase = context; railing = safeguard |
| Fall hazard, opening | floor opening, railing | floor opening = context; railing = safeguard |
| Trip hazard | cable, debris, uneven floor | evidence |
| No PPE | person, hard hat, safety vest | person = context; hard hat and safety vest = safeguards |
| Materials dumped | pile of materials | evidence |

- The full-list order is: person, hard hat, safety vest, staircase, railing, floor opening, cable, debris, uneven floor, pile of materials.
- There are no hidden synonyms: if a prompt is swapped, the glossary, scan line and chips all change with it.
- "uneven floor" stays in config and is verified against the demo photos by the preflight. If it is unreliable, it is dropped, and the Trip card copy and the limits line are updated.

`[C6–C8, R17]`

**UI-64** Confidence format:
- `floor(score × 100)` as an integer with no space ("91%"), clamped to 1–99, never "100%".
- One format everywhere: headline, chips, tags and legend.
- An object is *found* when its score is strictly above the threshold (`>`). The threshold comes from config, per object if per-object thresholds exist.
- Never "0.91", "91.0%" or "91 %".

`[C9–C13, H36]`

**UI-65** Counts are digits, and plurals agree: "1 hazard flagged", "2 hazards flagged", "No hazards flagged". `[C19]`

**UI-66** Header copy:
- Ready: "Model active: {checkpoint}", where the checkpoint is the weights file name without its extension (e.g. "yolov8s-world").
- Loading: "Model loading…".
- Failure: see UI-23 and U13.
- "Model active:" is set in Next and the checkpoint in Mono.

`[R9, C32, N-1, D2]`

**UI-67** Thumbnails and photo names:
- Captions are scene names (1 to 3 words naming the place, never the file or the hazard), read from a photos config file.
- Placeholders until the user supplies names:

  | Photo | Placeholder caption |
  |---|---|
  | site-ppe | Column bay |
  | site-stairs | Stair flight |
  | site-shaft | Service shaft |
  | site-floor | Room corner |
  | site-materials | Ground-floor room |
  | site-railing | Stair doorway (the no-hazards example) |

- Each thumbnail button's accessible name is "Scan photo: {scene}", and the thumbnail image has `alt=""`.
- The main photo's alt is "{scene}, site photo" or "{file name}, uploaded photo".
- The upload tile's caption is "Upload photo", with the tooltip and accessible description "JPG or PNG" (see U8). An uploaded photo's caption is its file name without the extension.

`[C33–C35, R18, LD-3, D4]`

**UI-68** Accessibility strings:
- A polite live region announces after each scan "Scan complete. {count phrase}. Model time {time spoken}." For example: "Scan complete. 2 hazards flagged. Model time 48 milliseconds." This adapts C38 to LD-10.
- Each hazard box's accessible name is "Hazard 01, No PPE: Person without a hard hat or safety vest. Person 91%."

`[C31, C38, H75, LD-10]`

### 5.7 Type scale

**UI-69** All type derives from one base:
- `--fs-body: clamp(1rem, 0.3rem + 0.81vw, 1.375rem)`.
- Every role is `calc(var(--fs-body) × ratio)`, and every role is wrapped in `max(0.875rem, …)`, so the 14px floor holds.
- No other font size is written in px.

Values in CSS px *(measured)*:

| Role | Formula | Face, weight, colour | 1280–1366 | 1536 | 1920 | LH |
|---|---|---|---|---|---|---|
| Label, meta (floor) | `max(0.875rem, .75×)` | Next 400 for meta; Next 700 for labels; `--ink-2` | 14.0 | 14.0 | 15.3 | 1.25 |
| Evidence chip, rule line, status line | `max(0.875rem, .85×)` | Next 400, status word 700, `--ink-1` | 14.0 | 14.7 | 17.3 | 1.25 |
| **Reasoning body** | 1× | Next 400, `--ink-1` | **16.0** | **17.2** | **20.4** | 1.45 |
| Card confidence | 1× | Mono 600, `--ink-1` | 16.0 | 17.2 | 20.4 | 1.1 |
| Section head ("Hazards flagged") | 1.1× | Barlow 600, uppercase (colour: U4) | 17.6 | 19.0 | 22.4 | 1.1 |
| Card title | 1.2× | Next 700, `--ink-1` | 19.2 | 20.7 | 24.4 | 1.3 (wraps to 2 lines; ≥ 1.3 keeps the detector's tight-leading rule clean) |
| Header wordmark | 1.4× | Barlow 700, uppercase, `--ink-1` + `--hivis` | 22.4 | 24.1 | 28.5 | 1.0 |
| Stat value | 1.4× | Mono 600, `--ink-1` | 22.4 | 24.1 | 28.5 | 1.1 |
| Card index | 2.2× | Mono 600, `--ink-3` | 35.2 | 37.9 | 44.8 | 1.0 |

At the 1093 floor and at 1280, the base is the 16px minimum. `[R5, ty B table]`

**UI-70** Photo tags scale with the frame (`container-type:inline-size` on the frame):

| Role | Formula | Face | 701px frame (1366) | 829px frame (1536) | 1083px frame (1920) |
|---|---|---|---|---|---|
| Tag line 1 ("01 No PPE") | `clamp(1.0625rem, 3.2cqw, 1.75rem)` | Next 700 | 22.4 | 26.5 | 28.0 |
| Tag line 2 ("Person 91%") | `clamp(0.9375rem, 2.3cqw, 1.25rem)` | Next 400, numerals in Mono 400 | 16.1 | 19.1 | 20.0 |

Both stay at or above the 14px floor. See U11 for how these compare with the card title. `[ty B tag table, R5]`

**UI-71** Type tests:
- (a) No rendered text is below 14px at any viewport, including captions, v0.1, tags and chips. Walk every text node and read its computed `font-size`.
- (b) Reasoning text uses `--ink-1` at 12.38:1 on a card and no opacity.
- (c) Neighbouring roles differ by ≥ 1.15× in size, or by a change of weight, case or colour token. Repeated roles get identical computed values in every card and state.
- (d) Card and tag titles use `text-wrap:balance`, and card body text runs 35–75 characters per line.
- (e) At 125% browser zoom, body text is larger in device pixels than at 100%.
- (f) No text uses `opacity` below 1.

`[R5, T-1–T-6]`

**UI-72** Case, tracking and numerals:
- Uppercase is applied only through `text-transform`, on these roles:
  - the wordmark (Barlow 700, +0.02em)
  - section heads (Barlow 600, +0.06em; see U4)
  - the card category label (Next 700, +0.06em)
  - field labels and stat keys (Next 700, +0.06em; see U4)
- Each uppercase run is at most three words.
- Mixed-case text has 0 tracking, except body text at +0.01em. Numerals have 0 tracking. Nothing goes below −0.01em.
- `font-variant-numeric: tabular-nums` is set on the app root.
- Mono is used only for measured numbers and literal identifiers: confidence, counts, timing, the card index, the checkpoint id and "v0.1" (filenames and prompt words: see U4).

`[C-1, C-2, N-1, N-2, D21, D22]`

### 5.8 Colour tokens

**UI-73** Colour tokens (WCAG 2.x ratios against the surface named):

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--surface-0` | #121417 | page, header, strip, stage, **findings panel** (R10) | (base) |
| `--surface-1` | #1a1d21 | **retired by R10** (was the panel/strip tint); kept only for reference | 1.09 vs s0 |
| `--surface-2` | #23272d | card | 1.13 vs s1 |
| `--surface-3` | #2e333a | fill of a neutral "found" chip | 1.18 vs s2 |
| `--ink-1` | #ece9e2 | primary text | 15.22 s0 · 13.95 s1 · 12.38 s2 · 10.49 s3 |
| `--ink-2` | #a4a9b0 | secondary text, labels, captions (replaces `--muted`) | 7.80 s0 · 7.15 s1 · 6.35 s2 |
| `--ink-3` / `--rule` | #6b737d | card index numerals; 1px region rules; context-chip borders; upload-tile border; scrollbar thumb | 3.84 s0 · 3.52 s1 · 3.12 s2 |
| `--rule-soft` | #353a42 | **unused after R10** (the card dividers and confidence-bar track are gone) | 1.31 s2 |
| `--hivis` | #f0c02f | the instrument accent (UI-77) | 10.79 s0 · 9.90 s1 · 8.78 s2 |
| `--on-hivis` | #121417 | text on a hivis fill, `::selection` | 10.79 |
| `--sev-high-ink` | #f0604f | red text, trigger-chip borders and line samples on dark; the failure dot and label | 5.70 s0 · 5.23 s1 · 4.64 s2 |
| `--sev-high-fill` | #c0392b | red photo box, leader, tag fill | white text 5.44; vs s0 3.39 |
| `--on-sev-high` | #ffffff | text on a red tag | 5.44 |
| `--sev-high-tint` | #483133 | fill of a red trigger chip that is "found" | ink-1 9.83; border 3.68 |
| `--sev-med` | #e8912d | amber text, borders, box, tag fill | 7.49 s0 · 6.86 s1 · 6.09 s2 |
| `--on-sev-med` | #16110a | text on an amber tag | 7.62 |
| `--sev-med-tint` | #43382d | fill of an amber trigger chip that is "found" | ink-1 9.40; border 4.62 |
| `--state-ready` | #4f9a64 | the model-ready dot only (replaces `--ok`); never on evidence | 5.39 s0 |

`[ty D table, R10]`

**UI-74** `--faint` (#5d636b) and `--muted` are deleted, and every former use becomes `--ink-2`. `--ink-3` is never used for text under 24px. The card index is 35–45px *(see U11)*. `[D-1]`

**UI-75** Region rules are 1px `--rule`, scoring at least 3:1 on both sides:
- header | strip
- strip | main
- stage | panel
- the card outline
- the upload tile's dashed border

Surfaces are not relied on to separate regions. `[D-2, D23]`

**UI-76** Severity:
- Red is used for Fall hazard and No PPE: `--sev-high-fill` on the photo, `--sev-high-ink` for text and borders on dark.
- Amber is used for Trip hazard and Materials dumped: `--sev-med`.
- The card category label, the box, the leader, the tag and the stats key of one hazard share one severity.

See U14. `[L9.1, ty D table, PRODUCT open decision]`

**UI-77** Hi-vis yellow:
- It is used only for:
  - "DETECTION" in the wordmark
  - the scan sweep and grid
  - the selected-thumbnail bar
- It never marks a hazard or a confidence value. It is forbidden on boxes, tags, category labels, chips, stat keys and confidence.
- The scan overlay is fully gone before the first box draws.
- Its use on the focus ring, `::selection`, the upload-tile hover and the "Scanning for …" text is open (U6).

`[R8, LD-2, E-1]`

**UI-78** **[Amended by §8: green is also used for a high confidence %]**  No green appears anywhere except the model-ready dot. The `empty` state uses neutral colours only. `[R4, H49, D-4]`

**UI-79** The wordmark source string is "Site Hazard Detection", rendered uppercase. "Site Hazard" uses `--ink-1` and "Detection" uses `--hivis`. `[LD-2]`

**UI-80** Telling red from amber without hue:
- Tags have opposite polarity (UI-16).
- Boxes have different dash patterns (UI-14).
- Every piece of severity-coloured text (card category label, stats key) starts with a 24×4px sample of its box stroke, in the same dash pattern and token.
- Test: a greyscale screenshot (`filter: grayscale(1)`) at 1366×768 still lets a viewer pair every card with its box and tell high from medium.

`[R7, E-2, E-4, E-5]`

**UI-81** Browser surfaces:
- `::selection` is `--hivis` with `--on-hivis` text (U6).
- Scrollbars are `scrollbar-color: var(--rule) var(--surface-0)`, giving 3.84:1. This changes from s1 because R10 retires the panel tint.
- `scrollbar-gutter: stable`.

`[D-5, R10]`

### 5.9 Fonts & offline

**UI-82** Bundle exactly these four WOFF2 files in the repo's font folder, with each family's `OFL.txt` beside them:

| File | Family | `font-weight` in @font-face | Weights used | Size |
|---|---|---|---|---|
| `atkinson-hyperlegible-next-latin-wght.woff2` | Atkinson Hyperlegible Next (variable) | `200 800` | 400, 700 | 34 KB |
| `atkinson-hyperlegible-mono-latin-wght.woff2` | Atkinson Hyperlegible Mono (variable) | `200 800` | 400, 600 | 18 KB |
| `barlow-condensed-latin-600.woff2` | Barlow Condensed (static) | `600` | 600 | 22 KB |
| `barlow-condensed-latin-700.woff2` | Barlow Condensed (static) | `700` | 700 | 22 KB |

Loading rules:
- Every `@font-face` uses the latin `unicode-range`. `font-display` is open (U5).
- Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for all four files.
- No Google Fonts `<link>`, no `preconnect` and no IBM Plex Mono. Searching the source for `googleapis`, `gstatic` and `Plex` finds nothing.

`[F-1–F-3, H15, LD-9, R10]`

**UI-83** Fallbacks are metric-matched and cover only a missing file:
- Next → `Arial` with `size-adjust: 99%`
- Mono → `Consolas` with `size-adjust: 115%`
- Barlow Condensed → `"Arial Narrow", sans-serif`

Set `font-synthesis: none` on the root, so a missing weight is never faked. `[F-4]`

**UI-84** The latin subset has no arrows, so no copy string contains an arrow character (→ ↓). Arrows (the rule line, the "{N} more" pill) are drawn as inline SVG. × · … – % are available. `[F-5]`

**UI-85** Font-failure check:
- After `document.fonts.ready`, call `load()` on every FontFace. If any load is rejected, or a locked family has no face, show a red one-line banner naming the family and the expected file path. One click dismisses it.
- Never use `document.fonts.check()`, which returns true for undeclared families.
- Manual test on the Windows laptop with Wi-Fi off: DevTools › Rendered Fonts lists only the three families, all served from 127.0.0.1.
- Don't set `-webkit-font-smoothing`. Judge weights on Windows Chrome or Edge at 125% scaling.

`[H16, F-6, F-7]`

**UI-86** No request leaves 127.0.0.1. The page sends the CSP `default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'`. Because that CSP blocks inline `<script>`, all JS lives in files. `[H14]`

**UI-87** Model integrity:
- A missing weights file, or one whose SHA-256 doesn't match the pinned value, makes `/health` report `error` with the path and the setup command. The page shows `boot-error`, the server window prints the error in red, and the thumbnails are disabled.
- The text encoder never loads from the network: the vocabulary is baked in at setup, or the encoder weights sit in `models/`.
- Runtime pip installs, hub downloads and analytics are off (`settings sync=False`).

`[H17, H18]`

**UI-88** A missing demo photo is logged at start-up. Its thumbnail shows a broken tile with the file name and *interim* "Missing file", and the other photos still work. `[H19]`

**UI-89** Preflight `check` command:
- It runs with outbound sockets patched to raise.
- It verifies:
  - dependencies
  - the weights hash
  - the encoder or vocabulary
  - **the 4 font files**
  - that all 6 demo photos decode
  - one detection per demo photo against `demo/expected.json`, including whether "uneven floor" fires where expected
- It prints PASS/FAIL and the model time per photo.
- It exits non-zero, naming each failure and any URL a library tried to reach.
- Run it on the Windows laptop the day before the demo and 1 h before it.

`[H20, H21, R17]`

**UI-90** Server and files:
- The server binds only to 127.0.0.1 on a fixed config port (e.g. 8765). If the port is busy, it exits naming the port.
- The launcher opens `http://127.0.0.1:<port>`, not `localhost`.
- All file I/O uses UTF-8 and repo-relative `pathlib` paths. Test it from `C:\Users\Zoë\My Demo\`.

`[H22, H23]`

### 5.10 Motion & reduced motion

**UI-91** Reveal, one authored moment per finding n, in card order:
- Box n wipes in (`clip-path: inset(0 100% 0 0)` → `inset(0)`). Its leader and tag then fade in.
- Card n then fades in and rises 8px, in ≤ 200 ms.
- The stagger between findings is min(300 ms, 1500 ms ÷ N), so the whole reveal takes ≤ 1.5 s at any N.
- Results stay until the next photo, with no fade-out.

`[R10, D9 (slide-up removal rejected), H55, mockup]`

**UI-92** Durations, collected in one place:

| Motion | Duration |
|---|---|
| Scan pass | 1500 ms per pass (UI-29) |
| Late-response catch-up | ≤ 150 ms |
| Reveal start after the scene | ≤ 200 ms |
| Card fade and rise | ≤ 200 ms |
| Hover dim | 120 ms |
| Overlay toggle fade | 150 ms |
| Cached revisit fade | 200 ms |
| Dot pulse | 1.2 s |

Tag re-placement after a resize uses no transitions. `[H31, H32, H62, H69, H28, H8, L5.7]`

**UI-93** Under `prefers-reduced-motion: reduce`:
- The sweep doesn't move. The dim, grid, "Scanning for …" line and elapsed counter show statically. The scene still holds for at least 1500 ms or until the result (LD-10).
- Overlays and cards appear with opacity fades of ≤ 150 ms: no wipe, rise or stagger.
- The dot doesn't pulse, and scroll-into-view is instant.
- Windows "Animation effects: off" triggers this setting in Edge and Chrome. When it is active, the `idle` state shows a dismissible notice, *interim* "Reduced motion is on: the scan sweep won't play".

`[H76, H77, L7.6, LD-10]`

### 5.11 Keyboard & clicker

**UI-94** → or PageDown moves to the next demo photo, and ← or PageUp to the previous one. Navigation doesn't wrap around, and the arrows never reach the uploaded slot or the Upload tile, so a clicker can't open the file dialog. `[H71]`

**UI-95** R re-scans the current photo with the full scene. H toggles the overlays. Keys pressed with Ctrl, Alt or Meta pass through to the browser. `[H72, R14]`

**UI-96** F5 without modifiers, Esc, B and "." (the clicker's start, stop and blank buttons) are swallowed. F11 passes through. `[H73, R19]`

**UI-97** Thumbnails and the Upload tile are `<button>`s. The focus ring shows on `:focus-visible` only, as a 2px outline with a 2px offset (colour: U6; typeset's figure is 8.78:1 or more on every surface). `[H24, H74, D-5]`

### 5.12 Removals

**UI-98** Removed from the mockup. Each item has a DOM or grep test showing it is absent:
- the status-dot glow halo (`box-shadow: 0 0 0 3px`)
- the mini confidence bars
- IBM Plex Mono, the Google Fonts link and the `preconnect`
- the "sorted by confidence" aside, and any replacement sort label
- the dashed "waiting for model…" panel placeholder
- the 7% tint inside boxes
- the strip tint `#17191c` and the panel tint `--panel`
- the card header divider
- the dashed rule above the chips
- the full-width footer row and its top border
- filename captions under the thumbnails
- chips on photo tags
- the "91% confidence" tag wording
- `.chip em` styling (uppercase, tracking, 75% opacity, 10px)
- text opacity below 1
- `--faint` and `--muted`
- the fixed 90px scan band
- the mockup's 8 s animation loop and its 96–100% fade-out
- the image resolution in the stats row
- the hard-coded "Scanning for" list
- the border-and-padding toggle on the active thumbnail
- `aspect-ratio:382/344` with `object-fit:cover` on the main photo
- the title "Human negligence"

`[R10, D1, D2, D4–D7, D9, D12–D14, D16, D18, D20, D23, F-2, T-6, D-1, L2.3, L3.7, L4.2, L4.8, C5, C29, C34]`

**UI-99** These distill removals are **rejected** and must not be applied:
- the single-colour wordmark (D3)
- confidence-free tags (D6)
- the single-line stats form (D10/D11)
- "1" instead of "01" (D17)
- removing the card's fade and rise (D9)

`[LD-2, R1, R2, R3, R10]`

**UI-100** Not building (YAGNI):
- HEIC decoding, drag-and-drop upload, upload history beyond one slot, and results persisted across reloads.
- A scan cancel button, automatic retries, a confidence slider, zoom or pan on the photo, and export.
- Number-key shortcuts, wrap-around navigation, touch gestures, mobile layouts, and Firefox or Safari support.
- A light theme, a service worker, multi-user concurrency, a GPU-detection UI and progress percentages.
- Icons on cards, a colour-legend box, glows, and new colours.

`[H YAGNI, D24]`

---

## 6. Post-merge resolutions (Claude's calls, 2026-11-14)

These settle the merge's unresolved items U2–U13. Each one overrides any conflicting requirement above.

- **PM-2 (U2): stats-row give-way.**
  - Stat keys are sentence case (see PM-4).
  - Swap the order: merge categories (step 3) **before** hiding the photo name (step 2).
  - Accept that the photo name can still be hidden in a 1366 window; full screen (F11) is the presenting mode.
- **PM-3 (U3):** derive the stats-row height from type: `--stats-h: calc(var(--fs-label)*1.25 + 4px + var(--fs-stat)*1.1)`.
- **PM-4 (U4): type styling.**
  - **(a) Field labels and stat keys** follow distill: sentence case, no tracking, medium weight, muted colour (still ≥ 4.5:1). Uppercase appears only in Barlow Condensed headings and the card's category label. This removes a critique-flagged "AI dashboard" tell.
  - **(b) The "Hazards flagged" heading** stays a Barlow Condensed uppercase section head, as in the approved mockup, in `--ink-2` at +0.04em.
  - **(c) Mono follows typeset:** numbers only. Filenames and prompt words use Atkinson Hyperlegible Next.
- **PM-5 (U5):** `font-display: block`. The fonts are local and preloaded, so there is no fallback flash on stage. The missing-font banner (H16) still applies.
- **PM-6 (U6): hi-vis outside R8.** Also allowed for:
  - the keyboard focus ring
  - the upload tile's hover state
  - the "Scanning for …" text (approved mockup)
  `::selection` uses browser defaults.
- **PM-7 (U7): zero hazards.** Show clarify's "Objects found: …" sentence, then harden's 5-check list, then the sign-off line.
- **PM-8 (U8):** accept WebP. All copy says "JPG, PNG or WebP".
- **PM-9 (U9): overlay toggle.**
  - The H key, plus a small text button ("Hide boxes" / "Show boxes") in the findings panel's heading row.
  - It is visible only in the result state.
- **PM-10 (U10):** confirmed. The tag's middle form is the single line `{NN} {Category} {NN}%`.
- **PM-11 (U11): sizes not tied to the base.**
  - **(a)** Cap tag line 1 at the card title size: `min(3.2cqw, var(--fs-title))`.
  - **(b)** Accept the 35–38px card index. The ≥ 24px rule and the 3:1 contrast still hold.
- **PM-12 (U12):** anchor boxes only, one box per hazard. Supporting objects are not drawn.
- **PM-13 (U13): copy gaps.**
  - Thumbnails are clickable before the model is ready (H10). The photo is queued and scans when the model is ready.
  - The tooltip reads "Scans when the model is ready".
  - The waiting stage text reads "Model is loading. This photo will scan when it's ready."
  - The builder writes the other listed strings during the build, following clarify's glossary and voice rules. They are covered by the glossary test.

- **PM-14 (builder check):** trip hazards produce one finding per merged detection, each with its own box, tag and card. This overrides UI-48. Card titles name the object.
- **PM-15 (builder check):** findings are ordered by severity (high first), then anchor score. This overrides UI-47.
- **PM-16 (builder check):** the glossary follows the prompts. If tuning swaps a prompt word (e.g. "hard hat" to "helmet"), the on-screen word, glossary and banned-word list all change with it. UI-59, UI-61 and UI-63 describe the *initial* vocabulary, not a permanent lock.

## 7. Open, needs the user

None. U1 (cards in view) was resolved by the user's card redesign (§8). U14 was confirmed by the user on 2026-11-14: red for Fall hazard and No PPE, amber for Trip hazard and Materials dumped (UI-76 stands).

## 8. Card redesign (user-decided 2026-11-14; overrides §5.5 where they differ)

Reference: `assets/approved-cards.html`, right-hand "After" panel. Real size for 1366×768.

- **UI-101 At most 3 findings.**
  - Cards, photo boxes and photo tags all show the top 3 in sort order (PM-15: severity, then anchor score).
  - If more were flagged, one line under the last card reads "{N} more hazards were flagged in this photo but are not shown." at meta size in `--ink-2`.
  - The stats row counts only the shown findings, and the line above says how many were not shown.
- **UI-102 Card anatomy, top to bottom.** No other elements.
  1. **Top row**, using flex and space-between:
     - **left:** the number ("01"), Mono 600 in `--ink-2`, 8px gap, then the category label (Next 700, uppercase, +0.06em, `--sev-high-ink` or `--sev-med`)
     - **right:** "Confidence", meta size in `--ink-2`, then a 6px gap and "91%" in Mono 600 at 1× (colour per UI-104)
  2. **Title:** Next 700 at 1.2×, line height 1.3, `text-wrap:balance`, 6px above and 12px below.
  3. **Chips row:** wraps with an 8px gap.

  The card has padding 14px 18px 16px, the `--surface-2` fill and a 1px `--rule` border.

  **Removed:**
  - the large index numeral column
  - the dashed line sample
  - the anchor name under the %
  - the Reason row
  - the YOLO intervention row
  - the rule line
  - the "Not checked" line
  - any grade word or dot
  - the confidence bar
- **UI-103 Chips.** Each chip covers one object the rule checked. Missing safeguards are listed after found objects.
  - **Found:** `{Object} found · {NN}%`, with the neutral fill (`--surface-3`, `--rule` border), or the severity tint and border for trigger evidence (UI-54 table).
  - **Missing:** `{Object} missing`, transparent with a severity-ink border. **No threshold text.** The panel's heading line ("Scores of 25% or less count as missing") explains it.
  - Padding 4px 10px, the .85× role, a 3px radius.
- **UI-104 Confidence colour grade (option G1).** It applies to the card's headline % only. Chip scores and photo tags stay neutral.

  | Grade | Range (config: `confidence_grades`) | Colour | Contrast on `--surface-2` |
  |---|---|---|---|
  | High | ≥ 60% | `--conf-high` #6ccf8c | 7.82:1 |
  | Medium | 40–59% | `--ink-1` #ece9e2 | 12.38:1 |
  | Low | 26–39% (≤ 25% is "missing") | `--ink-2` #a4a9b0 | 6.35:1 |

  - The number is always shown, so colour is never the only signal.
  - `--conf-high` is the only green besides the model-ready dot.
  - Red and amber are never used for confidence.
- **UI-105 Titles.** These are the observed descriptions, chosen as the shortest form, because the chips carry the detail.

  | Hazard | Category label | Title(s) |
  |---|---|---|
  | No PPE | No PPE | "No hard hat or safety vest" / "No hard hat" / "No safety vest" |
  | Fall, staircase | Fall hazard | "Staircase without a railing" |
  | Fall, floor opening | Fall hazard | "Floor opening without a railing" |
  | Trip | Trip hazard | "Cable on the floor" / "Debris on the floor" / "Uneven floor" |
  | Materials | Materials dumped | "Pile of materials" |

- **UI-106 Panel.**
  - The heading block (UI-42) and the last row (UI-46: limits line plus v0.1) stay.
  - With at most 3 cards, the list never needs to scroll at 1366×768.
  - Test: 3 cards, including a 3-chip No PPE card, fit without scrolling at 1366×768 and 1366×633.
