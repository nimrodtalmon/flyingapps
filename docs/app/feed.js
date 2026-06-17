// Feed client — manifest loader, scroll-snap loop, prefetch, SDK bridge, jar.

import { STRINGS } from "./strings.js";
import { Recommender } from "./recommender.js";
import {
  computeReward, isEngaged,
  getSeen, markSeen,
  getJar, addToJar,
  saveTrace, countTraces,
} from "./signals.js";

const BUFFER_LOOK_AHEAD = 2;       // ensure this many slots after the active one
const LAZY_UNMOUNT_DISTANCE = 2;   // slots further than this get unmounted
const HINT_KEY = "fa.hinted.v1";

let manifest = null;
let recommender = null;
let feedEl = null;

const slots = [];                  // [{ el, iframe, fly, mounted, isActive, signals }]
const sessionSeen = new Set();
let activeIdx = -1;
let scrollDebounce = null;

// ---- bootstrap -----------------------------------------------------------

async function main() {
  feedEl = document.getElementById("feed");

  try {
    const res = await fetch("manifest.json", { cache: "no-cache" });
    manifest = await res.json();
  } catch (e) {
    feedEl.innerHTML = `<div class="slot"><div class="frame" style="display:grid;place-items:center;color:#8B97A6;letter-spacing:.1em;text-transform:lowercase;">no swarm yet</div></div>`;
    return;
  }

  if (!manifest.flies || manifest.flies.length === 0) {
    feedEl.innerHTML = `<div class="slot"><div class="frame" style="display:grid;place-items:center;color:#8B97A6;letter-spacing:.1em;text-transform:lowercase;">the swarm is empty</div></div>`;
    return;
  }

  recommender = new Recommender(manifest.flies);

  // Initial buffer: pick the first BUFFER_LOOK_AHEAD + 1 Flies.
  for (let i = 0; i <= BUFFER_LOOK_AHEAD; i++) {
    const fly = recommender.pick(sessionSeen, getSeen(), countTraces());
    if (!fly) break;
    sessionSeen.add(fly.id);
    appendSlot(fly);
  }

  feedEl.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("message", onFlyMessage);
  setupJar();
  maybeShowHint();

  // Activate the first slot.
  requestAnimationFrame(() => setActive(0));
}

// ---- slot lifecycle ------------------------------------------------------

function appendSlot(fly) {
  const idx = slots.length;
  const slotEl = document.createElement("div");
  slotEl.className = "slot";
  slotEl.dataset.idx = String(idx);

  const titleEl = document.createElement("div");
  titleEl.className = "title";
  titleEl.textContent = fly.title || "fly";

  const frameEl = document.createElement("div");
  frameEl.className = "frame";

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("title", fly.title || "fly");
  iframe.src = fly.path;
  frameEl.appendChild(iframe);

  const catchBtn = document.createElement("button");
  catchBtn.className = "catch";
  catchBtn.setAttribute("aria-label", "catch this fly");
  catchBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 4h10v2H7zM6 7h12v2.5a4 4 0 0 1-1 2.5V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7a4 4 0 0 1-1-2.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  catchBtn.addEventListener("click", (e) => { e.stopPropagation(); onCatch(idx); });

  // Double-tap on the slot = quick catch.
  let lastTap = 0;
  slotEl.addEventListener("pointerdown", (e) => {
    const now = performance.now();
    if (now - lastTap < 320 && e.target === slotEl) onCatch(idx);
    lastTap = now;
  });

  slotEl.appendChild(titleEl);
  slotEl.appendChild(frameEl);
  slotEl.appendChild(catchBtn);
  feedEl.appendChild(slotEl);

  slots.push({
    el: slotEl,
    iframe,
    catchEl: catchBtn,
    fly,
    mounted: true,
    signals: freshSignals(fly),
  });

  // Mark mounted on next frame for the drift-in transition.
  requestAnimationFrame(() => slotEl.classList.add("is-mounted"));
}

function freshSignals(fly) {
  return {
    id: fly.id,
    tags: fly.tags || [],
    dwell_ms: 0,
    interactions: 0,
    completed: false,
    caught: getJar().includes(fly.id),
    startTime: null,
  };
}

// ---- scroll → active tracking -------------------------------------------

function onScroll() {
  if (scrollDebounce) return;
  scrollDebounce = requestAnimationFrame(() => {
    scrollDebounce = null;
    const idx = Math.round(feedEl.scrollTop / window.innerHeight);
    if (idx !== activeIdx && idx >= 0 && idx < slots.length) {
      setActive(idx);
    }
  });
}

function setActive(idx) {
  if (idx === activeIdx) return;
  const prev = activeIdx;
  activeIdx = idx;

  // Finalize previous Fly's signals → reward → posterior update.
  if (prev >= 0 && prev < slots.length) {
    finalizeSlot(prev);
  }

  const s = slots[idx];
  if (!s) return;

  // First-visit hint vanishes after first advance.
  if (prev !== -1) dismissHint();

  s.el.classList.add("is-active");
  // Settle title to corner after a moment.
  setTimeout(() => s.el.classList.add("is-settled"), 1400);

  // Reset signals and start the dwell clock.
  s.signals = freshSignals(s.fly);
  s.signals.startTime = performance.now();
  markSeen(s.fly.id);

  // Send fly:active to the active iframe, fly:pause to others nearby.
  postToIframe(s.iframe, "fly:active");
  for (let i = 0; i < slots.length; i++) {
    if (i === idx) continue;
    postToIframe(slots[i].iframe, "fly:pause");
  }

  // Ensure we have enough lookahead.
  while (slots.length - 1 < idx + BUFFER_LOOK_AHEAD) {
    const fly = recommender.pick(sessionSeen, getSeen(), countTraces());
    if (!fly) break;
    sessionSeen.add(fly.id);
    appendSlot(fly);
  }

  // Lazy-unmount far-away iframes to cap memory.
  for (let i = 0; i < slots.length; i++) {
    if (Math.abs(i - idx) > LAZY_UNMOUNT_DISTANCE) unmountSlot(i);
    else                                            ensureMounted(i);
  }
}

function finalizeSlot(idx) {
  const s = slots[idx];
  if (!s) return;
  const sig = s.signals;
  if (sig.startTime != null) {
    sig.dwell_ms += performance.now() - sig.startTime;
    sig.startTime = null;
  }
  const reward = computeReward(sig);
  const engaged = isEngaged(reward);
  recommender.update(sig.tags || [], engaged);

  saveTrace({
    id: sig.id,
    tags: sig.tags,
    dwell_ms: Math.round(sig.dwell_ms),
    interactions: sig.interactions,
    completed: sig.completed,
    caught: sig.caught,
    reward: Number(reward.toFixed(3)),
    engaged,
    at: Date.now(),
  });

  s.el.classList.remove("is-active", "is-settled");
}

function unmountSlot(idx) {
  const s = slots[idx];
  if (!s || !s.mounted) return;
  s.iframe.src = "about:blank";
  s.mounted = false;
}
function ensureMounted(idx) {
  const s = slots[idx];
  if (!s || s.mounted) return;
  s.iframe.src = s.fly.path;
  s.mounted = true;
}

function postToIframe(iframe, type) {
  try { iframe.contentWindow?.postMessage({ source: "feed", type }, "*"); } catch (e) {}
}

// ---- SDK message bridge --------------------------------------------------

function onFlyMessage(e) {
  const d = e.data;
  if (!d || d.source !== "fly") return;
  // Trust by matching event.source against a known iframe.
  let owner = -1;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].iframe.contentWindow === e.source) { owner = i; break; }
  }
  if (owner === -1) return;
  const s = slots[owner];

  switch (d.type) {
    case "fly:ready":
      // already mounted CSS-wise; nothing to do.
      break;
    case "fly:interaction":
      s.signals.interactions += 1;
      break;
    case "fly:complete":
      s.signals.completed = true;
      break;
    case "fly:catch":
      onCatch(owner);
      break;
  }
}

// ---- catch / jar ---------------------------------------------------------

function onCatch(idx) {
  const s = slots[idx];
  if (!s) return;
  if (!s.signals.caught) {
    s.signals.caught = true;
    addToJar(s.fly.id);
    s.catchEl.classList.add("is-caught");
    spawnPuff(s.el);
    updateJarBadge();
  }
}

function spawnPuff(slotEl) {
  const p = document.createElement("div");
  p.className = "puff";
  slotEl.appendChild(p);
  setTimeout(() => p.remove(), 750);
}

function setupJar() {
  const btn = document.getElementById("jar-button");
  const jar = document.getElementById("jar");
  const close = document.getElementById("jar-close");
  const grid = document.getElementById("jar-grid");
  const empty = document.getElementById("jar-empty");

  updateJarBadge();
  btn.hidden = false;

  btn.addEventListener("click", () => openJar());
  close.addEventListener("click", () => closeJar());

  function openJar() {
    const ids = getJar();
    grid.innerHTML = "";
    if (ids.length === 0) {
      empty.hidden = false;
      empty.textContent = STRINGS.jarEmpty;
    } else {
      empty.hidden = true;
      const byId = Object.fromEntries(manifest.flies.map(f => [f.id, f]));
      for (const id of ids) {
        const fly = byId[id];
        if (!fly) continue;
        const tile = document.createElement("div");
        tile.className = "jar-tile";

        const tIframe = document.createElement("iframe");
        tIframe.setAttribute("sandbox", "allow-scripts");
        tIframe.src = fly.path;
        tile.appendChild(tIframe);

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = fly.title || "fly";
        tile.appendChild(label);

        tile.addEventListener("click", () => openRelease(fly));
        grid.appendChild(tile);
      }
    }
    jar.hidden = false;
  }
  function closeJar() { jar.hidden = true; }

  function openRelease(fly) {
    const wrap = document.createElement("div");
    wrap.className = "release";
    wrap.innerHTML = `
      <header>
        <button class="release-back" type="button">${STRINGS.releaseBack}</button>
        <span style="color:var(--muted);font-size:13px;letter-spacing:.12em;text-transform:lowercase;">${fly.title || "fly"}</span>
        <span style="width:80px;"></span>
      </header>
    `;
    const rIframe = document.createElement("iframe");
    rIframe.setAttribute("sandbox", "allow-scripts");
    rIframe.src = fly.path;
    wrap.appendChild(rIframe);
    wrap.querySelector(".release-back").addEventListener("click", () => wrap.remove());
    document.body.appendChild(wrap);
  }
}

function updateJarBadge() {
  const count = getJar().length;
  const badge = document.getElementById("jar-count");
  if (count > 0) { badge.hidden = false; badge.textContent = String(count); }
  else            { badge.hidden = true;  badge.textContent = ""; }
}

// ---- onboarding hint -----------------------------------------------------

function maybeShowHint() {
  if (localStorage.getItem(HINT_KEY)) return;
  const hint = document.getElementById("hint");
  hint.querySelector(".hint-text").textContent = STRINGS.hintSwipe;
  hint.hidden = false;
}
function dismissHint() {
  const hint = document.getElementById("hint");
  if (!hint || hint.hidden) return;
  hint.style.transition = "opacity 360ms ease";
  hint.style.opacity = "0";
  setTimeout(() => hint.hidden = true, 400);
  localStorage.setItem(HINT_KEY, "1");
}

// ---- expose a small debug surface for dev poking ------------------------

window.FA = {
  manifest: () => manifest,
  posteriors: () => recommender?.posteriors,
  traces: () => JSON.parse(localStorage.getItem("fa.traces.v1") || "[]"),
  reset: () => {
    ["fa.seen.v1","fa.jar.v1","fa.traces.v1","fa.post.v1","fa.hinted.v1"].forEach(k => localStorage.removeItem(k));
    location.reload();
  },
};

main();
