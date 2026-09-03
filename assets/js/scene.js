/* ═══════════════════════════════════════════════════════════
   DATUM LINE — scene.js

   One canvas layer: a drifting gradient field that carries the
   colour grade. No geometry, no wireframe, no shapes.

   Publishes the active grade to CSS as --accent / --accent2 /
   --slab-fg / --ca, and drives the telemetry readout.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ---------------- colour grades ---------------- */
  var GRADES = {
    coolant: { name:'COOLANT/ICE',   bgA:[ 4,11,25], bgB:[ 2, 6,15], c1:[ 58,138,255], c2:[128,218,255], acc:[110,176,255], acc2:[186,238,255], sfg:[  8, 30, 64] },
    ember:   { name:'EMBER',         bgA:[21,11, 4], bgB:[11, 6, 3], c1:[247,168, 54], c2:[228, 96, 40], acc:[249,182, 84], acc2:[236,156, 78], sfg:[ 26, 12,  2] },
    iris:    { name:'IRIS/VIOLET',   bgA:[13, 6,25], bgB:[ 7, 5,17], c1:[168, 96,255], c2:[255, 92,190], acc:[192,140,255], acc2:[255,132,210], sfg:[ 30,  6, 52] },
    emerald: { name:'EMERALD/CYAN',  bgA:[ 3,18,15], bgB:[ 2,11,17], c1:[ 54,224,150], c2:[ 36,196,236], acc:[ 84,232,170], acc2:[ 72,210,240], sfg:[  4, 34, 28] }
  };
  var ORDER = ['coolant', 'ember', 'iris', 'emerald'];

  /* ---------------- small math ---------------- */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerp3(A, B, t) {
    return [Math.round(lerp(A[0],B[0],t)), Math.round(lerp(A[1],B[1],t)), Math.round(lerp(A[2],B[2],t))];
  }
  function rgb(a) { return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; }
  function rgba(a, al) { return 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + al + ')'; }
  function ease(t) { return t * t * (3 - 2 * t); }

  var bgC  = document.getElementById('bg');
  var root = document.getElementById('root');
  if (!bgC || !root) return;

  var bg = bgC.getContext('2d');
  if (!bg) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small  = window.matchMedia && window.matchMedia('(max-width:820px)').matches;

  var W = 1, H = 1, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = bgC.clientWidth  || window.innerWidth;
    H = bgC.clientHeight || window.innerHeight;
    bgC.width  = Math.max(1, Math.floor(W * dpr));
    bgC.height = Math.max(1, Math.floor(H * dpr));
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the breakpoint flag was previously evaluated once at load, so a
    // rotated phone kept the wrong blob count for the rest of the session
    small = window.matchMedia && window.matchMedia('(max-width:820px)').matches;
  }
  resize();
  window.addEventListener('resize', resize);

  /* drifting blobs — the whole visual now */
  var blobs = [];
  for (var i = 0; i < (small ? 4 : 6); i++) {
    blobs.push({
      ph: Math.random() * 6.283,
      fx: 0.00006 + Math.random() * 0.00007,
      fy: 0.00005 + Math.random() * 0.00007,
      ax: 0.26 + Math.random() * 0.18,
      ay: 0.26 + Math.random() * 0.18,
      which: i % 2,
      r: 0.5 + Math.random() * 0.35
    });
  }

  /* ---------------- grade state ----------------
     `fadeFrom` is a snapshot of the live colours taken when a fade
     starts, rather than a key into GRADES. The old version stored a
     from-KEY and only advanced curKey once a fade completed, so
     clicking a tab twice inside DUR left fromKey === toKey and froze
     the palette permanently mid-interpolation.                      */
  var DUR = 780;
  var toKey = 'coolant';
  var fadeFrom = null, tStart = 0;

  var BOOT = GRADES.coolant;
  var live = {
    bgA: BOOT.bgA.slice(), bgB: BOOT.bgB.slice(),
    c1:  BOOT.c1.slice(),  c2:  BOOT.c2.slice(),
    acc: BOOT.acc.slice(), acc2: BOOT.acc2.slice(), sfg: BOOT.sfg.slice(),
    name: BOOT.name
  };

  var intensity = reduce ? 0.12 : 0.6;
  var glitchOn  = !reduce;

  var raf = 0, running = false;
  var t0 = 0, tLast = 0, frames = 0;
  var elClock = document.getElementById('t-clock'),
      elUp    = document.getElementById('t-up'),
      elFps   = document.getElementById('t-fps'),
      elGrade = document.getElementById('t-grade');

  function snapGrade(key) {
    var G = GRADES[key];
    if (!G) return;
    live.bgA = G.bgA.slice(); live.bgB = G.bgB.slice();
    live.c1  = G.c1.slice();  live.c2  = G.c2.slice();
    live.acc = G.acc.slice(); live.acc2 = G.acc2.slice(); live.sfg = G.sfg.slice();
    live.name = G.name;
    toKey = key;
    fadeFrom = null;
  }

  /* ---------------- render ---------------- */
  function drawField(now) {
    var g = bg.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, rgb(live.bgA));
    g.addColorStop(1, rgb(live.bgB));
    bg.globalCompositeOperation = 'source-over';
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    bg.globalCompositeOperation = 'lighter';
    var alpha = 0.15 + 0.17 * intensity;
    var spd   = 0.5 + 0.7 * intensity;
    var maxD  = Math.max(W, H);
    for (var k = 0; k < blobs.length; k++) {
      var b  = blobs[k];
      var px = (0.5 + b.ax * Math.sin(now * b.fx * spd + b.ph)) * W;
      var py = (0.5 + b.ay * Math.cos(now * b.fy * spd + b.ph * 1.3)) * H;
      var rad = b.r * maxD * 0.55;
      var col = b.which ? live.c2 : live.c1;
      var rg  = bg.createRadialGradient(px, py, 0, px, py, rad);
      rg.addColorStop(0, rgba(col, alpha));
      rg.addColorStop(0.45, rgba(col, alpha * 0.34));
      rg.addColorStop(1, rgba(col, 0));
      bg.fillStyle = rg;
      bg.beginPath();
      bg.arc(px, py, rad, 0, 6.2832);
      bg.fill();
    }
    bg.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    if (!running) return;
    if (!t0) { t0 = now; tLast = now; }

    if (fadeFrom) {
      var t = Math.min(1, (now - tStart) / DUR), te = ease(t);
      var B = GRADES[toKey];
      live.bgA = lerp3(fadeFrom.bgA, B.bgA, te); live.bgB = lerp3(fadeFrom.bgB, B.bgB, te);
      live.c1  = lerp3(fadeFrom.c1,  B.c1,  te); live.c2  = lerp3(fadeFrom.c2,  B.c2,  te);
      live.acc = lerp3(fadeFrom.acc, B.acc, te); live.acc2 = lerp3(fadeFrom.acc2, B.acc2, te);
      live.sfg = lerp3(fadeFrom.sfg, B.sfg, te);
      live.name = te < 0.5 ? fadeFrom.name : B.name;
      if (t >= 1) { fadeFrom = null; }
    }

    drawField(now);

    var burst = (glitchOn && Math.random() < 0.015) ? (small ? 1.2 : 2.4) : 0;
    var ca = (glitchOn ? (small ? 0.12 + 0.42 * intensity : 0.25 + 1.0 * intensity) : 0) + burst;
    root.style.setProperty('--accent', rgb(live.acc));
    root.style.setProperty('--accent2', rgb(live.acc2));
    root.style.setProperty('--slab-fg', rgb(live.sfg));
    root.style.setProperty('--ca', ca.toFixed(2));
    root.style.setProperty('--scan-op', (0.2 + 0.5 * intensity).toFixed(3));
    root.style.setProperty('--grain-op', (0.02 + 0.07 * intensity).toFixed(3));

    frames++;
    if (now - tLast >= 500) {
      var fps = Math.round(frames * 1000 / (now - tLast));
      frames = 0; tLast = now;
      if (elClock) elClock.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
      if (elUp) {
        var s = Math.floor((now - t0) / 1000);
        elUp.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      }
      if (elFps) elFps.textContent = String(Math.max(1, Math.min(99, fps))).padStart(2, '0');
      if (elGrade) elGrade.textContent = live.name;
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;              // without this guard, every visible event stacked a loop
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); }
    else { tLast = performance.now(); frames = 0; start(); }
  });

  start();

  /* ---------------- public API ---------------- */
  window.DLScene = {
    grades: ORDER,
    setGrade: function (key, immediate) {
      if (!GRADES[key]) return;
      if (immediate) { snapGrade(key); return; }
      if (key === toKey && !fadeFrom) return;
      // fade from wherever the colours visually are right now
      fadeFrom = {
        bgA: live.bgA.slice(), bgB: live.bgB.slice(),
        c1:  live.c1.slice(),  c2:  live.c2.slice(),
        acc: live.acc.slice(), acc2: live.acc2.slice(), sfg: live.sfg.slice(),
        name: live.name
      };
      toKey = key;
      tStart = performance.now();
    },
    reduced: reduce
  };
})();
