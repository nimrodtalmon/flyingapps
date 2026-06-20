// Feed client — manifest loader, scroll-snap loop, variant switcher, jar.

import { STRINGS } from "./strings.js";
import { Recommender, conceptOf } from "./recommender.js";
import { TEMPLATES } from "./templates.js";
import {
  computeReward, isEngaged,
  getSeen, markSeen,
  getJar, addToJar, removeFromJar,
  saveTrace, countTraces,
  updateFlyStats, flyPosteriorMean,
  setLastVariant,
} from "./signals.js";

const BUFFER_LOOK_AHEAD = 2;
const LAZY_UNMOUNT_DISTANCE = 2;
const HINT_KEY = "fa.hinted.v1";

let manifest = null;
let catalog = [];
let recommender = null;
let feedEl = null;

const slots = [];
const sessionSeen = new Set();      // of concept ids
let activeIdx = -1;
let scrollDebounce = null;

// ---- bootstrap -----------------------------------------------------------

async function main() {
  feedEl = document.getElementById("feed");

  try {
    const res = await fetch("manifest.json", { cache: "no-cache" });
    manifest = await res.json();
  } catch (e) {
    showEmpty("no swarm yet");
    return;
  }

  if (!manifest.flies || manifest.flies.length === 0) {
    showEmpty("the swarm is empty");
    return;
  }

  catalog = expandManifest(manifest.flies);
  recommender = new Recommender(catalog);

  for (let i = 0; i <= BUFFER_LOOK_AHEAD; i++) {
    const pick = recommender.pick(sessionSeen, getSeen(), countTraces());
    if (!pick) break;
    sessionSeen.add(pick.concept);
    appendSlot(pick);
  }

  feedEl.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("message", onFlyMessage);
  window.addEventListener("keydown", onKeydown);
  setupJar();
  maybeShowHint();

  requestAnimationFrame(() => setActive(0));
}

function showEmpty(msg) {
  feedEl.innerHTML = `<div class="slot"><div class="frame" style="display:grid;place-items:center;color:#8B97A6;letter-spacing:.1em;text-transform:lowercase;">${msg}</div></div>`;
}

// Expand manifest template entries into concrete virtual Flies, one per
// variant the template offers. Each gets a stable id `${templateId}-v${i}`
// so per-fly stats persist across reloads.
function expandManifest(entries) {
  const out = [];
  for (const entry of entries) {
    if (entry.kind === "template") {
      const tpl = TEMPLATES[entry.template];
      if (!tpl) { console.warn("unknown template:", entry.template); continue; }
      const count = entry.variantCount ?? tpl.variantCount ?? 1;
      for (let i = 0; i < count; i++) {
        out.push({
          id: `${entry.template}-v${i}`,
          concept: entry.concept || tpl.concept,
          title: tpl.variantTitle ? tpl.variantTitle(i) : `${tpl.concept} v${i+1}`,
          tags: entry.tags || tpl.tags,
          category: entry.category || tpl.category,
          template: entry.template,
          seedIdx: i,
          kind: "template",
          prior: entry.prior ?? 1.0,
          aspect: "portrait",
        });
      }
    } else {
      out.push({ kind: "static", ...entry });
    }
  }
  return out;
}

function mountFly(iframe, fly) {
  if (fly.kind === "template") {
    const tpl = TEMPLATES[fly.template];
    iframe.removeAttribute("src");
    iframe.srcdoc = tpl ? tpl.render(fly.seedIdx) : "";
  } else {
    iframe.removeAttribute("srcdoc");
    iframe.src = fly.path;
  }
}
function unmountIframe(iframe) {
  iframe.removeAttribute("srcdoc");
  iframe.src = "about:blank";
}

// ---- slot lifecycle ------------------------------------------------------

function appendSlot(pick) {
  const idx = slots.length;
  const slotEl = document.createElement("div");
  slotEl.className = "slot";
  slotEl.dataset.idx = String(idx);

  const titleEl = document.createElement("div");
  titleEl.className = "title";

  const frameEl = document.createElement("div");
  frameEl.className = "frame";

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("loading", "lazy");
  frameEl.appendChild(iframe);

  // Bottom chrome: variant nav + catch.
  const chromeEl = document.createElement("div");
  chromeEl.className = "chrome";

  const prevEl = document.createElement("button");
  prevEl.className = "chev prev";
  prevEl.setAttribute("aria-label", "previous version");
  prevEl.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  prevEl.addEventListener("click", (e) => { e.stopPropagation(); switchVariant(idx, -1); });

  const dotsEl = document.createElement("div");
  dotsEl.className = "dots";

  const nextEl = document.createElement("button");
  nextEl.className = "chev next";
  nextEl.setAttribute("aria-label", "next version");
  nextEl.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  nextEl.addEventListener("click", (e) => { e.stopPropagation(); switchVariant(idx, +1); });

  const catchBtn = document.createElement("button");
  catchBtn.className = "catch";
  catchBtn.setAttribute("aria-label", "catch this fly");
  catchBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 4h10v2H7zM6 7h12v2.5a4 4 0 0 1-1 2.5V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7a4 4 0 0 1-1-2.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  catchBtn.addEventListener("click", (e) => { e.stopPropagation(); onCatch(idx); });

  chromeEl.appendChild(prevEl);
  chromeEl.appendChild(dotsEl);
  chromeEl.appendChild(nextEl);
  chromeEl.appendChild(catchBtn);

  // Double-tap on the slot background = quick catch.
  let lastTap = 0;
  slotEl.addEventListener("pointerdown", (e) => {
    const now = performance.now();
    if (now - lastTap < 320 && e.target === slotEl) onCatch(idx);
    lastTap = now;
  });

  slotEl.appendChild(titleEl);
  slotEl.appendChild(frameEl);
  slotEl.appendChild(chromeEl);
  feedEl.appendChild(slotEl);

  const variants = pick.variants;
  const variantIdx = Math.max(0, variants.findIndex(v => v.id === pick.defaultVariant.id));
  const slot = {
    el: slotEl,
    iframe,
    titleEl,
    catchEl: catchBtn,
    prevEl, nextEl, dotsEl,
    concept: pick.concept,
    variants,
    variantIdx,
    fly: variants[variantIdx],
    mounted: true,
    signals: freshSignals(variants[variantIdx]),
  };
  slots.push(slot);

  renderSlotUI(slot);
  mountFly(iframe, slot.fly);

  requestAnimationFrame(() => slotEl.classList.add("is-mounted"));
}

function renderSlotUI(slot) {
  slot.titleEl.textContent = slot.fly.title || "fly";
  slot.iframe.setAttribute("title", slot.fly.title || "fly");
  // Dots
  const n = slot.variants.length;
  if (n > 1) {
    slot.el.classList.add("has-variants");
    slot.dotsEl.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const dot = document.createElement("button");
      dot.className = "dot" + (i === slot.variantIdx ? " is-active" : "");
      dot.setAttribute("aria-label", `version ${i + 1}`);
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = slots.indexOf(slot);
        if (idx !== -1 && i !== slot.variantIdx) switchVariant(idx, i - slot.variantIdx);
      });
      slot.dotsEl.appendChild(dot);
    }
  } else {
    slot.el.classList.remove("has-variants");
    slot.dotsEl.innerHTML = "";
  }
  slot.catchEl.classList.toggle("is-caught", getJar().includes(slot.fly.id));
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

function switchVariant(slotIdx, delta) {
  const slot = slots[slotIdx];
  if (!slot || slot.variants.length <= 1) return;
  const n = slot.variants.length;
  const newIdx = (slot.variantIdx + delta + n) % n;
  if (newIdx === slot.variantIdx) return;

  // Finalize signals on the variant we're leaving.
  finalizeSlot(slotIdx);

  slot.variantIdx = newIdx;
  slot.fly = slot.variants[newIdx];
  slot.signals = freshSignals(slot.fly);
  setLastVariant(slot.concept, slot.fly.id);

  // Subtle cross-fade: pulse the frame, swap the iframe contents.
  slot.el.classList.add("is-variant-swap");
  postToIframe(slot.iframe, "fly:pause");
  mountFly(slot.iframe, slot.fly);
  setTimeout(() => slot.el.classList.remove("is-variant-swap"), 320);

  renderSlotUI(slot);

  // If this is the active slot, restart the dwell clock and re-mark active
  // (finalizeSlot stripped the is-active class).
  if (slotIdx === activeIdx) {
    slot.signals.startTime = performance.now();
    markSeen(slot.fly.id);
    slot.el.classList.add("is-active", "is-settled");
    setTimeout(() => postToIframe(slot.iframe, "fly:active"), 160);
  }
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

  if (prev >= 0 && prev < slots.length) finalizeSlot(prev);

  const s = slots[idx];
  if (!s) return;

  if (prev !== -1) dismissHint();

  s.el.classList.add("is-active");
  setTimeout(() => s.el.classList.add("is-settled"), 1400);

  s.signals = freshSignals(s.fly);
  s.signals.startTime = performance.now();
  markSeen(s.fly.id);

  postToIframe(s.iframe, "fly:active");
  for (let i = 0; i < slots.length; i++) {
    if (i === idx) continue;
    postToIframe(slots[i].iframe, "fly:pause");
  }

  while (slots.length - 1 < idx + BUFFER_LOOK_AHEAD) {
    const pick = recommender.pick(sessionSeen, getSeen(), countTraces());
    if (!pick) break;
    sessionSeen.add(pick.concept);
    appendSlot(pick);
  }

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
  updateFlyStats(sig.id, engaged);

  saveTrace({
    id: sig.id,
    concept: s.concept,
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
  unmountIframe(s.iframe);
  s.mounted = false;
}
function ensureMounted(idx) {
  const s = slots[idx];
  if (!s || s.mounted) return;
  mountFly(s.iframe, s.fly);
  s.mounted = true;
}

function postToIframe(iframe, type) {
  try { iframe.contentWindow?.postMessage({ source: "feed", type }, "*"); } catch (e) {}
}

// ---- SDK message bridge --------------------------------------------------

function onFlyMessage(e) {
  const d = e.data;
  if (!d || d.source !== "fly") return;
  let owner = -1;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].iframe.contentWindow === e.source) { owner = i; break; }
  }
  if (owner === -1) return;
  const s = slots[owner];

  switch (d.type) {
    case "fly:ready":      break;
    case "fly:interaction": s.signals.interactions += 1; break;
    case "fly:complete":    s.signals.completed = true;  break;
    case "fly:catch":       onCatch(owner);              break;
  }
}

function onKeydown(e) {
  if (activeIdx < 0) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key === "ArrowLeft")  { e.preventDefault(); switchVariant(activeIdx, -1); }
  if (e.key === "ArrowRight") { e.preventDefault(); switchVariant(activeIdx, +1); }
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

// ---- jar -----------------------------------------------------------------

let jarOpen = false;

function setupJar() {
  const btn = document.getElementById("jar-button");
  const jar = document.getElementById("jar");
  const close = document.getElementById("jar-close");

  updateJarBadge();
  btn.hidden = false;

  btn.addEventListener("click", () => openJar());
  close.addEventListener("click", () => closeJar());
  jar.addEventListener("click", (e) => { if (e.target === jar) closeJar(); });
}

function openJar() {
  if (jarOpen) return;
  jarOpen = true;
  renderJarGrid();
  const jar = document.getElementById("jar");
  jar.hidden = false;
  jar.classList.remove("is-closing");
  jar.classList.add("is-open");
}

function closeJar() {
  if (!jarOpen) return;
  const jar = document.getElementById("jar");
  jar.classList.add("is-closing");
  jar.classList.remove("is-open");
  setTimeout(() => {
    jar.hidden = true;
    jar.classList.remove("is-closing");
    jarOpen = false;
  }, 320);
}

function renderJarGrid() {
  const grid = document.getElementById("jar-grid");
  const empty = document.getElementById("jar-empty");
  const ids = getJar();
  grid.innerHTML = "";
  if (ids.length === 0) {
    empty.hidden = false;
    empty.textContent = STRINGS.jarEmpty;
    return;
  }
  empty.hidden = true;
  const byId = Object.fromEntries(catalog.map(f => [f.id, f]));
  // newest first
  for (const id of [...ids].reverse()) {
    const fly = byId[id];
    if (!fly) continue;
    const tile = document.createElement("button");
    tile.className = "jar-tile";
    tile.type = "button";

    const tIframe = document.createElement("iframe");
    tIframe.setAttribute("sandbox", "allow-scripts");
    tIframe.setAttribute("tabindex", "-1");
    mountFly(tIframe, fly);
    tile.appendChild(tIframe);

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = fly.title || "fly";
    tile.appendChild(label);

    tile.addEventListener("click", () => openRelease(fly, tile));
    grid.appendChild(tile);
  }
}

function openRelease(fly, sourceTile) {
  const wrap = document.createElement("div");
  wrap.className = "release";
  wrap.innerHTML = `
    <header>
      <button class="release-back" type="button">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${STRINGS.releaseBack}
      </button>
      <span class="release-title">${escapeHtml(fly.title || "fly")}</span>
      <button class="release-remove" type="button">release</button>
    </header>
  `;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  mountFly(iframe, fly);
  wrap.appendChild(iframe);

  // FLIP-style origin: scale up from the tile's bounding rect.
  if (sourceTile) {
    const r = sourceTile.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    wrap.style.transformOrigin = `${cx}px ${cy}px`;
  }

  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("is-open"));

  function close() {
    wrap.classList.remove("is-open");
    wrap.classList.add("is-closing");
    setTimeout(() => wrap.remove(), 320);
  }
  wrap.querySelector(".release-back").addEventListener("click", close);
  wrap.querySelector(".release-remove").addEventListener("click", () => {
    removeFromJar(fly.id);
    updateJarBadge();
    renderJarGrid();
    close();
  });

  // Esc closes too.
  function onKey(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } }
  document.addEventListener("keydown", onKey);
}

function updateJarBadge() {
  const count = getJar().length;
  const badge = document.getElementById("jar-count");
  if (count > 0) { badge.hidden = false; badge.textContent = String(count); }
  else            { badge.hidden = true;  badge.textContent = ""; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
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
  hint.classList.add("is-out");
  setTimeout(() => hint.hidden = true, 360);
  localStorage.setItem(HINT_KEY, "1");
}

// ---- debug surface -------------------------------------------------------

window.FA = {
  manifest: () => manifest,
  posteriors: () => recommender?.posteriors,
  flyStats: () => JSON.parse(localStorage.getItem("fa.fly_stats.v1") || "{}"),
  traces: () => JSON.parse(localStorage.getItem("fa.traces.v1") || "[]"),
  reset: () => {
    ["fa.seen.v1","fa.jar.v1","fa.traces.v1","fa.post.v1","fa.hinted.v1","fa.fly_stats.v1","fa.last_variant.v1"]
      .forEach(k => localStorage.removeItem(k));
    location.reload();
  },
};

main();
