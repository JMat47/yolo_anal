# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated to Claude, then chosen by the user on 2026-11-14 from the options presented: a **Python (FastAPI) server and a hand-written static HTML/CSS/JS page with no build step**, managed by `uv`. See `docs/superpowers/specs/2026-11-14-site-hazard-detection-design.md` §4. It runs YOLO on the presenter's laptop and works fully offline (see Operating Context).

## Users

- **Audience:** an M.Arch dissertation jury, watching a live demonstration as part of a dissertation on quantifying construction safety hazards with YOLO models. They are judging whether the idea holds up: how the detection works and where its limits are. They are not buyers.
- **Operator:** the student presenting, driving the app on their own laptop. The jury watches the laptop's screen; there is no projector.

## Product Purpose

A demonstration app. The presenter picks or uploads a photo of a construction site. YOLO finds hazards in it, draws a box around each one, and explains each in the same terms as the dissertation: hazard type, reason, and what YOLO does to detect it.

Success: on the presenter's handpicked photos, the app reliably flags the intended hazards, and the jury can see why each one was flagged.

It is not a production tool. YAGNI applies throughout: one photo in, boxes and explanations out.

## Positioning

No custom training. An open-vocabulary YOLO model finds objects from text descriptions ("staircase", "handrail", "hard hat"), and simple rules turn what is present or missing into a hazard (a staircase with no handrail is a fall hazard; a person with no hard hat means no PPE). Each finding shows its checks, such as "person found, hard hat missing", so the reasoning is visible instead of hidden behind a score.

## Operating Context

- Live presentation to a jury on the presenter's laptop screen (confirmed 2026-11-14: no projector).
- The venue may have no internet, so everything must work offline: model weights, fonts and assets are stored locally.
- The repo must be portable: the presenter clones it on a different laptop and runs it there. Setup from a fresh clone must be documented and repeatable: pinned dependencies, no machine-specific paths, and fonts and assets in the repo. Model weights are either committed or fetched during setup, never on demo day. The presentation laptop runs **Windows**; development happens on macOS. Setup and run must work on both. The Windows laptop has an **NVIDIA GeForce RTX 2060** (confirmed 2026-11-14), so inference should use CUDA there. Setup must install a CUDA-enabled PyTorch build on Windows. The app falls back to CPU when CUDA is unavailable, as on the Mac development machine.
- Photos are a handful the presenter has picked from real sites and the internet, tested beforehand.
- An upload button stays in so the presenter can show the full flow, from choosing a file to getting results. An uploaded photo should still be one tested beforehand.

## Capabilities and Constraints

Hazards in scope, taken from the dissertation slide "Construction Safety Hazards and Possible YOLO Intervention":

1. Fall hazard: no railing at an open stair edge
2. Fall hazard: no railing at an open shaft or floor opening
3. Trip hazard: uneven floor, debris or loose cables
4. No PPE: worker without a hard hat or safety vest
5. Materials dumped in a place they shouldn't be. The model can only say "a pile of materials is here"; it cannot know which areas are allowed.

Out of scope:
- "Wrong type of railing" is dropped. Judging it needs knowledge of safety codes, not object finding.
- Live camera or video, alerts to a person in charge, accounts, storing history, and training a model.

Known weak spots:
- Open shafts are the least reliable, because a hole is hard to describe as an object.
- Rubble and dumped materials can trigger each other.
- Unseen photos may come back with misses.

Other constraints:
- On screen, show the model name ("Model active: …") and the version number (v0.1). Do not mention the dissertation or "proof of concept".
- Detection outputs (boxes, confidence, timing) come from a real model run, not hard-coded results.
- Each finding card is titled by what was seen ("No hard hat or safety vest"). The dissertation's hazard category ("No PPE") sits on the card's top line. Do not use titles that assign intent or blame, such as "Human negligence".
- At most 3 findings are shown per photo. Each card shows found/missing chips, which carry the reasoning, and a colour-graded confidence %.
- Severity colours (confirmed 2026-11-14): red for fall hazards and No PPE, amber for trip hazards and materials dumped.

Open decisions:
- The exact model checkpoint. yolov8s-world is proposed; YOLOE is an alternative.

## Brand Commitments

- Product name on screen: "Site Hazard Detection".
- Binding constraint from the user: the interface must not look AI-generated.

## Evidence on Hand

- Dissertation slide with six annotated site photos and each hazard's type, reason and YOLO intervention text: `~/Downloads/Dissertation - Trial.png`.
- Approved screen mockup from the brainstorm: `.superpowers/brainstorm/14878-1794663101/content/screen-v5.html`. Its photos are crops from the slide and still carry the slide's red markup.
- Handpicked demo photos: the user says they can be gathered; none are in the project yet.
- Absent, and must not be made up: labelled training data, accuracy figures or benchmarks, and field-trial results.

## Product Principles

1. **Show the reasoning.** Every flag says what was found and what was missing, because the jury is judging the method, not the polish.
2. **Reliable on stage beats broad coverage.** Tune for the handpicked photos; don't chase photos that won't be shown.
3. **Honest numbers.** Confidence and timing come from the actual run. Limits are acknowledged, not hidden.
4. **Smallest thing that demonstrates the idea.** Anything that doesn't help a photo-in, findings-out demonstration waits.

## Accessibility & Inclusion

The text must be readable on a laptop screen by a jury watching alongside the presenter. Keep text contrast at or above WCAG AA (4.5:1), and make the reasoning text the easiest thing to read, not the hardest.
