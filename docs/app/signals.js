// Signals → reward. All weights/thresholds live in TUNABLES.
//
// Dwell alone conflates delight with confusion, so interactions and explicit
// "catch" weigh higher. fast_skip punishes Flies that never even engaged.

export const TUNABLES = {
  T_target:      20,   // seconds of dwell that count as "saturated"
  inter_target:   5,   // interactions that count as "saturated"
  w_dwell:       0.25,
  w_inter:       0.35,
  w_complete:    0.20,
  w_catch:       0.40,
  w_fast_skip:   0.30,
  fast_skip_dwell_s: 2,
  engaged_threshold: 0.5,
};

const SEEN_KEY    = "fa.seen.v1";
const JAR_KEY     = "fa.jar.v1";
const TRACES_KEY  = "fa.traces.v1";

const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function computeReward(t) {
  const T = TUNABLES;
  const dwell_s = (t.dwell_ms || 0) / 1000;
  const dwell_n = Math.min(dwell_s / T.T_target, 1);
  const inter_n = Math.min((t.interactions || 0) / T.inter_target, 1);
  const fast_skip = (dwell_s < T.fast_skip_dwell_s && (t.interactions || 0) === 0) ? 1 : 0;

  const raw =
    T.w_dwell    * dwell_n +
    T.w_inter    * inter_n +
    T.w_complete * (t.completed ? 1 : 0) +
    T.w_catch    * (t.caught ? 1 : 0) -
    T.w_fast_skip * fast_skip;

  return clip(raw, 0, 1);
}

export function isEngaged(reward) {
  return reward > TUNABLES.engaged_threshold;
}

// ---- persistence ---------------------------------------------------------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

// Seen set is timestamped so we can cool down across sessions.
export function getSeen() { return loadJSON(SEEN_KEY, {}); }
export function markSeen(id) {
  const seen = getSeen();
  seen[id] = Date.now();
  saveJSON(SEEN_KEY, seen);
}

// Jar
export function getJar() { return loadJSON(JAR_KEY, []); }
export function addToJar(id) {
  const jar = getJar();
  if (!jar.includes(id)) {
    jar.push(id);
    saveJSON(JAR_KEY, jar);
  }
}
export function removeFromJar(id) {
  const jar = getJar().filter(x => x !== id);
  saveJSON(JAR_KEY, jar);
}

// Trace log — keep recent N for debugging / future analysis.
const TRACE_CAP = 200;
export function saveTrace(trace) {
  const traces = loadJSON(TRACES_KEY, []);
  traces.push(trace);
  if (traces.length > TRACE_CAP) traces.splice(0, traces.length - TRACE_CAP);
  saveJSON(TRACES_KEY, traces);
}
export function countTraces() {
  return loadJSON(TRACES_KEY, []).length;
}
