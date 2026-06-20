// Hatch new Flies from inside the feed. Uses the user's fine-grained GitHub
// PAT (kept only in their browser's localStorage) to fire the
// .github/workflows/hatch.yml workflow via repository_dispatch. Polls the
// manifest for the new entry, then surfaces a tap-to-see toast.

const PAT_KEY  = "fa.gh_pat.v1";
const POLL_MS  = 5000;
const POLL_MAX = 4 * 60 * 1000;

export function getPat()       { try { return localStorage.getItem(PAT_KEY); } catch (e) { return null; } }
export function setPat(token)  { try { localStorage.setItem(PAT_KEY, token); } catch (e) {} }
export function clearPat()     { try { localStorage.removeItem(PAT_KEY); } catch (e) {} }

// owner/repo. Tries the GitHub Pages URL pattern first, then a `repo`
// field in manifest.json as a fallback for custom domains / localhost.
export function detectRepo(manifest) {
  const host = location.hostname;
  if (host.endsWith(".github.io")) {
    const owner = host.split(".")[0];
    const repo = location.pathname.split("/").filter(Boolean)[0];
    if (owner && repo) return `${owner}/${repo}`;
  }
  if (manifest && typeof manifest.repo === "string" && manifest.repo.includes("/")) {
    return manifest.repo;
  }
  return null;
}

export async function dispatchHatch(repoSlug, pat, { idea, count, category }) {
  const res = await fetch(`https://api.github.com/repos/${repoSlug}/dispatches`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: "hatch",
      client_payload: {
        idea: idea || "",
        count: String(count || 1),
        category: category || "",
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
}

// Polls manifest.json until at least one new static-Fly id appears (compared
// to `knownIds`), then resolves with the new entries. Or rejects on timeout.
export function pollForNewFly(knownIds, onTick) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      if (Date.now() - t0 > POLL_MAX) {
        reject(new Error("polling timed out — the workflow may still be running, try again in a minute"));
        return;
      }
      try {
        const res = await fetch("manifest.json", { cache: "no-cache" });
        if (res.ok) {
          const m = await res.json();
          const fresh = (m.flies || []).filter(f => f.id && !knownIds.has(f.id));
          if (fresh.length > 0) { resolve({ manifest: m, fresh }); return; }
        }
      } catch (e) { /* swallow, retry */ }
      if (typeof onTick === "function") onTick(Math.round((Date.now() - t0) / 1000));
      setTimeout(tick, POLL_MS);
    }
    tick();
  });
}
