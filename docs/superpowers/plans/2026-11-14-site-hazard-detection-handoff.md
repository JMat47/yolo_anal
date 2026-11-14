# Handoff: Site Hazard Detection build

**Written:** 2026-11-14, at the end of the brainstorm and planning session. **For:** the new Claude Code session that builds the app.
**Status:** design approved, plan approved ("plan is okay"), nothing built yet. The folder is not a git repo yet.

## 1. What this is, in one paragraph

An M.Arch student is presenting a dissertation on quantifying construction-site safety hazards with YOLO. This app is the live demo for the jury:
- Pick (or upload) a site photo.
- An open-vocabulary YOLO model (YOLO-World v2-S, no training) finds objects from 10 text prompts.
- Simple rules turn "found / missing" into at most 3 hazards.
- The screen shows dashed boxes, tags, cards and a stats row with the real model time.

It's a proof of concept for one presentation: YAGNI throughout, but it must be reliable on stage. It runs offline on the presenter's **Windows laptop with an RTX 2060**, cloned from git. Development happens here on macOS (Apple M5, arm64).

## 2. Read these, in this order

1. `PRODUCT.md`: product facts, users and constraints.
2. `docs/superpowers/specs/2026-11-14-site-hazard-detection-design.md`: the approved design. §5 lists the user's decisions; §6.8 sets the delivery order.
3. `docs/superpowers/specs/2026-11-14-site-hazard-detection-ui-requirements.md`: UI-1…UI-106. **§8 overrides §5.5, §6 (PM-2…PM-16) overrides §5**, and it wins over the design doc where they differ.
4. `docs/superpowers/plans/2026-11-14-site-hazard-detection.md`: **the plan, 17 tasks in 5 phases.** Its header lists the spec conflicts that were already ruled on. Its Global Constraints bind every task.
5. Visual references. Open them in Chrome:
   - `docs/superpowers/specs/assets/approved-mockup.html`: the approved screen. Its photos carry the slide's old red markup; ignore that.
   - `docs/superpowers/specs/assets/approved-cards.html`: the **right-hand "After" panel** is the approved card.

You don't need anything from the brainstorm session's scratchpad. The plan gives download URLs for the fonts, and the stand-in photos are in `docs/superpowers/specs/assets/`. `.superpowers/brainstorm/` holds old mockup iterations; it's git-ignored and only for reference.

## 3. Execution method (user decision): subagent-driven, one implementer per phase

Use `superpowers:subagent-driven-development` with one change the user asked for: **the unit of work is a phase, not a task.** Everything else in that skill applies as written:
- the ledger
- a review after each unit
- the fix loop and its cap
- rulings instead of stalls
- the final whole-branch review on the most capable model
- explicit model choice on every dispatch

| Unit | Plan tasks | Implementer | Phase reviewer | Ends with |
|---|---|---|---|---|
| Phase 1: detection core | T1–T7 | `opus` | `sonnet` | `uv run hazard-demo check` runs offline on the Mac. Then T8 (below). |
| T8: Windows checkpoint | T8 | **controller + user**, not a subagent | none | the user's pasted `setup` output |
| Phase 2: happy-path screen | T9–T13 | `opus` | `opus` (largest diff, UI judgment) | pick a photo → scene → boxes, tags, cards, stats |
| Phase 3: on-stage states | T14 | `opus` | `sonnet` | every UI-23 state renders |
| Phase 4: tuning | T15 | `opus` | `sonnet` | `check` all PASS on the Mac, then on Windows |
| Phase 5: everything else | T16, T17 steps 1–3 | `opus` | `sonnet` | keys, toggle, cache, reduced motion, screenshot matrix, README |
| Polish | T17 step 4 | `opus`, told to invoke the `impeccable:impeccable` skill with `polish static/` and follow it | `sonnet` | polish commits |
| Critique | T17 step 4 | **controller** runs `/impeccable critique` itself (baseline 19/40), then sends real findings to a fix implementer | — | score and fixes |
| Final review | whole branch | the most capable available model | — | `superpowers:finishing-a-development-branch` |

**The per-phase loop:**
1. Record `BASE=$(git rev-parse HEAD)`.
2. For each task in the phase, run the skill's `scripts/task-brief PLAN N`. The phase dispatch lists the brief paths **in task order**, introduced as "read these first, in order — they are your requirements, with the exact values to use verbatim".
3. Each dispatch carries:
   - one line on where the phase fits
   - the brief paths
   - interfaces from earlier phases that the briefs can't know (point to the Interfaces blocks and to the real files, which now exist)
   - your rulings on any ambiguity
   - one report path per phase, e.g. `…/phase-2-report.md`
4. The implementer works through the tasks in order. It follows each task's TDD steps, **commits at the end of every task** with the plan's commit message, and runs the full test suites before reporting.
5. Generate one review package for `BASE..HEAD` with `scripts/review-package`. Dispatch **one** phase reviewer with:
   - all the phase's brief paths
   - the report
   - the package
   - the plan's Global Constraints, copied verbatim

   It checks spec compliance and quality for every task in the phase.
6. Run the fix loop exactly as the skill says. Resume the same implementer for rounds 1–3.
7. Add a ledger line: `Phase <n> (T<a>–T<b>): complete (commits <base7>..<head7>, review clean | <K> parked)`.
8. Send the user **one line** on what they can try now (e.g. "Phase 2 done: `uv run hazard-demo`, then click a photo"). Then go straight to the next phase.

**Continuation rule.** A phase may be too big for one implementer's context, Phase 2 most likely. If the implementer reports BLOCKED, or says it is running out of context, don't restart the phase. Read `git log`, find the last task whose commit landed, and dispatch a fresh `opus` implementer with the briefs for the remaining tasks only. Note it in the ledger.

**Phase order.** Phase 1 → T8 (non-blocking, below) → 2 → 3 → 4 → 5 → polish and critique → final review.
- If the user's photos haven't arrived when Phase 3 ends, do Phase 5 first and Phase 4 when they arrive. Polish and critique should ideally see the real photos.
- If photos are already in `demo/incoming/` when Phase 1 ends, run `check` against them straight away. It's only information, but it shows early which hazards the model struggles with. Copy them to a temp `photos.json`; don't change `demo/` yet.

## 4. Things the controller does itself

1. **Before Phase 1:**
   - Run `git init -b main`.
   - Commit what already exists (`PRODUCT.md`, `docs/`, `.impeccable/config.json`, `.impeccable/critique/`) as `docs: product brief, design, UI requirements and plan`.
   - Write the `.gitignore` from plan T1 step 1 **first**, so `.superpowers/`, `.impeccable/config.local.json` and `.impeccable/hook.cache.json` never get committed. `config.local.json` holds this machine's hook consent.
   - Then run `git switch -c feat/site-hazard-demo`. **This branch is the isolation.** Use no separate worktree: it's a fresh repo with nothing else in flight, and an in-place branch keeps one `.venv` and the hook paths stable.
   - Tell the Phase 1 implementer that git is already initialised, the branch exists and `.gitignore` is written, so T1 step 1 is done apart from `.gitattributes`.

   If the user's kickoff message doesn't approve building on this branch, ask once before Phase 1. It's the one question allowed up front.
2. **The Impeccable design hook is already on.** `.impeccable/config.json` has `hook.enabled: true`, and the plugin's own hooks (PostToolUse Edit|Write, plus Stop) run the detector. `impeccable hooks status` reports "not wired"; that is expected, because the plugin, not a settings manifest, supplies the hook, so **don't run a repair**.
   - After the first UI edit in T10, check that a detector reminder appeared.
   - If none did, run `"<impeccable skill dir>/scripts/impeccable" detect static/` by hand at the end of each UI phase and give the findings to the reviewer.
   - Implementers fix detector findings. They suppress one only when the spec mandates the value (`hooks ignore-value <rule> "*" --file <path> --reason "..."`), and say so in their report.
3. **T8, the Windows checkpoint.** This doesn't block Phase 2.
   - Push the branch to the remote the user gave in the kickoff message: `git remote add origin <url>`, then `git push -u origin feat/site-hazard-demo`. **If no remote was given, ask for it then. Never create one.**
   - Send the user, in one message, the README's Windows steps, with the clone as `git clone -b feat/site-hazard-demo <url> "My Demo"`. Ask them to paste back the full output of `uv sync` and `uv run hazard-demo setup`.
   - Then start Phase 2. When their output arrives, check it against plan T8 step 3. Send any fix to a fix implementer with the failing case added as a test.
4. **Phase 4 inputs.** The user drops photos in `demo/incoming/` with a `notes.txt` (see §7). Once Phase 4 is done, have them run `uv run hazard-demo check` on Windows (after `git pull`) and paste the result.

## 5. The only reasons to stop and ask

- The git remote URL, if the kickoff didn't give it. Pushing to it is authorised once the user has given it.
- The photos for Phase 4, if they never arrive. Keep working on other phases meanwhile.
- Anything irreversible, anything security-sensitive, or a plan so broken that every path forward is a guess (the SDD skill's own list).

Anything else is a ruling: decide, write `Ruling: … — why — cost if wrong` in the ledger, and keep going. The user's deadline is **as soon as possible**.

## 6. Settled decisions: don't reopen them

All of these are in the specs. They're listed here so nobody "improves" them:
- **The look:**
  - The dark theme stays.
  - The wordmark is "SITE HAZARD DETECTION" in Barlow Condensed, with **"DETECTION" in hi-vis yellow**.
  - The only fonts are Atkinson Hyperlegible Next and Mono.
  - Boxes are dashed: red with long dashes, amber with short ones.
  - Tags read "01 No PPE" / "Person 91%".
- **The stats row** sits under the photo as tiles: Hazards flagged, the categories, Model time, Photo. The user asked for it back.
- **The scan scene** lasts at least ~1.5 s. The *real* model time shows separately.
- **Cards** follow UI-102: at most 3. The top row has the number, the category and "Confidence 91%", graded green, white or grey. Then a short observed title, then found/missing chips. **No** Reason, "YOLO intervention", rule line or "Not checked" text. The user removed those on purpose.
- **Severity:** red for falls and No PPE, amber for trip and materials.
- **Header:** "Model active: …" sits top right, and v0.1 bottom right. The words "dissertation", "proof of concept" and "AI" never appear on screen.
- **Upload** stays, so the end-to-end flow can be shown. HEIC is rejected with a clear message rather than decoded.
- **The model** is committed with its vocabulary baked in. Windows never builds it and never needs CLIP or the internet.
- **"Wrong type of railing"** is out of scope.
- **Prompt words are the on-screen words.** If tuning changes a prompt, the screen changes with it (PM-16).
- **No-hazard photos:** one per case. Two are on screen (the staircase with a railing and the person in full PPE), and the rest are check-only (design §5 decision 16).

## 7. Photos (what the user was asked for)

The user asked which photos to collect and how many. They were sent this brief, so expect photos to match it. Bring 2–3 candidates per row; spares replace any photo that misfires, which is step 4 of the tuning order.

**Hazard photos.** One per row goes in the strip.

| Row (placeholder scene) | What the photo should show | Candidates |
|---|---|---|
| No PPE ("Column bay") | 1–2 people, full body in view, at least one without a hard hat and/or safety vest | 2–3 |
| Fall, staircase ("Stair flight") | an open stair flight with no railing, the stairs filling a good part of the frame | 2–3 |
| Fall, floor opening ("Service shaft") | an unguarded slab opening or lift shaft, with its edge clearly visible | 3–4 (the weakest hazard) |
| Trip ("Room corner") | loose cables across a floor, and/or debris on a walking surface | 2–3 |
| Materials dumped ("Ground-floor room") | a pile of bricks, blocks, bags or rebar in a room or corridor | 2–3 |

**No-hazard photos.** Each should flag nothing; in `expected.json` they're `[]`. The first two are on screen, and the rest are check-only (`"strip": false`).

| Case | What the photo should show | On screen? | Candidates |
|---|---|---|---|
| Fall, staircase | a staircase *with* a railing | yes | 1–2 |
| No PPE | a person in a hard hat and safety vest | yes | 1–2 |
| Fall, floor opening | an opening with a guardrail or barrier around it | check only | 1–2 |
| Trip and materials | a clean floor, ideally with floor joints or shadows, and no piles | check only | 1–2 |

The app flags **any** pile, because it can't know where storage is allowed. So a neatly stacked pallet is never a no-hazard photo. The user was told this.

**Live upload:** 1–2 phone photos of a hazard, ideally taken in portrait (this tests EXIF rotation).

The strip ends up with 7 photos, in this order: the five hazard photos, then the railed staircase, then the person in full PPE. In total, expect about 20–25 candidates.

Photo rules:
- at least 1600 px on the long edge
- JPG, PNG or WebP, not HEIC
- no drawn arrows, circles, text or watermarks
- hazards large and in focus
- about 3 hazards or fewer per photo

`demo/incoming/notes.txt` has one line per photo, `file | scene name | should flag`, e.g. `IMG_2041.jpg | Column bay | No PPE` or `IMG_2050.jpg | Stair landing | nothing`.

**Two sources of photos:**
- **The user's own photos** go in `demo/incoming/`, with `demo/incoming/notes.txt`.
- **Internet photos** were collected on 2026-11-14 by a research agent into `demo/incoming/web/`. Each one is openly licensed or public domain and was checked by eye. Next to them:
  - `notes.txt`, in the same format; its scene names are proposals, so the user may rename them
  - `SOURCES.md`, giving each photo's source page, author, licence and size

Treat both folders as one candidate pool. When T15 copies an internet photo into `demo/photos/`, it adds the photo's row from `SOURCES.md` to `demo/photos/CREDITS.md`, so credit and licence travel with the repo.

## 8. Known risks, and what to do

| Risk | What to do |
|---|---|
| `uv lock` can't resolve torch/torchvision on the `cu128` index for Python 3.12 + Windows | Relax the lower bounds in `pyproject.toml`, or switch the index to `cu126`. Record a ruling. |
| `set_classes` needs CLIP, and ultralytics tries to pip-install it | That's why the `build` group exists. Always run `uv run --group build hazard-demo build-model`. A plain `uv run` re-syncs and removes `clip`. `YOLO_AUTOINSTALL=false` makes a missing package an explicit error. |
| The base weights download to the wrong place | `build_model` must leave them in `models/.base/` (git-ignored). Move them if ultralytics downloads to the current folder. |
| YOLO-World misbehaves on MPS | Plan T5 step 5: make `auto` choose `cuda:0`, then `cpu`, and log it. |
| Loading the built model needs network or CLIP | It shouldn't, because the vocabulary is baked in. The T5 smoke test runs under `block_network()` without the build group. If it fails, stop and report it; don't add CLIP as a runtime dependency. |
| Playwright | Use `channel="chrome"`. Chrome is installed at `/Applications/Google Chrome.app`, so no browser download is needed. UI tests run with `uv run --group ui pytest -m ui`. |
| Windows console encoding, or the path `C:\Users\Zoë\My Demo\` | Covered by Review Focus 1. Keep the UTF-8 reconfigure in `cli.main`. |
| The model file is changed by git on Windows | `.gitattributes` `*.pt binary`, plus the SHA pin. `setup` must say `OK weights`. |

Local tools: uv 0.13.1, node v26.6.0, git 2.50.1 (global identity already set), and Python 3.14 on the system, though uv provides 3.12. Creating `.venv` and `uv.lock` needs network once.

## 9. Kickoff message for the user to paste into the new session

```
Read docs/superpowers/plans/2026-11-14-site-hazard-detection-handoff.md and follow it.
Execute the plan with subagent-driven development, one implementer per phase.
Build on the branch feat/site-hazard-demo (approved).
Git remote for the Windows checkpoint: <paste URL, or "not yet">
```
