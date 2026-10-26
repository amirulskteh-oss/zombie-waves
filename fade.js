'use strict';
// Shared focus-fade hooks: elements dim after idle and hold while focused/held.
// Loaded before game.js; exposed as window.ZWFade.
(function () {
  function makeFader(fadeEls, input) {
    let timer = null;
    let focused = false;
    const held = () => focused || (input && document.activeElement === input);
    return {
      show() { for (const el of fadeEls) el.classList.remove('dim'); clearTimeout(timer); },
      fade(delay) {
        clearTimeout(timer);
        timer = setTimeout(() => { if (!held()) for (const el of fadeEls) el.classList.add('dim'); }, delay);
      },
      focusIn() { focused = true; this.show(); },
      focusOut() { focused = false; this.fade(400); },
    };
  }
  function attachFade(row, fader, opts) {
    const o = opts || {};
    const input = o.input || null;
    if (input) {
      input.addEventListener('focus', () => fader.focusIn());
      input.addEventListener('blur', () => fader.focusOut());
    }
    row.addEventListener('pointerdown', () => fader.show());
    row.addEventListener('pointerup', () => fader.fade(o.upDelay || 600));
    row.addEventListener('mouseenter', () => fader.show());
    row.addEventListener('mouseleave', () => fader.fade(o.leaveDelay || 400));
    fader.fade(o.graceMs || 3000);
    return {
      bump(idleMs) { fader.show(); fader.fade(idleMs || 1500); },
    };
  }
  window.ZWFade = { makeFader, attachFade };
})();
