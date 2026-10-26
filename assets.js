'use strict';
// Procedural 2.5D sprite assets, pre-rendered once to offscreen canvases.
// Loaded before game.js; exposed as window.ZWAssets.
(function () {
  const TAU = Math.PI * 2;
  const S = 3; // supersample factor for crisp scaling

  function make(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * S);
    c.height = Math.ceil(h * S);
    const g = c.getContext('2d');
    g.scale(S, S);
    draw(g, w, h);
    return { img: c, w, h };
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Standing figure viewed from a 3/4 angle: feet at the bottom, arms reaching
  // toward the viewer, side-shaded torso, rim-lit head.
  function humanoid(g, w, h, o) {
    const cx = w / 2;
    const ty = h - o.legH - o.bodyH; // torso top
    // legs
    g.fillStyle = o.legs;
    rr(g, cx - o.bodyW * 0.34, h - o.legH, o.bodyW * 0.28, o.legH, 2); g.fill();
    rr(g, cx + o.bodyW * 0.06, h - o.legH, o.bodyW * 0.28, o.legH, 2); g.fill();
    // arms reaching forward
    g.fillStyle = o.dark;
    rr(g, cx - o.bodyW * 0.5 - o.armW * 0.35, ty + o.bodyH * 0.12, o.armW, o.bodyH * 0.7, o.armW * 0.45); g.fill();
    rr(g, cx + o.bodyW * 0.5 - o.armW * 0.65, ty + o.bodyH * 0.12, o.armW, o.bodyH * 0.7, o.armW * 0.45); g.fill();
    // torso with side shading
    const grad = g.createLinearGradient(cx - o.bodyW / 2, 0, cx + o.bodyW / 2, 0);
    grad.addColorStop(0, o.dark);
    grad.addColorStop(0.55, o.base);
    grad.addColorStop(1, o.light);
    g.fillStyle = grad;
    rr(g, cx - o.bodyW / 2, ty, o.bodyW, o.bodyH, o.bodyW * 0.3); g.fill();
    // head
    g.fillStyle = o.skin;
    g.beginPath(); g.arc(cx, ty - o.headR * 0.5, o.headR, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, ty - o.headR * 0.5, o.headR, -0.7, 0.8); g.stroke();
    if (o.eyes) {
      g.fillStyle = o.eyes;
      const ey = ty - o.headR * 0.55;
      g.beginPath(); g.arc(cx - o.headR * 0.35, ey, o.headR * 0.16, 0, TAU); g.fill();
      g.beginPath(); g.arc(cx + o.headR * 0.35, ey, o.headR * 0.16, 0, TAU); g.fill();
    }
  }

  const sprites = {};

  sprites.zombie = make(30, 36, (g, w, h) => {
    humanoid(g, w, h, { legH: 10, bodyH: 14, bodyW: 16, headR: 6.5, armW: 5,
      base: '#5f7d3f', dark: '#3f5428', light: '#79955a', legs: '#3f5428', skin: '#9fb86a', eyes: '#2a3320' });
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(w * 0.35, h * 0.5); g.lineTo(w * 0.5, h * 0.58); g.lineTo(w * 0.42, h * 0.66); g.stroke();
  });

  sprites.fast = make(26, 30, (g, w, h) => {
    humanoid(g, w, h, { legH: 9, bodyH: 11, bodyW: 13, headR: 5.5, armW: 4,
      base: '#8a9a4f', dark: '#5c692f', light: '#a8b96b', legs: '#5c692f', skin: '#c2cf7f', eyes: '#3a3d1c' });
  });

  sprites.brute = make(44, 50, (g, w, h) => {
    humanoid(g, w, h, { legH: 14, bodyH: 20, bodyW: 26, headR: 8, armW: 9,
      base: '#4f6b36', dark: '#33451f', light: '#6d8a4c', legs: '#33451f', skin: '#7d955c', eyes: '#22301a' });
  });

  sprites.boss = make(64, 72, (g, w, h) => {
    humanoid(g, w, h, { legH: 20, bodyH: 28, bodyW: 38, headR: 11, armW: 13,
      base: '#6b3f3f', dark: '#3c2020', light: '#8a5656', legs: '#3c2020', skin: '#8a5656', eyes: '#ff5c5c' });
    // shoulder spikes
    const cx = w / 2, ty = h - 20 - 28;
    g.fillStyle = '#3c2020';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + side * 14, ty + 2);
      g.lineTo(cx + side * 25, ty - 9);
      g.lineTo(cx + side * 19, ty + 7);
      g.closePath(); g.fill();
    }
    // glowing eye haze
    g.fillStyle = 'rgba(255,80,80,0.4)';
    g.beginPath(); g.arc(cx, ty - 6, 5, 0, TAU); g.fill();
  });

  sprites.player = make(30, 38, (g, w, h) => {
    humanoid(g, w, h, { legH: 11, bodyH: 15, bodyW: 16, headR: 6.5, armW: 5,
      base: '#3d5168', dark: '#22303f', light: '#5a7392', legs: '#22303f', skin: '#d9a066' });
    // cap
    const cx = w / 2, hy = h - 11 - 15 - 6.5 * 0.5;
    g.fillStyle = '#22303f';
    g.beginPath(); g.arc(cx, hy, 6.5, Math.PI, 0); g.fill();
    g.fillRect(cx - 6.5, hy - 1.5, 13, 2);
  });

  sprites.rock = make(48, 34, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5a6455');
    grad.addColorStop(1, '#39413a');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(w * 0.08, h * 0.85);
    g.quadraticCurveTo(w * 0.02, h * 0.35, w * 0.3, h * 0.18);
    g.quadraticCurveTo(w * 0.55, h * 0.02, w * 0.8, h * 0.2);
    g.quadraticCurveTo(w * 0.98, h * 0.4, w * 0.92, h * 0.85);
    g.closePath(); g.fill();
    g.strokeStyle = '#262c26'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.ellipse(w * 0.38, h * 0.32, w * 0.16, h * 0.12, -0.4, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(w * 0.45, h * 0.3); g.lineTo(w * 0.55, h * 0.55); g.lineTo(w * 0.48, h * 0.75); g.stroke();
  });

  sprites.gem = make(12, 16, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#9ff0ff');
    grad.addColorStop(1, '#1fb6d8');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(w / 2, 0); g.lineTo(w, h * 0.42); g.lineTo(w / 2, h); g.lineTo(0, h * 0.42);
    g.closePath(); g.fill();
    g.strokeStyle = '#0d7f99'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.moveTo(w / 2, 2); g.lineTo(w * 0.72, h * 0.42); g.lineTo(w / 2, h * 0.5);
    g.closePath(); g.fill();
  });

  sprites.heal = make(20, 16, (g, w, h) => {
    g.fillStyle = '#f2f5f0';
    rr(g, 1, 2, w - 2, h - 3, 3); g.fill();
    g.strokeStyle = '#2ecc71'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#2ecc71';
    g.fillRect(w / 2 - 5, h / 2 - 1.5, 10, 3);
    g.fillRect(w / 2 - 1.5, h / 2 - 5, 3, 10);
  });

  sprites.pickShotgun = make(26, 12, (g) => {
    g.fillStyle = '#e8963c';
    g.fillRect(3, 2, 20, 3);
    g.fillRect(3, 6.5, 20, 3);
    g.fillRect(0, 3, 4, 6);
  });

  sprites.pickRifle = make(26, 12, (g) => {
    g.fillStyle = '#4dc3e8';
    g.fillRect(2, 4, 23, 3.5);
    g.fillRect(0, 3, 4, 6);
    g.fillRect(14, 1, 3, 3);
  });

  window.ZWAssets = sprites;
})();
