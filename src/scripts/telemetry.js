/* ═══════════════════════════════════════════════════════════
   DATUM LINE — telemetry readout

   Clock, uptime, frame rate and the name of the live colour
   grade. It is a HUD, not part of the render: it happens to be
   fed by frame ticks because that is the only honest way to
   measure frames per second.

   The whole strip is aria-hidden in the markup — it is set
   dressing, and a screen reader announcing a clock twice a
   second is noise.
   ═══════════════════════════════════════════════════════════ */

/* Twice a second: fast enough that the clock never looks stuck, slow enough
   that the FPS number is readable rather than a blur. */
const SAMPLE_MS = 500;

/* Two digits, so the row never changes width. */
const FPS_MIN = 1;
const FPS_MAX = 99;

const pad2 = (value) => String(value).padStart(2, '0');

/**
 * @param {{ readGrade?: () => (string | undefined) }} [options]
 */
export function createTelemetry({ readGrade } = {}) {
  const clockEl = document.getElementById('t-clock');
  const uptimeEl = document.getElementById('t-up');
  const fpsEl = document.getElementById('t-fps');
  const gradeEl = document.getElementById('t-grade');

  let bootedAt = null;  // first frame, so uptime is time on screen
  let windowAt = 0;     // start of the current FPS sample window
  let framesInWindow = 0;

  /* The loop is stopped while the tab is hidden. Without this the first sample
     after a resume would divide a handful of frames by the whole hidden period
     and report 0 FPS. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    windowAt = performance.now(); // same time base as the rAF timestamp
    framesInWindow = 0;
  });

  const frame = (now) => {
    if (bootedAt === null) {
      bootedAt = now;
      windowAt = now;
    }

    framesInWindow++;
    const elapsed = now - windowAt;
    if (elapsed < SAMPLE_MS) return;

    const fps = Math.round((framesInWindow * 1000) / elapsed);
    framesInWindow = 0;
    windowAt = now;

    if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });

    if (uptimeEl) {
      const seconds = Math.floor((now - bootedAt) / 1000);
      uptimeEl.textContent = `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;
    }

    if (fpsEl) fpsEl.textContent = pad2(Math.min(FPS_MAX, Math.max(FPS_MIN, fps)));

    const grade = readGrade?.();
    if (gradeEl && grade) gradeEl.textContent = grade;
  };

  return { frame };
}
