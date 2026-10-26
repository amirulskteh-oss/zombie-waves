'use strict';
// Unit tests for the shared focus-fade hooks (fade.js -> window.ZWFade).
// Run: node tests/fade.test.js
// Uses real timers with short delays to lock in the exact timing contract.

global.window = {};
require('../fade.js');
global.document = { activeElement: null }; // fade.js reads document.activeElement inside timers
const { makeFader, attachFade } = global.window.ZWFade;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
const failures = [];

function el() {
  const cls = new Set();
  return {
    cls,
    handlers: {},
    addEventListener(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); },
    fire(ev) { (this.handlers[ev] || []).forEach((fn) => fn()); },
    classList: {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
    },
  };
}
const dimmed = (e) => e.classList.contains('dim');

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log('  ok   ' + name);
  } catch (e) {
    failures.push(name + ' — ' + e.message);
    console.log('  FAIL ' + name + ' — ' + e.message);
  }
}

const tests = [
  // ---------- makeFader ----------
  () => test('makeFader: fade dims elements after the delay, not before', async () => {
    const a = el();
    const f = makeFader([a]);
    f.fade(25);
    await sleep(10);
    assert(!dimmed(a), 'dimmed before delay elapsed');
    await sleep(50);
    assert(dimmed(a), 'not dimmed after delay elapsed');
  }),

  () => test('makeFader: show cancels a pending fade', async () => {
    const a = el();
    const f = makeFader([a]);
    f.fade(25);
    f.show();
    await sleep(60);
    assert(!dimmed(a), 'pending fade was not cancelled by show');
  }),

  () => test('makeFader: a later fade replaces an earlier one (timer reset)', async () => {
    const a = el();
    const f = makeFader([a]);
    f.fade(100);
    f.fade(25);
    await sleep(40);
    assert(dimmed(a), 'shorter later fade did not fire');
    await sleep(100);
    assert(dimmed(a), 'dim state did not persist');
  }),

  () => test('makeFader: focusIn holds elements visible past the fade delay', async () => {
    const a = el();
    const f = makeFader([a]);
    f.focusIn();
    f.fade(25);
    await sleep(60);
    assert(!dimmed(a), 'dimmed while focused');
  }),

  () => test('makeFader: focusIn also shows already-dimmed elements', async () => {
    const a = el();
    const f = makeFader([a]);
    a.classList.add('dim');
    f.focusIn();
    assert(!dimmed(a), 'focusIn did not clear dim');
  }),

  () => test('makeFader: focusOut re-allows dimming (and schedules its own 400ms fade)', async () => {
    const a = el();
    const f = makeFader([a]);
    f.focusIn();
    f.fade(25);
    await sleep(40);
    assert(!dimmed(a), 'dimmed while focused (setup)');
    f.focusOut();
    await sleep(40);
    assert(!dimmed(a), 'focusOut dimmed before its 400ms delay');
    await sleep(450);
    assert(dimmed(a), 'focusOut fade did not fire after 400ms');
  }),

  () => test('makeFader: held via document.activeElement on the input prevents dimming', async () => {
    const input = el();
    const a = el();
    const f = makeFader([a], input);
    global.document.activeElement = input;
    f.fade(25);
    await sleep(60);
    assert(!dimmed(a), 'dimmed while input held activeElement');
    global.document.activeElement = null;
    f.fade(25);
    await sleep(60);
    assert(dimmed(a), 'not dimmed after activeElement released');
  }),

  // ---------- attachFade ----------
  () => test('attachFade: applies the initial grace fade and wires input focus/blur', async () => {
    const row = el(), input = el(), a = el();
    const f = makeFader([a], input);
    attachFade(row, f, { input, graceMs: 25 });
    assert(Array.isArray(input.handlers.focus) && input.handlers.focus.length === 1, 'focus not wired to input');
    assert(Array.isArray(input.handlers.blur) && input.handlers.blur.length === 1, 'blur not wired to input');
    await sleep(60);
    assert(dimmed(a), 'grace fade did not fire');
  }),

  () => test('attachFade: row pointerdown shows, pointerup fades after upDelay', async () => {
    const row = el(), input = el(), a = el();
    const f = makeFader([a], input);
    attachFade(row, f, { input, graceMs: 1000, upDelay: 25 });
    row.fire('pointerdown');
    assert(!dimmed(a), 'pointerdown did not show');
    row.fire('pointerup');
    await sleep(10);
    assert(!dimmed(a), 'dimmed before upDelay elapsed');
    await sleep(50);
    assert(dimmed(a), 'pointerup fade did not fire');
  }),

  () => test('attachFade: mouseenter shows, mouseleave fades after leaveDelay', async () => {
    const row = el(), input = el(), a = el();
    const f = makeFader([a], input);
    attachFade(row, f, { input, graceMs: 1000, leaveDelay: 25 });
    row.fire('mouseenter');
    assert(!dimmed(a), 'mouseenter did not show');
    row.fire('mouseleave');
    await sleep(10);
    assert(!dimmed(a), 'dimmed before leaveDelay elapsed');
    await sleep(50);
    assert(dimmed(a), 'mouseleave fade did not fire');
  }),

  () => test('attachFade: bump shows immediately then fades after idleMs', async () => {
    const row = el(), input = el(), a = el();
    const f = makeFader([a], input);
    const fade = attachFade(row, f, { input, graceMs: 1000, idleMs: 25 });
    a.classList.add('dim');
    fade.bump(25);
    assert(!dimmed(a), 'bump did not show immediately');
    await sleep(60);
    assert(dimmed(a), 'bump fade did not fire after idleMs');
  }),

  () => test('attachFade: without input, no focus/blur listeners are wired', async () => {
    const row = el(), a = el();
    const input = el();
    const f = makeFader([a]);
    attachFade(row, f, { graceMs: 1000 });
    assert(!input.handlers.focus, 'focus wired despite no input');
    assert(!input.handlers.blur, 'blur wired despite no input');
  }),

  () => test('attachFade: pointer hold on the input keeps elements visible (row events + held)', async () => {
    const row = el(), input = el(), a = el();
    const f = makeFader([a], input);
    attachFade(row, f, { input, graceMs: 1000, upDelay: 25 });
    global.document.activeElement = input;
    row.fire('pointerdown');
    row.fire('pointerup');
    await sleep(60);
    assert(!dimmed(a), 'dimmed while input held activeElement after pointerup');
    global.document.activeElement = null;
    f.fade(25);
    await sleep(60);
    assert(dimmed(a), 'not dimmed after hold released');
  }),
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

(async () => {
  console.log('fade.test.js — ' + tests.length + ' tests');
  for (const t of tests) await t();
  console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    console.log('failures:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  process.exit(0);
})();
