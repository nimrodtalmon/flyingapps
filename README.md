# Flying Apps

An infinite, swipeable feed of tiny self-contained interactive things — **Flies**.
Pure static site on GitHub Pages. No backend. Single user. Free to run.

```
/                         # repo root (NOT served)
  hatchery/               # offline generator (runs on your machine)
    hatch.py
    inject_sdk.py
    validate.py
    prompts/              # prompt bank, per category
    requirements.txt
  docs/                   # <-- GitHub Pages serves THIS folder
    index.html            # feed shell
    styles.css
    manifest.json         # the swarm
    app/
      feed.js             # main loop + prefetch
      recommender.js      # tag-level Thompson sampling
      signals.js          # dwell / interactions / catch → reward
      strings.js          # all user-facing copy
      sdk/fly-sdk.js      # the SDK injected into every Fly
    flies/<id>/index.html # each Fly, fully self-contained
```

## Run locally

The site is plain HTML/JS — no build step.

```sh
cd docs && python3 -m http.server 8000
# open http://localhost:8000
```

## Add new Flies

Three options, in order of how much setup they need.

### 1) Ask me, right here.

You're talking to Claude Code right now, running on your subscription. Tell
me what you want and I'll generate the Fly, commit, push. Zero setup.

### 2) Hatch on demand via GitHub Actions (uses your Claude subscription).

A `Hatch a Fly` workflow lives at `.github/workflows/hatch.yml`. It runs
Claude Code on a GitHub runner using your **Pro/Max subscription** — no
Anthropic API key involved.

**One-time setup:**

```sh
# On your machine — generates a short-lived OAuth token tied to your sub.
claude setup-token
```

Then in the repo on GitHub: **Settings → Secrets and variables → Actions
→ New repository secret**, name `CLAUDE_CODE_OAUTH_TOKEN`, paste the token.

**To hatch:**

- Manual: **Actions → Hatch a Fly → Run workflow**, optionally pass an
  `idea`, a `count`, or a pinned `category`.
- Programmatic: `POST /repos/<owner>/<repo>/dispatches` with
  `{ "event_type": "hatch", "client_payload": { "idea": "...", "count": 2 } }`
  using a fine-grained PAT scoped to *Contents: read & write* on this repo.
  (This is what a "hatch a new Fly" button on the site can call.)

The workflow generates, validates, commits, and pushes. GitHub Pages
rebuilds; reload the site to see the new Fly.

### 3) Offline hatchery (API-key path).

The original `hatchery/hatch.py` still works for people who do hold an
Anthropic API key:

```sh
cd hatchery
pip install -r requirements.txt
python -m playwright install chromium
export ANTHROPIC_API_KEY=sk-ant-...
python hatch.py --n 20
git add docs/flies docs/manifest.json && git commit -m "hatch 20" && git push
```

## Deploy

GitHub Pages → **Deploy from branch → `main` → `/docs`**. The hatchery stays
outside `/docs` so it is never served.

## Reset your local state

In the browser console: `FA.reset()` — clears localStorage (seen-set, jar,
traces, posteriors).

## Inspect the recommender

`FA.posteriors()` — per-tag Beta posteriors.
`FA.traces()` — last 200 reward traces.
