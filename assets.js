'use strict';
// Procedural 2.5D sprite assets, pre-rendered once to offscreen canvases.
// Humanoid entities come as 8-directional sets (E, SE, S, SW, W, NW, N, NE).
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

  // Standing figure viewed from a 3/4 camera, drawn facing angle `a`
  // (0 = East, PI/2 = South/toward viewer, PI = West, 3PI/2 = North/away).
  // `phase` (0..1) drives the walk cycle: leg stride, body bob, arm swing.
  function humanoid(g, w, h, o, a, phase) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const cx = w / 2;
    const bw = o.bodyW * (1 - 0.32 * Math.abs(dx)); // side profile is narrower
    const stride = Math.sin(phase * TAU) * 3;       // leg stride along facing
    const bob = Math.abs(Math.cos(phase * TAU)) * 1.5; // body rises mid-step
    const swing = Math.sin(phase * TAU) * 1.5;      // arm counter-swing
    const ty = h - o.legH - o.bodyH - bob; // torso top (bob above planted feet)
    const back = dy < -0.2; // facing away from the viewer

    // legs (stride toward facing)
    g.fillStyle = o.legs;
    rr(g, cx - bw * 0.36 + dx * 1.5 + dx * stride, h - o.legH + dy * stride * 0.4, bw * 0.3, o.legH, 2); g.fill();
    rr(g, cx + bw * 0.06 + dx * 1.5 - dx * stride, h - o.legH - dy * stride * 0.4, bw * 0.3, o.legH, 2); g.fill();

    // arms — behind the torso when facing away, in front otherwise
    const armW = o.armW * (1 - 0.25 * Math.abs(dx));
    const armY = ty + o.bodyH * 0.1 + Math.max(dy, 0) * o.bodyH * 0.35 - (back ? 2 : 0);
    const armDX = dx * o.armW * 1.1;
    const armDY = Math.max(dy, -0.2) * o.armW * 0.55;
    const drawArms = () => {
      g.fillStyle = o.dark;
      rr(g, cx - bw / 2 + armDX - armW / 2, armY + armDY + swing, armW, o.bodyH * 0.7, armW * 0.45); g.fill();
      rr(g, cx + bw / 2 - armDX - armW / 2, armY + armDY - swing, armW, o.bodyH * 0.7, armW * 0.45); g.fill();
    };
    if (back) drawArms();

    // torso with side shading
    const grad = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    grad.addColorStop(0, o.dark);
    grad.addColorStop(0.55, o.base);
    grad.addColorStop(1, o.light);
    g.fillStyle = grad;
    rr(g, cx - bw / 2, ty, bw, o.bodyH, bw * 0.3); g.fill();

    if (!back) drawArms();

    // head
    const hx = cx + dx * o.headR * 0.25;
    const hy = ty - o.headR * 0.5;
    g.fillStyle = o.skin;
    g.beginPath(); g.arc(hx, hy, o.headR, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1;
    g.beginPath(); g.arc(hx, hy, o.headR, -0.7, 0.8); g.stroke();

    if (back) {
      // back of the head
      g.fillStyle = o.dark;
      g.beginPath(); g.arc(hx, hy, o.headR * 0.78, 0, TAU); g.fill();
      if (o.cap) {
        g.fillStyle = '#1a2530';
        g.beginPath(); g.arc(hx, hy, o.headR * 0.8, 0, TAU); g.fill();
      }
    } else {
      // face
      g.fillStyle = o.eyes || '#222';
      const ex = dx * o.headR * 0.3;
      const ey = hy - o.headR * 0.1 + dy * o.headR * 0.12;
      g.beginPath(); g.arc(hx - o.headR * 0.35 + ex, ey, o.headR * 0.16, 0, TAU); g.fill();
      g.beginPath(); g.arc(hx + o.headR * 0.35 + ex, ey, o.headR * 0.16, 0, TAU); g.fill();
      if (o.cap) {
        g.fillStyle = '#22303f';
        g.beginPath(); g.arc(hx, hy - o.headR * 0.25, o.headR * 0.92, Math.PI, 0); g.fill();
        g.fillRect(hx - o.headR * 0.92 + dx * 2, hy - o.headR * 0.32, o.headR * 1.84, 2);
      }
    }
  }

  // Build 8 directional variants × 4 walk frames; `extra(g, w, h, a)` adds per-direction extras.
  function buildSet(w, h, opts, extra) {
    const FRAMES = 4;
    const set = [];
    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI / 4);
      const dir = [];
      for (let fr = 0; fr < FRAMES; fr++) {
        const phase = fr / FRAMES;
        dir.push(make(w, h, (g) => {
          humanoid(g, w, h, opts, a, phase);
          if (extra) extra(g, w, h, a);
        }));
      }
      set.push(dir);
    }
    return set;
  }

  const sprites = {};

  sprites.zombie = buildSet(30, 36, { legH: 10, bodyH: 14, bodyW: 16, headR: 6.5, armW: 5,
    base: '#5f7d3f', dark: '#3f5428', light: '#79955a', legs: '#3f5428', skin: '#9fb86a', eyes: '#2a3320' },
    (g, w, h) => {
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(w * 0.35, h * 0.5); g.lineTo(w * 0.5, h * 0.58); g.lineTo(w * 0.42, h * 0.66); g.stroke();
    });

  sprites.fast = buildSet(26, 30, { legH: 9, bodyH: 11, bodyW: 13, headR: 5.5, armW: 4,
    base: '#8a9a4f', dark: '#5c692f', light: '#a8b96b', legs: '#5c692f', skin: '#c2cf7f', eyes: '#3a3d1c' });

  sprites.brute = buildSet(44, 50, { legH: 14, bodyH: 20, bodyW: 26, headR: 8, armW: 9,
    base: '#4f6b36', dark: '#33451f', light: '#6d8a4c', legs: '#33451f', skin: '#7d955c', eyes: '#22301a' });

  sprites.boss = buildSet(64, 72, { legH: 20, bodyH: 28, bodyW: 38, headR: 11, armW: 13,
    base: '#6b3f3f', dark: '#3c2020', light: '#8a5656', legs: '#3c2020', skin: '#8a5656', eyes: '#ff5c5c' },
    (g, w, h, a) => {
      const dx = Math.cos(a), dy = Math.sin(a);
      const cx = w / 2, ty = h - 20 - 28;
      g.fillStyle = '#3c2020';
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + side * 14 + dx * 3, ty + 2);
        g.lineTo(cx + side * 25 + dx * 4, ty - 9);
        g.lineTo(cx + side * 19 + dx * 3, ty + 7);
        g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(255,80,80,0.4)';
      g.beginPath(); g.arc(cx + dx * 3, ty - 6, 5, 0, TAU); g.fill();
    });

  sprites.player = buildSet(30, 38, { legH: 11, bodyH: 15, bodyW: 16, headR: 6.5, armW: 5,
    base: '#3d5168', dark: '#22303f', light: '#5a7392', legs: '#22303f', skin: '#d9a066', cap: true });

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

  // Player reload animation frames: gun dips on a sine curve while the
  // magazine slides up into the grip. Pivot (grip) at (10, 14).
  sprites.reload = [];
  const RELOAD_FRAMES = 6;
  for (let i = 0; i < RELOAD_FRAMES; i++) {
    const p = i / (RELOAD_FRAMES - 1);
    sprites.reload.push(make(40, 34, (g, w, h) => {
      const px = 10, py = 14;
      const dip = Math.sin(p * Math.PI) * 1.15;
      const mp = Math.max(0, Math.min(1, (p - 0.25) / 0.5));
      g.translate(px, py);
      g.rotate(dip);
      g.fillStyle = '#8f9aa6';
      g.fillRect(2, -3.5, 24, 7);
      g.fillStyle = '#cfd6de';
      g.fillRect(2, -3.5, 24, 3);
      if (mp > 0) {
        g.fillStyle = '#4a5560';
        g.fillRect(6, 6 + (1 - mp) * 12, 6, 9);
        g.fillStyle = '#2f3a44';
        g.fillRect(6, 6 + (1 - mp) * 12, 6, 2.5);
      }
      g.fillStyle = '#d9a066';
      g.beginPath(); g.arc(10, -5, 4, 0, TAU); g.fill();
      g.beginPath(); g.arc(10, 5, 4, 0, TAU); g.fill();
    }));
  }

  window.ZWAssets = sprites;

  // ---- AI-generated image sprites (Gemini 3 Pro Image, keyed + cropped) ----
  // Loaded async; on success they replace the procedural canvases. On failure
  // the procedural sprites stay as fallback.
  const IMAGE_SPRITES = [
    { key: 'player', w: 30, h: 38, set: true, perDir: { 0: 'sprites/player_E.png', 1: 'sprites/player_SE.png', 2: 'sprites/player.png', 3: 'sprites/player_SW.png', 4: 'sprites/player_W.png', 5: 'sprites/player_NW.png', 6: 'sprites/player_N.png', 7: 'sprites/player_NE.png' } },
    { key: 'zombie', w: 30, h: 36, set: true, perDir: { 0: 'sprites/zombie_E.png', 1: 'sprites/zombie_SE.png', 2: 'sprites/zombie.png', 3: 'sprites/zombie_SW.png', 4: 'sprites/zombie_W.png', 5: 'sprites/zombie_NW.png', 6: 'sprites/zombie_N.png', 7: 'sprites/zombie_NE.png' } },
    { key: 'fast', file: 'sprites/fast.png', w: 26, h: 30, set: true },
    { key: 'brute', file: 'sprites/brute.png', w: 44, h: 50, set: true },
    { key: 'boss', file: 'sprites/boss.png', w: 64, h: 72, set: true },
    { key: 'gem', file: 'sprites/gem.png', w: 12, h: 16 },
    { key: 'heal', file: 'sprites/heal.png', w: 20, h: 16 },
    { key: 'pickShotgun', file: 'sprites/pickShotgun.png', w: 26, h: 12 },
    { key: 'pickRifle', file: 'sprites/pickRifle.png', w: 26, h: 12 },
    { key: 'flash', file: 'sprites/flash.png', w: 40, h: 40 },
  ];
  for (const cfg of IMAGE_SPRITES) {
    if (typeof Image === 'undefined') break; // non-browser environment: keep procedural
    if (cfg.perDir) {
      for (const dStr of Object.keys(cfg.perDir)) {
        const d = +dStr;
        const img = new Image();
        img.onload = () => {
          const spr = { img, w: cfg.w, h: cfg.h };
          for (let fr = 0; fr < sprites[cfg.key][d].length; fr++) sprites[cfg.key][d][fr] = spr;
        };
        img.onerror = () => { /* keep procedural fallback for this direction */ };
        img.src = cfg.perDir[dStr];
      }
      continue;
    }
    const img = new Image();
    img.onload = () => {
      const spr = { img, w: cfg.w, h: cfg.h };
      if (cfg.set) {
        for (let d = 0; d < sprites[cfg.key].length; d++)
          for (let fr = 0; fr < sprites[cfg.key][d].length; fr++)
            sprites[cfg.key][d][fr] = spr;
      } else {
        sprites[cfg.key] = spr;
      }
    };
    img.onerror = () => { /* keep procedural sprite as fallback */ };
    img.src = cfg.file;
  }
})();
