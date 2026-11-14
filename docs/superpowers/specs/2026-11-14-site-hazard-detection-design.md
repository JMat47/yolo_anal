# Site Hazard Detection — Design

**Date:** 2026-11-14 · **Status:** draft, awaiting approval

**Companion documents:**
- [`PRODUCT.md`](../../../PRODUCT.md): product facts, users and constraints. Read it first.
- [`2026-11-14-site-hazard-detection-ui-requirements.md`](2026-11-14-site-hazard-detection-ui-requirements.md): numbered UI requirements (UI-1 onwards) for every screen state, the wording, the type scale, colour tokens, layout and motion.
- [`assets/approved-cards.html`](assets/approved-cards.html): the approved finding-card design (the right-hand "After" panel). It supersedes the cards in the full-screen mockup below.
- [`assets/approved-mockup.html`](assets/approved-mockup.html): the screen the user approved during the brainstorm. Open it in a browser. It loops an 8-second animation. Its photos are crops from the dissertation slide with old red markup baked in; ignore that markup.

---

## 1. Intent

The user is presenting an M.Arch dissertation on quantifying construction-site safety hazards with YOLO models. This app is the live demonstration for the jury.

- The presenter picks one of a handful of handpicked site photos, or uploads one.
- YOLO finds hazards in it, draws a box around each, and explains each one: what was found, what was missing, and which rule turned that into a hazard.

The jury is judging **the method**, so the app's job is to make the reasoning visible and the numbers honest. It is a proof of concept for one presentation, not a product. YAGNI applies throughout.

## 2. Goals, non-goals, anti-goals

**Goals**
- On the presenter's handpicked photos, the app reliably flags the intended hazards, every time, offline.
- Each finding shows its evidence:
  - each found item with its own confidence score
  - each missing item with the threshold it fell below
  - the rule that turned them into a hazard
- The repo clones onto the presenter's **Windows laptop (RTX 2060)** and runs there with documented, repeatable setup. Development happens on macOS.
- The upload button demonstrates the end-to-end flow live.

**Non-goals (deliberately not doing)**
- Training or fine-tuning a model.
- Live camera or video.
- Alerts to a person in charge.
- Accounts or history.
- The "wrong type of railing" hazard.
- Decoding HEIC photos (they get a clear "not supported" message instead).
- Drag-and-drop upload.
- Accuracy benchmarks.
- Production hardening beyond what a live demo needs.

**Anti-goals (would be failure even if it "works")**
- It looks AI-generated. This is a binding user constraint.
- Any result, score or timing is faked or hard-coded.
- On-screen text claims capabilities the app doesn't have.
- It needs the internet on demo day.
- Boxes land on the wrong part of the photo (cropping or misalignment).
- A card title assigns blame or intent ("Human negligence").

## 3. Constraints

From PRODUCT.md, plus decisions made in the brainstorm:

**Hardware and portability**
- Runs fully offline on demo day. Fonts, model weights and photos are all local.
- The presentation machine is Windows with an NVIDIA RTX 2060, so use CUDA there.
- The development machine is macOS, running on CPU or Apple's GPU (MPS).
- The same code and the same commands work on both.
- Clone-and-run portability: pinned dependencies, no machine-specific paths.

**What the screen must show**
- Shown on the laptop's own screen (no projector). The jury sits beside the presenter.
- The model name ("Model active: …") and the version "v0.1" are shown.
- Nothing on screen mentions the dissertation or "proof of concept".

**Scope**
- Five hazards are in scope; see §6.3.

## 4. Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| **A** | **Python (FastAPI) server and a hand-written static web page (HTML/CSS/vanilla JS), no build step, managed by `uv`** | Fewest moving parts to carry to a second laptop, full control over the approved design, works offline. The UI's state handling (about 11 states) is hand-written in plain JS with no framework to structure it. | **Chosen by the user** |
| B | FastAPI server and a React/Svelte page | Cleaner component structure, but adds Node.js and a build step on both laptops (or committed build output that must be kept in sync). Too much tooling for one screen. | Rejected |
| — | Gradio / Streamlit | Fast, but can't reproduce the custom design and motion without fragile overrides. It produces exactly the generic look the user forbade. | Dropped |
| — | Precomputed results with a static page | Breaks live upload and the real-run requirement. (Revisits still use a cache; see the UI requirements.) | Dropped |
| — | Packaged Windows .exe | A CUDA PyTorch bundle runs to gigabytes and breaks easily. | Dropped |

## 5. Decisions the user made

1. **The detection approach:** an open-vocabulary YOLO (text prompts) plus simple rules, with **no training**. The user's photos are a test set for tuning prompts and thresholds, not training data.
2. **Photos:** only handpicked photos are shown, and the **upload button stays** for an end-to-end demonstration.
3. **The screen:** the layout and look of the approved mockup.
   - dark theme
   - heading font Barlow Condensed with "DETECTION" in hi-vis yellow
   - scan scene: dim, faint grid, yellow sweep, "Scanning for …"
   - dashed boxes with dot-ended pointers to tags
   - a stats row of tiles under the photo
   - "option D" finding cards
   - found / missing word chips
   - Atkinson Hyperlegible fonts for cards and tags
   - confidence % on both tags and cards
   - "Model active" at top right and "v0.1" at bottom right
4. **"Wrong type of railing" is dropped.**
5. **Card titles describe what was seen.** The dissertation's category is the small label above the title.
6. **Scan scene length:** at least about 1.5 s so the jury sees it. The *real* model time is shown separately in the stats row.
7. **The "YOLO intervention" text describes what the app actually does,** not the slide's claims about alerts, gloves or colour/texture analysis.
8. **Fixes from the design critique go into this spec,** not back into the mockup.
9. **Build approach A.**
10. **Development workflow:** run `impeccable hooks on` before the first UI edit (the Impeccable design detector), and finish with `/impeccable polish`.
11. **Finding cards (UI requirements §8):**
    - At most **3 findings** per photo, with a one-line note if more were flagged.
    - Each card has:
      - a top row with the number, the category and "Confidence 91%"
      - a short title
      - found/missing chips
    - **No** Reason, YOLO intervention, rule or "Not checked" text.
12. **Confidence colour grade** on each card's headline %: green for high, white for medium and grey for low. Cut-offs are 60% and 40% (in config). Red and amber are never used for confidence.
13. **Severity colours confirmed:** red for fall hazards and No PPE, amber for trip hazards and materials dumped.
14. **Deadline: as soon as possible.** Build in the order given in §6.8.
15. **The user runs setup on the Windows laptop** and is comfortable in a terminal, so the README can be technical.
16. **No-hazard photos (2026-11-14):** there is one no-hazard control for each case, e.g. a person in a hard hat and safety vest, or a staircase with a railing. They show `[]` in `demo/expected.json`, so `check` catches false alarms. Two of them are on screen: the staircase with a railing and the person in full PPE. The rest are check-only (`"strip": false` in `demo/photos.json`).

## 6. Design

### 6.1 Architecture

```
browser (static/index.html, app.css, app.js, fonts)
   │  GET /            static files (no CDN, strict CSP: self only)
   │  GET  /api/status model state
   │  GET  /api/photos demo photo list
   │  POST /api/scan   {photo_id} or multipart upload  →  result JSON
   ▼
FastAPI app (uvicorn, 127.0.0.1)
   ├── model service: loads model once in the background, warms up, runs one inference at a time
   ├── image prep: EXIF rotate → RGB → long side ≤ 2048 px  (the same pixels go to the model and the screen)
   ├── rules engine: detections → 5 rule outcomes → findings
   └── result cache: keyed by photo id or file hash
```

- **One process** started by `uv run hazard-demo`. It serves on `127.0.0.1` (port in config, default 8000) and prints the URL. Whether it opens the browser automatically is left to the builder.
- **Model lifecycle:**
  - The server starts and serves the page immediately.
  - The model loads in a background task, then runs 2 warm-up inferences.
  - `/api/status` reports one of `loading`, `warming`, `ready` or `error`, plus the model name, the device (e.g. `cuda:0 NVIDIA GeForce RTX 2060` or `cpu`) and any error cause.
  - The UI's status dot and "Model loading…" / "Model active: …" label follow this (UI requirements).
- **Concurrency:** one inference at a time, with at most one request waiting. A newer request replaces the waiting one; the frontend applies the "last click wins" rule.

### 6.2 Detection pipeline

**Steps**
1. **Prepare the image.** Read it and check it by file content: JPG, PNG and WebP are accepted. HEIC gets its own clear rejection message.
   - Limits: at most 25 MB, at most 50 MP, and at least 128 px.
   - Apply EXIF rotation, convert to RGB, and scale so the long side is at most 2048 px.
   - Return the prepared image (or a URL to it) and its dimensions. The **frontend displays exactly this image**, so the boxes align.
2. **Run the model once** with the full vocabulary (§6.3) and a **low confidence floor** (start at 0.05). Every prompt then has a "best score", even when it isn't found. That is what lets the UI say "Hard hat: none above 25%".
3. **Apply the threshold.** A prompt counts as **found** when its score is at or above its display threshold (default 0.25, configurable per prompt).
4. **Evaluate the rules** (§6.3). The result always contains **all 5 rule outcomes**, fired or not, which feeds the zero-hazards screen.
5. **Respond** with:
   - the image size, findings and rule outcomes
   - per-prompt best scores
   - the model time in ms (measured around the inference call only)
   - the model name and device

**Finding shape** (the builder may refine names):
```json
{
  "id": "01",
  "hazard": "no_ppe",
  "severity": "high",
  "anchor": {"label": "person", "score": 0.91, "box": [x1, y1, x2, y2]},
  "evidence": [
    {"item": "person",      "status": "found",   "score": 0.91, "role": "trigger"},
    {"item": "hard hat",    "status": "missing", "best": 0.12, "threshold": 0.25, "role": "trigger"},
    {"item": "safety vest", "status": "missing", "best": 0.08, "threshold": 0.25, "role": "trigger"}
  ]
}
```

- Box coordinates are in prepared-image pixels.
- The card's headline % is the **anchor's** score, i.e. the object the box is drawn around.
- Findings are sorted, and their `id`s ("01", "02", …) assigned, **by severity (high first), then anchor score**. This overrides UI-47's score-first order. One sort order drives the cards, their numbers and the photo tags.

### 6.3 Hazards, prompts and rules

There are 10 prompts. The vocabulary follows the UI requirements glossary, so the on-screen names *are* the prompt strings:
- person
- hard hat
- safety vest
- staircase
- railing
- floor opening
- cable
- debris
- uneven floor
- pile of materials

| # | Hazard (category label) | Severity | Fires when | Anchor box |
|---|---|---|---|---|
| 1 | Fall hazard: stair edge | high | `staircase` found, and no `railing` found touching or near the staircase box (the box expanded by a margin) | staircase |
| 2 | Fall hazard: floor opening | high | `floor opening` found, and no `railing` touching or near it | floor opening |
| 3 | No PPE | high | `person` found, and either no `hard hat` in the person's head region (the top ~30% of the box) or no `safety vest` over the torso | person (one finding per person) |
| 4 | Trip hazard | medium | `debris`, `cable` or `uneven floor` found. Same-type boxes overlapping 60% or more are merged. **One finding per (merged) detection, each with its own box and card**; this overrides UI-48's one-card-per-photo. Card titles name the object ("Cable on the floor", "Debris on the floor", "Uneven floor"). | the detection |
| 5 | Materials dumped | medium | `pile of materials` found. The app cannot know allowed storage areas, and the card says so ("Not checked: …"). | the detection |

Severity: red = high, amber = medium.

- **All prompts, thresholds, geometry margins and card copy live in one config file** (e.g. `config/hazards.yaml`), not in code. Tuning on the demo photos then means editing that file only.
- The exact margins and regions above are **starting points for the builder to tune** against the demo photos.
- **Tuning order, when a prompt detects poorly on a demo photo:**
  1. Adjust thresholds and geometry margins.
  2. Try another prompt word. The **prompt and its on-screen word change together**, because the screen always shows the real prompt (no hidden synonyms). Update the glossary and its banned-word test to match. For example, if "helmet" works and "hard hat" doesn't, the screen says "helmet" everywhere.
  3. Try the YOLOE fallback (§6.4).
  4. Ask the user to replace the photo.
  Record each change in the config and in the plan's tuning log.
- `uneven floor` describes a surface rather than an object, so it may be unreliable. Keep it in the config, check it on the demo photos, and remove it if it misfires.
- Open shafts and floor openings are the least reliable hazard (see PRODUCT.md, Known weak spots).

### 6.4 Model

- **Start with YOLO-World v2, small** (`yolov8s-worldv2`) through the `ultralytics` package.
  - The app loads the model with the custom vocabulary already built in, so at run time it needs no CLIP text encoder and no internet.
  - The setup step builds that model once by setting the vocabulary and saving it to a single file.
- **Fallback:** if a hazard's prompts misfire on the demo photos, the builder may try **YOLOE-11 small** through the same `ultralytics` text-prompt interface.
  - The UI reads the model name from config, so switching is a config change.
  - Record which model shipped.
- **Device selection is automatic:** CUDA if available, then MPS on macOS, then CPU. It is reported via `/api/status`.

### 6.5 Frontend

- **Files:** `static/index.html`, `static/app.css`, `static/app.js` (ES modules allowed, no build step), and `static/fonts/*.woff2` with their licence files.
- **Behaviour:** implements the UI requirements document, which covers:
  - the state machine (booting, warming, idle, scanning, result, empty, error, …)
  - drawing overlays against the rendered image rectangle
  - collision-avoiding tag placement
  - the stats row's give-way order
  - the findings list with a "more below" cue
  - keyboard and clicker keys
  - reduced motion
  - all wording
- **Scan scene timing:** at least ~1.5 s, then the boxes and cards reveal.
  - If inference is slower, the scene continues until the result arrives, with a 20 s timeout and then an error state.
  - The stats row shows the real `model time` from the server.
- **Revisits:** a photo that was already scanned shows its cached result instantly, labelled as an earlier run. Pressing R re-runs it.
- **Findings shown:** at most 3 (UI-101). The API still returns every rule outcome and all evidence, because `check` and debugging use them.

### 6.6 Offline and portability

**Repo files**
- `pyproject.toml`, `uv.lock` and `.python-version` are all committed. Use Python 3.12 unless a dependency forces otherwise.
- **PyTorch:**
  - On Windows, take CUDA 12.x builds from the PyTorch package index, selected via `uv` sources with a `sys_platform == 'win32'` marker. The RTX 2060 is supported by CUDA 12 builds.
  - On macOS, use the default builds.

**Commands**
- `uv run hazard-demo setup` is a one-time step. It needs internet only for the Python packages, which `uv sync` installs. It:
  - verifies the committed model file
  - reports the device it will use (e.g. "CUDA: NVIDIA GeForce RTX 2060", or a loud warning with copy-paste fixes if CUDA isn't available on Windows)
  - runs the check below
- `uv run hazard-demo` is **the demo run**. It needs no network. Missing weights or fonts fail loudly with the fix printed.
- `uv run hazard-demo check` is an **offline preflight**. It runs every demo photo and compares the result with `demo/expected.json` (which hazards should be flagged), printing pass or fail per photo. Run it on the Windows laptop before presenting.

**Other files**
- **Demo photos:** `demo/photos/` holds the images. `demo/photos.json` gives each photo's id, file, scene name and whether it appears in the strip. The scene names become the thumbnail captions; placeholders are used until the user supplies real names. `check` runs every photo, including the check-only ones.
- **Weights:** the **built vocabulary model is committed** to the repo (about 25–50 MB, plain git) and rebuilt only on macOS when prompts change.
  - The Windows laptop then needs only Python packages, with no CLIP download and no model build.
  - A pinned SHA-256 of the committed file is checked at startup (UI-87).
  - `setup` on Windows verifies CUDA and the model file, then runs `check`.
  - A separate `uv run hazard-demo build-model` command, used on the dev machine, rebuilds the model after prompt changes.
- **README:**
  - Windows and macOS steps: install `uv` (its one-line installer), the NVIDIA driver note, `setup`, `check`, then run.
  - Recommends presenting in full screen (F11) in Chrome or Edge.
- **Paths:** none are absolute; everything resolves from the repo root.

### 6.7 Testing

- **Rules engine:** pure functions, tested with `pytest` against synthetic detections, covering every rule's fires and doesn't-fire cases plus the geometry edge cases. Write these test-first.
- **Image prep:** tests for EXIF rotation, limits, HEIC rejection and size scaling.
- **API contract:** tests with a stub model, covering status transitions, scan responses, errors, and the queue and replace behaviour.
- **Real-photo acceptance:** `hazard-demo check` against `demo/expected.json`.
- **UI:**
  - Screenshots at 1366×768, 1536×864 and 1920×1080, for each state and for 4:3, 3:4 and 16:9 photos.
  - The Impeccable detector hook stays on during UI work.
  - `/impeccable polish`, then `/impeccable critique` at the end. The critique's 19/40 is the baseline to beat.

### 6.8 Delivery order (deadline: as soon as possible)

Build in this order. Each phase ends with something that can be demonstrated.

1. **Detection core:**
   - the config, the rules engine (test-first) and the model service
   - the `check` command running on the stand-in photos
   - `pyproject` and `uv.lock` with the Windows CUDA source
   - **The user runs `setup` and `check` on the Windows laptop as soon as this phase lands.** It is the riskiest step, so surface failures early.
2. **The demo screen, happy path:**
   - the strip and upload
   - the scan scene
   - boxes and tags
   - the three cards
   - the stats row
   - model status
   - local fonts
3. **States that can happen on stage:**
   - zero hazards
   - model loading and warm-up
   - upload errors (including HEIC)
   - scan timeout or error
   - mid-scan clicks
4. **Tuning:** against the user's real demo photos once they arrive, filling `demo/expected.json`.
5. **Everything else:**
   - keyboard and clicker keys
   - the overlay toggle
   - the revisit cache
   - reduced motion
   - collision-avoiding tag placement beyond the simple case
   - the full viewport screenshot matrix
   - `/impeccable polish` and a re-critique

If time runs out, phases 1–4 are the demo. Phase 5 is polish.

## 7. Calls Claude made (for the user to check)

1. **Each card's number also appears on its photo tag** ("01 No PPE"), so a box can be matched to its card even when the tag shrinks to a badge.
2. **No green anywhere in the evidence chips.** Found = filled, missing = hollow, and a severity-coloured border marks the evidence that triggers the rule. This avoids hazard evidence reading as "good".
3. **Body text scales** from about 16 px at 1366 wide to about 20 px at 1920, with nothing below 14 px. **The findings panel is `clamp(420px, 36vw, 640px)` wide.**
4. **"Model active: …" only appears once the model has really loaded.** Before that it says "Model loading…" with a pulsing ring, and it turns red with the cause on failure.
5. ~~Severity colours~~: now a user decision (§5.13).
6. **Both box styles stay dashed**, so the approved look is kept. Red uses long dashes and amber short ones, so they differ even in greyscale.
7. **Revisited photos show cached results instantly**; R re-runs.
8. **Model:** YOLO-World v2-S first, YOLOE-11-S as the fallback. The built vocabulary model is **committed**, so the Windows laptop never builds it.
9. **Tooling:** `uv` for environment and dependency management, Python 3.12.
10. **Prompt tuning:** when a prompt word changes, the on-screen word changes with it (no hidden synonyms). Tuning order: thresholds, then prompt word, then fallback model, then replace the photo.
11. **Trip hazards:** one finding per detection, each with its own box.
12. **Card order:** severity first, then confidence.

## 8. Left to the builder

- Package layout, module names and the exact API field names, within the shapes above.
- The geometry margins, head and torso regions, and per-prompt thresholds. Tune them on the demo photos and record the final values in the config.
- Whether the server opens the browser automatically.
- How the prepared image reaches the frontend (data URL or a short-lived URL).
- The config file format (YAML or JSON).

## 9. Open items (needed from the user before or during the build)

- **The handpicked demo photos and their scene names.** Until they arrive, the builder develops against the slide crops and any test photos.
- **`demo/expected.json`:** which hazards each demo photo should flag. The user confirms this once the photos are chosen.
- **A git remote** (e.g. a private GitHub repo) for cloning onto the Windows laptop. Creating it is the user's call.
