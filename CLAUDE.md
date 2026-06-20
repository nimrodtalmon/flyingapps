# Flying Apps — guidance for Claude Code

> An infinite, swipeable feed of tiny self-contained interactive things —
> *Flies*. Pure static site on GitHub Pages. No backend. No bundler.

If you're picking this repo up cold, read this file first. README.md is
the user-facing onboarding; this file captures the *conventions* a Claude
Code session should follow when working here.

## Project shape

```
docs/                 # GitHub Pages serves THIS (only)
  index.html          # feed shell
  styles.css
  manifest.json       # the swarm: static entries + template entries
  app/
    feed.js           # scroll-snap loop, prefetch, jar, share, hatch UI
    recommender.js    # tag-level Thompson sampling, concept grouping
    signals.js        # dwell/interactions/catch → reward, persistence
    templates.js      # client-side variant generators (srcdoc-mounted)
    hatch.js          # GitHub repository_dispatch trigger
    strings.js        # all user-facing copy
    sdk/fly-sdk.js    # the SDK inlined into every Fly (source of truth)
  flies/<id>/index.html

hatchery/             # NOT served — offline API-key generator
.github/workflows/hatch.yml   # subscription-driven hatcher (uses CLAUDE_CODE_OAUTH_TOKEN)
scripts/                      # dev / setup / hatch / hatch-local
```

## The Fly contract — never violate

Each Fly is **one self-contained `index.html`**:

- **Inline ALL CSS and JS.** No external network requests. No `<link>`, no
  `<script src>`, no fetch, no CDN, no fonts, no images.
- Sets `<title>` and `<meta name="fly:tags" content="t1,t2,t3">` with 2–4
  lowercase tags.
- **Inlines the SDK from `docs/app/sdk/fly-sdk.js` verbatim** inside a
  `<script>` block before `</body>`. Don't redefine `window.Fly`.
- Designed for a single portrait viewport (~390×800), responsive.
- Calls `window.Fly.interaction(kind)` on every meaningful user action.
  Optionally `Fly.complete()` at a natural end state, `Fly.catch()` to
  ask the parent to add it to the jar.
- Listens for window events `fly:pause` (stop timers/animations/audio)
  and `fly:active` (resume).
- No autoplaying audio. If you must, gate behind an in-Fly toggle.
- File size under 500 KB.

## Vibe — light, airy, weightless

- Palette: bg `#EAF1F6 → #F7FAFC`, surface `#FFFFFF`, ink `#1A2330`,
  muted `#8B97A6`, accent `#2BB6A3`, secondary `#2D7DD2`. Deliberate
  alternatives are fine; loud or busy is not.
- Type: system humanist sans (`-apple-system, system-ui, sans-serif`),
  light weights, modest letter-spacing on labels, **lowercase chrome**
  everywhere.
- Motion: gentle ease-out, ~250–350 ms drift-ins, never bouncy or
  attention-grabby.
- Copy is calm and a little buzzy, never cutesy-overload, never
  exclamatory engagement-speak ("🎉 You got a new fly!!!" — no).

## Adding a new Fly

1. Build the HTML file at `docs/flies/<slug>-<4hex>/index.html`. Use an
   existing Fly as your structural reference; do not omit the SDK.
2. Append a manifest entry to `docs/manifest.json`:
   ```json
   {
     "id": "<slug>-<4hex>",
     "concept": "<slug>",         // share with siblings to group as variants
     "title": "Short Title",
     "tags": ["t1","t2","t3"],
     "category": "tools",
     "path": "flies/<slug>-<4hex>/index.html",
     "source": "hatched",
     "created": "YYYY-MM-DD",
     "prior": 1.0,
     "aspect": "portrait"
   }
   ```
3. Commit + push. The static site picks it up on next manifest fetch.

For batches, prefer creating a **template** in `docs/app/templates.js`
rather than many static Flies — same surface, far fewer files. Register
it in the `TEMPLATES` object and add one `{ "kind": "template", … }`
manifest entry.

## Recommender — concept-level Thompson sampling

- Per-tag Beta posteriors in `localStorage` (`fa.post.v1`).
- The recommender picks a *concept* (so the same concept never appears
  twice in the buffer), then defaults to the current best variant for
  that concept. The default is *sticky*: a user's last manual pick wins
  next time.
- Per-fly engagement is tracked separately (`fa.fly_stats.v1`) so the
  best-performing variant of a concept becomes the default.
- Cold-start (<8 reward traces) falls back to a curated category
  round-robin so the swarm feels varied before signals are useful.

## Hatching — three paths

| Path | When | Setup |
|---|---|---|
| Ask Claude Code here | One-off, you're me anyway | none |
| `.github/workflows/hatch.yml` | Repeatable, no API key | `claude setup-token` + `CLAUDE_CODE_OAUTH_TOKEN` secret |
| `hatchery/hatch.py` | Offline, big batches | `ANTHROPIC_API_KEY` |

The in-feed `+ hatch` button fires the workflow via repository_dispatch
using the user's fine-grained PAT stored in their browser's localStorage.

## What NOT to add

The spec explicitly excludes these in v1:

- Any backend, database, or auth.
- Bundlers, frameworks, build steps.
- Per-swipe live LLM hatching that *uses an API key shipped to the site*.
- Multi-user / shared swarm / server-side graduation.
- Accounts, cross-device sync, analytics services.

Keep it static. Keep it simple. Keep it airy.

## Useful debug surface

In the browser console:

```js
FA.manifest()    // the loaded swarm (post-template-expansion)
FA.posteriors()  // per-tag Beta posteriors
FA.flyStats()    // per-fly wins/losses
FA.traces()      // last 200 reward traces
FA.reset()       // clear all localStorage and reload
```
