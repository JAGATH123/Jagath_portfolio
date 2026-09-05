/* ═══════════════════════════════════════════════════════════
   DATUM LINE — interface sound

   A single square-wave blip, off by default, remembered across
   visits. Nothing here ever autoplays: every blip is downstream
   of a click or a keypress.
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'dl.sound';

/** Named so call sites read as intent rather than as frequencies. */
export const TONE = {
  enabled: 900,   // the toggle confirming itself
  navigate: 600,  // moved to another screen
  reselect: 760,  // asked for the screen already showing
  caseOpen: 720,
  caseClose: 520,
};

/* Envelope. exponentialRampToValueAtTime cannot reach or start from zero,
   hence the near-silent floor rather than 0. */
const SILENT = 0.0001;
const PEAK = 0.05;
const ATTACK_S = 0.008;
const RELEASE_S = 0.12;
const TAIL_S = 0.13; // stop just after the release lands, so nothing clicks

export function createSound() {
  const button = document.getElementById('sound');

  /* Safari in Private Browsing throws on any localStorage access, and a page
     opened from file:// has no storage at all. Neither is worth a broken page. */
  let enabled = false;
  try {
    enabled = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    enabled = false;
  }

  let audio = null;

  const paint = () => button?.setAttribute('aria-pressed', String(enabled));

  const blip = (frequency) => {
    if (!enabled) return;

    try {
      const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioCtx) return;
      audio ??= new AudioCtx();

      if (audio.state === 'suspended') {
        /* resume() returns a promise that REJECTS when there has been no user
           activation, and an unhandled rejection prints an error to the
           console. Optional call because the prefixed implementation returned
           undefined. */
        audio.resume()?.catch(() => {});
      }

      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;

      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(SILENT, now);
      gain.gain.exponentialRampToValueAtTime(PEAK, now + ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(SILENT, now + RELEASE_S);

      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + TAIL_S);
    } catch {
      /* Construction can fail outright — blocked by an autoplay policy, or too
         many live contexts. Sound is decoration; the page carries on. */
    }
  };

  button?.addEventListener('click', () => {
    enabled = !enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      /* Preference is not persisted; it still applies for this session. */
    }
    paint();
    if (enabled) blip(TONE.enabled);
  });

  paint();

  return { blip };
}
