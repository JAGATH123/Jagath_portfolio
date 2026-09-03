/* ═══════════════════════════════════════════════════════════
   DATUM LINE — main.js
   Hash routing between the four screens, glitch transition,
   project accordion, interface sound.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SCREENS = ['home', 'about', 'work', 'info'];
  var root    = document.getElementById('root');
  var glitch  = document.querySelector('.glitch');
  var tabs    = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
  var words   = Array.prototype.slice.call(document.querySelectorAll('.wordmark'));
  var scene   = window.DLScene || null;
  var reduce  = scene ? scene.reduced
                      : (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var current = null, glitchTimer = null;

  // Single source of truth for the title. This used to be a literal duplicated
  // here and in <title>, and THIS copy always won -- it is rewritten on every
  // boot and every navigation, so editing the HTML alone changed nothing.
  var BASE_TITLE = document.title;

  /* ───────────── sound ───────────── */
  var soundBtn = document.getElementById('sound');
  var soundOn  = false, actx = null;

  try { soundOn = localStorage.getItem('dl.sound') === '1'; } catch (e) {}

  function paintSound() {
    if (soundBtn) soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
  }
  function blip(freq) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = 'square';
      o.frequency.value = freq || 660;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(actx.destination);
      o.start(t); o.stop(t + 0.13);
    } catch (e) {}
  }
  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      try { localStorage.setItem('dl.sound', soundOn ? '1' : '0'); } catch (e) {}
      paintSound();
      if (soundOn) blip(900);
    });
  }
  paintSound();

  /* ───────────── routing ───────────── */
  function fromHash() {
    var h = (location.hash || '').replace('#', '').toLowerCase();
    return SCREENS.indexOf(h) > -1 ? h : 'home';
  }

  function show(name, opts) {
    opts = opts || {};
    if (name === current) { blip(760); return; }

    var section = document.getElementById(name);
    if (!section) return;

    SCREENS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === name) { el.removeAttribute('hidden'); el.setAttribute('data-active', ''); el.scrollTop = 0; }
      else { el.removeAttribute('data-active'); }
    });

    tabs.forEach(function (t) {
      if (t.getAttribute('data-nav') === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });

    root.setAttribute('data-screen', name);

    var label = name.toUpperCase();
    words.forEach(function (w) { w.textContent = label; w.setAttribute('data-word', label); });

    if (scene) {
      scene.setGrade(section.getAttribute('data-grade') || 'coolant', !!opts.silent);
    }

    if (!reduce && !opts.silent && glitch) {
      glitch.classList.remove('on');
      void glitch.offsetWidth;            // restart the CSS animation
      glitch.classList.add('on');
      if (glitchTimer) clearTimeout(glitchTimer);
      glitchTimer = setTimeout(function () { glitch.classList.remove('on'); }, 460);
    }

    if (!opts.silent) blip(600);
    current = name;
    document.title = (name === 'home' ? '' : label.charAt(0) + label.slice(1).toLowerCase() + ' — ') + BASE_TITLE;
  }

  window.addEventListener('hashchange', function () { show(fromHash()); });

  /* intercept in-page links so we control the transition */
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a) return;
    var target = a.getAttribute('href').slice(1).toLowerCase();
    if (SCREENS.indexOf(target) === -1) return;
    ev.preventDefault();
    if (location.hash.replace('#', '') === target) { show(target); }
    else { history.pushState(null, '', '#' + target); show(target); }
  });
  window.addEventListener('popstate', function () { show(fromHash()); });

  /* keyboard: 1–4 jump straight to a screen */
  document.addEventListener('keydown', function (ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    var n = parseInt(ev.key, 10);
    if (n >= 1 && n <= 4) {
      history.pushState(null, '', '#' + SCREENS[n - 1]);
      show(SCREENS[n - 1]);
    }
  });

  /* ───────────── project accordion ───────────── */
  Array.prototype.forEach.call(document.querySelectorAll('.proj__btn'), function (btn) {
    btn.addEventListener('click', function () {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      var open  = btn.getAttribute('aria-expanded') === 'true';

      // accordion: only one case study open at a time
      Array.prototype.forEach.call(document.querySelectorAll('.proj__btn'), function (o) {
        if (o === btn) return;
        o.setAttribute('aria-expanded', 'false');
        var p = document.getElementById(o.getAttribute('aria-controls'));
        if (p) p.hidden = true;
      });

      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (panel) panel.hidden = open;
      blip(open ? 520 : 720);
    });
  });

  /* ───────────── boot ───────────── */
  show(fromHash(), { silent: true });
})();
