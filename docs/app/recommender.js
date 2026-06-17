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

// Public API ---------------------------------------------------------------

export class Recommender {
  constructor(catalog) {
    this.catalog = catalog;             // array of fly entries from manifest
    this.byId = Object.fromEntries(catalog.map(f => [f.id, f]));
    this.posteriors = loadPosteriors();
    this.recentTags = [];               // last DIVERSITY_WINDOW × tag sets
  }

  // Update on leaving a Fly.
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

  // Posterior mean (for inspection)
  tagPosteriorMean(tag) {
    const arm = this.posteriors[tag];
    if (!arm) return 0.5;
    return arm.a / (arm.a + arm.b);
  }

  // True if we are still in the cold-start phase.
  inColdStart(traceCount) {
    return (traceCount || 0) < COLD_START_THRESHOLD;
  }

  // Eligible: not in session seen-set, not in cross-session cooldown.
  _eligible(sessionSeen, persistentSeen) {
    const now = Date.now();
    return this.catalog.filter(f => {
      if (sessionSeen.has(f.id)) return false;
      const lastSeen = persistentSeen[f.id];
      if (lastSeen && (now - lastSeen) < COOLDOWN_MS) return false;
      return true;
    });
  }

  _diversityPenalty(fly) {
    if (this.recentTags.length === 0) return 1.0;
    let overlap = 0;
    for (const tagSet of this.recentTags) {
      for (const t of fly.tags) {
        if (tagSet.includes(t)) { overlap++; break; }
      }
    }
    // Each window-Fly that shared a tag drags the score down a bit.
    return Math.pow(1 - DIVERSITY_PENALTY, overlap);
  }

  _scoreCandidate(fly) {
    let s = 0;
    for (const t of fly.tags) {
      const arm = getArm(this.posteriors, t);
      s += sampleBeta(arm.a, arm.b);
    }
    const mean = s / Math.max(fly.tags.length, 1);
    return mean * (fly.prior || 1.0) * this._diversityPenalty(fly);
  }

  // sessionSeen: Set of ids served this session.
  // persistentSeen: { id: timestamp_ms } from localStorage.
  pick(sessionSeen, persistentSeen, traceCount) {
    let pool = this._eligible(sessionSeen, persistentSeen);

    // If we ran out (small swarm, all seen), drop the persistent cooldown.
    if (pool.length === 0) {
      pool = this.catalog.filter(f => !sessionSeen.has(f.id));
    }
    // Still empty? Allow repeats — better than a blank screen.
    if (pool.length === 0) pool = this.catalog.slice();
    if (pool.length === 0) return null;

    if (this.inColdStart(traceCount)) {
      return this._coldStartPick(pool);
    }

    let best = pool[0];
    let bestScore = -Infinity;
    for (const f of pool) {
      const s = this._scoreCandidate(f);
      if (s > bestScore) { bestScore = s; best = f; }
    }
    return best;
  }

  // Round-robin over categories — one per category, shuffled within.
  _coldStartPick(pool) {
    const byCat = {};
    for (const f of pool) {
      const c = f.category || "_";
      (byCat[c] = byCat[c] || []).push(f);
    }
    const cats = Object.keys(byCat);
    if (cats.length === 0) return pool[Math.floor(Math.random() * pool.length)];

    // Pick the category least represented in recentTags so far.
    let pickedCat = cats[Math.floor(Math.random() * cats.length)];
    const arr = byCat[pickedCat];
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
