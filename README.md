# Site Hazard Detection

A local demo that runs the open-vocabulary YOLOE model (YOLOE-11-S) on construction-site photos and turns what it
finds, and what it doesn't find, into at most three hazard findings. It runs fully offline once set up.

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

## Before presenting

Run the offline preflight on the Windows laptop **the day before** the demo, and again **1 hour before** it:

```sh
uv run hazard-demo check
```

`check` runs with the network blocked. It prints one line per item:

- `OK`, `WARN` or `FAIL` for the packages, the model file's SHA-256, the model's vocabulary, the 4 font files,
  each demo photo, and the device
- `PASS`, `FAIL` or `TODO` for each demo photo, with the real model time and what it flagged, compared with
  `demo/expected.json` (`TODO` means that photo has no expectation yet)

It exits with code 1 if any line is `FAIL`, naming the failure, and any address a library tried to reach.

If the model file fails its SHA-256 check (for example after a partial copy), re-clone the repo, or run
`git checkout -- models/`.

## Development

The prompt words live in `config/hazards.yaml`, and the model file has them built in, so the demo needs no text
encoder and no internet. After changing a prompt word, rebuild the model on the Mac and commit both files in
`models/`:

```sh
uv run --group build hazard-demo build-model
```

The `build` group adds the CLIP tokenizer for the MobileCLIP text encoder, which only `build-model` needs. A plain
`uv run` or `uv sync` removes it again. Downloads (the base weights and the encoder) go to `models/.base/`, which git
ignores.

Tests: `uv run pytest` (fast), `uv run pytest -m model` (loads the real model, offline).
