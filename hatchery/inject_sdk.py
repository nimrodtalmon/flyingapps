"""Inline the Fly SDK into a Fly's HTML, immediately before </body>.

The SDK is the source of truth at /docs/app/sdk/fly-sdk.js — the hatchery just
copies its bytes into each generated Fly so every Fly stays self-contained.
"""

import re

_SDK_OPEN = "<!-- fly-sdk:open -->"
_SDK_CLOSE = "<!-- fly-sdk:close -->"


def inject_sdk_into_html(html: str, sdk_js: str) -> str:
    block = f"{_SDK_OPEN}\n<script>\n{sdk_js.strip()}\n</script>\n{_SDK_CLOSE}\n"

    # If a previous injection block is present, replace it (idempotent).
    if _SDK_OPEN in html and _SDK_CLOSE in html:
        return re.sub(
            re.escape(_SDK_OPEN) + r".*?" + re.escape(_SDK_CLOSE) + r"\s*",
            block,
            html,
            count=1,
            flags=re.DOTALL,
        )

    # Insert before </body> if present, else append.
    if re.search(r"</body\s*>", html, flags=re.IGNORECASE):
        return re.sub(r"</body\s*>", block + "</body>", html, count=1, flags=re.IGNORECASE)
    return html.rstrip() + "\n" + block


if __name__ == "__main__":
    import sys
    from pathlib import Path
    if len(sys.argv) != 3:
        print("usage: inject_sdk.py <fly.html> <fly-sdk.js>")
        sys.exit(1)
    html_p = Path(sys.argv[1])
    sdk_p  = Path(sys.argv[2])
    out = inject_sdk_into_html(html_p.read_text(), sdk_p.read_text())
    html_p.write_text(out)
    print(f"injected SDK into {html_p}")
