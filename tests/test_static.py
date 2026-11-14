"""File checks on the served page: no inline script, nothing off-site, bundled fonts, spacing tokens, copy rules."""

import re
from pathlib import Path

import yaml

from hazard_demo.config import load_config
from hazard_demo.paths import CONFIG_PATH, FONT_FILES, STATIC_DIR

INDEX = STATIC_DIR / "index.html"
CSS = STATIC_DIR / "app.css"
STRINGS = STATIC_DIR / "js" / "strings.js"
SVG_NS = "http://www.w3.org/2000/svg"   # an identifier for createElementNS, never fetched

# Selectors whose UI-102/UI-103 values are spec-mandated (§8 beats UI-2's general rule).
SPACING_EXCEPTIONS = {
    (".card", "padding"): "14px 18px 16px",
    (".card-conf", "gap"): "6px",
    (".card-title", "margin"): "6px 0 12px",
    (".chip", "padding"): "4px 10px",
}
SPACING_PROPS = re.compile(r"^(margin(-[a-z-]+)?|padding(-[a-z-]+)?|gap|row-gap|column-gap)$")
SPACING_PART = re.compile(r"^(var\(--(space-\d+|gap-[a-z]+|gutter)\)|0|1px|3px|auto)$")

BANNED = ["helmet", "hi-vis", "safety vest", "floor opening", "rubble", "handrail", "guardrail", "workers?", "negligence", "detected", "probability",
          "findings?", "AI", "the system", "the detector", "we", "smart", "real-time", "accuracy", "safe",
          "compliant", "verified", "proof of concept", "dissertation"]


def served_files() -> list[Path]:
    return [p for p in STATIC_DIR.rglob("*") if p.suffix in {".html", ".css", ".js"}]


def css_rules(text: str) -> list[tuple[str, str, str]]:
    """(selector, property, value) for every declaration in the innermost blocks."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    rules = []
    for block in re.finditer(r"([^{}]+)\{([^{}]*)\}", text):
        selector = " ".join(block.group(1).split())
        for decl in block.group(2).split(";"):
            if ":" in decl:
                prop, value = decl.split(":", 1)
                rules.append((selector, prop.strip(), " ".join(value.split())))
    return rules


def js_string_literals(text: str) -> list[str]:
    """String literals in a JS file, with comments skipped and ${…} holes in template literals blanked."""
    token = re.compile(r"//[^\n]*|/\*.*?\*/|\"((?:[^\"\\\n]|\\.)*)\"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`",
                       re.S)
    out = []
    for m in token.finditer(text):
        if m.group(1) is not None or m.group(2) is not None:
            out.append(m.group(1) if m.group(1) is not None else m.group(2))
        elif m.group(3) is not None:
            out.append(re.sub(r"\$\{[^}]*\}", " ", m.group(3)))
    return out


def yaml_string_values(node) -> list[str]:
    if isinstance(node, dict):
        return [s for value in node.values() for s in yaml_string_values(value)]
    if isinstance(node, list):
        return [s for value in node for s in yaml_string_values(value)]
    return [node] if isinstance(node, str) else []


def test_no_inline_scripts():
    html = INDEX.read_text(encoding="utf-8")
    scripts = re.findall(r"<script\b([^>]*)>", html, flags=re.I)
    assert scripts, "the page loads its modules with <script type=module src=…>"
    for attrs in scripts:
        assert re.search(r'\bsrc="[^"]+"', attrs) and 'type="module"' in attrs, attrs
    assert not re.search(r"\son[a-z]+=", html, flags=re.I)


def test_no_external_hosts():
    for path in served_files():
        text = path.read_text(encoding="utf-8").replace(SVG_NS, "")
        for needle in ("googleapis", "gstatic", "Plex", "http://", "https://"):
            assert needle not in text, f"{path.relative_to(STATIC_DIR)} contains {needle}"


def test_fonts_preloaded():
    html = INDEX.read_text(encoding="utf-8")
    links = re.findall(r"<link\b[^>]*>", html)
    preloads = [link for link in links if 'rel="preload"' in link]
    assert len(preloads) == 4
    for name in FONT_FILES:
        match = [link for link in preloads if f'href="/fonts/{name}"' in link]
        assert len(match) == 1, name
        assert all(attr in match[0] for attr in ('as="font"', 'type="font/woff2"', " crossorigin"))
    css = CSS.read_text(encoding="utf-8")
    assert css.count("font-display: block") == 4
    for name in FONT_FILES:
        assert f'url("/fonts/{name}")' in css


def test_spacing_uses_tokens():
    bad = []
    for selector, prop, value in css_rules(CSS.read_text(encoding="utf-8")):
        if not SPACING_PROPS.match(prop):
            continue
        if SPACING_EXCEPTIONS.get((selector, prop)) == value:
            continue
        if not all(SPACING_PART.match(part) for part in value.split()):
            bad.append(f"{selector} {{ {prop}: {value} }}")
    assert not bad, bad


def test_font_sizes_use_roles():
    sizes = [(s, v) for s, p, v in css_rules(CSS.read_text(encoding="utf-8")) if p == "font-size"]
    assert sizes
    assert not [(s, v) for s, v in sizes if "px" in v]


def test_strings_free_of_banned_words():
    prompts = set(load_config().vocabulary)   # PM-16: a prompt word is always allowed on screen
    banned = [w for w in BANNED if w not in prompts]
    pattern = re.compile(r"\b(" + "|".join(banned) + r")\b|(?<!high-visibility )\bvest\b", re.I)
    texts = js_string_literals(STRINGS.read_text(encoding="utf-8"))
    texts += yaml_string_values(yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")))
    hits = [(t, m.group(0)) for t in texts for m in [pattern.search(t)] if m]
    assert not hits, hits


def test_no_arrow_characters():
    for path in STATIC_DIR.rglob("*"):
        if path.is_file() and path.suffix != ".woff2":
            text = path.read_text(encoding="utf-8")
            assert "→" not in text and "↓" not in text, path


def test_strings_sentence_case():
    shouting = [s for s in js_string_literals(STRINGS.read_text(encoding="utf-8"))
                if sum(c.isalpha() for c in s) > 3 and s == s.upper()]
    assert not shouting, shouting
