# Flying Apps

> An infinite, swipeable feed of tiny self-contained interactive things —
> **Flies**. Pure static site on GitHub Pages. No backend. No bundler.
> Free to run.

```
swipe up    let the next Fly drift in
swipe ← →    nothing here — use the chevrons or arrow keys to switch versions
tap catch    add to your jar
tap share    copy a link to send to a friend
```

---

## Run it locally

```sh
git clone https://github.com/<you>/flyingapps && cd flyingapps
make dev      # or: ./scripts/dev      (or: python3 -m http.server --directory docs)
```

Open <http://localhost:8000>. That's it — no build step, no install.

To deploy: push to `main`. In the repo's **Settings → Pages**, set
*Source = Deploy from branch · main · /docs*. Live in a minute.

---

## Add new Flies

There are three paths, ordered by setup effort.

### 1. Ask Claude Code (zero setup)

You're already running Claude Code on your subscription — that's the
session you're chatting in. Just say what you want and I'll generate the
Fly, append the manifest entry, commit, and push.

> *"hatch two new mindful Flies — one breath-related, one ambient"*

### 2. The Hatch a Fly workflow (uses your Claude subscription)

`.github/workflows/hatch.yml` runs Claude Code on a GitHub runner using
your Pro/Max OAuth token — **no Anthropic API key involved**.

**One-time setup:**

```sh
claude setup-token              # prints an OAuth token
```

In GitHub: **Settings → Secrets and variables → Actions → New repository
secret**, name `CLAUDE_CODE_OAUTH_TOKEN`, paste the token.

**Then to hatch:**

```sh
make hatch                              # picks something tasteful
make hatch ARGS='-f idea="tide gauge"'  # with an idea
```

Or from GitHub: **Actions → Hatch a Fly → Run workflow** (fields for idea,
count, category).

Or programmatically — `POST /repos/<owner>/<repo>/dispatches` with
`{ "event_type": "hatch", "client_payload": { "idea": "…", "count": 1 } }`
using a fine-grained PAT scoped to *Contents: read & write*.

### 3. The offline hatchery (needs an Anthropic API key)

```sh
export ANTHROPIC_API_KEY=sk-ant-...
make hatch-local ARGS="--n 5"
```

First run installs deps + Playwright Chromium and validates everything
(no console errors, no off-allowlist requests, SDK alive, body
non-empty). Quarantines bad outputs to `hatchery/_quarantine/`.

---

## What's in the repo

```
docs/                          # GitHub Pages serves this folder
  index.html                   # feed shell
  styles.css
  manifest.json                # the swarm — static + template entries
  app/
    feed.js                    # main loop, scroll-snap, buffer, jar
    recommender.js             # tag-level Thompson sampling
    signals.js                 # dwell/interactions/catch → reward
    templates.js               # client-side variant generators
    strings.js                 # user-facing copy
    sdk/fly-sdk.js             # the SDK inlined into every Fly
  flies/<id>/index.html        # each static Fly

hatchery/                      # NOT served — runs offline only
  hatch.py                     # Anthropic API hatcher
  inject_sdk.py
  validate.py                  # Playwright validity gate
  prompts/                     # prompt bank per category

.github/workflows/hatch.yml    # GitHub Action; uses Claude subscription

scripts/                       # dev | setup | hatch | hatch-local
Makefile                       # make help
```

---

## Spec, in one screen

A **Fly** is a single self-contained HTML file: inline CSS + JS, no
network, portrait viewport, must inline the **Fly SDK** and call
`window.Fly.interaction(kind)` on user actions.

The **feed** loads `manifest.json`, picks the next concept via tag-level
Thompson sampling (Beta posteriors per tag, persisted in `localStorage`),
mounts the picked variant in a sandboxed iframe, and learns which Fly /
which variant you engage with based on **dwell + interactions + complete
+ catch − fast_skip**. Per-concept variant picks are sticky: your last
choice becomes the default next time.

**Templates** in `docs/app/templates.js` are parameterised generators —
each returns a fresh self-contained HTML string per variant index, mounted
via `iframe.srcdoc`. They add variety without new files on disk; stable
ids (`${template}-v${i}`) keep signals and jar entries consistent across
reloads.

---

## Debug

In the browser console:

```js
FA.manifest()          // the loaded swarm
FA.posteriors()        // per-tag Beta posteriors
FA.flyStats()          // per-fly engagement counts
FA.traces()            // last 200 reward traces
FA.reset()             // clear all localStorage and reload
```

---

## Goal

Done when it works nicely. Light, airy, weightless. The opposite of a
loud dopamine feed — watching things float past a sunlit window,
occasionally reaching out to catch one.
