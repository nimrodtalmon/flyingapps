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

```sh
cd hatchery
pip install -r requirements.txt
python -m playwright install chromium
export ANTHROPIC_API_KEY=sk-ant-...
python hatch.py --n 20
git add docs/flies docs/manifest.json && git commit -m "hatch 20" && git push
```

Operate it: `python hatch.py --n 20 && git push`.

## Deploy

GitHub Pages → **Deploy from branch → `main` → `/docs`**. The hatchery stays
outside `/docs` so it is never served.

## Reset your local state

In the browser console: `FA.reset()` — clears localStorage (seen-set, jar,
traces, posteriors).

## Inspect the recommender

`FA.posteriors()` — per-tag Beta posteriors.
`FA.traces()` — last 200 reward traces.
