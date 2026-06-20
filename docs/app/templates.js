// Client-side Fly templates — parameterized generators that produce a fresh
// self-contained HTML document per variant. The feed mounts them via the
// iframe `srcdoc` attribute, so no static file needs to exist per variant.
//
// Each template exports:
//   concept       — id of the concept these variants belong to
//   tags, category — manifest-style metadata
//   variantCount  — how many variants this template offers
//   variantTitle(i) — short title for variant i
//   render(i)     — returns a complete HTML string for variant i
//
// IDs assigned by feed.js are `${templateId}-v${i}` so per-variant stats are
// stable across reloads.

// ---- shared SDK inlined into every generated Fly ------------------------

const SDK = `<script>
(function(){if(window.Fly)return;function s(t,p){try{parent.postMessage({source:"fly",type:t,payload:p||null},"*")}catch(e){}}window.Fly={ready:()=>s("fly:ready"),interaction:k=>s("fly:interaction",{kind:k||null}),complete:()=>s("fly:complete"),catch:()=>s("fly:catch")};window.addEventListener("message",e=>{const d=e.data;if(!d||typeof d!=="object")return;if(d.type==="fly:active")window.dispatchEvent(new CustomEvent("fly:active"));if(d.type==="fly:pause")window.dispatchEvent(new CustomEvent("fly:pause"))});function r(){Fly.ready()}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",r,{once:true});else r();})();
</script>`;

const HEAD = (title, tags, css) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="fly:tags" content="${tags.join(",")}">
<title>${title}</title>
<style>${css}</style>
</head>
<body>`;

const TAIL = (js) => `${SDK}
<script>${js}</script>
</body>
</html>`;

// =========================================================================
// breath — 6 rhythm variants of a calming breath pacer
// =========================================================================

const BREATH_RHYTHMS = [
  { name: "Even Breath",   phases: [{n:"in",s:4},{n:"out",s:4}],                          scale:[1.0,0.55] },
  { name: "5-5 Breath",    phases: [{n:"in",s:5},{n:"out",s:5}],                          scale:[1.0,0.55] },
  { name: "Calm Breath",   phases: [{n:"in",s:3},{n:"hold",s:1},{n:"out",s:3}],           scale:[1.0,1.0,0.55] },
  { name: "Deep Breath",   phases: [{n:"in",s:6},{n:"hold",s:2},{n:"out",s:7}],           scale:[1.0,1.0,0.55] },
  { name: "Slow Breath",   phases: [{n:"in",s:8},{n:"out",s:12}],                         scale:[1.0,0.55] },
  { name: "Steady Breath", phases: [{n:"in",s:4},{n:"hold",s:2},{n:"out",s:6}],           scale:[1.0,1.0,0.55] },
];

function renderBreath(i) {
  const r = BREATH_RHYTHMS[i % BREATH_RHYTHMS.length];
  const css = `
    html,body{margin:0;height:100%;background:radial-gradient(120% 80% at 50% 30%,#EAF6F4,#F4F8FA 60%,#FFFFFF);font-family:-apple-system,system-ui,sans-serif;color:#1A2330;overflow:hidden;-webkit-tap-highlight-color:transparent}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:24px}
    .ring-wrap{position:relative;width:64vmin;height:64vmin;max-width:280px;max-height:280px;display:grid;place-items:center}
    .ring{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 40% 35%,rgba(43,182,163,.22),rgba(45,125,210,.08) 70%);box-shadow:0 30px 60px -20px rgba(43,182,163,.25),inset 0 0 0 1px rgba(43,182,163,.15);transform:scale(.55);transition:transform 4s cubic-bezier(.45,0,.55,1)}
    .core{position:relative;z-index:2;width:62%;height:62%;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#EFF7F5 60%,#DBEDE9);box-shadow:inset 0 1px 1px #fff,0 8px 22px rgba(46,80,110,.12);display:grid;place-items:center}
    .phase{font-size:18px;letter-spacing:.18em;text-transform:lowercase;color:#1A2330;opacity:.78}
    .secs{font-variant-numeric:tabular-nums;font-size:38px;font-weight:200;color:#2BB6A3;margin-top:2px;letter-spacing:.02em}
    .meta{font-size:12px;letter-spacing:.18em;text-transform:lowercase;color:#8B97A6;text-align:center;line-height:1.6}
    .btn{margin-top:6px;padding:10px 22px;font:inherit;font-size:13px;letter-spacing:.18em;text-transform:lowercase;border-radius:999px;border:1px solid rgba(43,182,163,.35);background:#fff;color:#2BB6A3;cursor:pointer}
  `;
  const body = `
    <div class="wrap">
      <div class="ring-wrap">
        <div id="ring" class="ring"></div>
        <div class="core"><div style="text-align:center"><div id="phase" class="phase">ready</div><div id="secs" class="secs">0</div></div></div>
      </div>
      <div class="meta"><span id="cycle">cycle 0 of 4</span></div>
      <button id="btn" class="btn">begin</button>
    </div>
  `;
  const js = `
    var PHASES = ${JSON.stringify(r.phases)};
    var SCALES = ${JSON.stringify(r.scale)};
    var CYCLES = 4;
    var ring = document.getElementById("ring");
    var phaseEl = document.getElementById("phase");
    var secsEl = document.getElementById("secs");
    var cycleEl = document.getElementById("cycle");
    var btn = document.getElementById("btn");
    var running = false, cycle = 0, step = 0, timer = null, tick = null;
    function go(p, scale) {
      phaseEl.textContent = p.n;
      secsEl.textContent = p.s;
      ring.style.transition = "transform " + p.s + "s cubic-bezier(.45,0,.55,1)";
      ring.style.transform = "scale(" + scale + ")";
      var remaining = p.s;
      clearInterval(tick);
      tick = setInterval(function(){ remaining -= 1; if (remaining >= 0) secsEl.textContent = remaining; }, 1000);
    }
    function next() {
      if (!running) return;
      go(PHASES[step], SCALES[step]);
      timer = setTimeout(function(){
        step += 1;
        if (step >= PHASES.length) {
          step = 0; cycle += 1;
          cycleEl.textContent = "cycle " + cycle + " of " + CYCLES;
          if (cycle >= CYCLES) { stop(true); return; }
        }
        next();
      }, PHASES[step].s * 1000);
    }
    function start() {
      if (running) return;
      running = true; cycle = 0; step = 0;
      btn.textContent = "stop";
      cycleEl.textContent = "cycle 0 of " + CYCLES;
      Fly.interaction("start"); next();
    }
    function stop(done) {
      running = false;
      clearTimeout(timer); clearInterval(tick);
      ring.style.transition = "transform 1.2s cubic-bezier(.45,0,.55,1)";
      ring.style.transform = "scale(.55)";
      phaseEl.textContent = done ? "done" : "paused";
      secsEl.textContent  = done ? "\\u2713" : "\\u00b7";
      btn.textContent     = done ? "again" : "resume";
      if (done) Fly.complete();
    }
    btn.addEventListener("click", function(){ if (running) stop(false); else start(); });
    window.addEventListener("fly:pause", function(){ if (running) stop(false); });
  `;
  return HEAD(r.name, TEMPLATES.breath.tags, css) + body + TAIL(js);
}

// =========================================================================
// mood — gradient sphere variants by palette
// =========================================================================

const MOOD_PALETTES = [
  { name: "drift",  a:"#EAF1F6", b:"#F7FAFC", core:["#9CD5CC","#2BB6A3"] },
  { name: "dusk",   a:"#FFEFE5", b:"#FFD9C7", core:["#FF9F84","#E15B45"] },
  { name: "deep",   a:"#1E2A3A", b:"#0F1825", core:["#5DA9E9","#2D7DD2"] },
  { name: "meadow", a:"#E8F4DE", b:"#D8EBC8", core:["#A8D88A","#5BAE4E"] },
  { name: "plum",   a:"#1F1530", b:"#2E1F47", core:["#C892D8","#7B3FA0"] },
  { name: "honey",  a:"#FFF4D6", b:"#FFE5A0", core:["#FFC34A","#E0902B"] },
];

function renderMood(i) {
  const p = MOOD_PALETTES[i % MOOD_PALETTES.length];
  const css = `
    html,body{margin:0;height:100%;background:linear-gradient(180deg,${p.a},${p.b});font-family:-apple-system,system-ui,sans-serif;color:#1A2330;overflow:hidden;-webkit-tap-highlight-color:transparent;transition:background 1.6s cubic-bezier(.45,0,.55,1)}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:24px}
    .ring{width:60vmin;height:60vmin;max-width:280px;max-height:280px;border-radius:50%;background:radial-gradient(circle at 35% 30%,${p.core[0]},${p.core[1]} 70%);box-shadow:0 30px 60px -20px rgba(0,0,0,.25),inset 0 0 0 1px rgba(255,255,255,.55);transition:transform 600ms cubic-bezier(.45,0,.55,1);cursor:pointer;will-change:transform}
    .ring:active{transform:scale(.96)}
    .label{font-size:13px;letter-spacing:.22em;text-transform:lowercase;color:rgba(0,0,0,.55)}
    .hex{font-variant-numeric:tabular-nums;font-size:14px;letter-spacing:.18em;color:rgba(0,0,0,.4)}
  `;
  const body = `
    <div class="wrap">
      <div class="label">${p.name}</div>
      <div id="ring" class="ring"></div>
      <div class="hex">${p.core[1]}</div>
    </div>
  `;
  const js = `
    var ring = document.getElementById("ring");
    var pulse = false;
    ring.addEventListener("click", function(){
      if (pulse) return; pulse = true;
      ring.style.transform = "scale(1.06)";
      setTimeout(function(){ ring.style.transform = "scale(1)"; pulse = false; }, 700);
      Fly.interaction("pulse");
    });
  `;
  return HEAD("Mood " + p.name, TEMPLATES.mood.tags, css) + body + TAIL(js);
}

// =========================================================================
// pebble — ripple visualizations in different palettes
// =========================================================================

const PEBBLE_PALETTES = [
  { name: "Pond",   bg: ["#E0EEF2","#CFE2EC","#B8D2DF"], ring: 200, vibe: "rgba(7,12,22,0.0)" },
  { name: "Ember",  bg: ["#2A1812","#1A0E0A","#100805"], ring: 25,  vibe: "rgba(7,12,22,0.18)" },
  { name: "Forest", bg: ["#1B2C20","#142018","#0C1410"], ring: 110, vibe: "rgba(7,12,22,0.16)" },
  { name: "Mist",   bg: ["#F1ECF8","#E0D8F0","#C8BCDF"], ring: 270, vibe: "rgba(255,255,255,0.0)" },
];

function renderPebble(i) {
  const p = PEBBLE_PALETTES[i % PEBBLE_PALETTES.length];
  const darkBg = p.name === "Ember" || p.name === "Forest";
  const css = `
    html,body{margin:0;height:100%;background:radial-gradient(120% 80% at 50% 30%,${p.bg[0]} 0%,${p.bg[1]} 60%,${p.bg[2]} 100%);overflow:hidden;-webkit-tap-highlight-color:transparent;font-family:-apple-system,system-ui,sans-serif;user-select:none}
    canvas{position:fixed;inset:0;width:100%;height:100%;display:block;cursor:crosshair}
    .hint{position:fixed;bottom:96px;left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:.22em;text-transform:lowercase;color:${darkBg ? "rgba(255,255,255,.45)" : "rgba(26,35,48,.4)"};pointer-events:none}
  `;
  const body = `<canvas id="c"></canvas><div class="hint">${p.name.toLowerCase()} — tap to drop</div>`;
  const fadeColor = darkBg ? "rgba(15,20,30,0.18)" : "rgba(184,210,223,0.18)";
  const js = `
    var c = document.getElementById("c"), ctx = c.getContext("2d");
    var W=0,H=0,dpr=Math.min(window.devicePixelRatio||1,2);
    function resize(){ W=c.clientWidth; H=c.clientHeight; c.width=W*dpr; c.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
    window.addEventListener("resize", resize); resize();
    var ripples = [];
    function drop(x,y){ ripples.push({ x:x, y:y, r:0, t:0, life:1, hue: ${p.ring} + (Math.random()-.5)*30 }); if (ripples.length>30) ripples.shift(); }
    var running = true, raf=0;
    function frame(){
      if (!running) return;
      ctx.fillStyle = "${fadeColor}"; ctx.fillRect(0,0,W,H);
      for (var i=ripples.length-1;i>=0;i--){
        var r = ripples[i];
        r.t += 1/60; r.r += 1.6; r.life = Math.max(0, 1 - r.t/3.2);
        if (r.life <= 0) { ripples.splice(i,1); continue; }
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2);
        ctx.strokeStyle = "hsla(" + r.hue + ",55%,${darkBg ? 55 : 40}%," + (0.55*r.life) + ")";
        ctx.lineWidth = 1.4; ctx.stroke();
        if (r.r > 16) {
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r-14, 0, Math.PI*2);
          ctx.strokeStyle = "hsla(" + r.hue + ",60%,${darkBg ? 65 : 55}%," + (0.35*r.life) + ")";
          ctx.lineWidth = 1; ctx.stroke();
        }
      }
      raf = requestAnimationFrame(frame);
    }
    frame();
    c.addEventListener("pointerdown", function(e){
      var rect = c.getBoundingClientRect();
      drop(e.clientX - rect.left, e.clientY - rect.top);
      Fly.interaction("drop");
    });
    window.addEventListener("fly:pause", function(){ running=false; cancelAnimationFrame(raf); });
    window.addEventListener("fly:active", function(){ if (!running){ running=true; frame(); } });
  `;
  return HEAD(p.name + " Pebbles", TEMPLATES.pebble.tags, css) + body + TAIL(js);
}

// =========================================================================
// palette — color palette generators across six harmony rules
// =========================================================================

const PALETTE_HARMONIES = [
  { name: "Analogous",      offsets: [-30, -15, 0, 15, 30] },
  { name: "Complementary",  offsets: [0, 10, 180, 170, 190] },
  { name: "Triadic",        offsets: [0, 120, 240, 60, 300] },
  { name: "Monochrome",     offsets: [0, 0, 0, 0, 0] },
  { name: "Split-comp",     offsets: [0, 150, 210, 30, 330] },
  { name: "Square",         offsets: [0, 90, 180, 270, 45] },
];

function renderPalette(i) {
  const h = PALETTE_HARMONIES[i % PALETTE_HARMONIES.length];
  const css = `
    html,body{margin:0;height:100%;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;-webkit-tap-highlight-color:transparent;color:#1A2330}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column}
    .swatch{flex:1;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;padding:18px 22px;transition:flex 600ms cubic-bezier(.16,1,.3,1)}
    .swatch.big{flex:3}
    .name{font-size:13px;letter-spacing:.18em;text-transform:lowercase;opacity:.7}
    .hex{font-variant-numeric:tabular-nums;font-size:18px;letter-spacing:.08em;font-weight:300}
    .hint{position:fixed;bottom:96px;left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:.22em;text-transform:lowercase;color:rgba(255,255,255,.78);pointer-events:none;padding:6px 14px;border-radius:999px;background:rgba(0,0,0,0.25);backdrop-filter:blur(4px)}
  `;
  const body = `<div class="wrap" id="wrap"></div><div class="hint">${h.name.toLowerCase()} — tap to wander</div>`;
  const js = `
    var OFFSETS = ${JSON.stringify(h.offsets)};
    var MONO = ${h.name === "Monochrome"};
    var wrap = document.getElementById("wrap");
    function hslToHex(h,s,l){ s/=100; l/=100; var k=function(n){return (n+h/30)%12;}; var a=s*Math.min(l,1-l); var f=function(n){return l - a*Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n), 1)));};
      var r=Math.round(f(0)*255), g=Math.round(f(8)*255), b=Math.round(f(4)*255);
      return "#"+[r,g,b].map(function(x){return x.toString(16).padStart(2,"0");}).join(""); }
    function isLight(hex){ var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return (0.299*r+0.587*g+0.114*b)>170; }
    var ADJ=["calm","soft","deep","faint","dusty","quiet","still","bright","worn","clear"];
    var NOUN=["lake","sand","sky","slate","moss","silk","mist","linen","pine","ember"];
    function nm(){ return ADJ[Math.floor(Math.random()*ADJ.length)]+" "+NOUN[Math.floor(Math.random()*NOUN.length)]; }
    var palette=[], bigIdx=0;
    function generate(){
      var baseH=Math.random()*360, baseS=35+Math.random()*40, baseL=50+(Math.random()-.5)*30;
      palette = OFFSETS.slice(0,4).map(function(d, idx){
        var hh=(baseH+d+360)%360;
        var ss=Math.max(15,Math.min(85, baseS+(Math.random()-.5)*20));
        var ll=Math.max(20,Math.min(82, MONO ? baseL + (idx-1.5)*14 : baseL+(Math.random()-.5)*20));
        return { hex: hslToHex(hh,ss,ll), name: nm() };
      });
    }
    function render(){
      wrap.innerHTML="";
      palette.forEach(function(c, i){
        var el = document.createElement("div");
        el.className = "swatch" + (i === bigIdx ? " big" : "");
        el.style.background = c.hex;
        el.style.color = isLight(c.hex) ? "#1A2330" : "#FFFFFF";
        el.innerHTML = '<div class="name">'+c.name+'</div><div class="hex">'+c.hex.toUpperCase()+'</div>';
        el.addEventListener("click", function(){
          if (i === bigIdx) { generate(); bigIdx = 0; } else bigIdx = i;
          render(); Fly.interaction("pick");
        });
        wrap.appendChild(el);
      });
    }
    generate(); render();
  `;
  return HEAD(h.name, TEMPLATES.palette.tags, css) + body + TAIL(js);
}

// =========================================================================
// lissajous — generative figure-8 curves across five frequency ratios
// =========================================================================

const LISSAJOUS_PARAMS = [
  { name: "3:2",  a: 3, b: 2, delta: Math.PI/2 },
  { name: "5:4",  a: 5, b: 4, delta: Math.PI/3 },
  { name: "2:3",  a: 2, b: 3, delta: Math.PI/4 },
  { name: "1:2",  a: 1, b: 2, delta: 0 },
  { name: "7:5",  a: 7, b: 5, delta: Math.PI/2 },
];

function renderLissajous(i) {
  const p = LISSAJOUS_PARAMS[i % LISSAJOUS_PARAMS.length];
  const css = `
    html,body{margin:0;height:100%;background:radial-gradient(120% 80% at 50% 30%,#1B2330,#0E141E 60%,#070A12);overflow:hidden;-webkit-tap-highlight-color:transparent;font-family:-apple-system,system-ui,sans-serif}
    canvas{position:fixed;inset:0;width:100%;height:100%;display:block}
    .label{position:fixed;top:max(24px,env(safe-area-inset-top,0));left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:.22em;text-transform:lowercase;color:rgba(255,255,255,.45);pointer-events:none}
    .hint{position:fixed;bottom:96px;left:50%;transform:translateX(-50%);font-size:12px;letter-spacing:.22em;text-transform:lowercase;color:rgba(255,255,255,.35);pointer-events:none}
  `;
  const body = `<canvas id="c"></canvas><div class="label">${p.name}</div><div class="hint">tap to nudge</div>`;
  const js = `
    var c = document.getElementById("c"), ctx = c.getContext("2d");
    var W=0,H=0,dpr=Math.min(window.devicePixelRatio||1,2);
    function resize(){ W=c.clientWidth; H=c.clientHeight; c.width=W*dpr; c.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
    window.addEventListener("resize", resize); resize();
    var A = ${p.a}, B = ${p.b}, delta = ${p.delta};
    var t = 0, running = true, raf=0;
    var TRAIL = 240;
    var points = [];
    function frame(){
      if (!running) return;
      ctx.fillStyle = "rgba(10,14,22,0.10)"; ctx.fillRect(0,0,W,H);
      t += 0.012;
      var cx = W/2, cy = H/2;
      var R = Math.min(W,H) * 0.35;
      var x = cx + R * Math.sin(A*t + delta);
      var y = cy + R * Math.sin(B*t);
      points.push({x:x,y:y,t:t});
      if (points.length > TRAIL) points.shift();
      for (var i = 1; i < points.length; i++){
        var p0 = points[i-1], p1 = points[i];
        var f = i / points.length;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = "hsla(" + (170 + 40*Math.sin(p1.t*0.7)) + ",70%,65%," + (0.5*f) + ")";
        ctx.lineWidth = 1.5 * f;
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2);
      ctx.fillStyle = "rgba(120,220,210,0.95)"; ctx.fill();
      raf = requestAnimationFrame(frame);
    }
    frame();
    c.addEventListener("pointerdown", function(e){
      var rect = c.getBoundingClientRect();
      delta += (e.clientX - rect.left) / W * Math.PI / 4;
      Fly.interaction("nudge");
    });
    window.addEventListener("fly:pause", function(){ running=false; cancelAnimationFrame(raf); });
    window.addEventListener("fly:active", function(){ if (!running){ running=true; frame(); } });
  `;
  return HEAD(p.name + " Curve", TEMPLATES.lissajous.tags, css) + body + TAIL(js);
}

// =========================================================================
// Public registry
// =========================================================================

export const TEMPLATES = {
  breath: {
    concept: "breath-pacer",
    tags: ["mindful", "ambient", "time"],
    category: "mindful",
    variantCount: BREATH_RHYTHMS.length,
    variantTitle: (i) => BREATH_RHYTHMS[i].name,
    render: renderBreath,
  },
  mood: {
    concept: "mood-ring",
    tags: ["ambient", "visual", "color"],
    category: "visuals",
    variantCount: MOOD_PALETTES.length,
    variantTitle: (i) => "Mood " + MOOD_PALETTES[i].name,
    render: renderMood,
  },
  pebble: {
    concept: "pebbles",
    tags: ["ambient", "mindful", "visual"],
    category: "mindful",
    variantCount: PEBBLE_PALETTES.length,
    variantTitle: (i) => PEBBLE_PALETTES[i].name + " Pebbles",
    render: renderPebble,
  },
  palette: {
    concept: "color-sample",
    tags: ["creative", "visual", "color"],
    category: "creative",
    variantCount: PALETTE_HARMONIES.length,
    variantTitle: (i) => PALETTE_HARMONIES[i].name,
    render: renderPalette,
  },
  lissajous: {
    concept: "lissajous",
    tags: ["visual", "math", "generative"],
    category: "visuals",
    variantCount: LISSAJOUS_PARAMS.length,
    variantTitle: (i) => LISSAJOUS_PARAMS[i].name + " Curve",
    render: renderLissajous,
  },
};
