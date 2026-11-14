# Site Hazard Detection

A local demo that runs the open-vocabulary YOLOE model (YOLOE-11-S, `models/yoloe-11s-seg.pt`) on construction-site
photos and turns what it finds, and what it doesn't find, into at most three hazard findings. It runs fully offline
once set up.

## Setup

Setup needs the internet once, to install the Python packages. The model file, fonts and demo photos are in the repo.

### Windows (the presentation laptop, NVIDIA RTX 2060)

1. Install or update the NVIDIA driver (Game Ready or Studio, 2024 or newer).
2. Install [Git for Windows](https://git-scm.com/download/win).
3. Install uv, in PowerShell:

   ```powershell
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```

   Then open a new terminal so `uv` is on the `PATH`.
4. Clone the repo. A folder name with spaces or accents is fine:

   ```powershell
   git clone <remote> "My Demo"
   ```

5. Install the packages. This downloads the CUDA build of PyTorch, about 3 GB:

   ```powershell
   cd "My Demo"
   uv sync
   ```

6. Run setup:

   ```powershell
   uv run hazard-demo setup
   ```

   It prints the Python and PyTorch versions, checks that CUDA works on the GPU (including the RTX 2060's
   `sm_75` kernels and a test matrix multiply), then runs `check` (below). If CUDA isn't available it prints a
   `FAIL` block with the fixes to try, in order.

### macOS (development)

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync
uv run hazard-demo setup
```

On a Mac the model runs on the Apple GPU (MPS) or the CPU.

## Running the demo

```sh
uv run hazard-demo
```

This starts the server at `http://127.0.0.1:8765` and opens the default browser once the page answers. Present in
**Chrome or Edge**, in full screen (**F11**); the layout also works in a window, but full screen is the presenting
mode. Keep the server window open: if it closes, the page shows "Model offline" and recovers by itself once the server
runs again. `uv run hazard-demo run --no-browser` skips opening the browser; Ctrl+C stops the server.

The strip holds 4 demo photos, in this order: Tulaghi site (`noppe-1`), Timber floor (`opening-open-1`), Old workshop
(`materials-3`) and Slab edge (`ppe-ok-1`, which flags nothing). The other photos in `demo/photos/` are check-only
controls that `check` runs but the strip never shows.

Picking a photo again shows its earlier result at once, with the stats row reading "Model time, earlier run". R, or a
click on the photo already on stage, scans it afresh. The Upload photo tile takes JPG, PNG or WebP; HEIC is rejected
(save the photo as JPG first), and an upload is always scanned afresh.

### Keys

| Key | Does |
|---|---|
| Right arrow, Page Down (clicker forward) | Next demo photo. Stops at the last one; never reaches the upload slot or the Upload tile. |
| Left arrow, Page Up (clicker back) | Previous demo photo. |
| R | Scan the photo on stage again, with the full scan. |
| H | Hide or show the boxes and tags (the "Hide boxes" button in the panel). |
| F5, Esc, B, `.` | Ignored, so a clicker's start, stop and blank buttons can't reload or blank the page. |

F11 and any key held with Ctrl, Alt or the Windows key pass through to the browser, so Ctrl+R still reloads.

## Before presenting

1. Run the offline preflight on the Windows laptop **the day before** the demo, and again **1 hour before** it, with
   Wi-Fi off:

   ```sh
   uv run hazard-demo check
   ```

   `check` runs with the network blocked. It prints one line per item:

   - `OK`, `WARN` or `FAIL` for the packages, the model file's SHA-256, the model's vocabulary, the 4 font files,
     each demo photo, and the device
   - `PASS`, `FAIL` or `TODO` for each demo photo, with the real model time and what it flagged, compared with
     `demo/expected.json` (`TODO` means that photo has no expectation yet)

   It exits with code 1 if any line is `FAIL`, naming the failure, and any address a library tried to reach.
2. With Wi-Fi still off, run the demo and do one pass in **Edge** and one in **Chrome**: F11, step through every strip
   photo with Page Down, press R once and H twice, and upload one JPG.
3. In that run, open DevTools (F12) and select the wordmark, a card title and a percentage in turn. Under
   Elements › Computed › Rendered Fonts, only Barlow Condensed, Atkinson Hyperlegible Next and Atkinson Hyperlegible
   Mono may appear, each as a network resource. The Network tab must list only `127.0.0.1` addresses.
4. If a red bar says "Font failed to load", restore the named file: `git checkout -- static/fonts/`.
5. If the page says "Reduced motion is on", Windows animation effects are off (Settings › Accessibility › Visual
   effects). The scan still holds for 1.5 s, but the sweep doesn't move; turn animation effects on to show it.

## Troubleshooting

- **"Port 8765 is already in use."** Another copy of the demo is running: close its window, or change `server.port`
  in `config/hazards.yaml`.
- **A `FAIL cuda` block from `setup`.** Work through the fixes it prints, in order: update the NVIDIA
  driver, reinstall torch and torchvision, then confirm CUDA. If it says the torch build has no `sm_75` kernels,
  switch the PyTorch index in `pyproject.toml` to `cu126` and run `uv lock`. Without CUDA the demo still runs, on the
  CPU, more slowly.
- **"Model not loaded", or `check` fails the model file's SHA-256** (for example after a partial copy or a line-ending
  conversion). Run `git checkout -- models/`, or re-clone the repo.
- **"Can't reach the detection server."** The server window was closed. Run `uv run hazard-demo` again; the page
  reconnects within 5 seconds without a reload.

## Swapping demo photos

1. Copy the photo into `demo/photos/`, upright and downscaled to 2048 px on the long edge, JPEG quality 90. Start
   from at least 1600 px on the long edge; `check` warns that a smaller photo looks soft on screen.

   ```sh
   uv run python -c "from PIL import Image, ImageOps; im = ImageOps.exif_transpose(Image.open('IN.jpg')).convert('RGB'); im.thumbnail((2048, 2048)); im.save('demo/photos/NAME.jpg', quality=90)"
   ```

2. Add it to `demo/photos.json`: `{"id": "NAME", "file": "NAME.jpg", "scene": "Place name"}`. The scene is the
   thumbnail caption. The strip follows the file's order, and its first photo is also the model's warm-up photo. Add
   `"strip": false` to keep a photo for `check` only.
3. Add what it should flag to `demo/expected.json`: `"NAME": ["no_ppe"]`. The keys are `fall_stair`,
   `fall_opening`, `no_ppe`, `materials`, and `trip:cable`, `trip:debris` or `trip:uneven_floor`; `[]` means the
   photo should flag nothing.
4. Add a row to `demo/photos/CREDITS.md`: what it shows, the source, the author and the licence.
5. Run `uv run hazard-demo check`. The new photo must `PASS`.

## Development

The model is `models/yoloe-11s-seg.pt` (YOLOE-11-S), with the prompt words from `config/hazards.yaml` built in, so
the demo needs no text encoder and no internet. The prompt words are also the words on screen. After changing one,
rebuild the model on the Mac and commit both files in `models/`:

```sh
uv run --group build hazard-demo build-model
```

The `build` group adds the CLIP tokenizer for the MobileCLIP text encoder, which only `build-model` needs. A plain
`uv run` or `uv sync` removes it again. Downloads (the base weights and the encoder) go to `models/.base/`, which git
ignores.

Tests:

```sh
uv run pytest                        # fast
uv run pytest -m model               # loads the real model, offline
node --test "tests/js/*.test.mjs"    # the page's pure modules
uv run --group ui pytest -m ui       # in-browser, needs Chrome installed
```
