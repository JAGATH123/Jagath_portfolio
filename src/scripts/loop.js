/* ═══════════════════════════════════════════════════════════
   DATUM LINE — frame loop

   One requestAnimationFrame loop for the whole page. The
   renderer and the telemetry readout both need frame ticks;
   giving them a loop each would double the wake-ups and let
   their clocks disagree about what "now" is.

   Pauses while the tab is hidden: rAF is throttled to a
   standstill there anyway, and stopping explicitly means no
   frame is queued against a document nobody is looking at.
   ═══════════════════════════════════════════════════════════ */

export function createLoop() {
  /** @type {Set<(now: number) => void>} */
  const subscribers = new Set();
  let handle = 0;
  let running = false;

  const tick = (now) => {
    if (!running) return;

    try {
      for (const fn of subscribers) fn(now);
    } catch (error) {
      /* A throw in here used to leave `running` true with no pending frame,
         which permanently wedged the loop: start() saw the flag and returned,
         so the visibilitychange recovery below could never revive it. Park
         cleanly instead, and let the next tab switch try again. */
      stop();
      console.error('[loop] frame failed — animation parked until the tab is re-shown', error);
      return;
    }

    handle = requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return; // without this guard every visibility event stacked another loop
    running = true;
    handle = requestAnimationFrame(tick);
  };

  const stop = () => {
    running = false;
    cancelAnimationFrame(handle);
    handle = 0;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  return {
    start,
    stop,
    /**
     * @param {(now: number) => void} fn called with the rAF timestamp
     * @returns {() => void} unsubscribe
     */
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
