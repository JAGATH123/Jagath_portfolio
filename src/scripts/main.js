/* ═══════════════════════════════════════════════════════════
   DATUM LINE — entry point

   Builds the parts and connects them. Every decision worth
   making lives in one of the imported modules; this file is the
   wiring diagram.

   Loaded as <script type="module">, so it is deferred, strict
   and scoped: the DOM is parsed before any of this runs and
   nothing is added to window.

   The project accordions are native <details name="proj">.
   Open, close, keyboard and aria-expanded are the browser's
   job now — there is no accordion code here on purpose.
   ═══════════════════════════════════════════════════════════ */

import { createGlitch } from './glitch.js';
import { createLoop } from './loop.js';
import { createRouter } from './router.js';
import { createScene } from './scene/index.js';
import { createSound, TONE } from './sound.js';
import { createTelemetry } from './telemetry.js';

const loop = createLoop();
const scene = createScene(); // null if there is no <canvas id="bg"> to draw into
const sound = createSound();
const glitch = createGlitch();
const telemetry = createTelemetry({ readGrade: () => scene?.gradeName });

if (scene) loop.subscribe(scene.frame);
loop.subscribe(telemetry.frame);

const router = createRouter({
  onNavigate({ section, silent, changed }) {
    if (!changed) {
      sound.blip(TONE.reselect);
      return;
    }

    scene?.setGrade(section.dataset.grade, { immediate: silent });
    if (silent) return; // the cold boot arrives, it does not transition

    glitch.flash();
    sound.blip(TONE.navigate);
  },
});

/* The only thing left to say about the accordions: mirror them in audio.
   `toggle` does not bubble, hence the capture phase for delegation. */
document.addEventListener('toggle', (ev) => {
  const details = ev.target;
  if (details instanceof HTMLDetailsElement && details.classList.contains('proj')) {
    sound.blip(details.open ? TONE.caseOpen : TONE.caseClose);
  }
}, true);

router.start();
loop.start();
