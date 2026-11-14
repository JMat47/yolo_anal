# Site Hazard Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution decision (user, 2026-11-14):** subagent-driven, with **one implementer subagent per phase** instead of per task. Start from the handoff: `docs/superpowers/plans/2026-11-14-site-hazard-detection-handoff.md`.

**Goal:** A local web app for a live jury demo. It runs open-vocabulary YOLO on one construction-site photo, turns what was found and what was missing into at most 3 hazard findings, and shows them as dashed boxes, tags, cards and a stats row. It runs offline on a Windows RTX 2060 laptop from a fresh clone.

**Architecture:** One `uv run hazard-demo` process: a FastAPI server on 127.0.0.1 that serves a hand-written static page (HTML/CSS/vanilla ES modules, no build step) and a small JSON API. A background thread loads a YOLO-World v2-S model whose 10-prompt vocabulary was baked in on the Mac and committed. A pure rules engine turns detections into findings. Everything the screen says comes from `config/hazards.yaml` (words, thresholds, titles) and `static/js/strings.js` (UI copy).

**Tech Stack:** Python 3.12, uv, FastAPI, uvicorn, Pillow, PyYAML, ultralytics (YOLO-World), PyTorch (CUDA 12.8 wheels on Windows, default wheels on macOS arm64), pytest, Node's built-in `node --test` for pure JS modules, Playwright (Python, using the installed Chrome) for in-browser checks.

**Spec:**
- `docs/superpowers/specs/2026-11-14-site-hazard-detection-design.md` (the design; §6.8 sets the task order)
- `docs/superpowers/specs/2026-11-14-site-hazard-detection-ui-requirements.md` (UI-1…UI-106, PM-2…PM-16; **§8 overrides §5.5**, and §6 overrides §5)
- `PRODUCT.md`
- `docs/superpowers/specs/assets/approved-mockup.html` (the screen) and `approved-cards.html` (the right-hand "After" panel, CSS classes `.cd2 …`, is the card)

Where the design doc and the UI requirements differ, the UI requirements win. The known cases: the status endpoint is `GET /health` (UI-26), not `/api/status`. Found means **strictly above** the threshold (UI-64), not "at or above". The default port is 8765 (UI-90), not 8000.

## Global Constraints

- Python `>=3.12,<3.13` (`.python-version` = `3.12`). The lock is universal for macOS arm64 and Windows AMD64 only.
- Windows torch and torchvision come from `https://download.pytorch.org/whl/cu128` (explicit uv index, marker `sys_platform == 'win32'`). `setup` must confirm `sm_75` is in `torch.cuda.get_arch_list()`. If it isn't, switch the index to `cu126` and re-lock.
- No absolute paths. Everything resolves from `REPO_ROOT = Path(__file__).resolve().parents[2]`. All file I/O uses `encoding="utf-8"`. The CLI reconfigures stdout and stderr to UTF-8 (`errors="replace"`).
- Server: binds `127.0.0.1` only, port `8765` from config. The browser URL is `http://127.0.0.1:8765`, never `localhost`.
- Offline: `YOLO_OFFLINE=true`, `YOLO_AUTOINSTALL=false` and ultralytics `settings.update({"sync": False})` are set before ultralytics is imported, in every command except `build-model`. Nothing on the page loads from outside 127.0.0.1.
- CSP on every response, exactly: `default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'`. So there are no inline `<script>` blocks and no `on*=` attributes.
- Vocabulary, in this order: person, hard hat, safety vest, staircase, railing, floor opening, cable, debris, uneven floor, pile of materials. The on-screen word is always the prompt string (PM-16).
- Found = score `>` threshold (default `0.25`). The model runs at `conf=0.05`, so every prompt has a best score.
- Confidence % = `floor(score*100)` clamped to 1–99, written "91%". Grades: high ≥ 60 (`#6ccf8c`), medium 40–59 (`--ink-1`), low otherwise (`--ink-2`). Grades colour only the card's headline %.
- Severity: high (red) = Fall hazard and No PPE; medium (amber) = Trip hazard and Materials dumped. Category labels are exactly "Fall hazard", "Trip hazard", "No PPE", "Materials dumped".
- Findings sort: high severity first, then anchor score descending, then hazard order `fall_stair, fall_opening, trip, no_ppe, materials`, then box x1, then y1. At most **3** are shown. Their ids are "01"–"03".
- Image prep: magic bytes (JPG/PNG/WebP accepted, HEIC gets its own message) → ≤ 25 MB, ≤ 50 MP, shortest side ≥ 128 px → EXIF transpose → RGB with alpha flattened onto `#808080` → long edge ≤ 2048 → JPEG q90. The model and the screen both use this exact file.
- Scene: each pass is 1500 ms and the first pass always completes. A late response catches up in ≤ 150 ms. The reveal starts ≤ 200 ms after the scene ends. The scan times out at 20 s.
- Copy rules: UI-58 voice, UI-59 banned words, UI-61 glossary, sentence case in source (UI-60), no arrow characters (UI-84). No "dissertation", "proof of concept" or "AI". The version string is "v0.1".
- Fonts: exactly the 4 WOFF2 files in UI-82, plus OFL texts. `font-display: block`. No Google Fonts link.
- UI tasks: before the first UI file edit, the controlling session runs `/impeccable hooks on` (user instruction). Every UI implementer reads the Impeccable skill's `reference/craft-floor.md` before editing. Detector findings are fixed or, only for spec-mandated values, suppressed with a scoped `hooks ignore-value`.
- Don't create a git remote or push. The user supplies the remote (design §9).

## Review Focus

1. **The repo is cloned into a path with spaces and non-ASCII characters** (`C:\Users\Zoë\My Demo\`), and the Windows console is cp1252. Expected: every command works and prints without `UnicodeEncodeError`. Tests: T3 `test_store_under_non_ascii_path`, T7 `test_check_from_non_ascii_root` and `test_cli_survives_cp1252_stdout`.
2. **Phone photos are uploaded live:** an EXIF-rotated portrait, a HEIC file, a 48 MP JPEG. Expected: upright, with boxes on the right objects; a clear HEIC message; downscaled silently. Tests: T3 `test_exif_orientation_6_is_upright` and `test_long_edge_capped`, T9 `test_prepare_heic_415`, T12 `test_boxes_align_with_markers[exif6]`.
3. **The presenter clicks before the model is ready, double-clicks, or switches photos mid-scan.** Expected: last pick wins, and photo A's boxes are never drawn on photo B. Tests: T4 `test_queue_supersedes_waiting`, T11 stale-seq reducer cases, T14 `test_last_click_wins` and `test_pick_before_ready_waits_then_scans`.
4. **The model file is missing or altered on the Windows clone** (CRLF conversion, partial copy). Expected: a boot-error screen with the fix, and `check` FAILs naming the file. Tests: T1 `test_gitattributes_marks_binaries`, T4 `test_verify_weights_mismatch`, T9 `test_health_error_when_weights_bad`, T14 `test_boot_error_state`.
5. **A second copy of the app is already running, or the server window is closed mid-demo.** Expected: exits naming the busy port; the page shows "Model offline" within 5 s and recovers without a reload. Tests: T9 `test_run_exits_when_port_busy`, T14 `test_server_lost_then_recovers`.

---

## File structure

```
.gitignore  .gitattributes  .python-version  pyproject.toml  uv.lock  README.md
config/hazards.yaml                  every prompt, threshold, margin, title, grade, port
demo/photos.json  demo/expected.json  demo/photos/*.jpg
models/yolov8s-worldv2.pt  models/yolov8s-worldv2.pt.sha256   (built on the Mac, committed)
src/hazard_demo/
  __init__.py   paths.py      REPO_ROOT, dirs, font file list
  config.py     Config, HazardText, DemoPhoto, load_config, load_photos, load_expected
  rules.py      Detection, Check, Finding, RuleOutcome, Evaluation, evaluate, select
  results.py    pct, grade, scan_payload
  imaging.py    sniff, PreparedImage, ImageStore, ImageRejected
  offline.py    configure_ultralytics, block_network, NetworkBlocked
  detector.py   Backend, UltralyticsBackend, InferenceQueue, ModelService, verify_weights
  build_model.py  checks.py  api.py  cli.py
static/index.html  static/app.css  static/fonts/*
static/js/ main.js api.js state.js stage.js placement.js cards.js stats.js format.js strings.js keys.js fonts.js
tests/  test_*.py   tests/js/*.test.mjs   tests/ui/ (Playwright, marker `ui`)
```

---

# Phase 1: Detection core

### Task 1: Scaffold, config and config loader

**Files:**
- Create: `pyproject.toml`, `.python-version`, `.gitignore`, `.gitattributes`, `config/hazards.yaml`, `src/hazard_demo/__init__.py`, `src/hazard_demo/paths.py`, `src/hazard_demo/config.py`
- Test: `tests/test_config.py`

**Interfaces:**
- Produces:
  - `paths.py`: `REPO_ROOT`, `CONFIG_PATH`, `DEMO_DIR`, `MODELS_DIR`, `STATIC_DIR`, `FONTS_DIR`, and `FONT_FILES: tuple[str, ...]` (the 4 UI-82 names).
  - `config.py`: `ROLES` (the 10 role keys in vocabulary order), `HAZARDS = ("fall_stair","fall_opening","trip","no_ppe","materials")`, `class ConfigError(Exception)`.
  - `@dataclass(frozen=True) HazardText(category: str, severity: Literal["high","medium"], titles: dict[str,str], check_label: str)`.
  - `@dataclass(frozen=True) Config` with fields `port, model_file: Path, model_base: str, conf_floor, imgsz, device, min_scene_ms, timeout_ms, prompts: dict[str,str]` (role → word, in vocabulary order), `threshold, thresholds: dict[str,float], merge_iou, railing_margin, head_region, torso_region: tuple[float,float], ppe_margin, confidence_grades: dict[str,int], max_findings, hazards: dict[str,HazardText]`.
  - `Config` properties and methods: `model_name -> str` (the `model_file` stem), `vocabulary -> list[str]`, `word(role) -> str`, `role_of(word) -> str`, `threshold_for(role) -> float`, `threshold_pct -> int`.
  - `load_config(path: Path = CONFIG_PATH) -> Config`.

- [ ] **Step 1: `git init -b main`**, then write `.gitignore` (`.venv/`, `__pycache__/`, `.superpowers/`, `models/.base/`, `artifacts/`, `.pytest_cache/`, `.claude/settings.local.json`, `.impeccable/config.local.json`, `.impeccable/hook.cache.json`, `demo/incoming/`) and `.gitattributes` (`*.pt binary`, `*.woff2 binary`, `*.jpg binary`, `*.png binary`, `*.webp binary`, `*.sha256 text eol=lf`).

- [ ] **Step 2: Write `pyproject.toml`**

```toml
[project]
name = "hazard-demo"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = ["fastapi", "uvicorn", "python-multipart", "pillow", "pyyaml", "numpy",
                "ultralytics>=8.3,<9", "torch>=2.7", "torchvision>=0.22"]

[project.scripts]
hazard-demo = "hazard_demo.cli:main"

[dependency-groups]
dev = ["pytest", "httpx"]
ui = ["playwright"]
build = ["clip @ git+https://github.com/ultralytics/CLIP.git"]

[tool.uv]
environments = ["sys_platform == 'darwin' and platform_machine == 'arm64'",
                "sys_platform == 'win32' and platform_machine == 'AMD64'"]

[tool.uv.sources]
torch = [{ index = "pytorch-cu128", marker = "sys_platform == 'win32'" }]
torchvision = [{ index = "pytorch-cu128", marker = "sys_platform == 'win32'" }]

[[tool.uv.index]]
name = "pytorch-cu128"
url = "https://download.pytorch.org/whl/cu128"
explicit = true

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/hazard_demo"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-m 'not model and not ui'"
markers = ["model: needs the committed model file", "ui: Playwright in-browser tests (uv run --group ui)"]
```

- [ ] **Step 3: Write `config/hazards.yaml`.** These are the starting values from the spec; T15 tunes them.

```yaml
server: {port: 8765}
model: {file: models/yolov8s-worldv2.pt, base: yolov8s-worldv2.pt, conf_floor: 0.05, imgsz: 640, device: auto}
scan: {min_scene_ms: 1500, timeout_ms: 20000}
prompts:            # role: prompt word (shown on screen). Order = vocabulary order. Changing a word needs build-model.
  person: person
  hard_hat: hard hat
  safety_vest: safety vest
  staircase: staircase
  railing: railing
  floor_opening: floor opening
  cable: cable
  debris: debris
  uneven_floor: uneven floor
  pile: pile of materials
threshold: 0.25
thresholds: {}      # per-role overrides, e.g. {floor_opening: 0.2}
merge_iou: 0.6
geometry: {railing_margin: 0.15, head_region: 0.30, torso_region: [0.20, 0.70], ppe_margin: 0.10}
confidence_grades: {high: 60, medium: 40}
max_findings: 3
hazards:
  fall_stair:   {category: Fall hazard, severity: high, titles: {default: Staircase without a railing}, check_label: Staircase without a railing}
  fall_opening: {category: Fall hazard, severity: high, titles: {default: Floor opening without a railing}, check_label: Floor opening without a railing}
  trip:         {category: Trip hazard, severity: medium, titles: {cable: Cable on the floor, debris: Debris on the floor, uneven_floor: Uneven floor}, check_label: Cable, debris or uneven floor}
  no_ppe:       {category: No PPE, severity: high, titles: {both: No hard hat or safety vest, hard_hat: No hard hat, safety_vest: No safety vest}, check_label: Person without a hard hat or safety vest}
  materials:    {category: Materials dumped, severity: medium, titles: {default: Pile of materials}, check_label: Pile of materials}
```

- [ ] **Step 4: Write the failing tests** in `tests/test_config.py`:
  - `test_vocabulary_order`: `load_config().vocabulary == ["person","hard hat","safety vest","staircase","railing","floor opening","cable","debris","uneven floor","pile of materials"]`
  - `test_threshold_override`: write a yaml copy to `tmp_path` with `thresholds: {floor_opening: 0.2}`. Then `threshold_for("floor_opening") == 0.2`, `threshold_for("cable") == 0.25`, and `threshold_pct == 25`.
  - `test_model_paths_resolve_from_repo`: `cfg.model_file == REPO_ROOT / "models/yolov8s-worldv2.pt"` and `cfg.model_name == "yolov8s-worldv2"`.
  - `test_uneven_floor_may_be_removed`: with `uneven_floor` deleted from `prompts`, the config loads, and `"uneven_floor" not in cfg.prompts`.
  - `test_rejects_bad_config` (parametrised): an unknown role, a duplicate word, a missing required role (`person`), no trip role at all, a threshold outside (0,1), `high <= medium` in the grades, or a missing hazard key. Each raises `ConfigError`, and the message names the offending key.
  - `test_gitattributes_marks_binaries`: `.gitattributes` contains the lines `*.pt binary` and `*.woff2 binary`.

- [ ] **Step 5: Run** `uv run pytest tests/test_config.py -v`. Expected: FAIL (`ModuleNotFoundError: hazard_demo.config`). (The first `uv run` creates `.venv` and `uv.lock`. This needs network.)

- [ ] **Step 6: Implement `paths.py` and `config.py`.** `load_config` reads the yaml with `encoding="utf-8"` and validates. The required roles are `person, hard_hat, safety_vest, staircase, railing, floor_opening, pile`, plus at least one of `cable, debris, uneven_floor`. It resolves `model.file` against `REPO_ROOT`.

- [ ] **Step 7: Run** `uv run pytest -v`. Expected: all PASS. Confirm `uv.lock` lists torch from `download.pytorch.org/whl/cu128` for win32.

- [ ] **Step 8: Commit** `git add -A && git commit -m "chore: scaffold project, config and loader"`

### Task 2: Rules engine and result payload (test-first)

**Files:**
- Create: `src/hazard_demo/rules.py`, `src/hazard_demo/results.py`
- Test: `tests/test_rules.py`, `tests/test_results.py`

**Interfaces:**
- Consumes: `Config`, `HAZARDS` (T1).
- Produces (`rules.py`):
  - `Box = tuple[float,float,float,float]` (xyxy, in prepared-image pixels).
  - `@dataclass(frozen=True) Detection(role: str, score: float, box: Box)`
  - `@dataclass(frozen=True) Check(role: str, status: Literal["found","missing"], score: float, kind: Literal["context","safeguard","evidence"])`. For a missing check, `score` is the role's best score, kept for debugging and never shown.
  - `@dataclass(frozen=True) Finding(hazard: str, severity: str, title: str, anchor: Detection, checks: tuple[Check,...])`
  - `@dataclass(frozen=True) RuleOutcome(hazard: str, fired: bool, count: int)`
  - `@dataclass(frozen=True) Evaluation(findings: tuple[Finding,...], outcomes: tuple[RuleOutcome,...], best: dict[str,float])`. `findings` is all findings, sorted. `outcomes` is always 5, in `HAZARDS` order. `best` is role → max raw score, 0.0 when the role has no detections.
  - `iou(a: Box, b: Box) -> float`, `merge_same_role(dets: Sequence[Detection], iou_min: float) -> list[Detection]`, `evaluate(dets: Sequence[Detection], cfg: Config) -> Evaluation`, `select(findings: Sequence[Finding], cap: int) -> tuple[tuple[Finding,...], int]`.
- Produces (`results.py`):
  - `pct(score: float) -> int`
  - `grade(p: int, grades: Mapping[str,int]) -> Literal["high","medium","low"]`
  - `scan_payload(*, seq: int, ev: Evaluation, image: PreparedImage, model_ms: float, model: str, device: str, cfg: Config) -> dict`. `PreparedImage` is defined in T3. These tests use a stand-in object that has `.width`, `.height` and `.to_json()`.

**Rule semantics (from design §6.3, PM-14, PM-15, UI-64, UI-103, UI-105):**
- `found(role)` = merged detections of that role with `score > cfg.threshold_for(role)`. Merging is greedy NMS: sort by score, descending, and drop any same-role box with IoU ≥ `merge_iou` against one already kept.
- **Near:** expand the anchor box by `railing_margin × max(w, h)` on every side. A railing is near if its box intersects that rectangle; touching counts.
- **fall_stair / fall_opening:** one finding per found staircase (or floor opening) with no found railing near it. Checks: `[(anchor role, found, context), ("railing", missing, safeguard)]`.
- **no_ppe:** one finding per found person who is missing a hard hat, a safety vest or both.
  - Head region: `y1 … y1 + head_region×h`, widened by `ppe_margin×w` on the left, right and top.
  - Torso region: `y1 + 0.20h … y1 + 0.70h`, widened by `ppe_margin×w` on the left and right.
  - A safeguard counts as matched when the centre of a found hard hat (or safety vest) box lies in its region.
  - Checks, in order: the person (context), then found safeguards with their scores, then missing safeguards.
  - Title key: `both`, `hard_hat` (only the hat is missing) or `safety_vest` (only the vest is missing).
- **trip:** one finding per found, merged detection of each configured trip role. Title = `titles[role]`. Checks = `[(role, found, evidence)]`.
- **materials:** one finding per found pile. Checks = `[("pile", found, evidence)]`.

- [ ] **Step 1: Write the failing tests** in `tests/test_rules.py`.

```python
CFG = load_config()
PERSON = (100, 100, 200, 400)   # w=100 h=300: head y 100–190 (x 90–210), torso y 160–310
HAT    = (130, 100, 170, 140)   # centre (150,120): in head
VEST   = (110, 200, 190, 300)   # centre (150,250): in torso
STAIR  = (300, 300, 500, 500)   # margin 30 → expanded (270,270,530,530)
def d(role, score, box): return Detection(role, score, box)
def kinds(f): return [(c.role, c.status, c.kind) for c in f.checks]
```

| Test | Input | Assertion |
|---|---|---|
| `test_staircase_without_railing_fires` | staircase .81 | one finding: `fall_stair`, `high`, "Staircase without a railing"; `kinds == [("staircase","found","context"),("railing","missing","safeguard")]` |
| `test_railing_touching_expanded_box_suppresses` | + railing .5 at (520,300,560,500) | no findings; `outcomes[0].fired is False` |
| `test_railing_far_away_does_not_suppress` | + railing .5 at (600,300,650,500) | fires |
| `test_score_equal_to_threshold_is_missing` | staircase .81, railing .25 near | fires (`>` only). Staircase .25 alone → no findings |
| `test_floor_opening_without_railing_fires` | floor_opening .47 | `fall_opening`, "Floor opening without a railing" |
| `test_person_missing_both` | person .91 | title "No hard hat or safety vest"; `kinds == [person found context, hard_hat missing safeguard, safety_vest missing safeguard]` |
| `test_person_with_hat_only` | person, HAT .7 | "No safety vest"; checks `[person found, hard_hat found (score .7), safety_vest missing]` |
| `test_person_with_vest_only` | person, VEST .66 | "No hard hat" |
| `test_person_with_both_not_flagged` | person, HAT, VEST | no findings |
| `test_hat_below_head_region_is_missing` | person, VEST, hat at (130,300,170,340) | "No hard hat" |
| `test_hat_within_side_margin_matches` | person, VEST, hat centred at x=205 | no findings |
| `test_one_finding_per_person` | two separate persons | two `no_ppe` findings |
| `test_trip_one_finding_per_detection` | cable .64, debris .52 | titles "Cable on the floor", "Debris on the floor"; each `kinds == [(role,"found","evidence")]` |
| `test_same_role_overlap_merged_keeps_higher` | cables .5 and .7 at IoU ≥ .6 | one trip finding, `anchor.score == .7` |
| `test_different_roles_not_merged` | cable and debris, same box | two findings |
| `test_trip_role_removed_from_config_is_skipped` | cfg without `uneven_floor`, an `uneven_floor` det .9 | no findings; 5 outcomes |
| `test_materials_fires` | pile .77 | `materials`, `medium`, "Pile of materials" |
| `test_outcomes_always_five_in_order` | `[]` | `[o.hazard for o in outcomes] == list(HAZARDS)`; all `fired False`, `count 0` |
| `test_best_scores_include_unfound` | hard_hat .12 | `best["hard_hat"] == .12`, `best["railing"] == 0.0` |
| `test_sort_severity_then_score` | cable .95, pile .90, staircase .70, person .60 | hazards `["fall_stair","no_ppe","trip","materials"]` |
| `test_tie_breaks_by_hazard_order` | staircase .7, person .7 | `["fall_stair","no_ppe"]` |
| `test_select_caps_at_three` | 5 findings | `select(f, 3) == (f[:3], 2)` |

In `tests/test_results.py`:
- `test_pct_floors_and_clamps`: `pct(.919)==91`, `pct(.999)==99`, `pct(1.0)==99`, `pct(.004)==1`, `pct(.25)==25`.
- `test_grade_cutoffs`: 60 → high, 59 → medium, 40 → medium, 39 → low, 26 → low.
- `test_payload_shape`: payload from 5 findings on a 2000×1000 image. `[f["id"] for f in p["findings"]] == ["01","02","03"]`, `p["hidden_count"] == 2`, `anchor.box_norm == [x1/2000, y1/1000, x2/2000, y2/1000]` rounded to 4 dp, `p["threshold_pct"] == 25`, `p["vocabulary"] == CFG.vocabulary`, `len(p["rules"]) == 5`, and `p["model_ms"]` is rounded to 1 dp.
- `test_payload_missing_check_has_no_pct`: a missing check is `{"item":"hard hat","status":"missing","kind":"safeguard","best":0.12}` with no `"pct"` key.
- `test_payload_rules_carry_empty_state_data`: each rule is `{hazard, category, check_label, anchor_items, anchor_found, fired, count}`. For trip, `anchor_items` is the configured trip words. `anchor_found` is true when any anchor role's best score is above its threshold.
- `test_payload_uses_config_words` (UI-57): a config where `hard_hat` is `helmet` gives `"helmet"` in `vocabulary` and in the No PPE check's `item`, with no code change.
- `test_objects_found_sorted`: `objects_found == [{"item":"staircase","pct":84},{"item":"railing","pct":71}]`. It lists only the best scores above the threshold, sorted by score, descending.

The payload contract that every later task uses:

```json
{"seq": 3, "model": "yolov8s-worldv2", "device": "cuda:0 NVIDIA GeForce RTX 2060",
 "vocabulary": ["person", "…"], "threshold_pct": 25,
 "image": {"id": "…", "url": "/api/images/….jpg", "width": 2048, "height": 1536,
           "original_width": 4032, "original_height": 3024, "name": "IMG_0042.jpg"},
 "model_ms": 48.2,
 "findings": [{"id": "01", "hazard": "no_ppe", "category": "No PPE", "severity": "high",
               "title": "No hard hat or safety vest", "confidence": 91, "grade": "high",
               "anchor": {"item": "person", "score": 0.913, "box": [1, 2, 3, 4], "box_norm": [0.1, 0.2, 0.3, 0.4]},
               "checks": [{"item": "person", "status": "found", "kind": "context", "pct": 91},
                          {"item": "hard hat", "status": "missing", "kind": "safeguard", "best": 0.12}]}],
 "hidden_count": 0,
 "rules": [{"hazard": "fall_stair", "category": "Fall hazard", "check_label": "Staircase without a railing",
            "anchor_items": ["staircase"], "anchor_found": false, "fired": false, "count": 0}],
 "best_scores": {"person": 0.913, "hard hat": 0.12},
 "objects_found": [{"item": "person", "pct": 91}]}
```

- [ ] **Step 2: Run** `uv run pytest tests/test_rules.py tests/test_results.py -v`. Expected: FAIL (import errors).
- [ ] **Step 3: Implement `rules.py` and `results.py`.** Both are pure, with no I/O. Items use the display word, `cfg.word(role)`.
- [ ] **Step 4: Run** the same command. Expected: all PASS.
- [ ] **Step 5: Commit** `git add src tests && git commit -m "feat: rules engine and scan payload"`

### Task 3: Image preparation and store

**Files:**
- Create: `src/hazard_demo/imaging.py`
- Test: `tests/test_imaging.py`

**Interfaces:**
- Produces:
  - Constants: `MAX_BYTES = 25*1024*1024`, `MAX_PIXELS = 50_000_000`, `MIN_SIDE = 128`, `MAX_EDGE = 2048`, `JPEG_QUALITY = 90`, `FLATTEN = (128,128,128)`.
  - `class ImageRejected(Exception)` with attributes `kind: Literal["unsupported","too-large","too-small","unreadable"]`, `format: str|None` (`"heic"`), `limit: str|None` and `value: str|None`.
  - `sniff(data: bytes) -> Literal["jpeg","png","webp","heic"] | None`. JPEG is `FF D8 FF`. PNG is the 8-byte signature. WebP is `RIFF????WEBP`. HEIC is `ftyp` at offset 4, with brand `heic|heix|hevc|mif1|msf1`.
  - `@dataclass(frozen=True) PreparedImage(id, path: Path, width, height, original_width, original_height, name)`, with `to_json() -> dict`, whose `url` is `/api/images/{id}.jpg`.
  - `ImageStore(root: Path)`. The constructor deletes `root` and recreates it (cleared at start-up). It has `put(data: bytes, name: str) -> PreparedImage` and `get(image_id: str) -> PreparedImage | None`. The id is the first 16 hex characters of the SHA-256 of `data`, and `put` is idempotent. `get` accepts only `[0-9a-f]{16}`.
  - `default_store_root() -> Path` returns `Path(tempfile.gettempdir()) / "site-hazard-demo"`.

Rejection values are human-readable. For bytes: `limit "25 MB"`, value like `"31.2 MB"`. For pixels: `"50 MP"` / `"61.0 MP"`. For the shortest side: `"128 px"` / `"96 px"`. Pillow's `DecompressionBombError` maps to `too-large`.

- [ ] **Step 1: Write the failing tests.** Fixtures are built in-test with Pillow.
  - `test_accepts_jpeg_png_webp`: each format's `put` returns the right dimensions.
  - `test_heic_rejected`: `b"\x00\x00\x00\x18ftypheic" + bytes(64)` → `kind "unsupported"`, `format "heic"`.
  - `test_unknown_type_rejected`: `b"%PDF-1.4…"` → `unsupported`, `format None`.
  - `test_too_many_bytes`: `MAX_BYTES + 1` bytes → `too-large`, `limit "25 MB"`.
  - `test_too_many_pixels`: an 8000×6400 PNG → `too-large`, `limit "50 MP"`, `value "51.2 MP"`.
  - `test_too_small`: 100×300 → `too-small`, `value "100 px"`.
  - `test_corrupt_jpeg_unreadable`: the JPEG magic bytes plus garbage → `unreadable`, and nothing is written to the store.
  - `test_exif_orientation_6_is_upright`: a 400×300 image with a red block in its top-left, saved with EXIF orientation 6. Expect `width, height == 300, 400`, `original_* == 300, 400`, and the red block at the top-right.
  - `test_alpha_flattened_to_808080`: a fully transparent RGBA PNG → the centre pixel is within ±3 of (128,128,128).
  - `test_long_edge_capped`: 4032×3024 → 2048×1536, `original 4032×3024`. The saved file is a JPEG.
  - `test_store_cleared_on_init`: a stray file in `root` is gone after `ImageStore(root)`.
  - `test_put_is_idempotent`: putting the same bytes twice gives the same id.
  - `test_get_rejects_bad_ids`: `get("../x")` and `get("ABC")` return `None`.
  - `test_store_under_non_ascii_path`: `ImageStore(tmp_path / "Zoë My Demo")`, then `put`, then `get` all work.
- [ ] **Step 2: Run** `uv run pytest tests/test_imaging.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `imaging.py`.** Check the byte length first, then `sniff`. Then `Image.open` lazily and check `size` before `load()`. Then `ImageOps.exif_transpose`, flatten, `thumbnail((2048, 2048), LANCZOS)`, and save JPEG q90.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add src tests && git commit -m "feat: image preparation and content-addressed store"`

### Task 4: Offline guard and model service

**Files:**
- Create: `src/hazard_demo/offline.py`, `src/hazard_demo/detector.py`
- Test: `tests/test_offline.py`, `tests/test_detector.py`, `tests/conftest.py` (shared `FakeBackend`)

**Interfaces:**
- Consumes: `Config` (T1), `Detection` (T2).
- Produces (`offline.py`):
  - `configure_ultralytics(*, offline: bool) -> None`. It sets `YOLO_OFFLINE` to `"true"` or `"false"` and `YOLO_AUTOINSTALL="false"`, then imports `ultralytics.settings` and sets `sync=False`.
  - `class NetworkBlocked(RuntimeError)`.
  - `block_network()` is a context manager that yields `attempts: list[str]`. It patches `socket.socket.connect`, `socket.create_connection` and `socket.getaddrinfo` to record `"host:port"` and raise `NetworkBlocked`, and restores them on exit.
- Produces (`detector.py`):
  - `class WeightsError(Exception)`, `NotReady`, `Superseded`, `ModelError`.
  - `sha_path(cfg) -> Path` (`<model_file>.sha256`), `sha256_file(path) -> str` and `verify_weights(cfg) -> None`. `verify_weights` raises `WeightsError`, and the message names the path and the fix: "Re-clone the repo, or run `git checkout -- models/`".
  - `class Backend(Protocol)` with `name: str`, `device: str`, `names: list[str]` and `predict(img: PIL.Image.Image) -> list[Detection]`.
  - `pick_device(pref: str) -> str`. For `"auto"` it returns `cuda:0`, then `mps`, then `cpu`, whichever is available first. It returns any other value unchanged.
  - `device_label(device: str) -> str`, e.g. `"cuda:0 NVIDIA GeForce RTX 2060"`.
  - `UltralyticsBackend(cfg)`. It calls `verify_weights` and imports ultralytics lazily inside `__init__`, then runs `YOLOWorld(cfg.model_file)`. It checks that `list(model.names.values()) == cfg.vocabulary`, else raises `WeightsError("Model vocabulary differs from config/hazards.yaml. On the Mac: uv run --group build hazard-demo build-model")`. `predict` passes the **PIL image** (ultralytics treats numpy as BGR) with `conf=cfg.conf_floor`, `imgsz=cfg.imgsz`, `device=…` and `verbose=False`, then maps `cls` to a role by vocabulary index.
  - `InferenceQueue` with `run(fn: Callable[[], T]) -> T`. It runs one call at a time with at most one waiting. A newer arrival makes the waiting call raise `Superseded`. Use a `threading.Condition`, a running flag and the waiting ticket.
  - `ModelService(cfg, backend_factory: Callable[[Config], Backend], warmup_image: Path | None)`.
    - Attributes and methods: `boot_id: str` (uuid4 hex), `start()`, `wait_ready(timeout) -> bool` and `health() -> {"state","model","device","message","boot_id"}`.
    - `scan(image_path: Path) -> tuple[list[Detection], float]` raises `NotReady`, `Superseded` or `ModelError`. `ms` is timed with `perf_counter` around `backend.predict` only.
    - States: `loading → warming → ready | error`. Warm-up runs 2 predictions on `warmup_image`, or a 1280×960 grey image when there is none.

- [ ] **Step 1: Write the failing tests.**
  - `tests/test_offline.py`:
    - `test_block_network_raises_and_records`: `socket.create_connection(("example.com", 443))` raises `NetworkBlocked`, and `attempts == ["example.com:443"]`. Afterwards, `socket.create_connection` is the original function again.
    - `test_configure_ultralytics_offline`: the env vars are set, and `ultralytics.settings["sync"] is False`.
  - `tests/test_detector.py`, using `FakeBackend(dets=(), delay=0.0, fail=False)`, which records `calls`:
    - `test_health_reaches_ready_after_two_warmups`: `wait_ready(5)`, then `health()["state"] == "ready"` and `fake.calls == 2`.
    - `test_health_error_when_factory_raises`: the factory raises `WeightsError("missing models/x.pt …")` → state `"error"`, and the message contains `models/x.pt`.
    - `test_scan_before_ready_raises_not_ready`: a factory blocked on an `Event`.
    - `test_scan_times_model_call_only`: with `delay=.05`, `50 <= ms < 400`, and the returned detections equal `fake.dets`.
    - `test_scan_wraps_backend_error`: `fail=True` → `ModelError`.
    - `test_queue_supersedes_waiting`: A blocks on an Event, B waits, and C arrives. B raises `Superseded`, C runs after A, and the order of execution is `["A","C"]`.
    - `test_verify_weights_missing`, `test_verify_weights_mismatch`, `test_verify_weights_ok`: in `tmp_path`, using `dataclasses.replace(cfg, model_file=…)`.
    - `test_pick_device_auto_falls_back_to_cpu`: monkeypatch `torch.cuda.is_available` and `torch.backends.mps.is_available` to return False → `"cpu"`.
- [ ] **Step 2: Run** `uv run pytest tests/test_offline.py tests/test_detector.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `offline.py` and `detector.py`.** Ultralytics is imported only inside `configure_ultralytics` and `UltralyticsBackend.__init__`.
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add src tests && git commit -m "feat: offline guard, model service and inference queue"`

### Task 5: `build-model` and the committed model

**Files:**
- Create: `src/hazard_demo/build_model.py`, `src/hazard_demo/cli.py` (with a `build-model` subcommand only, for now), `models/yolov8s-worldv2.pt`, `models/yolov8s-worldv2.pt.sha256`
- Test: `tests/test_model_smoke.py` (marker `model`)

**Interfaces:**
- Consumes: `Config`, `configure_ultralytics`, `sha_path`, `sha256_file`, `UltralyticsBackend`, `block_network`.
- Produces:
  - `build_model(cfg: Config, base: str | None = None) -> Path`. It runs `configure_ultralytics(offline=False)` and loads `YOLOWorld(MODELS_DIR / ".base" / (base or cfg.model_base))`, which downloads the base weights there on first use. Then it calls `set_classes(cfg.vocabulary)`, `save(cfg.model_file)`, and writes the hex digest plus `\n` to `sha_path(cfg)`.
  - `cli.main(argv: list[str] | None = None) -> int`, an argparse program with subcommands. `run` is the default when no subcommand is given. T7 and T9 add the others.

- [ ] **Step 1: Write the smoke tests** (`pytestmark = pytest.mark.model`):
  - `test_built_model_loads_offline`: inside `block_network() as attempts`, construct `UltralyticsBackend(load_config())` and predict on `demo/photos/site-ppe.jpg`. (If T6 hasn't run yet, use `docs/superpowers/specs/assets/site-ppe.jpg`.) Assert `attempts == []`, `backend.names == cfg.vocabulary`, and every `d.role in cfg.prompts`.
  - `test_sha_file_matches`: `sha_path(cfg).read_text().strip() == sha256_file(cfg.model_file)`.
- [ ] **Step 2: Run** `uv run pytest -m model -v`. Expected: FAIL (`WeightsError: … models/yolov8s-worldv2.pt`).
- [ ] **Step 3: Implement `build_model.py` and the `build-model` subcommand** (`--base NAME`, optional).
- [ ] **Step 4: Build.** Run `uv run --group build hazard-demo build-model`. Expected: it prints the output path and its SHA-256. The file is roughly 25–50 MB.
- [ ] **Step 5: Run the smoke tests without CLIP installed.** Run `uv sync`, which drops the `build` group, then `uv run pytest -m model -v`. Expected: PASS.
  - If prediction fails on `mps` only, change `pick_device("auto")` to go `cuda:0 → cpu` and record that in the Tuning log.
  - If loading fails without `clip`, the vocabulary isn't baked. Stop and report it. Don't add CLIP to the runtime dependencies.
- [ ] **Step 6: Commit** `git add src tests models/yolov8s-worldv2.pt models/yolov8s-worldv2.pt.sha256 && git commit -m "feat: build-model command and baked-vocabulary model"`

### Task 6: Demo assets and fonts

**Files:**
- Create: `demo/photos/site-{ppe,stairs,shaft,floor,materials,railing}.jpg` (copied from `docs/superpowers/specs/assets/`), `demo/photos.json`, `demo/expected.json` (`{}`), `static/fonts/` (4 WOFF2 files + `OFL-atkinson-hyperlegible-next.txt`, `OFL-atkinson-hyperlegible-mono.txt`, `OFL-barlow-condensed.txt`)
- Modify: `src/hazard_demo/config.py` (add the photo and expectation loaders)
- Test: `tests/test_assets.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) DemoPhoto(id: str, file: Path, scene: str, strip: bool = True)`
  - `load_photos(path: Path = DEMO_DIR/"photos.json") -> list[DemoPhoto]`, in file order. File paths resolve against `DEMO_DIR / "photos"`. An entry with `"strip": false` is a check-only photo: a no-hazard control that `check` runs but the jury never sees (user decision, 2026-11-14).
  - `load_expected(path: Path = DEMO_DIR/"expected.json") -> dict[str, list[str]]`.

`demo/photos.json` (placeholder scene names from UI-67, in this order; photo 1 is the warm-up photo):

```json
[{"id": "site-ppe", "file": "site-ppe.jpg", "scene": "Column bay"},
 {"id": "site-stairs", "file": "site-stairs.jpg", "scene": "Stair flight"},
 {"id": "site-shaft", "file": "site-shaft.jpg", "scene": "Service shaft"},
 {"id": "site-floor", "file": "site-floor.jpg", "scene": "Room corner"},
 {"id": "site-materials", "file": "site-materials.jpg", "scene": "Ground-floor room"},
 {"id": "site-railing", "file": "site-railing.jpg", "scene": "Stair doorway"}]
```

`demo/expected.json` maps a photo id to its sorted flagged keys. A key is a hazard name, or `trip:<role>` for trip findings, e.g. `{"site-floor": ["trip:cable", "trip:uneven_floor"], "site-railing": []}`. It stays `{}` until T15.

Font sources. Download these and save them under the UI-82 names:
- `atkinson-hyperlegible-next-latin-wght.woff2` ← `https://fonts.gstatic.com/s/atkinsonhyperlegiblenext/v7/NaPNcYPdHfdVxJw0IfIP0lvYFqijb-UxCtm5_wdGseiJn3o.woff2`
- `atkinson-hyperlegible-mono-latin-wght.woff2` ← `https://fonts.gstatic.com/s/atkinsonhyperlegiblemono/v8/tss4AoFBci4C4gvhPXrt3wjT1MqSzhA4t7IIcncBiwKthFw.woff2`
- `barlow-condensed-latin-600.woff2` ← `https://fonts.gstatic.com/s/barlowcondensed/v13/HTxwL3I-JCGChYJ8VI-L6OO_au7B4873z3bWuQ.woff2`
- `barlow-condensed-latin-700.woff2` ← `https://fonts.gstatic.com/s/barlowcondensed/v13/HTxwL3I-JCGChYJ8VI-L6OO_au7B46r2z3bWuQ.woff2`
- The OFL texts come from `https://raw.githubusercontent.com/google/fonts/main/ofl/{atkinsonhyperlegiblenext,atkinsonhyperlegiblemono,barlowcondensed}/OFL.txt`.

The brainstorm used these same files. Their SHA-256s, in order, are `18b2a1a3…`, `2706b1ee…`, `215a93c6…` and `3787a5a4…`.

- [ ] **Step 1: Write the failing tests:**
  - `test_photos_json_matches_files`: the 6 ids in the order above, every file exists, and `photos[0].id == "site-ppe"`.
  - `test_fonts_bundled`: every `FONT_FILES` entry exists in `FONTS_DIR`, starts with `b"wOF2"`, and is under 60 KB. The 3 OFL files exist.
  - `test_expected_json_loads`: it is a dict.
  - `test_check_only_flag`: in a `tmp_path` photos.json, an entry with `"strip": false` loads with `strip is False`, and an entry without the key loads with `strip is True`.
- [ ] **Step 2: Run** `uv run pytest tests/test_assets.py -v`. Expected: FAIL.
- [ ] **Step 3: Copy the photos, write the JSON files, download the fonts, and add `load_photos` / `load_expected`.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git add demo static/fonts src tests && git commit -m "feat: stand-in demo photos and bundled fonts"`

### Task 7: `check` and `setup` commands, and the README's setup section

**Files:**
- Create: `src/hazard_demo/checks.py`, `README.md`
- Modify: `src/hazard_demo/cli.py` (add `check` and `setup`, plus the UTF-8 stream reconfiguration)
- Test: `tests/test_checks.py`

**Interfaces:**
- Consumes: everything from T1–T6.
- Produces:
  - `flagged_keys(ev: Evaluation) -> list[str]` (sorted, with `trip:<role>` keys).
  - `run_check(cfg, *, backend_factory, photos: list[DemoPhoto], expected: dict, fonts_dir: Path, out: TextIO) -> int`.
  - `run_setup(cfg, *, out: TextIO) -> int`.

`check` prints one line per item, in this format: `OK   weights     sha256 3f2a… models/yolov8s-worldv2.pt`. The status is one of `OK`, `FAIL`, `WARN`, `PASS` or `TODO`. The order:
1. dependencies (versions of python, torch with its CUDA version, ultralytics, fastapi and pillow)
2. weights (`verify_weights`)
3. vocabulary (the model's names equal the config's)
4. fonts (4 files)
5. each photo decodes through `ImageStore` (WARN when the long edge is under 1600 px, per UI-11)
6. device (`device_label`)
7. per photo: `PASS|FAIL|TODO  {id:<16}{scene:<20}{ms:>6.0f} ms  flagged: {keys}`. FAIL lines add `expected: …`. TODO means the photo has no entry in `expected.json`.

It prepares photos into its own store, `ImageStore(default_store_root().with_name("site-hazard-demo-check"))`. It runs every photo in `photos.json`, including check-only ones, and tags those lines `(check only)`. The whole model section runs inside `block_network()`. Any recorded attempt prints `FAIL network  tried to reach {host:port}`.

Exit codes: 1 if any line is FAIL, otherwise 0. A final summary line reads `check: N passed, M failed, K without expectation`.

`setup` does three things in order:
1. It prints the Python and torch versions.
2. On win32, it checks CUDA:
   - If `torch.cuda.is_available()` is false, it prints a loud `FAIL` block with these fixes: "Install or update the NVIDIA driver (Game Ready or Studio, 2024 or newer)", then "`uv sync --reinstall-package torch --reinstall-package torchvision`", then "`uv run python -c "import torch; print(torch.version.cuda, torch.cuda.is_available())"`".
   - If CUDA is available but `"sm_75"` is missing from `get_arch_list()`, it FAILs with "switch the PyTorch index to cu126 in pyproject.toml and run `uv lock`".
   - Otherwise it runs a 512×512 matmul on `cuda:0`.
3. It runs `run_check`.

- [ ] **Step 1: Write the failing tests** (FakeBackend, `tmp_path` fonts dir, photos from T6):
  - `test_check_passes_when_flagged_matches`: the expected entries equal what the fake detections produce → exit 0, and the output contains `PASS  site-ppe`.
  - `test_check_fails_and_names_mismatch`: the expected `["trip:uneven_floor"]` vs a cable detection → exit 1, and the output contains `expected: trip:uneven_floor`.
  - `test_check_todo_without_expectation`: → exit 0, with the line `TODO`.
  - `test_check_fails_on_missing_font`: with one font removed → `FAIL fonts` naming that file.
  - `test_check_reports_network_attempt`: a fake backend whose `predict` calls `socket.create_connection(("example.com", 443))` → exit 1, and the output includes `tried to reach example.com:443`.
  - `test_flagged_keys`: trip keys are qualified by role and the list is sorted.
  - `test_check_from_non_ascii_root`: copy `config/`, `demo/` and `static/fonts/` to `tmp_path/"Zoë My Demo"`, load the config and photos from there, and pass `fonts_dir` → exit 0.
  - `test_cli_survives_cp1252_stdout`: monkeypatch `sys.stdout` to `io.TextIOWrapper(io.BytesIO(), encoding="cp1252")` and call a CLI path that prints "Zoë …" (`main(["check"])` with `run_check` monkeypatched to print it). It does not raise.
- [ ] **Step 2: Run** `uv run pytest tests/test_checks.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `checks.py`, and `check`/`setup` in `cli.py`.** `main` first calls `sys.stdout.reconfigure(encoding="utf-8", errors="replace")`, the same for stderr, and `configure_ultralytics(offline=True)` for every command except `build-model`.
- [ ] **Step 4: Write `README.md`'s setup part.** It covers:
  - Windows:
    1. Install the NVIDIA driver.
    2. Install Git for Windows.
    3. Install uv: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`.
    4. `git clone <remote> "My Demo"`.
    5. `cd "My Demo"`, then `uv sync`.
    6. `uv run hazard-demo setup`.
  - macOS: `curl -LsSf https://astral.sh/uv/install.sh | sh`, then `uv sync`, then `uv run hazard-demo setup`.
  - "Before presenting": run `uv run hazard-demo check` the day before and again 1 h before the demo (UI-89).
  - Dev only: `uv run --group build hazard-demo build-model` after changing a prompt word.
- [ ] **Step 5: Run** `uv run pytest -v`, then `uv run hazard-demo check` for real. Expected: tests PASS. The real check prints OK for weights, vocabulary, fonts and photos, WARN for the small stand-ins, TODO for each photo with a model time, and exits 0.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: offline check and setup commands, README setup"`

### Task 8: Windows checkpoint (the user runs this)

**Files:** none, unless a failure needs a fix. If one does, fix it in the owning task's files and add the failing case as a test there.

- [ ] **Step 1: Ask the user for the git remote URL** (e.g. a private GitHub repo they created). Then run `git remote add origin <url> && git push -u origin main`. Do not create the repo yourself.
- [ ] **Step 2: Give the user the README's Windows steps, unchanged.** Ask them to clone into a folder whose name has a space and, if possible, a non-ASCII character (e.g. `C:\Users\<them>\My Demo Zoë`). Then they paste back the full output of `uv sync` and `uv run hazard-demo setup`.
- [ ] **Step 3: Confirm in the pasted output:**
  - `OK device cuda:0 NVIDIA GeForce RTX 2060`
  - the sm_75 check is OK
  - `OK weights` (the SHA matches, so `.gitattributes` worked)
  - 6 photo lines, each with a model time
  - exit code 0

  For any FAIL, fix it, push, and have the user re-run. Record the outcome (the torch version, the CUDA build and the model times) in the Tuning log below.

---

# Phase 2: The demo screen, happy path

### Task 9: FastAPI app and the `run` command

**Files:**
- Create: `src/hazard_demo/api.py`
- Modify: `src/hazard_demo/cli.py` (`run`)
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `ModelService`, `ImageStore`, `scan_payload`, `rules.evaluate/select`, `load_photos`.
- Produces `create_app(cfg, *, backend_factory=UltralyticsBackend, store: ImageStore | None = None, photos: list[DemoPhoto] | None = None) -> FastAPI`. Its lifespan prepares every demo photo into the store (missing files are logged and listed as missing) and starts `ModelService`, with the warm-up image being the first prepared strip photo. Check-only photos are not prepared by the server.

Routes. Error bodies are always `{"error": {"kind": …, "format"?, "limit"?, "value"?, "detail"?}}`:

| Route | Response |
|---|---|
| `GET /health` | `service.health()` |
| `GET /api/config` | `{"vocabulary", "threshold_pct", "min_scene_ms", "timeout_ms", "max_findings", "max_upload_bytes": 26214400, "version": "v0.1"}` |
| `GET /api/photos` | strip photos only (`strip` true), in file order: `[{"id","scene","image": PreparedImage.to_json()}]`, or `{"id","scene","file","missing": true}` for a missing file |
| `POST /api/prepare` (multipart `file`) | `image` JSON, with the original file name in `name`. 415 for `unsupported`, 413 for `too-large`, 422 for `too-small` or `unreadable`. It reads at most `MAX_BYTES + 1` bytes. |
| `POST /api/scan` JSON `{"image_id": str, "seq": int}` | the T2 payload. 404 `unreadable` for an unknown id, 503 `not-ready`, 409 `superseded`, 500 `model-error` (with `detail` = the exception text, never a traceback; the traceback goes to the log with the image id). It runs `service.scan` via `run_in_threadpool`. |
| `GET /api/images/{id}.jpg` | `FileResponse`, `image/jpeg` |
| `/` | `StaticFiles(STATIC_DIR, html=True)`, mounted last |

A middleware adds the exact CSP (see Global Constraints) and `Cache-Control: no-cache` to every response.

Loud failures in the server window (design §6.6, UI-87):
- When the model service enters `error`, its message is printed to stderr in red (ANSI), including the path and the fix.
- At start-up, `run` prints a red line for each missing font file ("Missing font static/fonts/{file}. Re-clone the repo.") and keeps going, so the page can show its banner.

`run` has one flag, `--no-browser`.
- First it binds a test socket to `127.0.0.1:port`. On `OSError` it prints `Port {port} is already in use. Close the other copy of the demo, or change server.port in config/hazards.yaml.` to stderr and returns 1.
- Then it prints `Site Hazard Detection: http://127.0.0.1:{port}  (Ctrl+C to stop)`.
- 1 s after start it opens that URL via `webbrowser.open` in a `threading.Timer`.
- Finally it runs `uvicorn.run(app, host="127.0.0.1", port=port)`.

- [ ] **Step 1: Write the failing tests.** Use `with TestClient(create_app(cfg, backend_factory=…, store=ImageStore(tmp_path/"s"))) as c` and poll `/health` until it reports `ready`:
  - `test_health_ready_after_warmup`: `state == "ready"` and `boot_id` is 32 hex characters.
  - `test_health_error_when_weights_bad`: a factory raising `WeightsError` → `state "error"`, and the message names the path.
  - `test_csp_header_exact`: on `/`, `/health` and `/api/photos`.
  - `test_config_endpoint`: the vocabulary matches, `min_scene_ms == 1500`, `timeout_ms == 20000`, `version == "v0.1"`.
  - `test_photos_listed_with_prepared_image`: the first item has `id "site-ppe"`, `scene "Column bay"`, and an `image.url` starting with `/api/images/`.
  - `test_missing_photo_listed_as_missing`: photos include `DemoPhoto("x", tmp_path/"nope.jpg", "X")` → `{"missing": true, "file": "nope.jpg"}`, and the others are still listed.
  - `test_check_only_photos_not_listed`: a photo with `strip=False` is absent from `/api/photos`.
  - `test_prepare_upload_ok`: the response `name` is the original file name.
  - `test_prepare_heic_415`: `{"error": {"kind": "unsupported", "format": "heic"}}`.
  - `test_prepare_too_large_413`: `limit "25 MB"`.
  - `test_prepare_too_small_422`.
  - `test_scan_payload_and_seq`: `seq` is echoed, and the findings come from the fake detections.
  - `test_scan_unknown_image_404`.
  - `test_scan_before_ready_503`.
  - `test_scan_superseded_409`: a slow fake with delay .5 and 3 scans from threads, staggered by 50 ms. The middle one gets 409, and the others get 200.
  - `test_scan_model_error_500_without_traceback`: the body has no `"Traceback"`.
  - `test_image_served_as_jpeg`.
  - `test_run_warns_when_font_missing`: monkeypatch `FONTS_DIR` to an empty `tmp_path`, and stub `uvicorn.run`. stderr names each missing file.
  - `test_run_exits_when_port_busy`: hold a socket on `127.0.0.1:0`, monkeypatch `cli.load_config` to use that port, and call `main(["run","--no-browser"])`. It returns 1, and stderr contains `Port {n} is already in use`.
- [ ] **Step 2: Run** `uv run pytest tests/test_api.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `api.py` and `run`.** For now `static/index.html` can be a one-line placeholder; T10 replaces it.
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all PASS. Then manually run `uv run hazard-demo`: the browser opens `http://127.0.0.1:8765`, and `/health` reaches `ready`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: FastAPI app, scan/prepare API and run command"`

### Task 10: Frontend shell: tokens, layout, header, strip, panel frame

**Before this task:** the Impeccable design hook must be on. It was turned on on 2026-11-14 (see the handoff). The implementer reads Impeccable's `reference/craft-floor.md`.

**Files:**
- Create: `static/index.html`, `static/app.css`, `static/js/strings.js`, `static/js/api.js`, `static/js/main.js` (boot only: health polling, photo strip and header), `tests/test_static.py`

**Interfaces:**
- Consumes: `/health`, `/api/config`, `/api/photos` (T9).
- Produces:
  - **DOM hooks** used by later tasks and tests:

    | Element | Hook |
    |---|---|
    | header | `#status-dot`, `#model-label` |
    | strip | `#strip`, `button.thumb[data-photo]`, `#upload-tile` (button), `#upload-input` (hidden `input type=file accept=".jpg,.jpeg,.png,.webp"`), `#upload-msg` |
    | stage | `#stage`, `.well`, `.frame`, `#photo` (img), `.overlay` (svg), `.tags` (div) |
    | stats | `#stats` |
    | panel | `#panel h2`, `#overlay-toggle`, `#legend`, `#findings-list`, `#limits`, `#version` |
    | other | `#live` (`aria-live="polite"`), `#banner` |

  - `strings.js`: `export const S = {…}` holds every UI string, plus helpers. Every exact copy line in UI-23, 27, 30, 33, 34, 35, 42, 46, 66, 67, 68, 93, 101, 105, PM-13 and the T14 list goes here.
  - `api.js`:
    - functions: `getHealth()`, `getConfig()`, `getPhotos()`, `prepare(file, signal)`, `scan(imageId, seq, signal)`
    - each returns parsed JSON or throws `ApiError {kind, status, body}`
    - a network failure gives `kind: "server-lost"`, and an abort gives `kind: "aborted"`

Build the visual shell from `assets/approved-mockup.html` with these sections of the UI requirements applied:
- the UI-73 tokens on `:root` (plus `--conf-high: #6ccf8c`)
- the UI-2 spacing tokens
- the UI-69 type roles (`--fs-body` …, `--fs-label`, `--fs-stat`, `--fs-title`)
- the UI-3 app grid, UI-4 panel width, UI-7 header, UI-8/UI-9 strip, UI-11 stage frame, UI-41/42/46 panel frame
- the UI-82/83 `@font-face` rules with `font-display: block` and preloads
- `--stats-h` from PM-3; UI-6 DOM and focus order; UI-15 stacking order
- UI-72 case and tracking, UI-81 scrollbars, UI-97 focus ring (hivis, PM-6)

Boot behaviour:
- Poll `/health` every 500 ms until `ready`, then every 5 s.
- Header (UI-27, UI-66): `#status-dot` is a pulsing ring with "Model loading…" while loading, solid `--state-ready` with "Model active: " plus the checkpoint (in Mono) when ready, and red with "Model not loaded: {message}" on error.
- Render thumbnails (UI-67: accessible name "Scan photo: {scene}", `alt=""`, scene captions), then the Upload tile ("Upload photo", title "JPG, PNG or WebP").
- The panel shows UI-23's booting or idle message.

- [ ] **Step 1: Write the failing tests** in `tests/test_static.py`. These are file greps and need no browser.
  - `test_no_inline_scripts`: every `<script>` in `index.html` has `src` and `type="module"`, and no attribute matches `\son[a-z]+=`.
  - `test_no_external_hosts`: no file under `static/` contains `googleapis`, `gstatic`, `Plex`, `http://` or `https://`.
  - `test_fonts_preloaded`: 4 `<link rel="preload" as="font" type="font/woff2" crossorigin>`, one per `FONT_FILES` entry, and `font-display: block` appears 4 times in `app.css`.
  - `test_spacing_uses_tokens`: every `margin*|padding*|gap|row-gap|column-gap` value in `app.css` is made only of `var(--space-*|--gap-*|--gutter)`, `0`, `1px`, `3px` and `auto`. The UI-102 card padding `14px 18px 16px` and the 6px confidence gap are allowed, listed by selector in the test.
  - `test_font_sizes_use_roles`: no `font-size:` value in `app.css` contains `px`.
  - `test_strings_free_of_banned_words`: check the string literals in `strings.js` and the string values in the parsed `config/hazards.yaml` (not the keys, so `safety_vest` is fine). None may contain a case-insensitive whole-word match for the UI-59 list or the UI-58 list ("AI", "the system", "the detector", "we", "smart", "real-time", "accuracy", "safe", "compliant", "verified", "proof of concept", "dissertation"), or a `vest` not preceded by `safety `.
  - `test_no_arrow_characters`: no `→` or `↓` in `static/`.
  - `test_strings_sentence_case`: no string literal in `strings.js` is all uppercase when it is longer than 3 letters.
- [ ] **Step 2: Run** `uv run pytest tests/test_static.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement the shell.**
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: PASS. Then start `uv run hazard-demo` and look at 1366×768 and 1920×1080 in Chrome. The header, strip and empty panel should match the mockup's chrome, with no page scroll. Fix any detector-hook findings.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: frontend shell with tokens, layout, header and photo strip"`

### Task 11: Pure JS modules (format, placement, state), with node tests

**Files:**
- Create: `static/js/format.js`, `static/js/placement.js`, `static/js/state.js`, `tests/js/format.test.mjs`, `tests/js/placement.test.mjs`, `tests/js/state.test.mjs`

**Interfaces (all DOM-free ES modules):**
- `format.js`:
  - `formatModelTime(ms) -> {value, unit}`: round to whole ms first. Under 1000 → `{value: "48", unit: "ms"}`. Under 10000 → seconds with `toFixed(2)`. Otherwise seconds with `toFixed(1)`.
  - `spokenTime(ms) -> string`: "48 milliseconds" / "1.24 seconds".
  - `countPhrase(n)`: "No hazards flagged" / "1 hazard flagged" / "2 hazards flagged".
  - `hiddenLine(n)`: for 1, "1 more hazard was flagged in this photo but is not shown."; otherwise "{n} more hazards were flagged in this photo but are not shown."
  - `displayName(fileName)`: drops the extension.
  - `splitMiddle(name, keep = 10) -> [head, tail]`: by code points. The tail is the last `keep`.
  - `sentenceCase(word)`, `orList(words)`: "cable, debris or uneven floor".
- `placement.js`: `placeTags(frame: {w, h}, items: [{id, box: {x, y, w, h}, sizes: {full, short, badge}: {w, h}}], opts?) -> [{id, form, x, y, side, leader: {points: [[x,y], …]} | null}]`. It implements UI-17, UI-18 and UI-19 exactly:
  - the leader is 24 px, or 16 px when `frame.w < 600`
  - 8 px inset, 8 px tag gap
  - candidates in the order right, left, above, below, then the inside corner when the tag covers ≤ 25% of the box
  - forms are tried full → short → badge
  - the leader is null when the gap is under 12 px
  - it is deterministic
- `state.js`: `initialState` and `reduce(state, event) -> {state, effects}`.
  - State fields: `{app, modelReady, bootId, photoKey, image, name, seq, pending, cached, error, prev}`.
  - Events:
    - `{type: "health", health}`, `{type: "healthFailed"}`
    - `{type: "pick", key, image, name, cachedResult?}`, `{type: "rescan"}`
    - `{type: "upload", name}`, `{type: "prepared", key, image, name}`, `{type: "prepareFailed", error}`
    - `{type: "response", seq, payload}`, `{type: "failed", seq, error}`, `{type: "timeout", seq}`
  - Effects (objects with a `type`): `showPhoto`, `clear`, `scan {imageId, seq}`, `abort`, `prepare`, `reveal`, `showCached`, `showEmpty`, `showError`, `clearCache`.

- [ ] **Step 1: Write the failing tests.**
  - `format.test.mjs`:
    - `formatModelTime(48.4)` → `{"48","ms"}`, `999.6` → `{"1.00","s"}`, `1240` → `{"1.24","s"}`, `12345` → `{"12.3","s"}`
    - `spokenTime(48) === "48 milliseconds"`
    - `countPhrase` for 0, 1 and 3
    - `hiddenLine` for 1 and 2
    - `displayName("IMG-20241102-WA0042 site visit.jpeg") === "IMG-20241102-WA0042 site visit"`
    - `splitMiddle` on a 120-character name with emoji and Arabic, where the tail is exactly the last 10 code points and `head + tail === name`
    - `orList` for 1, 2 and 3 words
  - `placement.test.mjs`, with sizes `full {150,52}`, `short {140,30}`, `badge {28,28}`:
    - a single centred box gets `side "right"`, `form "full"`
    - a box touching the right edge goes `"left"`
    - an 85% box gets a placement fully inside the 8 px inset
    - the UI-18 fixture (5 boxes: two overlapping, one on each frame edge, one covering 85%) on frames 701×526, 394×526 and 617×347: no two tag rectangles come within 8 px of each other, all stay inside the inset, and each non-null leader starts on its box's border
    - placement is deterministic (deep equal across two calls)
    - a frame under 600 px wide uses a 16 px leader gap
  - `state.test.mjs`, one test per row:

| From | Event | To | Effects |
|---|---|---|---|
| booting | health loading | warming | — |
| warming | health ready | idle (`modelReady`) | — |
| booting | health error | boot-error | — |
| warming | pick A | waiting (`pending=A`) | showPhoto |
| waiting | pick B | waiting (`pending=B`) | showPhoto |
| waiting | health ready | scanning, seq 1 | clear, scan(B) |
| idle | pick A | scanning, seq 1 | clear, showPhoto, scan |
| scanning A/1 | pick B | scanning, seq 2 | abort, clear, showPhoto, scan |
| scanning A | pick A | unchanged | none |
| scanning seq 2 | response seq 1 | unchanged | none |
| scanning seq 2 | response seq 2, ≥ 1 finding | result | reveal |
| scanning | response, 0 findings | empty | showEmpty |
| scanning | failed model-error | error | showError |
| scanning seq 2 | timeout seq 2 | error (`kind "timeout"`) | abort, showError |
| result A | pick A | scanning (a re-scan) | clear, scan |
| idle | pick with cachedResult | result (`cached`) | clear, showPhoto, showCached |
| result | rescan | scanning | clear, scan |
| result | healthFailed | server-lost (`prev "result"`) | — |
| server-lost | health ready, same bootId | prev if result/empty, else idle | — |
| server-lost | health ready, new bootId | idle | clearCache, clear |
| idle | upload | preparing | prepare |
| preparing | prepared, modelReady | scanning | showPhoto, scan |
| preparing | prepared, not ready | waiting | showPhoto |
| preparing | prepareFailed | error | showError |
| idle | prepared (not preparing) | unchanged | none |
| boot-error | health ready | idle | — |

- [ ] **Step 2: Run** `node --test tests/js/`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Run** `node --test tests/js/`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add static/js tests/js && git commit -m "feat: format helpers, tag placement and app state reducer"`

### Task 12: Scan flow and stage: scene, boxes, leaders, tags, reveal

**Files:**
- Create: `static/js/stage.js`, `tests/ui/conftest.py`, `tests/ui/markers.py`, `tests/ui/test_stage.py`
- Modify: `static/js/main.js` (the controller: dispatch → reduce → effects), `static/app.css`

**Interfaces:**
- Consumes: `reduce` (T11), `placeTags` (T11), `api.scan` (T10), the payload (T2).
- Produces (`stage.js`):
  - `showPhoto(image, alt) -> Promise<void>`: set `src`, run `decode()`, set `--ar`, and check that `image.width/height` matches the natural size within 1%. If it doesn't, throw `Error("size-mismatch")`, which the controller turns into `error`.
  - `clearOverlays()`.
  - `startScene({passMs}) -> {finish(): Promise<void>, cancel()}`. `finish()` resolves at the end of the first pass if that hasn't finished yet. Otherwise it completes the remaining distance in ≤ 150 ms with ease-out. Either way it then fades the dim and grid out over 150 ms.
  - `drawOverlays(findings, {animate: bool})`.
  - `setOverlaysVisible(bool)`.
  - `highlight(id | null)`.
  - Rendered markup: boxes `[data-box="01"]`, tags `[data-tag="01"]`, and performance marks `scan-start`, `scene-end` and `first-box`.
- Produces (`tests/ui`), for T13, T14, T16 and T17:
  - `served_app(cfg_overrides, backend_factory)`: a fixture that runs uvicorn in a thread on a free port with `create_app(...)` and yields the base URL.
  - `page_at(viewport)`: a Playwright fixture with `channel="chrome"`.
  - `MarkerBackend`: a fake backend that finds solid colour rectangles (within ±40 per channel) and returns them as detections. Red `(230,30,30)` = person .91, blue `(30,30,230)` = staircase .81, green `(30,200,30)` = cable .64, magenta `(200,30,200)` = pile .77.
  - `marker_photo(path, size, rects, exif_orientation=None)`.

Drawing rules:
- One `<svg class="overlay">` sized to the frame's CSS px. For each box, compute the px rect from `box_norm × frame size`.
- The stroke is 3 px and sits inside the box (inset 1.5 px). Red uses `stroke-dasharray: 8 4` with `--sev-high-fill`. Amber uses `3 3` with `--sev-med`.
- A 1 px keyline outside the box in `rgba(0,0,0,.55)`. No fill. Draw the largest area first. Minimum 16×16 px. When two boxes of different types have IoU ≥ 0.9, inset the later one by 4 px (UI-14).
- Tags are HTML in `.tags`. Measure the full, short and badge forms off-screen (`visibility: hidden`), pass the sizes to `placeTags`, and draw leaders from `placement.leader.points` with a 7 px dot (UI-16, UI-19, UI-70, PM-11a). Use `textContent` only.
- A `ResizeObserver` on the frame re-runs placement once per animation frame, with no transitions (UI-13).
- Scene look: UI-29. The "Scanning for …" line comes from `config.vocabulary`, using `stats.js` once it exists. Until T13, write it into `#stats` directly. After 5 s it appends " · {n} s", updated each second (UI-30).
- Main photo alt (UI-67): "{scene}, site photo" or "{name}, uploaded photo". Each box `<g>` gets `role="img"` and the UI-68 accessible name: "Hazard 01, No PPE: No hard hat or safety vest. Person 91%." 
- Reveal timing: UI-91 and UI-92. The stagger is `min(300, 1500/N)` ms. Box n wipes in over 240 ms with `clip-path: inset(0 100% 0 0)` → `inset(0)`. Its leader and tag fade in over 120 ms. Card n fades and rises 8 px over 200 ms (T13 adds cards).
- The controller adds a 20 s timeout using an `AbortController`, and fires the `timeout` event.

- [ ] **Step 1: Write the failing Playwright tests** (`pytestmark = pytest.mark.ui`; `pytest.importorskip("playwright")` in conftest):
  - `test_no_page_scroll[vp-aspect]`: for 1366×768, 1536×864 and 1920×1080 × 4:3 (4032×3024), 3:4 and 16:9 marker photos, uploaded via `#upload-input`. After the reveal, `scrollHeight == innerHeight` and `scrollWidth == innerWidth`.
  - `test_boxes_align_with_markers[vp-aspect]`, the same matrix plus `exif6` (a 4032×3024 marker photo saved with orientation 6): each `[data-box]` rect's screen edges are within 1 px of the marker's edges, mapped through the image's rendered rect.
  - `test_scene_lasts_one_pass`: a fast backend → `first-box − scan-start` is between 1500 and 1500+200+100 ms.
  - `test_slow_response_extends_scene`: with backend delay 2.2 s, `first-box − scan-start ≤ 2200 + 150 + 200 + 150 + 100` ms, and the sweep is still visible at 1.8 s.
  - `test_scan_line_lists_vocabulary`: during the scene, `#stats` text starts with "Scanning for person, hard hat, safety vest," and ends with "…".
  - `test_tag_text_format`: a person marker → `[data-tag="01"]` text contains "01 No PPE" and "Person 91%".
- [ ] **Step 2: Run** `uv run --group ui pytest -m ui tests/ui/test_stage.py -v`. Playwright drives the installed Chrome (`channel="chrome"`), so no browser download is needed. Expected: FAIL.
- [ ] **Step 3: Implement `stage.js` and the `main.js` controller.**
- [ ] **Step 4: Run** the same command. Expected: PASS. Then check by eye at 1366×768 that a demo photo scans like the approved mockup.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: scan scene, dashed boxes, tags and reveal"`

### Task 13: Finding cards and the stats row

**Files:**
- Create: `static/js/cards.js`, `static/js/stats.js`, `tests/ui/test_panel.py`
- Modify: `static/js/main.js`, `static/app.css`

**Interfaces:**
- Consumes: the payload (T2), `format.js` (T11), `stage.highlight` (T12).
- Produces:
  - `cards.js`: `renderCards(findings, hiddenCount, {animate})`, `renderPanelMessage(text)` and `renderEmpty(payload)` (used in T14). Cards are `[data-card="01"]`.
  - `stats.js`: `renderStats({findings, modelMs, photoName, cached})`, `renderScanLine(vocabulary)`, `renderErrorBar(...)` (used in T14), `clearStats()`, and `fitStats()` for the give-way.

Card anatomy is exactly UI-102 through UI-105. Copy the `.cd2` rules from `assets/approved-cards.html` onto the real tokens.
- Top row: "01" in Mono 600, `--ink-2`, then an 8 px gap and the category in Next 700, uppercase, +0.06em, in severity ink. On the right, "Confidence" at meta size, a 6 px gap, then the % in Mono 600, coloured by `finding.grade`.
- Title: the server's `title`.
- Chips:
  - found: `{Sentence-case item} <b>found</b> · <span class="m">{pct}%</span>`
  - missing: `{Item} <b>missing</b>`
  - Styles follow UI-54's table: neutral for context and safeguard; for evidence found, the severity tint and border; for a missing safeguard, transparent with a severity border.
- If `hiddenCount > 0`, add a `hiddenLine(n)` paragraph after the last card.
- Cards are focusable (`tabindex="0"`) and come last in the tab order (UI-6).

Linking (UI-20): hovering or focusing a card calls `highlight(id)`. Hovering a box or tag adds the card's 3 px inset bar and scrolls it into view with `block: "nearest"`. Everything else dims to 35% over 120 ms.

Stats row: UI-36 to UI-40, using PM-2's order.
- Tiles: "Hazards flagged" (the shown count), one tile per category (the shown count, with a 24×4 px line sample in the box's dash), "Model time" (from `formatModelTime`; the unit at label size after a no-break space), and "Photo" (the scene name, or the uploaded name middle-truncated via `splitMiddle`, with `title` holding the full name).
- `fitStats()`: if `scrollWidth > clientWidth`, first merge the categories into one "Categories" tile, then hide the Photo tile.
- The live region says "Scan complete. {countPhrase}. Model time {spokenTime}." (UI-68).

- [ ] **Step 1: Write the failing Playwright tests:**
  - `test_three_cards_fit[1366x768, 1366x633]`: a fixture photo with a person (no PPE, 3 chips), a cable, a pile and a staircase gives 3 cards plus "1 more hazard was flagged in this photo but is not shown.". `#findings-list` `scrollHeight <= clientHeight`.
  - `test_card_order_and_numbers`: the cards read 01 "Staircase without a railing", 02 "No hard hat or safety vest", 03 "Cable on the floor". The tags and boxes use the same numbers.
  - `test_confidence_grade_colours`: 91% → computed colour `rgb(108, 207, 140)`. A 52% fixture → `--ink-1`. A 33% fixture → `--ink-2`.
  - `test_headline_equals_chip_and_tag`: the card %, the anchor chip % and the tag % are equal.
  - `test_no_text_below_14px[1366x768, 1093x560]`: walk every text node; each computed font size is ≥ 14.
  - `test_stats_row_fits[1366x768, 1366x605][2cats, 4cats]`: `scrollWidth <= clientWidth`, and the row's height equals `--stats-h`.
  - `test_hover_card_highlights_box`: on hover, the other boxes' opacity is 0.35.
  - `test_live_region_announces`: the text matches `^Scan complete\. \d hazards? flagged\. Model time \d+ milliseconds\.$`.
- [ ] **Step 2: Run** `uv run --group ui pytest -m ui tests/ui/test_panel.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `cards.js`, `stats.js` and the wiring.**
- [ ] **Step 4: Run** `uv run --group ui pytest -m ui -v` and `uv run pytest -v`. Expected: PASS. Compare a card by eye against `approved-cards.html`'s "After" panel at 1366×768.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: finding cards, stats row and live announcement"`

---

# Phase 3: States that can happen on stage

### Task 14: Loading, waiting, empty, errors, upload, mid-scan clicks, server lost

**Files:**
- Modify: `static/js/main.js`, `static/js/cards.js`, `static/js/stats.js`, `static/js/stage.js`, `static/js/strings.js`, `static/app.css`
- Test: `tests/ui/test_states.py`

**Interfaces:**
- Consumes: the reducer effects (T11), the error kinds from T9.
- Produces: no new modules. Each UI-23 state renders.

Copy to add to `strings.js`, exactly. Anything not listed comes from the UI requirements IDs given here.
- Waiting stage (PM-13): "Model is loading. This photo will scan when it's ready." Thumbnail title while loading: "Scans when the model is ready".
- Loading after 45 s: "Model loading… still loading, check the server window".
- Boot-error stage: "The model didn't load, so photos can't be scanned. Restart the app; setup steps are in the README." Below it, the health `message` (which carries the path and the fix command). Thumbnails are disabled.
- Server lost: label "Model offline". Stage: "Can't reach the detection server. Is its window still open?"
- Preparing: "Opening {name}…".
- Upload errors (UI-33, PM-8):
  - HEIC: "Can't open {name}: HEIC photos aren't supported. Save it as JPG and upload it again."
  - Other type: "Can't open {name}. Choose a JPG, PNG or WebP photo."
  - Bytes: "Can't open {name}: the file is {value}; the limit is {limit}."
  - Pixels: "Can't open {name}: the photo is {value}; the limit is {limit}."
  - Too small: "Can't open {name}: its shortest side is {value}; the minimum is {limit}."
  - Unreadable: "This file couldn't be read as a photo."
- Scan error and timeout: the UI-35 strings, with the "Scan again" button. The panel shows "No results for this photo".
- Empty (UI-34, PM-7), in order:
  1. heading "No hazards flagged"
  2. the objects sentence, "Objects found: Staircase 84%, Railing 71%. No rule matched them.", or "No object scored above 25%, so no rule could run."
  3. "Checked:", then one line per rule: "{check_label}: {orList(anchor_items)} found, not flagged" when `anchor_found`, otherwise "{check_label}: no {orList(anchor_items)} found"
  4. "Only 5 hazard checks run, so this is not a safety sign-off."
- Client-side size rejection: show the inline message in `#upload-msg` for 8 s and leave the current result untouched. Server-side rejections enter `error`.
- While preparing, the Upload tile is busy and disabled, but thumbnails stay clickable. If preparing takes more than 10 s, abort and enter `error` with the unreadable message (UI-33).
- When `boot_id` changes, the `clearCache` effect also drops the uploaded slot, because the server's image store was cleared.
- Dropping a file anywhere on the window is swallowed (`dragover`/`drop` `preventDefault`).
- The uploaded photo takes one thumbnail slot before the Upload tile, and a later upload replaces it. Its caption is the display name, middle-truncated.

- [ ] **Step 1: Write the failing Playwright tests:**
  - `test_pick_before_ready_waits_then_scans`: the factory sleeps 3 s. Click a thumbnail: the stage text shows the waiting copy, then a scan runs automatically, and boxes appear.
  - `test_last_click_wins`: with a 1 s backend delay, click A, then B after 200 ms. After the reveal, `#photo` src is B's and only B's boxes are drawn. No request with A's seq is rendered.
  - `test_click_active_mid_scan_does_nothing`: a single scan request is sent.
  - `test_empty_state_copy`: a photo with only a railing marker. The panel contains "No hazards flagged", "Objects found:", 5 "Checked" lines and the sign-off line. There is no green, and the overlay toggle is hidden.
  - `test_upload_heic_shows_message`: the error bar text starts with "Can't open" and contains "HEIC photos aren't supported".
  - `test_upload_too_large_kept_client_side`: a 26 MB file → the `#upload-msg` text is visible, the existing cards are still present, and no request is made to `/api/prepare`.
  - `test_scan_error_bar_and_retry`: a failing backend → "Scan failed." and "Scan again". Clicking it re-scans.
  - `test_timeout_error`: with `timeout_ms: 2000` and a 3 s backend delay → "Scan stopped: no result after 2 s."
  - `test_boot_error_state`: the factory raises `WeightsError` → the label starts "Model not loaded:", the stage shows the boot-error copy, and the thumbnails are disabled.
  - `test_server_lost_then_recovers`: after the result, stop the uvicorn server. Within 6 s the label reads "Model offline". Restart on the same port with the same `boot_id`: within 6 s the label is "Model active: …" and the cards are still shown.
  - `test_upload_name_rendered_as_text`: upload `"<img src=x onerror=alert(1)>.jpg"`. The caption shows the literal text, and no `img[src=x]` exists.
- [ ] **Step 2: Run** `uv run --group ui pytest -m ui tests/ui/test_states.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement the states.**
- [ ] **Step 4: Run** `uv run --group ui pytest -m ui -v` and `uv run pytest -v`. Expected: all PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: on-stage states, upload errors and recovery"`

---

# Phase 4: Tuning

### Task 15: Tune on the real demo photos

**Needs from the user:** the handpicked photos (≥ 1600 px on the long edge) in `demo/incoming/`, with `demo/incoming/notes.txt` giving `file | scene name | should flag` per line. The handoff's "Photos" section has the brief the user was given.

**Files:**
- Modify: `demo/photos/*`, `demo/photos.json`, `demo/expected.json`, `config/hazards.yaml`, this plan's Tuning log. Also `models/*` and the glossary in `strings.js`/tests, if a prompt word changes.

- [ ] **Step 1: Replace the stand-ins** with the user's photos. Then write `photos.json` and `expected.json` from the user's answers.
  - The strip holds 7 photos: the five hazard photos (photo 1 is the warm-up photo, so make it a typical one), then "staircase with a railing", then "person in a hard hat and safety vest".
  - Every other no-hazard photo gets `"strip": false`.
  - Every no-hazard photo gets `[]` in `expected.json`, so `check` fails on any false alarm.
  - Keep the best candidate per row in the strip. Spares stay out of `demo/` unless they're needed as a replacement.
  - Candidates come from `demo/incoming/` (the user's) and `demo/incoming/web/` (from the internet, with `SOURCES.md`). Every internet photo copied into `demo/photos/` gets its source, author and licence row in `demo/photos/CREDITS.md`.
- [ ] **Step 2: Run** `uv run hazard-demo check` on the Mac and record each FAIL in the Tuning log.
- [ ] **Step 3: Fix each FAIL in the design §6.3 order, re-running `check` after each change:**
  1. thresholds and geometry in `hazards.yaml`
  2. a different prompt word (change `prompts`, the titles, `check_label`, the banned-word list in `tests/test_static.py` and any glossary strings together; then run `uv run --group build hazard-demo build-model` and commit the model and its `.sha256`)
  3. the YOLOE-11-S fallback (extend `build_model` for a `yoloe` base: `YOLOE(base)`, `set_classes(names, model.get_text_pe(names))`; set `model.file`/`base` in config)
  4. ask the user to replace the photo

  A fix counts only if every no-hazard photo still flags nothing. Drop `uneven_floor` if it misfires (R17). Then update the limits line and the trip titles as well.
- [ ] **Step 4: Run** `uv run pytest -v` and `uv run --group ui pytest -m ui -v`. Expected: PASS. Then run `check` → all PASS, exit 0.
- [ ] **Step 5: Commit and push**, then have the user run `uv run hazard-demo check` on Windows. Expected: all PASS. Record the Windows model times.

---

# Phase 5: Everything else

### Task 16: Keyboard, overlay toggle, revisit cache, reduced motion, font banner, missing photo

**Files:**
- Create: `static/js/keys.js`, `static/js/fonts.js`, `tests/ui/test_extras.py`
- Modify: `static/js/main.js`, `static/js/stage.js`, `static/js/stats.js`, `static/js/strings.js`, `static/app.css`

**Interfaces:**
- `keys.js`: `bindKeys({next, prev, rescan, toggle})`.
  - → and PageDown run `next`, ← and PageUp run `prev`. Neither wraps, and neither ever reaches the upload slot or the Upload tile.
  - R runs `rescan`, H runs `toggle`.
  - F5 (without modifiers), Esc, B and "." are swallowed. F11 passes through, and so does any key with Ctrl, Alt or Meta (UI-94 to UI-96).
- `fonts.js`: `checkFonts() -> Promise<string[]>`. It returns the failed families after `document.fonts.ready`, by calling `load()` on every FontFace (UI-85).

Behaviour:
- **Overlay toggle** (UI-21, PM-9): `#overlay-toggle` with `aria-pressed`, reading "Hide boxes" / "Show boxes". It is visible only in `result` and resets to shown on every reveal. The fade is 150 ms.
- **Revisit cache** (UI-31): a `Map` from photo key to payload, cleared when `boot_id` changes. Errors and uploads are never cached. A cached result appears with a 200 ms fade; the Model time key reads "Model time, earlier run".
- **Reduced motion** (UI-93): the scene is static. The reveal is opacity-only and ≤ 150 ms. The dot doesn't pulse. A dismissible notice in `idle` reads "Reduced motion is on: the scan sweep won't play".
- **Font banner:** "Font failed to load: {family}. Expected file: static/fonts/{file}". One click dismisses it.
- **Missing demo photo** (UI-88): a broken tile with the file name and "Missing file". It is not clickable.

- [ ] **Step 1: Write the failing Playwright tests:**
  - `test_arrow_keys_navigate_without_wrap`: from the last photo, → stays put, and the file chooser never opens.
  - `test_r_rescans_with_full_scene`: a second `scan-start` mark, and the scene lasts ≥ 1500 ms.
  - `test_h_toggles_overlays`: `aria-pressed` flips and the boxes' opacity goes to 0.
  - `test_revisit_shows_cached`: A, then B, then A → no new scan request, and the text includes "earlier run".
  - `test_reduced_motion_static_sweep`: with `reduced_motion="reduce"`, the band's `transform` is unchanged at 0.5 s and 1.2 s, and the scene still lasts ≥ 1500 ms.
  - `test_font_banner_when_font_missing`: `page.route` returns 404 for `barlow-condensed-latin-700.woff2` → the banner names "Barlow Condensed".
  - `test_clicker_keys_swallowed`: F5, Esc, B and "." don't reload the page or change state.
  - `test_missing_photo_tile`: the tile shows "Missing file", and the other thumbnails still scan.
- [ ] **Step 2: Run** `uv run --group ui pytest -m ui tests/ui/test_extras.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full suites (`uv run pytest -v`, `node --test tests/js/`, `uv run --group ui pytest -m ui -v`). Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: keyboard and clicker keys, toggle, revisit cache, reduced motion"`

### Task 17: Screenshot matrix, README final, polish and critique

**Files:**
- Create: `tests/ui/test_matrix.py` (it writes PNGs to `artifacts/screens/`, which is gitignored)
- Modify: `README.md`, plus whatever polish touches

- [ ] **Step 1: Write `test_matrix.py`:**
  - For every UI-1 viewport × the 3 aspects, in `result`: no page scroll and no text under 14 px. Save `artifacts/screens/{vp}-{aspect}.png`.
  - At 1366×768: one screenshot for each UI-23 state.
  - A greyscale screenshot (`filter: grayscale(1)`) of a red-plus-amber result, for the UI-80 check.
  - `test_banned_words_in_dom_every_state`: the UI-59 list against `document.body.innerText`.
  - `test_removals_absent` (UI-98): `app.css` and `index.html` contain none of `0 0 0 3px`, `--faint`, `--muted`, `#17191c`, `Human negligence` or `confidence</`. The computed `object-fit` of `#photo` is `contain`.
  - `test_no_offsite_requests`: record every request URL across one full session. All are `http://127.0.0.1:*`.
- [ ] **Step 2: Run** `uv run --group ui pytest -m ui tests/ui/test_matrix.py -v`. Expected: PASS. Look through the PNGs and fix anything visibly off.
- [ ] **Step 3: Finish the README:** the run command, F11 in Chrome or Edge (UI-10, R19), the keyboard and clicker keys, the "Before presenting" checklist (run `check` the day before and 1 h before, Wi-Fi off), troubleshooting (a busy port, the CUDA FAIL block, a weights mismatch → `git checkout -- models/`), and how to swap photos (T15).
- [ ] **Step 4: Run `/impeccable polish`** on `static/`, then **`/impeccable critique`**. The baseline is 19/40. Fix what they raise within the spec. Re-run all three suites.
- [ ] **Step 5: Commit** `git add -A && git commit -m "chore: screenshot matrix, README and polish pass"`, then push, and have the user run `check` once more on Windows.

---

## Tuning log

| Date | Photo | Change | Before → after | Machine |
|---|---|---|---|---|
| | | | | |
