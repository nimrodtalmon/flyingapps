// Tag-level Thompson sampling. Per-tag Beta posteriors persist in localStorage.
// Picks score = mean_t( sample Beta(α_t, β_t) ) * prior.
//
// Cold-start: until COLD_START_THRESHOLD rewards have been recorded, fall back
// to a category round-robin (curated diverse shuffle) so the swarm feels varied
// before there are enough signals to be useful.

const POSTERIORS_KEY = "fa.post.v1";
const COLD_START_THRESHOLD = 8;
const DIVERSITY_WINDOW = 3;   // last M Flies — share-tag candidates are penalized
const COOLDOWN_MS = 1000 * 60 * 60 * 6;  // re-show after 6h
const DIVERSITY_PENALTY = 0.35;

function loadPosteriors() {
  try {
    const raw = localStorage.getItem(POSTERIORS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function savePosteriors(p) {
  try { localStorage.setItem(POSTERIORS_KEY, JSON.stringify(p)); } catch (e) {}
}

function getArm(p, tag) {
  if (!p[tag]) p[tag] = { a: 1, b: 1 };
  return p[tag];
}

// Beta sampling via two Gamma(shape, 1) samples — Marsaglia–Tsang.
function gamma(shape) {
  if (shape < 1) {
    // Boost: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
    const u = Math.random();
    return gamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      // Standard normal via Box–Muller
      const u1 = Math.random() || 1e-12;
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function sampleBeta(a, b) {
  const x = gamma(a);
  const y = gamma(b);
  return x / (x + y);
}

import { flyPosteriorMean, getLastVariant } from "./signals.js";

export function conceptOf(fly) {
  return fly.concept || fly.id.replace(/-[a-f0-9]{3,8}$/, "") || fly.id;
}

// Public API ---------------------------------------------------------------

export class Recommender {
  constructor(catalog) {
    this.catalog = catalog;
    this.byId = Object.fromEntries(catalog.map(f => [f.id, f]));

    // Group by concept.
    this.byConcept = {};
    for (const f of catalog) {
      const c = conceptOf(f);
      (this.byConcept[c] = this.byConcept[c] || []).push(f);
    }
    this.conceptIds = Object.keys(this.byConcept);

    this.posteriors = loadPosteriors();
    this.recentTags = [];   // last DIVERSITY_WINDOW × tag sets
  }

  // Update on leaving a Fly. Updates tag posteriors. The caller updates per-fly
  // stats separately so the recommender stays a pure function of localStorage.
  update(tags, engaged) {
    for (const t of tags) {
      const arm = getArm(this.posteriors, t);
      if (engaged) arm.a += 1;
      else         arm.b += 1;
    }
    savePosteriors(this.posteriors);
    this.recentTags.push(tags);
    if (this.recentTags.length > DIVERSITY_WINDOW) this.recentTags.shift();
  }

  tagPosteriorMean(tag) {
    const arm = this.posteriors[tag];
    if (!arm) return 0.5;
    return arm.a / (arm.a + arm.b);
  }

  inColdStart(traceCount) {
    return (traceCount || 0) < COLD_START_THRESHOLD;
  }

  // Variants of a concept — exposed for the slot UI.
  variantsOf(conceptId) {
    return this.byConcept[conceptId] || [];
  }

  // Default variant of a concept:
  //   1. user's last manual pick for this concept (sticky preference)
  //   2. variant with the highest per-fly posterior mean
  //   3. first in manifest order
  defaultVariant(conceptId) {
    const variants = this.byConcept[conceptId] || [];
    if (variants.length === 0) return null;
    if (variants.length === 1) return variants[0];

    const lastId = getLastVariant(conceptId);
    if (lastId) {
      const hit = variants.find(v => v.id === lastId);
      if (hit) return hit;
    }
    let best = variants[0], bestMean = -1;
    for (const v of variants) {
      const m = flyPosteriorMean(v.id);
      if (m > bestMean) { bestMean = m; best = v; }
    }
    return best;
  }

  // Eligible concepts: none of their variants are in this session's seen-set,
  // and at least one variant is out of cross-session cooldown.
  _eligibleConcepts(sessionSeenConcepts, persistentSeen) {
    const now = Date.now();
    const out = [];
    for (const c of this.conceptIds) {
      if (sessionSeenConcepts.has(c)) continue;
      const variants = this.byConcept[c];
      const anyFresh = variants.some(v => {
        const t = persistentSeen[v.id];
        return !t || (now - t) >= COOLDOWN_MS;
      });
      if (anyFresh) out.push(c);
    }
    return out;
  }

  _diversityPenalty(tagUnion) {
    if (this.recentTags.length === 0) return 1.0;
    let overlap = 0;
    for (const tagSet of this.recentTags) {
      for (const t of tagUnion) {
        if (tagSet.includes(t)) { overlap++; break; }
      }
    }
    return Math.pow(1 - DIVERSITY_PENALTY, overlap);
  }

  _scoreConcept(conceptId) {
    // A concept's score is the max of its variants' Thompson scores. The
    // strongest variant gets to advocate for the concept being picked.
    const variants = this.byConcept[conceptId];
    let best = -Infinity;
    const tagUnion = new Set();
    for (const v of variants) {
      let s = 0;
      for (const t of (v.tags || [])) {
        const arm = getArm(this.posteriors, t);
        s += sampleBeta(arm.a, arm.b);
        tagUnion.add(t);
      }
      const mean = s / Math.max((v.tags || []).length, 1);
      const score = mean * (v.prior || 1.0);
      if (score > best) best = score;
    }
    return best * this._diversityPenalty([...tagUnion]);
  }

  // Returns { concept, variants, defaultVariant } or null.
  pick(sessionSeenConcepts, persistentSeen, traceCount) {
    let pool = this._eligibleConcepts(sessionSeenConcepts, persistentSeen);
    if (pool.length === 0) {
      pool = this.conceptIds.filter(c => !sessionSeenConcepts.has(c));
    }
    if (pool.length === 0) pool = this.conceptIds.slice();
    if (pool.length === 0) return null;

    let chosen;
    if (this.inColdStart(traceCount)) {
      chosen = this._coldStartPick(pool);
    } else {
      let best = pool[0], bestScore = -Infinity;
      for (const c of pool) {
        const s = this._scoreConcept(c);
        if (s > bestScore) { bestScore = s; best = c; }
      }
      chosen = best;
    }
    return {
      concept: chosen,
      variants: this.byConcept[chosen],
      defaultVariant: this.defaultVariant(chosen),
    };
  }

  // Round-robin over categories — one per category, shuffled within.
  _coldStartPick(conceptPool) {
    const byCat = {};
    for (const c of conceptPool) {
      const cat = this.byConcept[c][0].category || "_";
      (byCat[cat] = byCat[cat] || []).push(c);
    }
    const cats = Object.keys(byCat);
    if (cats.length === 0) return conceptPool[Math.floor(Math.random() * conceptPool.length)];
    const pickedCat = cats[Math.floor(Math.random() * cats.length)];
    const arr = byCat[pickedCat];
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
