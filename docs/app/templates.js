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
// starfield — drifting particles, palette + density variants
// =========================================================================

const STARFIELD_PALETTES = [
  { name: "Night", bg: ["#1E2A3A","#0F1825","#070C16"], star: "rgba(255,255,255," , density: 120 },
  { name: "Dusk",  bg: ["#2A1A2A","#1A0E1A","#0E0510"], star: "rgba(255,220,200,", density: 90  },
  { name: "Deep",  bg: ["#0F1E2A","#081420","#040A12"], star: "rgba(180,220,255,", density: 180 },
  { name: "Ember", bg: ["#2A1612","#1A0A06","#100502"], star: "rgba(255,180,130,", density: 80  },
];

function renderStarfield(i) {
  const p = STARFIELD_PALETTES[i % STARFIELD_PALETTES.length];
  const css = `
    html,body{margin:0;height:100%;background:radial-gradient(120% 80% at 50% 30%,${p.bg[0]},${p.bg[1]} 60%,${p.bg[2]});overflow:hidden;-webkit-tap-highlight-color:transparent;font-family:-apple-system,system-ui,sans-serif}
    canvas{position:fixed;inset:0;width:100%;height:100%;display:block}
    .hint{position:fixed;bottom:96px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.4);font-size:12px;letter-spacing:.18em;text-transform:lowercase}
  `;
  const body = `<canvas id="c"></canvas><div class="hint">${p.name.toLowerCase()} — tap to seed</div>`;
  const fadeColor = `rgba(${p.bg[2].slice(1).match(/.{2}/g).map(x=>parseInt(x,16)).join(",")},0.18)`;
  const js = `
    var c=document.getElementById("c"),ctx=c.getContext("2d");
    var W=0,H=0,dpr=Math.min(window.devicePixelRatio||1,2);
    function resize(){W=c.clientWidth;H=c.clientHeight;c.width=W*dpr;c.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
    window.addEventListener("resize",resize);resize();
    var stars=[];
    function seed(x,y,bright){stars.push({x:x==null?Math.random()*W:x,y:y==null?Math.random()*H:y,r:0.4+Math.random()*1.6,v:0.05+Math.random()*0.22,a:bright?1:0.4+Math.random()*0.5,t:Math.random()*Math.PI*2,tv:0.02+Math.random()*0.04});}
    for(var i=0;i<${p.density};i++)seed();
    var running=true,raf=0;
    function frame(){if(!running)return;ctx.fillStyle="${fadeColor}";ctx.fillRect(0,0,W,H);for(var s of stars){s.y+=s.v;if(s.y>H+4){s.y=-4;s.x=Math.random()*W;}s.t+=s.tv;var tw=0.6+0.4*Math.sin(s.t);ctx.beginPath();ctx.fillStyle="${p.star}"+(s.a*tw)+")";ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}raf=requestAnimationFrame(frame);}
    frame();
    c.addEventListener("pointerdown",function(e){var r=c.getBoundingClientRect();for(var k=0;k<4;k++)seed(e.clientX-r.left+(Math.random()-.5)*16,e.clientY-r.top+(Math.random()-.5)*16,true);Fly.interaction("seed");});
    window.addEventListener("fly:pause",function(){running=false;cancelAnimationFrame(raf);});
    window.addEventListener("fly:active",function(){if(!running){running=true;frame();}});
  `;
  return HEAD(p.name + " Sky", TEMPLATES.starfield.tags, css) + body + TAIL(js);
}

// =========================================================================
// coin — flip variants: H/T, Yes/No, Up/Down, Day/Night
// =========================================================================

const COIN_FACES = [
  { name: "Heads/Tails", a: "H",   b: "T",    aBg:"#FFE6A8,#E0902B", bBg:"#E0F2EE,#2BB6A3" },
  { name: "Yes/No",      a: "yes", b: "no",   aBg:"#D6F2EC,#2BB6A3", bBg:"#FFD6D0,#E15B45" },
  { name: "Up/Down",     a: "↑",   b: "↓",    aBg:"#E0EEF8,#2D7DD2", bBg:"#FFEFE5,#FF9F84" },
  { name: "Day/Night",   a: "☀",   b: "☾",    aBg:"#FFF4D6,#FFC34A", bBg:"#1E2A3A,#2D7DD2" },
];

function renderCoin(i) {
  const f = COIN_FACES[i % COIN_FACES.length];
  const fontSize = f.a.length > 2 ? 26 : 54;
  const css = `
    html,body{margin:0;height:100%;background:linear-gradient(180deg,#EAF1F6,#F7FAFC);font-family:-apple-system,system-ui,sans-serif;color:#1A2330;overflow:hidden;-webkit-tap-highlight-color:transparent}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;padding:24px}
    .scene{perspective:800px;width:60vmin;height:60vmin;max-width:240px;max-height:240px}
    .coin{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform 1500ms cubic-bezier(.16,1,.3,1);cursor:pointer}
    .face{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;font-size:${fontSize}px;font-weight:200;letter-spacing:.06em;backface-visibility:hidden;box-shadow:inset 0 0 0 4px rgba(255,255,255,.6),0 14px 30px rgba(0,0,0,.12)}
    .heads{background:radial-gradient(circle at 35% 30%,${f.aBg});color:#1A2330}
    .tails{background:radial-gradient(circle at 35% 30%,${f.bBg});color:${i===3?"#FFFFFF":"#1A2330"};transform:rotateX(180deg)}
    .result{font-size:14px;letter-spacing:.22em;text-transform:lowercase;color:#8B97A6}
    .tally{font-size:13px;letter-spacing:.18em;color:#8B97A6;text-transform:lowercase}
    .tally span{color:#1A2330}
  `;
  const body = `
    <div class="wrap">
      <div id="result" class="result">tap to flip</div>
      <div class="scene"><div id="coin" class="coin">
        <div class="face heads">${f.a}</div>
        <div class="face tails">${f.b}</div>
      </div></div>
      <div class="tally"><span id="ca">0</span> ${escapeJS(f.a)} · <span id="cb">0</span> ${escapeJS(f.b)}</div>
    </div>
  `;
  const js = `
    var coin=document.getElementById("coin"), result=document.getElementById("result");
    var ca=0,cb=0,base=0,busy=false;
    var nameA=${JSON.stringify(f.a)}, nameB=${JSON.stringify(f.b)};
    coin.addEventListener("click",function(){if(busy)return;busy=true;var headSide=Math.random()<.5;var extra=5+Math.floor(Math.random()*3);base+=extra*180+(headSide?0:180)-(base%360);coin.style.transform="rotateX("+base+"deg)";setTimeout(function(){busy=false;if(headSide){ca++;document.getElementById("ca").textContent=ca;result.textContent=nameA;}else{cb++;document.getElementById("cb").textContent=cb;result.textContent=nameB;}Fly.interaction("flip");},1500);});
  `;
  return HEAD(f.name, TEMPLATES.coin.tags, css) + body + TAIL(js);
}

function escapeJS(s) { return String(s).replace(/[<>&"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c])); }

// =========================================================================
// roll-die — d6 palette variants
// =========================================================================

const DIE_PALETTES = [
  { name: "Classic", bg: "radial-gradient(circle at 30% 25%,#FFFFFF,#E5EEF3 70%,#D5E1EA)", pip: "#1A2330", shadow: "rgba(46,80,110,.16)" },
  { name: "Coral",   bg: "radial-gradient(circle at 30% 25%,#FFEEEA,#FFC8B8 70%,#FFAA98)", pip: "#5A2A20", shadow: "rgba(110,46,32,.16)" },
  { name: "Slate",   bg: "radial-gradient(circle at 30% 25%,#5B6878,#3D4858 70%,#2B3441)", pip: "#FFFFFF", shadow: "rgba(0,0,0,.32)" },
  { name: "Honey",   bg: "radial-gradient(circle at 30% 25%,#FFF4D6,#FFE5A0 70%,#FFC34A)", pip: "#5A4010", shadow: "rgba(110,80,20,.18)" },
];

function renderRollDie(i) {
  const p = DIE_PALETTES[i % DIE_PALETTES.length];
  const css = `
    html,body{margin:0;height:100%;background:linear-gradient(180deg,#EAF1F6,#F7FAFC);font-family:-apple-system,system-ui,sans-serif;color:#1A2330;overflow:hidden;-webkit-tap-highlight-color:transparent;user-select:none}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;padding:24px}
    .die{position:relative;width:46vmin;height:46vmin;max-width:200px;max-height:200px;border-radius:24px;background:${p.bg};box-shadow:inset 0 1px 1px rgba(255,255,255,.6),0 14px 30px ${p.shadow};display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;padding:14%;gap:6%;cursor:pointer;transition:transform 600ms cubic-bezier(.16,1,.3,1)}
    .die.rolling{animation:roll 600ms ease-in-out}
    @keyframes roll{0%{transform:rotate(0) scale(1)}25%{transform:rotate(-90deg) scale(.9)}50%{transform:rotate(180deg) scale(.85)}75%{transform:rotate(360deg) scale(.92)}100%{transform:rotate(720deg) scale(1)}}
    .pip{border-radius:50%;background:${p.pip};opacity:0;align-self:center;justify-self:center;width:62%;height:62%}
    .pip.on{opacity:1}
    .recent{display:flex;gap:10px;font-variant-numeric:tabular-nums}
    .recent .r{width:32px;height:32px;border-radius:8px;background:#fff;display:grid;place-items:center;font-size:14px;color:#1A2330;box-shadow:0 1px 3px rgba(0,0,0,.04);border:1px solid rgba(26,35,48,.06)}
    .label{font-size:12px;letter-spacing:.22em;text-transform:lowercase;color:#8B97A6}
  `;
  const body = `
    <div class="wrap">
      <div class="label">${p.name.toLowerCase()}</div>
      <div id="die" class="die">${Array.from({length:9}, () => '<div class="pip"></div>').join("")}</div>
      <div class="recent" id="recent"></div>
    </div>
  `;
  const js = `
    var MAP={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
    var pips=Array.from(document.querySelectorAll(".pip"));
    var die=document.getElementById("die"), recent=document.getElementById("recent");
    var hist=[];
    function show(n){pips.forEach(function(p){p.classList.remove("on");});MAP[n].forEach(function(i){pips[i].classList.add("on");});}
    function roll(){if(die.classList.contains("rolling"))return;die.classList.add("rolling");var t=0;var iv=setInterval(function(){show(1+Math.floor(Math.random()*6));t++;if(t>=6)clearInterval(iv);},80);setTimeout(function(){die.classList.remove("rolling");var n=1+Math.floor(Math.random()*6);show(n);hist.unshift(n);if(hist.length>5)hist.pop();recent.innerHTML=hist.slice(1).map(function(x){return '<div class="r">'+x+'</div>';}).join("");Fly.interaction("roll");},620);}
    show(1);die.addEventListener("click",roll);
  `;
  return HEAD(p.name + " Die", TEMPLATES.rollDie.tags, css) + body + TAIL(js);
}

// =========================================================================
// reaction-timer — palette + ramp variants
// =========================================================================

const REACTION_THEMES = [
  { name: "Classic", idle:["#EAF1F6","#F7FAFC"], wait:["#FFE5DC","#FFC8B8"], go:["#D6F2EC","#9CD5CC"], early:["#FFD9D9","#F3B1B1"] },
  { name: "Forest",  idle:["#E8F4DE","#D8EBC8"], wait:["#FFF4D6","#FFE5A0"], go:["#A8D88A","#5BAE4E"], early:["#FFD0C0","#F38E70"] },
  { name: "Ocean",   idle:["#E2F2F2","#CFE7E7"], wait:["#E0EEF8","#B8D6F0"], go:["#7FCBCB","#2E8C8C"], early:["#FFD0D8","#E69BAA"] },
];

function renderReaction(i) {
  const t = REACTION_THEMES[i % REACTION_THEMES.length];
  const css = `
    html,body{margin:0;height:100%;font-family:-apple-system,system-ui,sans-serif;color:#1A2330;overflow:hidden;-webkit-tap-highlight-color:transparent;user-select:none;transition:background 400ms ease}
    body.idle{background:linear-gradient(180deg,${t.idle.join(",")})}
    body.wait{background:linear-gradient(180deg,${t.wait.join(",")})}
    body.go{background:linear-gradient(180deg,${t.go.join(",")})}
    body.early{background:linear-gradient(180deg,${t.early.join(",")})}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;cursor:pointer}
    .big{font-size:11vmin;font-weight:200;letter-spacing:-.02em;color:#1A2330}
    .label{font-size:13px;letter-spacing:.22em;text-transform:lowercase;color:#1A2330;opacity:.7}
    .meta{font-size:12px;letter-spacing:.18em;text-transform:lowercase;color:#1A2330;opacity:.5;font-variant-numeric:tabular-nums}
  `;
  const body = `
    <div class="wrap" id="wrap">
      <div id="label" class="label">tap to begin</div>
      <div id="big" class="big">·</div>
      <div id="meta" class="meta">best: —</div>
    </div>
  `;
  const js = `
    var body=document.body,label=document.getElementById("label"),big=document.getElementById("big"),meta=document.getElementById("meta");
    var state="idle",startT=0,timer=null,best=null;
    body.classList.add("idle");
    function set(s){body.className=s;state=s;}
    function arm(){set("wait");label.textContent="wait for go";big.textContent="·";var d=900+Math.random()*2400;timer=setTimeout(function(){set("go");label.textContent="now";big.textContent="tap!";startT=performance.now();},d);}
    function tap(){Fly.interaction("tap");if(state==="idle"||state==="done"||state==="early"){arm();return;}if(state==="wait"){clearTimeout(timer);set("early");label.textContent="too early — tap to retry";big.textContent="✗";return;}if(state==="go"){var t=Math.round(performance.now()-startT);set("done");label.textContent="your time — tap to try again";big.textContent=t+" ms";if(best==null||t<best){best=t;meta.textContent="best: "+best+" ms";Fly.complete();}}}
    document.getElementById("wrap").addEventListener("click",tap);
    window.addEventListener("fly:pause",function(){clearTimeout(timer);if(state==="wait")set("idle");});
  `;
  return HEAD(t.name + " Reaction", TEMPLATES.reaction.tags, css) + body + TAIL(js);
}

// =========================================================================
// pixel-doodle — grid size + palette variants
// =========================================================================

const DOODLE_THEMES = [
  { name: "Canvas",  rows: 10, cols:  8, colors: ["#F2F5F8","#1A2330","#2BB6A3","#2D7DD2","#E15B45","#FFC34A","#7B3FA0","#5BAE4E"] },
  { name: "Cozy",    rows: 12, cols: 10, colors: ["#FFF4D6","#5A2A20","#E0902B","#A8D88A","#E15B45","#7B3FA0","#2BB6A3","#FFC34A"] },
  { name: "Slate",   rows:  8, cols:  6, colors: ["#222A38","#F7FAFC","#FFC34A","#2BB6A3","#E15B45","#9CD5CC","#FFFFFF","#7B3FA0"] },
];

function renderDoodle(i) {
  const t = DOODLE_THEMES[i % DOODLE_THEMES.length];
  const css = `
    html,body{margin:0;height:100%;background:linear-gradient(180deg,#EAF1F6,#F7FAFC);font-family:-apple-system,system-ui,sans-serif;color:#1A2330;overflow:hidden;-webkit-tap-highlight-color:transparent;user-select:none}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px}
    .label{font-size:12px;letter-spacing:.22em;text-transform:lowercase;color:#8B97A6}
    .grid{display:grid;grid-template-columns:repeat(${t.cols},1fr);gap:2px;width:min(80vw,320px);aspect-ratio:${t.cols}/${t.rows};padding:8px;background:#fff;border-radius:14px;box-shadow:0 8px 24px rgba(46,80,110,.08),inset 0 0 0 1px rgba(26,35,48,.04)}
    .cell{background:${t.colors[0]};border-radius:3px;cursor:pointer;transition:background 120ms ease,transform 200ms cubic-bezier(.16,1,.3,1)}
    .cell:active{transform:scale(.94)}
    .row{display:flex;gap:10px;align-items:center}
    .sw{width:22px;height:22px;border-radius:8px;cursor:pointer;border:2px solid transparent;transition:transform 150ms ease}
    .sw.sel{border-color:#1A2330;transform:scale(1.1)}
    .btn{font:inherit;font-size:12px;letter-spacing:.18em;text-transform:lowercase;border-radius:999px;border:1px solid rgba(26,35,48,.12);background:#fff;color:#8B97A6;padding:6px 14px;cursor:pointer}
  `;
  const body = `
    <div class="wrap">
      <div class="label">${t.name.toLowerCase()} — tap a cell</div>
      <div id="grid" class="grid"></div>
      <div class="row" id="palette"></div>
      <button id="clear" class="btn" type="button">clear</button>
    </div>
  `;
  const js = `
    var COLORS=${JSON.stringify(t.colors)};
    var ROWS=${t.rows}, COLS=${t.cols};
    var grid=document.getElementById("grid"), palette=document.getElementById("palette");
    var sel=1;
    for(var i=1;i<COLORS.length;i++){(function(i){var sw=document.createElement("div");sw.className="sw"+(i===sel?" sel":"");sw.style.background=COLORS[i];sw.addEventListener("click",function(){sel=i;Array.from(palette.children).forEach(function(c,j){c.classList.toggle("sel",j+1===i);});Fly.interaction("color");});palette.appendChild(sw);})(i);}
    for(var r=0;r<ROWS;r++)for(var c=0;c<COLS;c++){var cell=document.createElement("div");cell.className="cell";cell.addEventListener("pointerdown",function(){this.style.background=COLORS[sel];Fly.interaction("paint");});cell.addEventListener("pointerenter",function(e){if(e.buttons===1)this.style.background=COLORS[sel];});grid.appendChild(cell);}
    document.getElementById("clear").addEventListener("click",function(){Array.from(grid.children).forEach(function(c){c.style.background=COLORS[0];});Fly.interaction("clear");});
  `;
  return HEAD(t.name + " Doodle", TEMPLATES.doodle.tags, css) + body + TAIL(js);
}

// =========================================================================
// word-daisy — different word domains
// =========================================================================

const DAISY_GROUPS = {
  drift: {
    drift:["float","slow","cloud","sail","wander"], float:["lift","sky","buoy","cloud","glide"], slow:["soft","hush","quiet","drift","still"],
    cloud:["sky","drift","rain","mist","white"], sail:["wind","sea","mast","glide","drift"], wander:["roam","path","drift","slow","quiet"],
    lift:["rise","wing","sky","float","up"], sky:["blue","cloud","wide","still","far"], buoy:["bob","sea","red","float","mark"],
    glide:["smooth","wing","slip","drift","float"], rise:["lift","sun","dawn","up","tall"], wing:["bird","glide","feather","lift","beat"],
    bird:["wing","song","sky","feather","nest"], feather:["soft","light","quill","wing","down"], soft:["hush","cloud","down","wool","slow"],
  },
  light: {
    light:["dawn","glow","soft","clean","warm"], dawn:["light","rise","blue","quiet","wake"], glow:["light","ember","warm","soft","low"],
    soft:["hush","cloud","down","still","light"], clean:["light","still","fresh","spare","white"], warm:["glow","ember","sun","close","low"],
    rise:["dawn","sun","lift","up","tall"], sun:["warm","gold","high","light","ray"], ember:["warm","glow","low","ash","red"],
    still:["quiet","calm","light","held","slow"], quiet:["still","hush","calm","slow","alone"], hush:["quiet","soft","slow","mute","calm"],
  },
  mood: {
    mood:["calm","blue","red","glow","drift"], calm:["still","quiet","slow","sea","held"], blue:["sea","sky","deep","ink","mood"],
    red:["ember","warm","sun","close","mood"], glow:["light","ember","warm","soft","mood"], drift:["float","slow","cloud","sail","mood"],
    still:["calm","quiet","slow","silent","held"], quiet:["hush","still","slow","mute","calm"], slow:["soft","hush","quiet","drift","still"],
    sea:["wave","salt","blue","tide","far"], sky:["blue","cloud","wide","still","far"], deep:["sea","blue","still","quiet","far"],
    ember:["glow","warm","ash","low","red"], warm:["glow","ember","sun","close","low"], sun:["warm","gold","high","light","ray"],
  },
};

function renderDaisy(i) {
  const names = ["drift","light","mood"];
  const domain = names[i % names.length];
  const wordsObj = DAISY_GROUPS[domain];
  const accentBg = {
    drift: "#FFC34A,#E0902B",
    light: "#FFE5A0,#FFC34A",
    mood:  "#C892D8,#7B3FA0",
  }[domain];
  const bg = {
    drift: "#FFFDF7,#FAF6EC 60%,#F2EAD3",
    light: "#FFFEF9,#FBF6E0 60%,#FBEEB8",
    mood:  "#F3EEFA,#E5DAEE 60%,#D2C0E5",
  }[domain];
  const css = `
    html,body{margin:0;height:100%;background:radial-gradient(120% 80% at 50% 35%,${bg});font-family:-apple-system,system-ui,sans-serif;color:#2A2316;overflow:hidden;-webkit-tap-highlight-color:transparent;user-select:none}
    .wrap{position:fixed;inset:0;display:grid;place-items:center;padding:24px}
    .daisy{position:relative;width:84vmin;height:84vmin;max-width:340px;max-height:340px}
    .petal{position:absolute;top:50%;left:50%;display:grid;place-items:center;width:30vmin;height:18vmin;max-width:130px;max-height:78px;border-radius:50%;background:radial-gradient(circle at 30% 35%,#FFFFFF,#FFF5D9 80%);color:#2A2316;font-size:14px;letter-spacing:.18em;text-transform:lowercase;box-shadow:0 8px 22px rgba(180,140,40,.12),inset 0 0 0 1px rgba(180,140,40,.08);cursor:pointer;transition:transform 320ms cubic-bezier(.16,1,.3,1)}
    .center{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:24vmin;height:24vmin;max-width:110px;max-height:110px;border-radius:50%;background:radial-gradient(circle at 30% 30%,${accentBg} 80%);display:grid;place-items:center;color:#2A2316;font-size:18px;letter-spacing:.14em;text-transform:lowercase;font-weight:300;box-shadow:0 10px 24px rgba(180,140,40,.22);z-index:2}
  `;
  const body = `<div class="wrap"><div id="daisy" class="daisy"><div id="center" class="center">${domain}</div></div></div>`;
  const js = `
    var WORDS=${JSON.stringify(wordsObj)};
    var FALLBACK=${JSON.stringify(wordsObj[domain])};
    var ring=document.getElementById("daisy"), centerEl=document.getElementById("center");
    var cur=${JSON.stringify(domain)};
    function render(word){cur=word;centerEl.textContent=word;Array.from(ring.querySelectorAll(".petal")).forEach(function(p){p.remove();});var opts=WORDS[word]||FALLBACK;var R=Math.min(window.innerWidth,window.innerHeight)*0.30;opts.forEach(function(w,i){var a=(-Math.PI/2)+(i/opts.length)*Math.PI*2;var x=Math.cos(a)*R,y=Math.sin(a)*R;var p=document.createElement("div");p.className="petal";p.textContent=w;p.style.transform="translate(-50%,-50%) translate("+x+"px,"+y+"px)";p.addEventListener("click",function(){if(!WORDS[w])WORDS[w]=FALLBACK;render(w);Fly.interaction("petal");});ring.appendChild(p);});}
    render(cur);
    window.addEventListener("resize",function(){render(cur);});
  `;
  return HEAD(domain.charAt(0).toUpperCase()+domain.slice(1) + " Daisy", TEMPLATES.daisy.tags, css) + body + TAIL(js);
}

// =========================================================================
// tide-clock — face style variants
// =========================================================================

const CLOCK_STYLES = [
  { name: "Modern",  ticks: false, accent: "#2BB6A3" },
  { name: "Classic", ticks: true,  accent: "#2D7DD2" },
  { name: "Dusk",    ticks: false, accent: "#E15B45" },
];

function renderClock(i) {
  const s = CLOCK_STYLES[i % CLOCK_STYLES.length];
  const ticks = s.ticks
    ? Array.from({length:12}, (_, k) => `<div class="tick" style="transform:translate(-50%,-50%) rotate(${k*30}deg) translateY(-44%)"></div>`).join("")
    : Array.from({length:4}, (_, k) => `<div class="tick" style="transform:translate(-50%,-50%) rotate(${k*90}deg) translateY(-44%)"></div>`).join("");
  const css = `
    html,body{margin:0;height:100%;background:linear-gradient(180deg,#E6F0F4 0%,#F4F8FA 60%,#FFFFFF);font-family:-apple-system,system-ui,sans-serif;color:#1A2330;overflow:hidden;-webkit-tap-highlight-color:transparent}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px}
    .face{position:relative;width:62vmin;height:62vmin;max-width:280px;max-height:280px;border-radius:50%;background:radial-gradient(circle at 30% 28%,#FFFFFF 0%,#F2F7FA 60%,#E5EEF3);box-shadow:inset 0 1px 1px #fff,0 14px 36px rgba(46,80,110,.10),0 2px 6px rgba(46,80,110,.06)}
    .face::before{content:"";position:absolute;inset:6%;border-radius:50%;border:1px solid ${s.accent}40}
    .tick{position:absolute;top:50%;left:50%;width:1px;height:6px;background:#A8B6C2;transform-origin:50% 0}
    .hand{position:absolute;top:50%;left:50%;background:#1A2330;border-radius:2px;transform-origin:50% 100%;transition:transform .6s cubic-bezier(.16,1,.3,1)}
    .hour{width:3px;height:24%;margin-left:-1.5px;margin-top:-24%}
    .min{width:2px;height:34%;margin-left:-1px;margin-top:-34%;background:${s.accent}}
    .pivot{position:absolute;top:50%;left:50%;width:10px;height:10px;border-radius:50%;background:#1A2330;transform:translate(-50%,-50%);box-shadow:0 0 0 3px ${s.accent}26}
    .label{font-size:12px;letter-spacing:.18em;text-transform:lowercase;color:#8B97A6}
  `;
  const body = `
    <div class="wrap" id="wrap">
      <div class="label">${s.name.toLowerCase()}</div>
      <div id="face" class="face">
        ${ticks}
        <div id="hand-h" class="hand hour"></div>
        <div id="hand-m" class="hand min"></div>
        <div class="pivot"></div>
      </div>
    </div>
  `;
  const js = `
    var ticking=true, raf=0;
    var hh=document.getElementById("hand-h"), hm=document.getElementById("hand-m");
    function tick(){var d=new Date();var h=d.getHours()%12,m=d.getMinutes(),s=d.getSeconds();hh.style.transform="translate(-50%,0) rotate("+((h+m/60)*30)+"deg)";hm.style.transform="translate(-50%,0) rotate("+((m+s/60)*6)+"deg)";if(ticking)raf=requestAnimationFrame(function(){setTimeout(tick,950);});}
    document.getElementById("wrap").addEventListener("click",function(){Fly.interaction("tap");});
    window.addEventListener("fly:pause",function(){ticking=false;cancelAnimationFrame(raf);});
    window.addEventListener("fly:active",function(){if(!ticking){ticking=true;tick();}});
    tick();
  `;
  return HEAD(s.name + " Clock", TEMPLATES.clock.tags, css) + body + TAIL(js);
}

// =========================================================================
// tally-counter — palette variants
// =========================================================================

const TALLY_THEMES = [
  { name: "Mint",  bg: "linear-gradient(180deg,#EAF1F6,#F7FAFC)", num: "#1A2330", accent: "#2BB6A3" },
  { name: "Coral", bg: "linear-gradient(180deg,#FFEFE5,#FFF7F1)", num: "#5A2A20", accent: "#E15B45" },
  { name: "Plum",  bg: "linear-gradient(180deg,#F1ECF8,#FAF6FE)", num: "#2E1F47", accent: "#7B3FA0" },
];

function renderTally(i) {
  const t = TALLY_THEMES[i % TALLY_THEMES.length];
  const css = `
    html,body{margin:0;height:100%;background:${t.bg};font-family:-apple-system,system-ui,sans-serif;color:${t.num};overflow:hidden;-webkit-tap-highlight-color:transparent;user-select:none}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:24px}
    .num{font-variant-numeric:tabular-nums;font-size:34vmin;line-height:1;font-weight:100;color:${t.num};letter-spacing:-.04em;transition:transform 240ms cubic-bezier(.16,1,.3,1)}
    .num.bump{transform:scale(1.05)}
    .row{display:flex;gap:14px}
    .btn{font:inherit;font-size:13px;letter-spacing:.18em;text-transform:lowercase;border-radius:999px;border:1px solid rgba(26,35,48,.12);background:#fff;color:${t.num};padding:10px 20px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.04)}
    .btn.minus{opacity:.7}
    .btn.reset{color:${t.accent};border-color:${t.accent}55}
    .meta{font-size:12px;letter-spacing:.18em;text-transform:lowercase;opacity:.7}
    .tap{position:absolute;inset:0;cursor:pointer}
  `;
  const body = `
    <div class="wrap">
      <div id="meta" class="meta">${t.name.toLowerCase()} — tap anywhere</div>
      <div id="num" class="num">0</div>
      <div class="row">
        <button id="minus" class="btn minus" type="button">−1</button>
        <button id="reset" class="btn reset" type="button">reset</button>
      </div>
    </div>
    <div class="tap" id="tap"></div>
  `;
  const js = `
    var n=0;var numEl=document.getElementById("num");
    function set(v){n=Math.max(0,v);numEl.textContent=String(n);numEl.classList.remove("bump");void numEl.offsetWidth;numEl.classList.add("bump");}
    document.getElementById("tap").addEventListener("click",function(e){set(n+1);Fly.interaction("tap");e.stopPropagation();});
    document.getElementById("minus").addEventListener("click",function(e){e.stopPropagation();set(n-1);Fly.interaction("minus");});
    document.getElementById("reset").addEventListener("click",function(e){e.stopPropagation();set(0);Fly.interaction("reset");});
  `;
  return HEAD(t.name + " Tally", TEMPLATES.tally.tags, css) + body + TAIL(js);
}

// =========================================================================
// tip-calc — currency variants
// =========================================================================

const CURRENCIES = [
  { name: "USD",    symbol: "$", code: "$" },
  { name: "Euro",   symbol: "€", code: "€" },
  { name: "Shekel", symbol: "₪", code: "₪" },
  { name: "Pound",  symbol: "£", code: "£" },
];

function renderTipCalc(i) {
  const c = CURRENCIES[i % CURRENCIES.length];
  const css = `
    html,body{margin:0;height:100%;background:linear-gradient(180deg,#EAF1F6,#F7FAFC);font-family:-apple-system,system-ui,sans-serif;color:#1A2330;overflow:hidden;-webkit-tap-highlight-color:transparent}
    .wrap{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:28px}
    .card{width:100%;max-width:320px;background:#fff;border-radius:18px;padding:22px;box-shadow:0 8px 24px rgba(46,80,110,.08);display:flex;flex-direction:column;gap:18px}
    .row{display:flex;flex-direction:column;gap:4px}
    .lbl{font-size:11px;letter-spacing:.22em;text-transform:lowercase;color:#8B97A6}
    .ctl{display:flex;align-items:center;gap:10px}
    input[type=number]{font:inherit;font-size:24px;font-weight:300;width:100%;border:0;border-bottom:1px solid rgba(26,35,48,.08);background:transparent;color:#1A2330;padding:4px 0;outline:none;-moz-appearance:textfield}
    input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    input[type=number]:focus{border-bottom-color:#2BB6A3}
    .tip-pct{display:flex;gap:6px;flex-wrap:wrap}
    .pct{font:inherit;font-size:12px;letter-spacing:.12em;text-transform:lowercase;padding:6px 12px;border-radius:999px;background:#F2F5F8;color:#8B97A6;border:1px solid transparent;cursor:pointer}
    .pct.sel{background:rgba(43,182,163,.12);color:#2BB6A3;border-color:rgba(43,182,163,.35)}
    .out{display:flex;flex-direction:column;gap:6px;padding-top:12px;border-top:1px solid rgba(26,35,48,.06)}
    .per{font-size:42px;font-weight:200;color:#2BB6A3;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
    .detail{font-size:12px;letter-spacing:.18em;text-transform:lowercase;color:#8B97A6;font-variant-numeric:tabular-nums}
    .stepper{display:flex;align-items:center;gap:6px}
    .step{width:32px;height:32px;border-radius:8px;background:#F2F5F8;border:0;color:#1A2330;font-size:16px;cursor:pointer}
    .ppl{font-size:24px;font-weight:300;min-width:30px;text-align:center;font-variant-numeric:tabular-nums}
  `;
  const body = `
    <div class="wrap"><div class="card">
      <div class="row"><div class="lbl">bill (${c.code})</div><div class="ctl"><input id="bill" type="number" inputmode="decimal" value="48" min="0" step="0.01"></div></div>
      <div class="row"><div class="lbl">tip</div><div class="tip-pct" id="pct">
        <button class="pct" data-v="10">10%</button>
        <button class="pct sel" data-v="15">15%</button>
        <button class="pct" data-v="18">18%</button>
        <button class="pct" data-v="20">20%</button>
        <button class="pct" data-v="25">25%</button>
      </div></div>
      <div class="row"><div class="lbl">split</div><div class="ctl stepper">
        <button class="step" id="dec" type="button">−</button>
        <div class="ppl" id="ppl">2</div>
        <button class="step" id="inc" type="button">+</button>
      </div></div>
      <div class="out">
        <div class="per" id="per">${c.symbol}0.00</div>
        <div class="detail" id="detail">per person</div>
      </div>
    </div></div>
  `;
  const js = `
    var SYM=${JSON.stringify(c.symbol)};
    var bill=48,pct=15,ppl=2;
    var billEl=document.getElementById("bill"),pctRow=document.getElementById("pct"),pplEl=document.getElementById("ppl");
    function recompute(){var total=bill*(1+pct/100),per=total/Math.max(ppl,1);document.getElementById("per").textContent=SYM+per.toFixed(2);document.getElementById("detail").textContent="tip "+SYM+(bill*pct/100).toFixed(2)+" · total "+SYM+total.toFixed(2);}
    billEl.addEventListener("input",function(){bill=parseFloat(billEl.value)||0;recompute();Fly.interaction("bill");});
    pctRow.addEventListener("click",function(e){var t=e.target.closest(".pct");if(!t)return;Array.from(pctRow.children).forEach(function(c){c.classList.remove("sel");});t.classList.add("sel");pct=parseInt(t.dataset.v);recompute();Fly.interaction("pct");});
    document.getElementById("inc").addEventListener("click",function(){ppl++;pplEl.textContent=ppl;recompute();Fly.interaction("ppl");});
    document.getElementById("dec").addEventListener("click",function(){if(ppl>1){ppl--;pplEl.textContent=ppl;recompute();Fly.interaction("ppl");}});
    recompute();
  `;
  return HEAD(c.name + " Tip Split", TEMPLATES.tipCalc.tags, css) + body + TAIL(js);
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
  starfield: {
    concept: "starfield",
    tags: ["visual", "ambient", "generative"],
    category: "visuals",
    variantCount: STARFIELD_PALETTES.length,
    variantTitle: (i) => STARFIELD_PALETTES[i].name + " Sky",
    render: renderStarfield,
  },
  coin: {
    concept: "coin-flip",
    tags: ["tool", "quick", "decide"],
    category: "tools",
    variantCount: COIN_FACES.length,
    variantTitle: (i) => COIN_FACES[i].name,
    render: renderCoin,
  },
  rollDie: {
    concept: "roll-die",
    tags: ["tool", "quick", "game"],
    category: "tools",
    variantCount: DIE_PALETTES.length,
    variantTitle: (i) => DIE_PALETTES[i].name + " Die",
    render: renderRollDie,
  },
  reaction: {
    concept: "reaction-timer",
    tags: ["game", "reflex", "quick"],
    category: "games",
    variantCount: REACTION_THEMES.length,
    variantTitle: (i) => REACTION_THEMES[i].name + " Reaction",
    render: renderReaction,
  },
  doodle: {
    concept: "pixel-doodle",
    tags: ["creative", "visual", "playful"],
    category: "creative",
    variantCount: DOODLE_THEMES.length,
    variantTitle: (i) => DOODLE_THEMES[i].name + " Doodle",
    render: renderDoodle,
  },
  daisy: {
    concept: "word-daisy",
    tags: ["text", "playful", "word"],
    category: "word",
    variantCount: 3,
    variantTitle: (i) => ["Drift","Light","Mood"][i] + " Daisy",
    render: renderDaisy,
  },
  clock: {
    concept: "tide-clock",
    tags: ["time", "ambient", "visual"],
    category: "tools",
    variantCount: CLOCK_STYLES.length,
    variantTitle: (i) => CLOCK_STYLES[i].name + " Clock",
    render: renderClock,
  },
  tally: {
    concept: "tally-counter",
    tags: ["tool", "quick", "useful"],
    category: "tools",
    variantCount: TALLY_THEMES.length,
    variantTitle: (i) => TALLY_THEMES[i].name + " Tally",
    render: renderTally,
  },
  tipCalc: {
    concept: "tip-calc",
    tags: ["tool", "useful", "calc"],
    category: "tools",
    variantCount: CURRENCIES.length,
    variantTitle: (i) => CURRENCIES[i].name + " Tip Split",
    render: renderTipCalc,
  },
};
