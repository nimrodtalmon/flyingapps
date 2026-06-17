"""Validity gate — a broken Fly is worse than a boring one, so gate hard.

Checks:
  - HTML parses, single file, < 500 KB
  - Has <!doctype html>, <title>, <meta name="fly:tags">, and the Fly SDK
  - Loads in headless Chromium within timeout
  - Zero uncaught console errors / unhandled rejections
  - DOM has visible children (not blank)
  - Makes no network requests outside the CDN allowlist
  - SDK is alive (`window.Fly` exists after load)
"""

import asyncio
import re
from pathlib import Path
from urllib.parse import urlparse


MAX_BYTES        = 500 * 1024
LOAD_TIMEOUT_MS  = 8000
POST_LOAD_WAIT   = 900   # let the SDK initialize and any errors surface

ALLOWED_HOSTS = {"cdnjs.cloudflare.com"}


def validate_fly(path: Path):
    """Returns (ok: bool, reason: str)."""
    try:
        return asyncio.run(_validate(Path(path)))
    except Exception as e:
        return False, f"exception: {e!r}"


async def _validate(path: Path):
    if not path.exists():
        return False, "file not found"

    size = path.stat().st_size
    if size > MAX_BYTES:
        return False, f"too big: {size} bytes"

    html = path.read_text(encoding="utf-8", errors="replace")
    lower = html.lower()
    if "<!doctype html" not in lower:
        return False, "missing doctype"
    if "<title>" not in lower:
        return False, "missing <title>"
    if not re.search(r'<meta[^>]+name=["\']fly:tags["\']', html, re.I):
        return False, "missing fly:tags meta"
    if "window.Fly" not in html:
        return False, "missing fly sdk"

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return False, "playwright not installed (pip install playwright && playwright install chromium)"

    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch(headless=True)
        except Exception as e:
            return False, f"chromium launch failed: {e!r}"

        ctx = await browser.new_context(viewport={"width": 390, "height": 800})
        page = await ctx.new_page()

        errors:        list[str] = []
        bad_requests:  list[str] = []

        page.on("pageerror",   lambda e: errors.append(f"pageerror: {e}"))
        page.on("crash",       lambda _: errors.append("page crashed"))
        page.on("console",     lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)

        async def route_handler(route):
            url = route.request.url
            if url.startswith(("data:", "blob:", "about:", "file:")):
                await route.continue_()
                return
            host = urlparse(url).hostname or ""
            if host in ALLOWED_HOSTS:
                await route.continue_()
                return
            bad_requests.append(url)
            await route.abort()

        await ctx.route("**/*", route_handler)

        try:
            await page.goto(path.absolute().as_uri(), wait_until="load", timeout=LOAD_TIMEOUT_MS)
        except Exception as e:
            await browser.close()
            return False, f"load failed: {e!r}"

        await page.wait_for_timeout(POST_LOAD_WAIT)

        if errors:
            await browser.close()
            return False, f"runtime errors: {errors[:3]}"
        if bad_requests:
            await browser.close()
            return False, f"blocked requests: {bad_requests[:3]}"

        sdk_alive = await page.evaluate("typeof window.Fly === 'object' && typeof window.Fly.ready === 'function'")
        if not sdk_alive:
            await browser.close()
            return False, "Fly SDK not initialized"

        # The body needs *something* visible — not just an empty container.
        has_visible = await page.evaluate("""
          (() => {
            const b = document.body;
            if (!b) return false;
            if (b.children.length === 0) return false;
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          })()
        """)
        if not has_visible:
            await browser.close()
            return False, "empty body"

        await browser.close()

    return True, "ok"


if __name__ == "__main__":
    import sys
    for arg in sys.argv[1:]:
        ok, reason = validate_fly(Path(arg))
        marker = "PASS" if ok else "FAIL"
        print(f"{marker}  {arg}  ({reason})")
