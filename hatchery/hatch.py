#!/usr/bin/env python3
"""Offline Fly generator. Runs on Nimrod's machine.

Usage:
  python hatch.py --n 20
  python hatch.py --n 6  --category tools
  python hatch.py --n 1  --dry-run

Writes valid Flies to /docs/flies/<id>/index.html, appends to manifest.json.
Invalid Flies go to /hatchery/_quarantine/ with a reason logged.

Env:
  ANTHROPIC_API_KEY  — required unless --dry-run
  FLY_MODEL          — defaults to claude-opus-4-7
"""

import argparse
import hashlib
import json
import os
import random
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from inject_sdk import inject_sdk_into_html
from validate import validate_fly

HERE = Path(__file__).parent
DOCS = HERE.parent / "docs"
FLIES_DIR = DOCS / "flies"
MANIFEST_PATH = DOCS / "manifest.json"
SDK_PATH = DOCS / "app" / "sdk" / "fly-sdk.js"
PROMPTS_DIR = HERE / "prompts"
QUARANTINE = HERE / "_quarantine"

SYSTEM_PROMPT = """\
You generate a Fly: a single self-contained HTML file that renders a tiny
interactive toy, tool, or visual. It will be served in a sandboxed iframe at
~390×800 portrait. The product is called Flying Apps; each Fly should feel
light, airy, and tasteful — not loud or attention-grabby.

ABSOLUTE RULES:
- Output ONE valid HTML5 document. No markdown, no explanation, no code fences —
  start with <!doctype html> and end with </html>.
- Inline ALL CSS and JS. ZERO external network requests. No <link rel="stylesheet">,
  no external scripts, no fetch, no CDN, no fonts, no images.
- Set <title> to a short lowercase title (e.g. "Tide Clock"). Add a meta tag:
    <meta name="fly:tags" content="t1,t2,t3">
  with 2–4 lowercase tags.
- Portrait single-viewport: no horizontal scroll, responsive. Don't assume desktop.
- A SMALL interactive: a toy, a single tool, or a visual. Not a "full app".
- No autoplaying audio. If you must use audio, gate it behind an explicit in-Fly toggle.
- Listen for window event "fly:pause" — when it fires, stop all timers/animations/audio.
- Listen for window event "fly:active" — when it fires, resume.
- The Fly SDK exposes window.Fly with these methods you should CALL where appropriate:
    window.Fly.interaction(kindString)  — call on every meaningful user action
    window.Fly.complete()               — call when the Fly reaches a natural end state
    window.Fly.catch()                  — call only if you have an in-Fly "save this" affordance
  Don't define window.Fly yourself — the hatchery injects it. Just call it.

VIBE (LIGHT, AIRY, WEIGHTLESS):
- bg: linear-gradient(180deg, #EAF1F6, #F7FAFC) — or a related soft palette
- ink #1A2330, muted #8B97A6, accent #2BB6A3 (teal), secondary #2D7DD2
- Type: system sans (-apple-system, system-ui, sans-serif), light/regular weights,
  modest letter-spacing on labels, lowercase chrome.
- Generous whitespace. Soft shadows. Small radius (12–22px). Subtle motion only.

Title metadata you MUST emit:
  <title>...</title>
  <meta name="fly:tags" content="t1,t2,t3">
"""

USER_TEMPLATE = """\
Category: {category}
Idea: {idea_title} — {idea_description}
Suggested tags: {tags}

Produce the Fly now. Output only the HTML.
"""


# ---- prompt bank ---------------------------------------------------------

def load_prompts():
    bank = {}
    for f in sorted(PROMPTS_DIR.glob("*.json")):
        bank[f.stem] = json.loads(f.read_text(encoding="utf-8"))
    if not bank:
        raise SystemExit(f"no prompts in {PROMPTS_DIR}")
    return bank


# ---- manifest ------------------------------------------------------------

def load_manifest():
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {"version": 1, "generated_at": "", "flies": []}


def save_manifest(m):
    m["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    MANIFEST_PATH.write_text(json.dumps(m, indent=2) + "\n", encoding="utf-8")


# ---- HTML utilities ------------------------------------------------------

def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:40] or "fly"


def short_hash(content):
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:4]


def extract_html(text):
    # Tolerate accidental code fences or markdown wrapping.
    m = re.search(r"```(?:html)?\s*(<!doctype html.*?</html>)\s*```", text, re.I | re.S)
    if m: return m.group(1)
    m = re.search(r"<!doctype html.*?</html>", text, re.I | re.S)
    if m: return m.group(0)
    return text.strip()


def extract_title(html):
    m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    if not m: return "Fly"
    return re.sub(r"\s+", " ", m.group(1)).strip()[:60] or "Fly"


def extract_tags(html):
    m = re.search(r'<meta\s+name=["\']fly:tags["\']\s+content=["\'](.*?)["\']', html, re.I)
    if not m: return []
    return [t.strip().lower() for t in m.group(1).split(",") if t.strip()][:4]


# ---- write & quarantine --------------------------------------------------

def write_fly(html: str, category: str, source: str = "hatched", prior: float = 1.0):
    sdk_js = SDK_PATH.read_text(encoding="utf-8")
    injected = inject_sdk_into_html(html, sdk_js)

    title = extract_title(injected)
    tags = extract_tags(injected) or [category]
    h = short_hash(injected)
    fly_id = f"{slugify(title)}-{h}"

    out_dir = FLIES_DIR / fly_id
    out_dir.mkdir(parents=True, exist_ok=True)
    fly_path = out_dir / "index.html"
    fly_path.write_text(injected, encoding="utf-8")

    entry = {
        "id": fly_id,
        "title": title,
        "tags": tags,
        "category": category,
        "path": f"flies/{fly_id}/index.html",
        "source": source,
        "created": date.today().isoformat(),
        "prior": prior,
        "aspect": "portrait",
    }
    return entry, fly_path


def quarantine(html_or_path, reason):
    QUARANTINE.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    p = QUARANTINE / f"{ts}.html"
    content = html_or_path if isinstance(html_or_path, str) else Path(html_or_path).read_text(encoding="utf-8", errors="replace")
    p.write_text(content, encoding="utf-8")
    with (QUARANTINE / "log.txt").open("a", encoding="utf-8") as f:
        f.write(f"{ts}\t{reason}\n")


def remove_fly_dir(path: Path):
    try:
        path.unlink()
        path.parent.rmdir()
    except Exception:
        pass


def is_duplicate(manifest, entry):
    ids = {f["id"] for f in manifest["flies"]}
    titles = {f["title"].lower() for f in manifest["flies"]}
    if entry["id"] in ids: return True
    if entry["title"].lower() in titles: return True
    return False


# ---- Anthropic API call --------------------------------------------------

def call_anthropic(user_prompt):
    import anthropic
    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=os.environ.get("FLY_MODEL", "claude-opus-4-7"),
        max_tokens=8000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", None) == "text")


# ---- main loop -----------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Hatch Flies for Flying Apps.")
    ap.add_argument("--n", type=int, default=10, help="how many to accept")
    ap.add_argument("--category", type=str, default=None, help="restrict to one category")
    ap.add_argument("--dry-run", action="store_true", help="print prompts; no API calls")
    ap.add_argument("--skip-validate", action="store_true", help="skip Playwright gate")
    args = ap.parse_args()

    bank = load_prompts()
    categories = [args.category] if args.category else list(bank)
    for c in categories:
        if c not in bank:
            print(f"unknown category: {c} (have: {sorted(bank)})", file=sys.stderr)
            sys.exit(1)

    if not args.dry_run and not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        sys.exit(2)

    manifest = load_manifest()

    accepted = 0
    failed = 0
    attempted = 0
    max_attempts = max(args.n * 4, args.n + 8)

    while accepted < args.n and attempted < max_attempts:
        attempted += 1
        cat = random.choice(categories)
        idea = random.choice(bank[cat]["ideas"])
        user_prompt = USER_TEMPLATE.format(
            category=cat,
            idea_title=idea["title"],
            idea_description=idea["description"],
            tags=", ".join(idea.get("tags", [])),
        )

        print(f"[{accepted+1}/{args.n}] {cat} :: {idea['title']}")

        if args.dry_run:
            print("------\n" + user_prompt + "------")
            accepted += 1
            continue

        try:
            raw = call_anthropic(user_prompt)
        except Exception as e:
            print(f"  ! api error: {e}")
            failed += 1
            continue

        html = extract_html(raw)
        if not html or "<html" not in html.lower():
            quarantine(raw, "no html in response")
            failed += 1
            continue

        try:
            entry, fly_path = write_fly(html, cat)
        except Exception as e:
            quarantine(html, f"write error: {e!r}")
            failed += 1
            continue

        if is_duplicate(manifest, entry):
            print("  ~ duplicate, skipping.")
            remove_fly_dir(fly_path)
            continue

        if not args.skip_validate:
            ok, reason = validate_fly(fly_path)
            if not ok:
                print(f"  ✗ validation: {reason}")
                quarantine(fly_path.read_text(encoding="utf-8"), f"validate: {reason}")
                remove_fly_dir(fly_path)
                failed += 1
                continue

        manifest["flies"].append(entry)
        save_manifest(manifest)
        accepted += 1
        print(f"  ✓ {entry['id']}  tags={entry['tags']}")

    print(f"\ndone. accepted {accepted}/{args.n}, failed {failed} (over {attempted} attempts).")
    if accepted == 0:
        sys.exit(3)


if __name__ == "__main__":
    main()
