'use strict';
(() => {
  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function fmt(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  }

  // ---------- canvas ----------
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const WORLD = 2400;
  const ASSETS = window.ZWAssets;
  let vw = 0, vh = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- world decals (deterministic) ----------
  const rng = mulberry32(20261025);
  const tufts = [], stones = [], cracks = [];
  for (let i = 0; i < 90; i++) tufts.push({ x: rng() * WORLD, y: rng() * WORLD, s: rand(0.7, 1.6), r: rng() * TAU });
  for (let i = 0; i < 30; i++) stones.push({ x: rng() * WORLD, y: rng() * WORLD, r: rand(3, 9) });
  for (let i = 0; i < 16; i++) cracks.push({ x: rng() * WORLD, y: rng() * WORLD, l: rand(24, 70), r: rng() * TAU });

  // ---------- audio ----------
  let actx = null, muted = loadPref('zombie-waves.muted', false);
  let volume = loadNum('zombie-waves.volume', 100);
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function tone(f0, f1, dur, type, vol, delay = 0) {
    if (!actx || muted) return;
    const t0 = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    g.gain.setValueAtTime(vol * (volume / 100), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    shoot: () => tone(280, 90, 0.07, 'square', 0.03),
    hit: () => tone(220, 130, 0.05, 'triangle', 0.028),
    die: () => tone(140, 40, 0.22, 'sawtooth', 0.045),
    hurt: () => tone(120, 55, 0.2, 'sawtooth', 0.06),
    pickup: () => tone(520, 840, 0.09, 'sine', 0.045),
    heal: () => tone(440, 880, 0.12, 'sine', 0.05),
    dash: () => tone(180, 460, 0.09, 'sine', 0.035),
    wave: () => { tone(160, 320, 0.14, 'square', 0.045); tone(320, 640, 0.14, 'square', 0.035, 0.15); },
    level: () => { [440, 554, 659, 880].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.05, i * 0.08)); },
    roar: () => tone(90, 40, 0.5, 'sawtooth', 0.09),
    charge: () => tone(220, 90, 0.22, 'square', 0.05),
    shotgun: () => tone(140, 55, 0.13, 'square', 0.055),
    rifle: () => tone(520, 80, 0.1, 'sawtooth', 0.05),
  };

  // ---------- game state ----------
  let state = 'menu'; // menu | playing | levelup | over
  let paused = false;
  let wave = 0, kills = 0, level = 1, xp = 0, time = 0;
  let waveActive = false, toSpawn = 0, spawned = 0, spawnTimer = 0, interTimer = 0;
  let shake = 0, hurtFlash = 0, muzzle = 0;
  const xpNeed = () => 5 + level * 3;

  let score = 0, bossRef = null;
  const HS_KEY = 'zombie-waves.highscore';
  function loadHigh() { try { return parseInt(localStorage.getItem(HS_KEY), 10) || 0; } catch (e) { return 0; } }
  function saveHigh(v) { try { localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* storage unavailable */ } }
  let highScore = loadHigh();
  function loadPref(key, dflt) { try { const v = localStorage.getItem(key); return v === null ? dflt : v === '1'; } catch (e) { return dflt; } }
  function loadNum(key, dflt) { try { const v = parseInt(localStorage.getItem(key), 10); return isNaN(v) ? dflt : clamp(v, 0, 100); } catch (e) { return dflt; } }
  function savePref(key, v) { try { localStorage.setItem(key, v ? '1' : '0'); } catch (e) { /* storage unavailable */ } }
  function clearPref(key) { try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ } }
  let credits = 0;
  const perkLevels = {};

  const WEAPONS = {
    pistol: { name: 'PISTOL', dmg: 4, rate: 3.8, pellets: 1, spread: 0.05, speed: 640, life: 1.3, pierce: 0 },
    shotgun: { name: 'SHOTGUN', dmg: 2.5, rate: 1.5, pellets: 6, spread: 0.24, speed: 560, life: 0.5, pierce: 0 },
    rifle: { name: 'RIFLE', dmg: 9, rate: 1.7, pellets: 1, spread: 0.02, speed: 900, life: 1.3, pierce: 2 },
  };
  const player = {
    x: WORLD / 2, y: WORLD / 2, r: 15,
    hp: 100, maxHp: 100, speed: 235,
    dmgMul: 1, rateMul: 1, weapon: 'pistol', fireCd: 0, aim: -Math.PI / 2,
    regen: 0, dashCdMax: 2.4, magnet: 130,
    dashT: 0, dashCd: 0, hitCd: 0,
  };
  const cam = { x: 0, y: 0 };
  let zombies = [], bullets = [], gems = [], drops = [], parts = [], floats = [], ghosts = [], obstacles = [];

  // ---------- DOM ----------
  const elHp = $('hp'), elXpFill = $('xpfill'), elStats = $('stats'),
    elBanner = $('banner'), elHurt = $('hurtflash'), elDash = $('dashbtn'),
    elMenu = $('menu'), elLvl = $('levelup'), elLvlTitle = $('lvltitle'), elCards = $('cards'),
    elShop = $('shop'), elShopCredits = $('shopcredits'), elPerks = $('perks'),
    elSettings = $('settings'), elSetRows = $('settingrows'),
    elPause = $('pauseov'), elOver = $('over'), elOverStats = $('overstats'), elNewRecord = $('newrecord'),
    btnPlay = $('play'), btnRestart = $('restart'), btnResume = $('resume'), btnReady = $('ready'),
    btnPSettings = $('psettings'), btnSetBack = $('setback'), btnPRestart = $('prestart'),
    btnPReset = $('preset'),
    btnPause = $('pause'), btnMute = $('mute');

  let bannerTimer = 0;
  function banner(txt) {
    elBanner.textContent = txt;
    elBanner.classList.remove('show');
    void elBanner.offsetWidth;
    elBanner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => elBanner.classList.remove('show'), 1900);
  }
  function hideAll() {
    elMenu.classList.add('hidden');
    elLvl.classList.add('hidden');
    elShop.classList.add('hidden');
    elSettings.classList.add('hidden');
    elPause.classList.add('hidden');
    elOver.classList.add('hidden');
  }

  // ---------- key hint visibility ----------
  let hintsOn = loadPref('zombie-waves.hints', true), hintsTimer = null;
  let shakeOn = loadPref('zombie-waves.shake', true);
  function hintEls() { return document.querySelectorAll('.keyhints, .keys'); }
  function showHints() {
    if (!hintsOn) return;
    for (const el of hintEls()) el.classList.remove('fading');
    clearTimeout(hintsTimer);
    hintsTimer = setTimeout(() => { for (const el of hintEls()) el.classList.add('fading'); }, 4200);
  }
  function hideHints() {
    clearTimeout(hintsTimer);
    for (const el of hintEls()) el.classList.add('fading');
  }
  function toggleMute() {
    muted = !muted;
    btnMute.textContent = muted ? '🔇' : '🔊';
    savePref('zombie-waves.muted', muted);
    updateSettingsRows();
  }
  function toggleHints() {
    hintsOn = !hintsOn;
    if (hintsOn) showHints(); else hideHints();
    savePref('zombie-waves.hints', hintsOn);
    updateSettingsRows();
  }
  function toggleShake() {
    shakeOn = !shakeOn;
    savePref('zombie-waves.shake', shakeOn);
    updateSettingsRows();
  }
  function resetSettings() {
    muted = false;
    hintsOn = true;
    shakeOn = true;
    volume = 100;
    clearPref('zombie-waves.muted');
    clearPref('zombie-waves.hints');
    clearPref('zombie-waves.shake');
    clearPref('zombie-waves.volume');
    btnMute.textContent = '🔊';
    showHints();
    updateSettingsRows();
  }

  // ---------- settings sub-screen ----------
  let settingsOpen = false;
  const SETTINGS_ROWS = [
    { nm: 'Sound', ds: 'Toggle all audio', get: () => muted, on: '🔊 On', off: '🔇 Off', toggle: toggleMute },
    { nm: 'Master Volume', ds: 'Overall loudness', slider: true, get: () => volume, set: setVolume },
    { nm: 'Key Hints', ds: 'Show key hints on menus', get: () => hintsOn, on: '👁 On', off: '👁 Off', toggle: toggleHints },
    { nm: 'Screen Shake', ds: 'Camera motion on hits and dashes', get: () => shakeOn, on: '〰 On', off: '〰 Off', toggle: toggleShake },
  ];
  function setVolume(v) {
    volume = clamp(Math.round(v), 0, 100);
    try { localStorage.setItem('zombie-waves.volume', String(volume)); } catch (e) { /* storage unavailable */ }
  }
  // Shared focus-fade hooks (defined in fade.js, loaded before this script).
  const { makeFader, attachFade } = window.ZWFade;
  function updateSettingsRows() {
    elSetRows.innerHTML = '';
    for (const r of SETTINGS_ROWS) {
      const row = document.createElement('div');
      row.className = 'perk';
      if (r.slider) {
        row.innerHTML =
          `<div class="pinfo"><div class="pnm">${r.nm} <span class="plv">${r.get()}%</span></div><div class="pds">${r.ds}</div></div>` +
          `<div class="volwrap"><div class="voltrack"><input type="range" min="0" max="100" step="5" value="${r.get()}"><div class="volticks">${'<i></i>'.repeat(11)}</div></div></div>`;
        const input = row.querySelector('input');
        const pct = row.querySelector('.plv');
        const ticks = row.querySelector('.volticks');
        const fader = makeFader([pct, ticks], input);
        const fade = attachFade(row, fader, { input });
        let lastTick = 0;
        input.addEventListener('input', () => {
          r.set(+input.value);
          input.value = String(r.get());
          pct.textContent = r.get() + '%';
          fade.bump(1500);
          const now = performance.now();
          if (now - lastTick > 90) { lastTick = now; sfx.pickup(); }
        });
      } else {
        row.className = 'perk clickable';
        row.innerHTML =
          `<div class="pinfo"><div class="pnm">${r.nm}</div><div class="pds">${r.ds}</div></div>` +
          `<button class="buy">${r.get() ? r.on : r.off}</button>`;
        const pill = row.querySelector('.buy');
        const fader = makeFader([pill], pill);
        row.addEventListener('click', () => r.toggle());
        attachFade(row, fader, { input: pill });
      }
      elSetRows.appendChild(row);
    }
  }
  function openSettings() {
    settingsOpen = true;
    updateSettingsRows();
    elPause.classList.add('hidden');
    elSettings.classList.remove('hidden');
    showHints();
  }
  function closeSettings() {
    settingsOpen = false;
    elSettings.classList.add('hidden');
    elPause.classList.remove('hidden');
    showHints();
  }

  // ---------- input ----------
  const keys = {};
  const joy = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    keys[k] = true;
    if (k === 'p' || k === 'escape') togglePause();
    if (k === 'm') toggleMute();
    if (k === 'h') toggleHints();
    if (state === 'menu' && (k === 'enter' || k === ' ')) { audio(); startRun(); return; }
    if (state === 'shop') {
      if (k >= '1' && k <= '7') buyPerk(+k - 1);
      else if (k === ' ') nextWaveFromShop();
    }
    if (k === ' ' || k === 'shift') tryDash();
    if (k === 'r' && state === 'over') startRun();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    audio();
    for (const t of e.changedTouches) {
      if (t.clientX < vw * 0.6 && !joy.active) {
        joy.active = true; joy.id = t.identifier;
        joy.ox = t.clientX; joy.oy = t.clientY; joy.dx = 0; joy.dy = 0;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) {
        joy.dx = t.clientX - joy.ox;
        joy.dy = t.clientY - joy.oy;
        const m = Math.hypot(joy.dx, joy.dy), max = 60;
        if (m > max) {
          joy.ox = t.clientX - (joy.dx / m) * max;
          joy.oy = t.clientY - (joy.dy / m) * max;
          joy.dx = (joy.dx / m) * max;
          joy.dy = (joy.dy / m) * max;
        }
      }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joy.id) { joy.active = false; joy.id = -1; joy.dx = 0; joy.dy = 0; }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  function tryDash() {
    if (player.dashCd <= 0 && state === 'playing' && !paused) {
      player.dashCd = player.dashCdMax; player.dashT = 0.2;
      shake = Math.min(shake + 3, 14);
      sfx.dash();
    }
  }

  // ---------- flow ----------
  function startRun() {
    zombies = []; bullets = []; gems = []; drops = []; parts = []; floats = [];
    ghosts = []; obstacles = [];
    for (const k in perkLevels) delete perkLevels[k];
    credits = 0;
    let otries = 0;
    while (obstacles.length < 26 && otries < 500) {
      otries++;
      const rr = rand(18, 42);
      const rx = rand(rr + 30, WORLD - rr - 30);
      const ry = rand(rr + 30, WORLD - rr - 30);
      if (dist2(rx, ry, WORLD / 2, WORLD / 2) < (rr + 240) ** 2) continue;
      let ok = true;
      for (const o of obstacles) {
        if (dist2(rx, ry, o.x, o.y) < (rr + o.r + 60) ** 2) { ok = false; break; }
      }
      if (!ok) continue;
      obstacles.push({ x: rx, y: ry, r: rr, seed: rand(0, TAU) });
    }
    wave = 0; kills = 0; level = 1; xp = 0; time = 0; score = 0; bossRef = null;
    Object.assign(player, {
      x: WORLD / 2, y: WORLD / 2, hp: 100, maxHp: 100, speed: 235,
      dmgMul: 1, rateMul: 1, weapon: 'pistol', fireCd: 0, aim: -Math.PI / 2,
      regen: 0, dashCdMax: 2.4, magnet: 130, dashT: 0, dashCd: 0, hitCd: 0,
    });
    waveActive = false; interTimer = 2.5;
    state = 'playing'; paused = false; settingsOpen = false;
    shake = 0; hurtFlash = 0;
    hideAll();
    banner('GET READY');
    audio();
  }

  function beginWave() {
    wave++;
    waveActive = true; spawned = 0;
    if (wave % 5 === 0) {
      toSpawn = Math.min(4 + wave * 2, 60);
      spawnTimer = 1.2;
      spawnBoss();
      banner('⚠ BOSS WAVE ' + wave);
    } else {
      toSpawn = Math.min(6 + wave * 3, 100);
      spawnTimer = 0.6;
      banner('WAVE ' + wave);
    }
    sfx.wave();
  }

  function spawnZombie() {
    const ang = rand(0, TAU);
    const rad = Math.max(Math.hypot(vw, vh) / 2, 300) + rand(40, 260);
    const x = clamp(player.x + Math.cos(ang) * rad, 30, WORLD - 30);
    const y = clamp(player.y + Math.sin(ang) * rad, 30, WORLD - 30);
    const bruteP = Math.min(0.12 + wave * 0.02, 0.3);
    const roll = Math.random();
    let type = 'normal';
    const base = { hp: 4 + wave * 2.2, speed: 52 + rand(0, 30) + Math.min(wave * 1.5, 50), dmg: 8, r: 15, color: '#5f7d3f', edge: '#3f5428' };
    if (roll < bruteP) { base.hp *= 3.2; base.speed *= 0.62; base.dmg = 16; base.r = 24; base.color = '#4f6b36'; base.edge = '#33451f'; type = 'brute'; }
    else if (roll < bruteP + 0.35) { base.hp *= 0.55; base.speed *= 1.75; base.dmg = 6; base.r = 11; base.color = '#8a9a4f'; base.edge = '#5c692f'; type = 'fast'; }
    zombies.push({
      x, y, r: base.r, hp: base.hp, maxHp: base.hp, speed: base.speed, dmg: base.dmg,
      color: base.color, edge: base.edge, face: 0, wob: rand(0, 6), flash: 0, atkCd: 0, dead: false,
      sprite: type === 'brute' ? 'brute' : type === 'fast' ? 'fast' : 'zombie',
    });
  }

  function spawnBoss() {
    const ang = rand(0, TAU);
    const rad = Math.max(Math.hypot(vw, vh) / 2, 300) + rand(60, 160);
    const x = clamp(player.x + Math.cos(ang) * rad, 60, WORLD - 60);
    const y = clamp(player.y + Math.sin(ang) * rad, 60, WORLD - 60);
    const hp = 60 + wave * 16;
    bossRef = {
      x, y, r: 40, hp, maxHp: hp,
      speed: 28 + Math.min(wave, 30), dmg: 25,
      color: '#6b3f3f', edge: '#3c2020',
      face: 0, wob: rand(0, 6), flash: 0, atkCd: 0, dead: false,
      type: 'boss', sprite: 'boss', ai: { t: rand(3, 4), phase: 'walk', chx: 0, chy: 0 },
    };
    pushOutOfObstacles(bossRef, 40);
    zombies.push(bossRef);
  }

  function killZombie(z) {
    z.dead = true;
    kills++;
    if (z.type === 'boss') {
      bossRef = null;
      score += 250;
      credits += 20;
      blood(z.x, z.y, 36);
      shake = Math.min(shake + 10, 18);
      for (let i = 0; i < 8; i++) gems.push({ x: z.x + rand(-30, 30), y: z.y + rand(-30, 30), vx: rand(-90, 90), vy: rand(-90, 90) });
      drops.push({ x: z.x + rand(-15, 15), y: z.y + rand(-15, 15), t: 25, type: 'heal' });
      drops.push({ x: z.x + rand(-15, 15), y: z.y + rand(-15, 15), t: 25, type: 'weapon', weapon: Math.random() < 0.5 ? 'shotgun' : 'rifle' });
      banner('BOSS DOWN!');
      tone(70, 30, 0.7, 'sawtooth', 0.1);
    } else {
      score += 10;
      blood(z.x, z.y, 10);
      gems.push({ x: z.x + rand(-8, 8), y: z.y + rand(-8, 8), vx: rand(-60, 60), vy: rand(-60, 60) });
      const roll2 = Math.random();
      if (roll2 < 0.03) drops.push({ x: z.x, y: z.y, t: 25, type: 'weapon', weapon: Math.random() < 0.5 ? 'shotgun' : 'rifle' });
      else if (roll2 < 0.10) drops.push({ x: z.x, y: z.y, t: 20, type: 'heal' });
    }
    sfx.die();
  }

  function collectGem() {
    xp++;
    sfx.pickup();
    if (xp >= xpNeed()) {
      xp -= xpNeed();
      level++;
      showLevelUp();
    }
  }

  function gameOver() {
    state = 'over';
    let isRecord = false;
    if (score > highScore) { highScore = score; saveHigh(highScore); isRecord = true; }
    elOverStats.innerHTML =
      `<div class="ost"><span>Wave</span><b>${wave}</b></div>` +
      `<div class="ost"><span>Kills</span><b>${kills}</b></div>` +
      `<div class="ost"><span>Score</span><b>${score}</b></div>` +
      `<div class="ost"><span>Best</span><b>${highScore}</b></div>` +
      `<div class="ost"><span>Time</span><b>${fmt(time)}</b></div>` +
      `<div class="ost"><span>Level</span><b>${level}</b></div>`;
    elNewRecord.classList.toggle('hidden', !isRecord);
    elOver.classList.remove('hidden');
    showHints();
    tone(220, 50, 0.6, 'sawtooth', 0.06);
  }

  // ---------- level-up cards ----------
  const CARDS = [
    { id: 'dmg', ico: '⚔️', nm: 'Damage +25%', ds: 'Bullets hit harder' },
    { id: 'rate', ico: '🔫', nm: 'Fire Rate +20%', ds: 'Shoot faster' },
    { id: 'speed', ico: '👟', nm: 'Speed +10%', ds: 'Outrun the horde' },
    { id: 'hp', ico: '❤️', nm: 'Max HP +20', ds: 'And heal 20 HP' },
    { id: 'heal', ico: '💚', nm: 'Med Kit', ds: 'Restore 40 HP' },
  ];
  function showLevelUp() {
    state = 'levelup';
    const pool = CARDS.filter((c) => !(c.id === 'heal' && player.hp >= player.maxHp));
    const chosen = [];
    while (chosen.length < 3 && chosen.length < pool.length) {
      const c = pick(pool);
      if (!chosen.includes(c)) chosen.push(c);
    }
    elCards.innerHTML = '';
    for (const c of chosen) {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<div class="ico">${c.ico}</div><div class="nm">${c.nm}</div><div class="ds">${c.ds}</div>`;
      div.addEventListener('click', () => applyCard(c));
      elCards.appendChild(div);
    }
    elLvlTitle.textContent = 'LEVEL UP — LV ' + level;
    elLvl.classList.remove('hidden');
    sfx.level();
  }
  function applyCard(c) {
    if (c.id === 'dmg') player.dmgMul *= 1.25;
    else if (c.id === 'rate') player.rateMul *= 1.2;
    else if (c.id === 'speed') player.speed *= 1.1;
    else if (c.id === 'hp') { player.maxHp += 20; player.hp = Math.min(player.maxHp, player.hp + 20); }
    else if (c.id === 'heal') player.hp = Math.min(player.maxHp, player.hp + 40);
    elLvl.classList.add('hidden');
    state = 'playing';
    updateHud();
  }

  // ---------- upgrade shop ----------
  const PERKS = [
    { id: 'dmg', nm: 'Damage +15%', ds: 'Bullets hit harder', base: 6, step: 2, apply: () => { player.dmgMul *= 1.15; } },
    { id: 'rate', nm: 'Fire Rate +10%', ds: 'Shoot faster', base: 6, step: 2, apply: () => { player.rateMul *= 1.1; } },
    { id: 'speed', nm: 'Move Speed +8%', ds: 'Outrun the horde', base: 5, step: 2, apply: () => { player.speed *= 1.08; } },
    { id: 'hp', nm: 'Max HP +25', ds: 'And heal 25 HP', base: 8, step: 3, apply: () => { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); } },
    { id: 'regen', nm: 'Regen +0.5/s', ds: 'Slowly recover HP in combat', base: 10, step: 5, apply: () => { player.regen += 0.5; } },
    { id: 'dash', nm: 'Dash CD -15%', ds: 'Dash more often', base: 8, step: 4, apply: () => { player.dashCdMax *= 0.85; } },
    { id: 'magnet', nm: 'Magnet +40', ds: 'Pull XP gems from farther away', base: 4, step: 2, apply: () => { player.magnet += 40; } },
  ];
  function openShop() {
    state = 'shop';
    renderShop();
    elShop.classList.remove('hidden');
    showHints();
  }
  function renderShop() {
    elShopCredits.textContent = 'Credits: ' + credits + ' ⛁';
    elPerks.innerHTML = '';
    for (let i = 0; i < PERKS.length; i++) {
      const p = PERKS[i];
      const lv = perkLevels[p.id] || 0;
      const cost = p.base + lv * p.step;
      const row = document.createElement('div');
      row.className = 'perk';
      row.innerHTML =
        `<div class="pinfo"><div class="pnm"><span class="pkey">${i + 1}</span> ${p.nm}${lv ? ' <span class="plv">Lv ' + lv + '</span>' : ''}</div><div class="pds">${p.ds}</div></div>` +
        `<button class="buy"${credits < cost ? ' disabled' : ''}>${cost} ⛁</button>`;
      row.querySelector('.buy').addEventListener('click', () => buyPerk(i));
      elPerks.appendChild(row);
    }
  }
  function buyPerk(i) {
    const p = PERKS[i];
    if (!p || state !== 'shop') return;
    const lv = perkLevels[p.id] || 0;
    const cost = p.base + lv * p.step;
    if (credits < cost) return;
    credits -= cost;
    perkLevels[p.id] = lv + 1;
    p.apply();
    sfx.pickup();
    renderShop();
  }
  function nextWaveFromShop() {
    if (state !== 'shop') return;
    elShop.classList.add('hidden');
    state = 'playing';
    beginWave();
  }

  function togglePause() {
    if (state !== 'playing') return;
    if (settingsOpen) { closeSettings(); return; }
    paused = !paused;
    elPause.classList.toggle('hidden', !paused);
    if (paused) showHints();
  }

  // ---------- fx ----------
  const BLOOD = ['#a31621', '#7a0f1a', '#c1262e', '#8f1420'];
  function blood(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(40, 170);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.55), max: 0.55, size: rand(2, 5), c: pick(BLOOD) });
    }
  }

  function pushOutOfObstacles(e, entR) {
    let hit = false;
    for (const o of obstacles) {
      const dx = e.x - o.x, dy = e.y - o.y;
      const rr = entR + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.x = o.x + (dx / d) * rr;
        e.y = o.y + (dy / d) * rr;
        hit = true;
      }
    }
    return hit;
  }

  // ---------- update ----------
  function update(dt) {
    time += dt;
    shake = Math.max(0, shake - 26 * dt);
    hurtFlash = Math.max(0, hurtFlash - dt);
    muzzle = Math.max(0, muzzle - dt);

    // movement
    let mx = 0, my = 0;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    if (joy.active) { mx += joy.dx / 60; my += joy.dy / 60; }
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    let spd = player.speed;
    if (player.dashT > 0) {
      spd *= 2.8;
      player.dashT -= dt;
      ghosts.push({ x: player.x, y: player.y, life: 0.28, max: 0.28 });
      if (ghosts.length > 60) ghosts.shift();
      const tvx = (mx || my) ? mx : Math.cos(player.aim);
      const tvy = (mx || my) ? my : Math.sin(player.aim);
      parts.push({ x: player.x - tvx * 14, y: player.y - tvy * 14, vx: -tvx * 140, vy: -tvy * 140, life: 0.22, max: 0.22, size: 2.5, c: '#9adcff' });
    }
    if (player.dashCd > 0) player.dashCd -= dt;
    player.x = clamp(player.x + mx * spd * dt, 24, WORLD - 24);
    player.y = clamp(player.y + my * spd * dt, 24, WORLD - 24);
    pushOutOfObstacles(player, player.r);
    if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    if (player.hitCd > 0) player.hitCd -= dt;

    // waves / spawning
    if (waveActive) {
      if (spawned < toSpawn) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          const batch = Math.min(1 + Math.floor(wave / 5), toSpawn - spawned);
          for (let i = 0; i < batch; i++) spawnZombie();
          spawned += batch;
          spawnTimer = clamp(1.05 - wave * 0.035, 0.22, 1.05) * rand(0.7, 1.3);
        }
      } else if (zombies.length === 0) {
        waveActive = false;
        player.hp = Math.min(player.maxHp, player.hp + 10);
        score += 50 * wave;
        credits += 4 + wave;
        banner('WAVE ' + wave + ' CLEARED');
        openShop();
      }
    } else {
      interTimer -= dt;
      if (interTimer <= 0) beginWave();
    }

    // auto-aim + fire
    let target = null, best = Infinity;
    for (const z of zombies) {
      const d2 = dist2(z.x, z.y, player.x, player.y);
      if (d2 < best) { best = d2; target = z; }
    }
    player.fireCd -= dt;
    if (target && best < 560 * 560 && player.fireCd <= 0) {
      const W = WEAPONS[player.weapon];
      player.fireCd = 1 / (W.rate * player.rateMul);
      player.aim = Math.atan2(target.y - player.y, target.x - player.x);
      for (let p = 0; p < W.pellets; p++) {
        const a = player.aim + rand(-W.spread, W.spread);
        bullets.push({
          x: player.x + Math.cos(a) * (player.r + 8),
          y: player.y + Math.sin(a) * (player.r + 8),
          vx: Math.cos(a) * W.speed, vy: Math.sin(a) * W.speed,
          life: W.life, dmg: W.dmg * player.dmgMul,
          pierce: W.pierce, hit: W.pierce > 0 ? new Set() : null,
          w: player.weapon,
        });
      }
      muzzle = 0.05;
      if (player.weapon === 'shotgun') { shake = Math.min(shake + 2, 14); sfx.shotgun(); }
      else if (player.weapon === 'rifle') sfx.rifle();
      else sfx.shoot();
    }

    // zombies
    for (const z of zombies) {
      if (z.type === 'boss') {
        z.ai.t -= dt;
        if (z.ai.phase === 'walk') {
          z.face = Math.atan2(player.y - z.y, player.x - z.x);
          z.x += Math.cos(z.face) * z.speed * dt;
          z.y += Math.sin(z.face) * z.speed * dt;
          if (z.ai.t <= 0) { z.ai.phase = 'windup'; z.ai.t = 0.8; sfx.roar(); }
        } else if (z.ai.phase === 'windup') {
          z.face = Math.atan2(player.y - z.y, player.x - z.x);
          if (z.ai.t <= 0) {
            z.ai.phase = 'charge'; z.ai.t = 0.7;
            z.ai.chx = Math.cos(z.face); z.ai.chy = Math.sin(z.face);
            sfx.charge();
          }
        } else if (z.ai.phase === 'charge') {
          z.x = clamp(z.x + z.ai.chx * 340 * dt, 30, WORLD - 30);
          z.y = clamp(z.y + z.ai.chy * 340 * dt, 30, WORLD - 30);
          if (pushOutOfObstacles(z, z.r)) {
            z.ai.phase = 'walk'; z.ai.t = rand(2.5, 4.5);
            shake = Math.min(shake + 5, 14);
          }
          z.face = Math.atan2(z.ai.chy, z.ai.chx);
          parts.push({ x: z.x, y: z.y, vx: -z.ai.chx * 60, vy: -z.ai.chy * 60, life: 0.28, max: 0.28, size: 4, c: '#8a3a3a' });
          if (z.ai.t <= 0) { z.ai.phase = 'walk'; z.ai.t = rand(2.5, 4.5); }
        }
      } else {
        z.face = Math.atan2(player.y - z.y, player.x - z.x);
        z.x += Math.cos(z.face) * z.speed * dt;
        z.y += Math.sin(z.face) * z.speed * dt;
      }
      z.wob += dt;
      pushOutOfObstacles(z, z.r);
      if (z.flash > 0) z.flash -= dt;
      if (z.atkCd > 0) z.atkCd -= dt;
      const rr = z.r + player.r - 3;
      if (z.atkCd <= 0 && player.hitCd <= 0 && dist2(z.x, z.y, player.x, player.y) < rr * rr) {
        z.atkCd = 0.9;
        player.hp -= z.dmg;
        player.hitCd = 0.55;
        hurtFlash = 0.5;
        shake = Math.min(shake + 7, 14);
        sfx.hurt();
        blood(z.x, z.y, 4);
        const kb = Math.atan2(player.y - z.y, player.x - z.x);
        const kf = z.type === 'boss' ? 30 : 18;
        player.x = clamp(player.x + Math.cos(kb) * kf, 24, WORLD - 24);
        player.y = clamp(player.y + Math.sin(kb) * kf, 24, WORLD - 24);
        if (player.hp <= 0) { player.hp = 0; gameOver(); return; }
      }
    }

    // separation
    for (let i = 0; i < zombies.length; i++) {
      for (let j = i + 1; j < zombies.length; j++) {
        const a = zombies[i], b = zombies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r - 2;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < rr * rr) {
          const d = Math.sqrt(d2), push = ((rr - d) / d) * 0.5;
          const wa = a.type === 'boss' ? 0 : (b.type === 'boss' ? 1 : 0.5);
          const wb = b.type === 'boss' ? 0 : (a.type === 'boss' ? 1 : 0.5);
          const px = dx * push, py = dy * push;
          a.x = clamp(a.x - px * wa * 2, 24, WORLD - 24); a.y = clamp(a.y - py * wa * 2, 24, WORLD - 24);
          b.x = clamp(b.x + px * wb * 2, 24, WORLD - 24); b.y = clamp(b.y + py * wb * 2, 24, WORLD - 24);
        }
      }
    }

    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD) { bullets.splice(i, 1); continue; }
      let hitRock = false;
      for (const o of obstacles) {
        const rr = o.r + 3;
        if (dist2(b.x, b.y, o.x, o.y) < rr * rr) {
          hitRock = true;
          for (let s = 0; s < 4; s++) parts.push({ x: b.x, y: b.y, vx: rand(-130, 130), vy: rand(-130, 130), life: rand(0.12, 0.28), max: 0.28, size: rand(1.5, 3), c: '#cfd6de' });
          break;
        }
      }
      if (hitRock) { bullets.splice(i, 1); continue; }
      for (const z of zombies) {
        const rr = z.r + 4;
        if (dist2(b.x, b.y, z.x, z.y) < rr * rr) {
          if (b.hit) {
            if (b.hit.has(z)) continue;
            b.hit.add(z);
          }
          z.hp -= b.dmg;
          z.flash = 0.08;
          blood(b.x, b.y, 3);
          floats.push({ x: z.x, y: z.y - z.r - 6, t: 0.7, txt: String(Math.round(b.dmg)) });
          sfx.hit();
          if (z.hp <= 0) killZombie(z);
          if (b.hit && b.pierce > 0) { b.pierce--; continue; }
          bullets.splice(i, 1);
          break;
        }
      }
    }
    zombies = zombies.filter((z) => !z.dead);

    // gems
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i];
      const dx = player.x - g.x, dy = player.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < player.magnet && d > 0) {
        g.vx += (dx / d) * 950 * dt;
        g.vy += (dy / d) * 950 * dt;
      }
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= 0.92; g.vy *= 0.92;
      if (d < 26) { gems.splice(i, 1); collectGem(); }
    }

    // heal drops
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t -= dt;
      if (d.t <= 0) { drops.splice(i, 1); continue; }
      if (dist2(d.x, d.y, player.x, player.y) < 28 * 28) {
        drops.splice(i, 1);
        if (d.type === 'weapon') {
          player.weapon = d.weapon;
          floats.push({ x: d.x, y: d.y - 16, t: 1, txt: WEAPONS[d.weapon].name + '!' });
          sfx.level();
        } else {
          player.hp = Math.min(player.maxHp, player.hp + 25);
          floats.push({ x: d.x, y: d.y - 14, t: 0.7, txt: '+25' });
          sfx.heal();
        }
      }
    }

    // particles / floaters
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t -= dt; f.y -= 26 * dt;
      if (f.t <= 0) floats.splice(i, 1);
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      ghosts[i].life -= dt;
      if (ghosts[i].life <= 0) ghosts.splice(i, 1);
    }

    // camera
    cam.x = clamp(player.x - vw / 2, 0, Math.max(0, WORLD - vw));
    cam.y = clamp(player.y - vh / 2, 0, Math.max(0, WORLD - vh));
  }

  // ---------- draw ----------
  // ---------- 2.5D sprite rendering ----------
  function depthScale(y) {
    return 0.78 + 0.52 * (y / WORLD); // farther (top) smaller, nearer (bottom) larger
  }
  function drawShadow(x, y, w, alpha) {
    ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.32, 0, 0, TAU);
    ctx.fill();
  }
  function drawSpriteAt(sp, x, y, scale, flip, rot) {
    const w = sp.w * scale;
    const h = sp.h * scale;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(sp.img, -w / 2, -h, w, h); // anchored bottom-center (feet on ground)
    ctx.restore();
  }
  function drawRock(o) {
    const s = depthScale(o.y);
    drawShadow(o.x, o.y + o.r * 0.5, o.r * 0.85 * s, 0.3);
    drawSpriteAt(ASSETS.rock, o.x, o.y + o.r * 0.55, s * (o.r / 24), false, 0);
  }
  function drawGem(g) {
    const s = depthScale(g.y);
    const bob = Math.sin(time * 3 + g.x * 0.05) * 2;
    drawShadow(g.x, g.y + 4, 6 * s, 0.25);
    drawSpriteAt(ASSETS.gem, g.x, g.y - 3 + bob, s, false, 0);
  }
  function drawDrop(d) {
    const s = depthScale(d.y);
    const pulse = 1 + Math.sin(time * 5) * 0.1;
    drawShadow(d.x, d.y + 4, 10 * s, 0.28);
    if (d.type === 'weapon') {
      ctx.fillStyle = 'rgba(20,28,24,0.85)';
      ctx.beginPath(); ctx.arc(d.x, d.y - 6 * s, 12 * s, 0, TAU); ctx.fill();
    }
    const sp = d.type === 'weapon' ? (d.weapon === 'shotgun' ? ASSETS.pickShotgun : ASSETS.pickRifle) : ASSETS.heal;
    drawSpriteAt(sp, d.x, d.y + 2, s * pulse, false, 0);
  }
  function drawGhost(gh) {
    const s = depthScale(gh.y);
    ctx.globalAlpha = clamp(gh.life / gh.max, 0, 1) * 0.3;
    drawSpriteAt(ASSETS.player, gh.x, gh.y + 4, s, false, 0);
    ctx.globalAlpha = 1;
  }
  function drawZombie(z) {
    const s = depthScale(z.y);
    const sp = ASSETS[z.sprite] || ASSETS.zombie;
    const flip = Math.cos(z.face) < 0 ? -1 : 1;
    const feetY = z.y + z.r * 0.5;
    if (z.type === 'boss' && z.ai.phase === 'windup') {
      const ta = z.face;
      ctx.strokeStyle = 'rgba(255,90,90,0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(z.x + Math.cos(ta) * (z.r + 14), z.y + Math.sin(ta) * (z.r + 14));
      ctx.lineTo(z.x + Math.cos(ta) * (z.r + 240), z.y + Math.sin(ta) * (z.r + 240));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawShadow(z.x, feetY + 2, z.r * 1.05 * s, 0.3);
    drawSpriteAt(sp, z.x, feetY + 2, s, flip, Math.sin(z.wob * 5) * 0.06);
    const cy = feetY + 2 - (sp.h * s) / 2;
    if (z.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (z.flash * 8).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(z.x, cy, z.r * s, 0, TAU); ctx.fill();
    }
    if (z.type === 'boss' && z.ai.phase === 'windup') {
      ctx.fillStyle = 'rgba(255,60,60,' + (0.25 + 0.2 * Math.sin(time * 30)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(z.x, cy, z.r * s, 0, TAU); ctx.fill();
    }
    if (z.type !== 'boss' && z.hp < z.maxHp) {
      const w = z.r * 2;
      const by = feetY + 2 - sp.h * s - 9;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(z.x - w / 2, by, w, 4);
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(z.x - w / 2, by, w * clamp(z.hp / z.maxHp, 0, 1), 4);
    }
  }
  function drawPlayer() {
    const s = depthScale(player.y);
    const feetY = player.y + player.r * 0.5;
    drawShadow(player.x, feetY + 2, player.r * 1.15 * s, 0.32);
    if (player.dashT > 0) {
      ctx.fillStyle = 'rgba(140,225,255,0.22)';
      ctx.beginPath(); ctx.arc(player.x, feetY, player.r + 8, 0, TAU); ctx.fill();
    }
    const sp = ASSETS.player;
    drawSpriteAt(sp, player.x, feetY + 2, s, false, 0);
    // gun rotates toward aim, held at chest height
    const gy = feetY + 2 - sp.h * s * 0.5;
    ctx.save();
    ctx.translate(player.x, gy);
    ctx.rotate(player.aim);
    ctx.fillStyle = '#8f9aa6';
    ctx.fillRect(player.r * 0.2, -3.5, player.r + 16, 7);
    ctx.fillStyle = '#cfd6de';
    ctx.fillRect(player.r * 0.2, -3.5, player.r + 16, 3);
    ctx.fillStyle = '#d9a066';
    ctx.beginPath(); ctx.arc(player.r * 0.85, -5, 4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(player.r * 0.85, 5, 4, 0, TAU); ctx.fill();
    ctx.restore();
    if (muzzle > 0) {
      const mmx = player.x + Math.cos(player.aim) * (player.r + 18);
      const mmy = gy + Math.sin(player.aim) * (player.r + 18);
      ctx.fillStyle = 'rgba(255,226,140,' + (muzzle * 16).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(mmx, mmy, 5, 0, TAU); ctx.fill();
    }
    if (player.hitCd > 0.3) {
      ctx.strokeStyle = 'rgba(229,72,77,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(player.x, feetY, player.r + 5, 0, TAU); ctx.stroke();
    }
  }
  function draw() {
    ctx.clearRect(0, 0, vw, vh);
    ctx.fillStyle = '#0a0f0c';
    ctx.fillRect(0, 0, vw, vh);

    const shx = shakeOn ? rand(-shake, shake) : 0;
    const shy = shakeOn ? rand(-shake, shake) : 0;
    ctx.save();
    ctx.translate(-cam.x + shx, -cam.y + shy);

    // ground
    ctx.fillStyle = '#131a15';
    ctx.fillRect(0, 0, WORLD, WORLD);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 0; g <= WORLD; g += 120) {
      ctx.moveTo(g, 0); ctx.lineTo(g, WORLD);
      ctx.moveTo(0, g); ctx.lineTo(WORLD, g);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,150,120,0.5)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, WORLD - 6, WORLD - 6);

    // decals
    ctx.strokeStyle = 'rgba(90,120,80,0.5)';
    ctx.lineWidth = 1.5;
    for (const t of tufts) {
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.r);
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * 3, 3); ctx.quadraticCurveTo(i * 4, -3 * t.s, i * 2, -7 * t.s);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(110,120,105,0.4)';
    for (const s of stones) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (const c of cracks) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(c.l * 0.6, 4); ctx.lineTo(c.l, -2);
      ctx.stroke(); ctx.restore();
    }

    // depth shading (far = darker, near = lighter) for the 2.5D ground plane
    const dg = ctx.createLinearGradient(0, 0, 0, WORLD);
    dg.addColorStop(0, 'rgba(0,0,0,0.34)');
    dg.addColorStop(0.5, 'rgba(0,0,0,0.08)');
    dg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, WORLD, WORLD);

    // 2.5D depth-sorted sprite rendering (painter's algorithm)
    const renderList = [];
    for (const o of obstacles) renderList.push({ y: o.y + o.r * 0.5, draw: () => drawRock(o) });
    for (const d of drops) renderList.push({ y: d.y, draw: () => drawDrop(d) });
    for (const g of gems) renderList.push({ y: g.y, draw: () => drawGem(g) });
    for (const gh of ghosts) renderList.push({ y: gh.y, draw: () => drawGhost(gh) });
    for (const z of zombies) renderList.push({ y: z.y + z.r, draw: () => drawZombie(z) });
    renderList.push({ y: player.y + player.r, draw: drawPlayer });
    renderList.sort((a, b) => a.y - b.y);
    for (const item of renderList) item.draw();

    // bullets
    for (const b of bullets) {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      if (b.w === 'rifle') {
        ctx.fillStyle = 'rgba(120,220,255,0.3)';
        ctx.fillRect(-20, -3, 40, 6);
        ctx.fillStyle = '#bfefff';
        ctx.fillRect(-10, -1.5, 20, 3);
      } else if (b.w === 'shotgun') {
        ctx.fillStyle = 'rgba(255,214,120,0.2)';
        ctx.fillRect(-8, -2, 16, 4);
        ctx.fillStyle = '#ffd678';
        ctx.fillRect(-4, -1, 8, 2);
      } else {
        ctx.fillStyle = 'rgba(255,214,120,0.25)';
        ctx.fillRect(-14, -3, 28, 6);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(-7, -1.5, 14, 3);
      }
      ctx.restore();
    }

    // particles
    for (const p of parts) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // damage numbers
    for (const f of floats) {
      ctx.globalAlpha = clamp(f.t / 0.7, 0, 1);
      ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd966';
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);

    // boss hp bar
    if (bossRef && !bossRef.dead) {
      const bw = Math.min(440, vw - 80);
      const bx = (vw - bw) / 2, by = 76;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, 16);
      ctx.fillStyle = '#5c1a1f';
      ctx.fillRect(bx, by, bw, 12);
      ctx.fillStyle = '#e5484d';
      ctx.fillRect(bx, by, bw * clamp(bossRef.hp / bossRef.maxHp, 0, 1), 12);
      ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffb3b3';
      ctx.fillText('MEGA ZOMBIE', vw / 2, by - 8);
    }

    // touch joystick
    if (joy.active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 46, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(joy.ox + joy.dx, joy.oy + joy.dy, 22, 0, TAU); ctx.fill();
    }
  }

  // ---------- HUD ----------
  function updateHud() {
    elHp.style.width = clamp((player.hp / player.maxHp) * 100, 0, 100) + '%';
    elXpFill.style.width = clamp((xp / xpNeed()) * 100, 0, 100) + '%';
    elStats.textContent = 'Wave ' + wave + '  ·  ' + kills + ' kills  ·  ' + fmt(time) + '  ·  Lv ' + level + '  ·  Score ' + score + '  ·  ' + WEAPONS[player.weapon].name;
    elHurt.style.opacity = String(Math.min(hurtFlash, 1) * 0.6);
  }

  // ---------- loop ----------
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    if (state === 'playing' && !paused) update(dt);
    draw();
    updateHud();
  }
  requestAnimationFrame(loop);

  // ---------- buttons ----------
  btnPlay.addEventListener('click', () => { audio(); startRun(); });
  btnRestart.addEventListener('click', startRun);
  btnResume.addEventListener('click', togglePause);
  btnPSettings.addEventListener('click', openSettings);
  btnSetBack.addEventListener('click', closeSettings);
  btnPReset.addEventListener('click', resetSettings);
  btnPRestart.addEventListener('click', startRun);
  btnReady.addEventListener('click', nextWaveFromShop);
  btnPause.addEventListener('click', togglePause);
  btnMute.addEventListener('click', toggleMute);
  elDash.addEventListener('touchstart', (e) => { e.preventDefault(); tryDash(); });
  elDash.addEventListener('mousedown', (e) => { e.preventDefault(); tryDash(); });
  $('hiscore').textContent = highScore > 0 ? 'High Score: ' + highScore : '';
  btnMute.textContent = muted ? '🔇' : '🔊';
  if (hintsOn) showHints(); else hideHints();
})();
