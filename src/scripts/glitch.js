/* ═══════════════════════════════════════════════════════════
   DATUM LINE — glitch transition

   The flash and sweep that punctuate a screen change. All the
   animation lives in CSS; this only arms it.
   ═══════════════════════════════════════════════════════════ */

import { reducedMotion } from './media.js';

/* Slightly longer than the .44s CSS animations so the class is removed after
   they have finished rather than cutting them off. */
const HOLD_MS = 460;

export function createGlitch() {
  const overlay = document.querySelector('.glitch');
  let timer = 0;

  const flash = () => {
    /* The stylesheet also hides the overlay under reduced motion; checking here
       as well means no reflow and no timer are spent on something invisible. */
    if (!overlay || reducedMotion.matches) return;

    overlay.classList.remove('on');
    void overlay.offsetWidth; // forced reflow: restarts the CSS animation from 0
    overlay.classList.add('on');

    clearTimeout(timer);
    timer = setTimeout(() => overlay.classList.remove('on'), HOLD_MS);
  };

  return { flash };
}
