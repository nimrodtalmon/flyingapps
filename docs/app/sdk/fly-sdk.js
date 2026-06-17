// Fly SDK — injected into every Fly. Bridges the sandboxed iframe to the feed.
// Self-contained; no imports. Source of truth — hatchery inlines this verbatim.

(function () {
  if (window.Fly) return;

  function send(type, payload) {
    try {
      parent.postMessage({ source: "fly", type, payload: payload || null }, "*");
    } catch (e) { /* parentless preview is fine */ }
  }

  const Fly = {
    ready:       () => send("fly:ready"),
    interaction: (kind) => send("fly:interaction", { kind: kind || null }),
    complete:    () => send("fly:complete"),
    catch:       () => send("fly:catch"),
  };

  window.Fly = Fly;

  // Parent → Fly messages dispatched as window events.
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "fly:active") window.dispatchEvent(new CustomEvent("fly:active"));
    if (d.type === "fly:pause")  window.dispatchEvent(new CustomEvent("fly:pause"));
  });

  // Auto-ready when DOM is parsed.
  function ready() { Fly.ready(); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    ready();
  }
})();
