/* STICK WAR LIVE - 1 vs 1 stick man kung fu duel for TikTok LIVE (WHITE vs BLACK, sunset desert style)
   Plain HTML5 canvas. Events come from server.js over WebSocket (or the test buttons). */
'use strict';

// ============================================================ setup
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 1080, H = 1920, FLOOR = 1540, G = 3300;
const VIEW_TOP = 455, VIEW_BOT = 1594, VIEW_CY = 1024;   // the game window between the top and bottom HUD
let BASE_S = 0.66;     // fighter size - config.json game.fighterSize
let GIANT_S = 1.6;
const DMG_SCALE = 1.6; // global damage tuning (config "damage" multiplies this)
const QS = new URLSearchParams(location.search);
const MANUAL = QS.has('manual');
const USER = String(QS.get('user') || '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30); // TikTok name from the link
const UQ = USER ? '?user=' + encodeURIComponent(USER) : '';           // used for recording: time is stepped from outside

// ============================================================ display: sharp on phones + fills the screen
// The game is laid out in a fixed 1080x1920 world. The real canvas is sized in the screen's own pixels
// (CSS size x devicePixelRatio), and every setTransform() gets the screen scale + centring folded in,
// so lines and text are drawn at full phone resolution instead of being stretched (blurry).
// Extra screen above/below the 9:16 game is filled by extending the top/bottom edge of the picture.
const VIEW = { k: 1, ox: 0, oy: 0, gw: W, gh: H, fixed: MANUAL };
const C2D = CanvasRenderingContext2D.prototype, _setT = C2D.setTransform, _getT = C2D.getTransform;
const _shB = Object.getOwnPropertyDescriptor(C2D, 'shadowBlur');
if (!VIEW.fixed) {
  ctx.setTransform = function (a, b, c, d, e, f) {
    if (a && typeof a === 'object') ({ a, b, c, d, e, f } = a);
    const k = VIEW.k; _setT.call(this, a * k, b * k, c * k, d * k, e * k + VIEW.ox, f * k + VIEW.oy);
  };
  ctx.getTransform = function () { const g = _getT.call(this), k = VIEW.k; return new DOMMatrix([g.a / k, g.b / k, g.c / k, g.d / k, (g.e - VIEW.ox) / k, (g.f - VIEW.oy) / k]); };
  // shadow blur is in screen pixels (not affected by the transform) - scale it like everything else
  Object.defineProperty(ctx, 'shadowBlur', { get() { return _shB.get.call(this) / VIEW.k; }, set(v) { _shB.set.call(this, v * VIEW.k); } });
}
function layoutView() {
  if (VIEW.fixed) { document.body.classList.add('fixed'); return; }
  const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
  let dpr = window.devicePixelRatio || 1;
  const kFull = Math.min(vw / W, vh / H) * dpr;
  if (kFull > 1.5) dpr *= 1.5 / kFull;               // cap: never draw the game bigger than 1620x2880 (keeps phones fast)
  const cw = Math.round(vw * dpr), ch = Math.round(vh * dpr);
  let k = Math.min(cw / W, ch / H);
  if (k > 1 && k < 1.02) k = 1;                        // ~1080-pixel-wide phones: exact 1:1 pixels, no resampling at all
  VIEW.k = k; VIEW.gw = Math.round(W * k); VIEW.gh = Math.round(H * k);
  VIEW.ox = Math.floor((cw - VIEW.gw) / 2); VIEW.oy = Math.floor((ch - VIEW.gh) / 2);
  if (cv.width !== cw) cv.width = cw;
  if (cv.height !== ch) cv.height = ch;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
}
// fill the bands above/below (or beside) the 9:16 game so the whole phone screen is used
function paintBars() {
  if (VIEW.fixed) return;
  const { ox, oy, gw, gh } = VIEW, cw = cv.width, ch = cv.height;
  if (ox <= 0 && oy <= 0) return;
  ctx.save(); _setT.call(ctx, 1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; _shB.set.call(ctx, 0);
  if (oy > 0) {   // plain dark bands that match the HUD colours (no stretched streaks)
    const bot = ch - oy - gh;
    let g = ctx.createLinearGradient(0, 0, 0, oy); g.addColorStop(0, '#000000'); g.addColorStop(1, '#04050f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, oy);
    g = ctx.createLinearGradient(0, oy + gh, 0, ch); g.addColorStop(0, '#05060d'); g.addColorStop(1, '#000000');
    ctx.fillStyle = g; ctx.fillRect(0, oy + gh, cw, bot);
  }
  if (ox > 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ox, ch); ctx.fillRect(ox + gw, 0, cw - ox - gw, ch); }
  ctx.restore();
}
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const PI = Math.PI, TAU = Math.PI * 2;
const EASE = {
  lin: (t) => t,
  in: (t) => t * t * t,                       // slow start (anticipation)
  out: (t) => 1 - Math.pow(1 - t, 3),         // fast snap (strike)
  io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
};
function wpick(list) { let s = 0; for (const c of list) s += c.w; let r = Math.random() * s; for (const c of list) { r -= c.w; if (r <= 0) return c; } return list[list.length - 1]; }

const DEFAULT_SETTINGS = {
  game: { roundSeconds: 75, heroHp: 200, fighterSize: 0.66, damage: 1, suddenDeathDamage: 2, slowMotion: true, sound: true, volume: 0.8, unjoinedGiftRule: 'weakest', title: 'STICK WAR LIVE' },
  gifts: {
    joinWords: { white: ['white', '1', 'team white'], black: ['black', '2', 'team black'] },
    likes: { every: 10, heal: 2 }, follow: { heal: 5 }, share: { heal: 5 }, maxShieldPercent: 150,
    gifts: {
      'Rose': { heal: 8 }, 'TikTok': { heal: 8 }, 'Finger Heart': { heal: 15, power: 'sword' }, 'Doughnut': { heal: 30, power: 'super' },
      'Hand Hearts': { heal: 40, power: 'pistol' }, 'Money Gun': { heal: 70, power: 'rifle' }, 'Galaxy': { heal: 100, power: 'airstrike' },
      'Lion': { heal: 150, power: 'ultimate' }, 'Universe': { heal: 150, power: 'ultimate' }
    },
    byCoins: [
      { min: 1, max: 1, heal: 8 }, { min: 2, max: 9, heal: 12, power: 'sword' }, { min: 10, max: 99, heal: 25, power: 'super' },
      { min: 100, max: 299, heal: 40, power: 'pistol' }, { min: 300, max: 999, heal: 60, power: 'rifle' },
      { min: 1000, max: 9999, heal: 100, power: 'airstrike' }, { min: 10000, max: 1e12, heal: 150, power: 'ultimate' }]
  },
  live: { mode: 'simulator', username: '' }
};
let S = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
S.viewers = 0;

// team 0 = WHITE (comment 1 / white, old 'red' still works), team 1 = BLACK (comment 2)
const TEAMS = [
  { name: 'WHITE', key: 'white', body: '#f6f3ee', rear: '#dcd6cf', aura: '255,244,214', glow: '255,255,255', rim: '#ffffff', eye: '#16161a', flashC: '#ffd2c4', line: '#1c0000', ui: '#eef1f7', bub: '#8f9bb3', panel: 'rgba(64,68,82,0.92)', text: '#ffffff', accent: '#e6ebf5', fan: '#f2f4fa', trail: '255,240,220', voice: 1.18 },
  { name: 'BLACK', key: 'black', body: '#0b0a0c', rear: '#1d1a1f', aura: '255,40,30', glow: '255,30,20', rim: '#ff2a1c', eye: '#ff2a1c', flashC: '#ffffff', line: 'rgba(235,240,255,0.95)', ui: '#ff4040', bub: '#ff3030', panel: 'rgba(10,6,8,0.94)', text: '#ffffff', accent: '#ff4040', fan: '#ff8a80', trail: '255,90,60', voice: 0.88 }
];
const NT = TEAMS.length;
const teams = TEAMS.map(() => ({ wins: 0, likes: 0, rageT: 0 }));

const PLATS = [];   // flat desert floor (like the reference style) - no floating platforms
const WALL_L = 22, WALL_R = W - 22;
const HZ = FLOOR - 300;   // horizon line of the desert (world y)

// ============================================================ sound (real CC0 samples + small synth for UI cues)
// Fight sounds are real recordings in public/sounds (see sounds/LICENSES.txt). Each play picks a random
// variation with a small random pitch/volume change so repeats never sound identical. If the files
// can't be loaded the old synth sounds are used as a fallback.
const SB = { buf: {}, last: {}, ready: null, ok: false };
function loadSamples() {
  if (SB.ready) return SB.ready;
  SB.ready = (async () => {
    try {
      const man = await (await fetch('sounds/sounds.json')).json();
      const dc = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
      await Promise.all(Object.entries(man).map(async ([g, list]) => {
        const got = await Promise.all(list.map(async (fn) => { try { const ab = await (await fetch('sounds/' + fn)).arrayBuffer(); return await dc.decodeAudioData(ab); } catch (e) { return null; } }));
        SB.buf[g] = got.filter(Boolean);
      }));
      SB.ok = !!(SB.buf.punch && SB.buf.punch.length);
    } catch (e) { SB.ok = false; }
    if (AU.ctx && SB.ok) startWind(AU.ctx, AU.out, 0, null);
    return SB.ok;
  })();
  return SB.ready;
}
// play one sample of a group: vol, rate, delay; +-6% pitch and +-15% volume random variation
function smp(ac, out, t, g, vol = 1, rate = 1, vr = 0.06) {
  const L = SB.buf[g]; if (!L || !L.length) return;
  let i = Math.floor(Math.random() * L.length); if (L.length > 1 && i === SB.last[g]) i = (i + 1) % L.length; SB.last[g] = i;
  const s = ac.createBufferSource(); s.buffer = L[i]; s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vr);
  const gn = ac.createGain(); gn.gain.value = vol * (0.85 + Math.random() * 0.3);
  s.connect(gn); gn.connect(out); s.start(Math.max(0, t));
}
// desert wind bed (looped)
function startWind(ac, out, t, dur) {
  const L = SB.buf.wind; if (!L || !L.length || ac._wind) return; ac._wind = true;
  const s = ac.createBufferSource(); s.buffer = L[0]; s.loop = true;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2 * (S.game.ambience ?? 1), t + 1.5);
  s.connect(g); g.connect(out); s.start(t); if (dur) s.stop(t + dur);
}
// sound kind -> real sample layers. (p = voice pitch for shouts)
const SMAP = {
  step: (a, o, t) => smp(a, o, t, 'step', 0.4),
  jump: (a, o, t) => { smp(a, o, t, 'step', 0.55, 0.9); smp(a, o, t, 'whoosh', 0.25, 0.8); },
  land: (a, o, t) => { smp(a, o, t, 'step', 0.6, 0.85); smp(a, o, t, 'fall', 0.35, 1.2); },
  wsh1: (a, o, t) => smp(a, o, t, 'whoosh', 0.42, 1.2),
  wsh2: (a, o, t) => smp(a, o, t, 'whooshH', 0.3),
  wsh3: (a, o, t) => smp(a, o, t, 'whooshH', 0.42, 0.82),
  whoosh: (a, o, t) => smp(a, o, t, 'whoosh', 0.45),
  dodge: (a, o, t) => { smp(a, o, t, 'whooshH', 0.34, 0.8); smp(a, o, t + 0.05, 'step', 0.35); },
  punch: (a, o, t) => { smp(a, o, t, 'punch', 0.95); smp(a, o, t, 'body', 0.3, 1.15); },          // face
  punchB: (a, o, t) => { smp(a, o, t, 'body', 0.95); smp(a, o, t, 'punch', 0.22, 0.8); },         // body / gut
  kickhit: (a, o, t) => { smp(a, o, t, 'kick', 1); smp(a, o, t, 'body', 0.45, 0.85); },
  impact: (a, o, t) => { smp(a, o, t, 'body', 0.9, 0.72); smp(a, o, t, 'fall', 0.55, 0.9); },
  heavy: (a, o, t) => { smp(a, o, t, 'kick', 0.9, 0.7); smp(a, o, t, 'boom', 0.22, 1.5); },
  thud: (a, o, t) => smp(a, o, t, 'fall', 0.8),
  wall: (a, o, t) => { smp(a, o, t, 'fall', 0.95, 0.8); smp(a, o, t, 'body', 0.7, 0.7); },
  clang: (a, o, t) => { smp(a, o, t, 'block', 0.85); smp(a, o, t, 'body', 0.25, 1.3); },      // forearm block
  ting: (a, o, t) => { smp(a, o, t, 'block', 0.85, 1.25); smp(a, o, t, 'whoosh', 0.3, 1.3); },   // parry swat
  swing: (a, o, t) => smp(a, o, t, 'sword', 0.7),
  slash: (a, o, t) => { smp(a, o, t, 'sword', 0.55, 1.1); smp(a, o, t, 'body', 0.75, 1.05); },
  clash: (a, o, t) => smp(a, o, t, 'clash', 0.9),
  cring: (a, o, t) => smp(a, o, t + 0.04, 'clash', 0.35, 0.8),
  lock: (a, o, t) => smp(a, o, t, 'scrape', 0.7),
  iai: (a, o, t) => { smp(a, o, t, 'sword', 0.9, 0.85); smp(a, o, t + 0.05, 'clash', 0.12, 1.5); },
  slide: (a, o, t) => { smp(a, o, t, 'step', 0.6, 0.6); smp(a, o, t + 0.08, 'step', 0.4, 0.55); },
  roll: (a, o, t) => { smp(a, o, t, 'fall', 0.3, 1.4); smp(a, o, t + 0.12, 'step', 0.35, 0.7); },
  kiai: (a, o, t, p) => smp(a, o, t, 'effort', 0.55, clamp(p, 0.86, 1.12), 0.04),
  kiai2: (a, o, t, p) => smp(a, o, t, 'effort', 0.46, clamp(p * 1.06, 0.86, 1.18), 0.04),
  grunt: (a, o, t, p) => smp(a, o, t, 'pain', 0.5, clamp(p, 0.88, 1.12), 0.04),
  shot: (a, o, t) => { smp(a, o, t, 'gun', 1.2); smp(a, o, t + rand(0.32, 0.42), 'casing', 0.3, 1.5); },
  reload: (a, o, t) => { smp(a, o, t, 'reload', 0.6); smp(a, o, t + 0.22, 'reload', 0.55, 0.9); smp(a, o, t + 0.42, 'reload', 0.7, 1.2); },
  ko: (a, o, t, p) => { smp(a, o, t, 'body', 1, 0.65); smp(a, o, t + 0.05, 'pain', 0.55, 0.85, 0.03); smp(a, o, t + 0.9, 'fall', 1); },
  boom: (a, o, t) => smp(a, o, t, 'boom', 1),
  crowd: (a, o, t) => { smp(a, o, t, 'crowd', 0.16); smp(a, o, t + 0.1, 'cheer', 0.32); },
  fanfare: (a, o, t) => { smp(a, o, t, 'applause', 0.3); smp(a, o, t + 0.2, 'cheer', 0.38); },
  murmur: () => {},   // the wind bed carries the ambience
};
// All sounds are made with WebAudio (no sound files). In recording mode (?manual) the sound
// events are logged with their game time and rendered offline into a WAV for the demo video.
const AU = { ctx: null, out: null, on: true, last: {}, log: [], bufs: new WeakMap() };
const SND_GAP = { step: 0.07, punch: 0.035, punchB: 0.035, kickhit: 0.035, slash: 0.04, shot: 0.03, wsh1: 0.03, wsh2: 0.04, wsh3: 0.05, murmur: 1.5, crowd: 0.9, heal: 0.08, kiai: 0.35, grunt: 0.25, clang: 0.04, lock: 0.1 };
function noiseBuf(ac) {
  let b = AU.bufs.get(ac);
  if (!b) { b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; AU.bufs.set(ac, b); }
  return b;
}
// master chain: gain -> hard limiter style compressor -> gain (keeps peaks from clipping)
function makeOut(ac) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 4; comp.ratio.value = 16; comp.attack.value = 0.001; comp.release.value = 0.12;
  const pre = ac.createGain(); pre.gain.value = 0.72 * (S.game.volume ?? 0.8) / 0.8;
  const post = ac.createGain(); post.gain.value = 1.25;
  pre.connect(comp); comp.connect(post); post.connect(ac.destination);
  return pre;
}
function audioInit() {
  if (MANUAL) return;
  try {
    if (!AU.ctx) { AU.ctx = new (window.AudioContext || window.webkitAudioContext)(); AU.out = makeOut(AU.ctx); }
    if (AU.ctx.state !== 'running') { const r = AU.ctx.resume(); if (r && r.catch) r.catch(() => {}); }
    if (!AU.unlocked) {   // play 1 silent sample inside the tap - some phones only unlock audio this way
      const b = AU.ctx.createBuffer(1, 1, 22050), s = AU.ctx.createBufferSource(); s.buffer = b; s.connect(AU.ctx.destination); s.start(0);
      AU.unlocked = AU.ctx.state === 'running';
    }
    if (SB.ok) startWind(AU.ctx, AU.out, AU.ctx.currentTime, null);
  } catch (e) { AU.ctx = null; }
}
function audioRunning() { return !!(AU.ctx && AU.ctx.state === 'running'); }
function env(g, t, vol, dur, att) {
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function nz(ac, out, t, dur, type, f0, f1, vol, q = 1, att = 0.003) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf(ac);
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain(); env(g, t, vol, dur, att);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tn(ac, out, t, type, f0, f1, dur, vol, att = 0.003) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, vol, dur, att);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
// synthesized voice (kiai shouts / grunts): sawtooth through vowel formant filters
function vox(ac, out, t, f0, f1, dur, vol, form) {
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.12, t + dur * 0.25); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 7; vg.gain.value = f0 * 0.02; vib.connect(vg); vg.connect(o.frequency);
  const g = ac.createGain(); env(g, t, vol, dur, 0.015);
  o.connect(g);
  for (const [ff, q, gv] of form) { const b = ac.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = ff; b.Q.value = q; const bg = ac.createGain(); bg.gain.value = gv; g.connect(b); b.connect(bg); bg.connect(out); }
  o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
}
function voice(ac, master, t, kind, v, x, p = 1) {
  let out = master;
  if (x != null && ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = clamp((x / W) * 2 - 1, -1, 1) * 0.6; pn.connect(master); out = pn; }
  if (v !== 1) { const g = ac.createGain(); g.gain.value = v; g.connect(out); out = g; }
  if (SB.ok && SMAP[kind]) { SMAP[kind](ac, out, t, p); return; }
  if (kind === 'punchB') kind = 'punch';
  switch (kind) {
    case 'step': nz(ac, out, t, 0.05, 'lowpass', 500, 150, 0.16); tn(ac, out, t, 'sine', 95, 50, 0.05, 0.08); break;
    case 'jump': nz(ac, out, t, 0.14, 'bandpass', 500, 1800, 0.25, 1.2); tn(ac, out, t, 'sine', 180, 420, 0.12, 0.08); break;
    case 'land': nz(ac, out, t, 0.14, 'lowpass', 600, 80, 0.45); tn(ac, out, t, 'sine', 120, 45, 0.14, 0.35); break;
    case 'wsh1': nz(ac, out, t, 0.075, 'bandpass', 1500, 4200, 0.3, 1.8); break;                                  // fast jab
    case 'wsh2': nz(ac, out, t, 0.13, 'bandpass', 800, 2800, 0.36, 1.5, 0.01); break;                              // hook / kick
    case 'wsh3': nz(ac, out, t, 0.24, 'bandpass', 420, 1800, 0.42, 1.3, 0.03); tn(ac, out, t, 'sine', 120, 70, 0.22, 0.07, 0.03); break; // big spin kick
    case 'whoosh': nz(ac, out, t, 0.11, 'bandpass', 700, 2400, 0.3, 1.6); break;
    case 'punch': tn(ac, out, t, 'sine', 190, 55, 0.1, 0.7); nz(ac, out, t, 0.07, 'bandpass', 2600, 800, 0.55, 0.8); break;
    case 'kickhit': tn(ac, out, t, 'sine', 140, 40, 0.16, 0.8); nz(ac, out, t, 0.1, 'lowpass', 3500, 300, 0.7); break;
    case 'impact': tn(ac, out, t, 'sine', 75, 28, 0.5, 0.95); nz(ac, out, t, 0.32, 'lowpass', 2600, 90, 0.8); nz(ac, out, t, 0.05, 'highpass', 3000, 2000, 0.45); break;
    case 'thud': tn(ac, out, t, 'sine', 95, 38, 0.22, 0.8); nz(ac, out, t, 0.16, 'lowpass', 900, 90, 0.55); break;
    case 'wall': tn(ac, out, t, 'sine', 80, 30, 0.3, 0.9); nz(ac, out, t, 0.14, 'bandpass', 1300, 500, 0.6, 1.2); nz(ac, out, t, 0.3, 'lowpass', 700, 60, 0.5); break;
    case 'clang': tn(ac, out, t, 'triangle', 820, 640, 0.1, 0.3); nz(ac, out, t, 0.05, 'bandpass', 2800, 1500, 0.5, 3); tn(ac, out, t, 'sine', 150, 70, 0.09, 0.35); break;   // forearm block
    case 'ting': [2637, 3951, 5274].forEach((f, i) => tn(ac, out, t, 'sine', f, f * 0.995, 0.5 - i * 0.12, 0.15 - i * 0.035)); nz(ac, out, t, 0.04, 'highpass', 6000, 4000, 0.3); break; // parry
    case 'swing': nz(ac, out, t, 0.24, 'highpass', 2500, 7000, 0.28, 0.9, 0.02); nz(ac, out, t, 0.2, 'bandpass', 900, 3000, 0.2, 2, 0.02); break;
    case 'slash': nz(ac, out, t, 0.16, 'highpass', 6500, 2500, 0.5); tn(ac, out, t, 'triangle', 1900, 900, 0.12, 0.13); tn(ac, out, t, 'sine', 160, 50, 0.1, 0.45); break;
    case 'clash': [2350, 3170, 4420, 1730].forEach((f, i) => tn(ac, out, t, i % 2 ? 'square' : 'triangle', f, f * 0.98, 0.5 - i * 0.06, 0.1)); nz(ac, out, t, 0.08, 'highpass', 5000, 3000, 0.45); break;
    case 'lock': for (let i = 0; i < 5; i++) nz(ac, out, t + i * 0.05, 0.06, 'bandpass', 1800 + Math.random() * 2200, 1500, 0.16, 4); tn(ac, out, t, 'square', 95, 90, 0.25, 0.05); break; // grinding
    case 'iai': nz(ac, out, t, 0.5, 'highpass', 8000, 3500, 0.35, 1, 0.12); tn(ac, out, t + 0.05, 'sine', 3300, 3100, 0.7, 0.06, 0.05); break; // shing
    case 'slide': nz(ac, out, t, 0.42, 'lowpass', 1300, 250, 0.38, 1, 0.02); break;
    case 'roll': nz(ac, out, t, 0.3, 'lowpass', 700, 200, 0.3, 1, 0.03); break;
    case 'kiai': nz(ac, out, t, 0.05, 'bandpass', 1800, 1200, 0.22, 1.5); vox(ac, out, t + 0.02, 210 * p, 150 * p, 0.3, 0.75, [[800, 5, 1], [1250, 6, 0.7], [2600, 8, 0.25]]); break;
    case 'kiai2': nz(ac, out, t, 0.06, 'bandpass', 2200, 1400, 0.25, 1.5); vox(ac, out, t + 0.03, 265 * p, 190 * p, 0.24, 0.75, [[700, 5, 1], [1150, 6, 0.7], [2700, 8, 0.3]]); break;
    case 'grunt': vox(ac, out, t, 140 * p, 95 * p, 0.14, 0.45, [[500, 5, 1], [900, 6, 0.5]]); break;
    case 'shot': nz(ac, out, t, 0.16, 'lowpass', 6500, 380, 0.9); tn(ac, out, t, 'square', 170, 40, 0.09, 0.3); break;
    case 'reload': [0, 0.22, 0.42].forEach((d, i) => { nz(ac, out, t + d, 0.03, 'highpass', 3500, 2500, 0.45); tn(ac, out, t + d, 'square', i === 2 ? 1400 : 700, 600, 0.03, 0.1); }); break;
    case 'dodge': nz(ac, out, t, 0.3, 'bandpass', 400, 2600, 0.3, 1.4, 0.04); tn(ac, out, t, 'sine', 300, 700, 0.25, 0.07, 0.03); break;
    case 'ko': tn(ac, out, t, 'sawtooth', 320, 40, 0.7, 0.28); nz(ac, out, t, 0.5, 'lowpass', 1500, 80, 0.65); tn(ac, out, t, 'sine', 70, 30, 0.6, 0.75); break;
    case 'heal': [1046, 1318, 1568, 2093].forEach((f, i) => tn(ac, out, t + i * 0.045, 'sine', f, f, 0.32, 0.14, 0.005)); break;
    case 'powerup': tn(ac, out, t, 'square', 280, 1250, 0.32, 0.1, 0.01); [523, 659, 784, 1046, 1318].forEach((f, i) => tn(ac, out, t + 0.06 + i * 0.06, 'triangle', f, f, 0.2, 0.16)); break;
    case 'plane': {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(ac); s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(250, t); f.frequency.linearRampToValueAtTime(1300, t + 1.1); f.frequency.linearRampToValueAtTime(300, t + 2.3);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.55, t + 1.0); g.gain.linearRampToValueAtTime(0.0001, t + 2.3);
      s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 2.4);
      tn(ac, out, t, 'sawtooth', 110, 70, 2.2, 0.05, 0.8); break;
    }
    case 'boom': nz(ac, out, t, 1.3, 'lowpass', 1400, 45, 0.9); tn(ac, out, t, 'sine', 85, 25, 1.0, 0.9); break;
    case 'heavy': tn(ac, out, t, 'sine', 62, 24, 0.9, 1.0); tn(ac, out, t, 'triangle', 130, 40, 0.25, 0.5); nz(ac, out, t, 0.6, 'lowpass', 3200, 60, 0.9); nz(ac, out, t, 0.04, 'highpass', 4000, 2500, 0.5); break;  // heavy impact boom
    case 'whoomp': { // shockwave: rising suck-in then a deep whoomp
      nz(ac, out, t, 0.18, 'bandpass', 300, 1600, 0.35, 1.2, 0.15);
      tn(ac, out, t + 0.16, 'sine', 160, 32, 0.9, 1.0, 0.01); nz(ac, out, t + 0.16, 1.1, 'lowpass', 900, 50, 0.8, 1, 0.02); break;
    }
    case 'hum': { // aura charge hum (rising)
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(82, t + 1.2);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(2200, t + 1.2); f.Q.value = 6;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 1.5);
      nz(ac, out, t, 1.3, 'bandpass', 400, 3000, 0.18, 2, 0.8); break;
    }
    case 'cring': [1180, 1770, 2655, 3540, 4720].forEach((f, i) => tn(ac, out, t, 'sine', f, f * 0.997, 1.6 - i * 0.22, 0.13 - i * 0.018, 0.002)); nz(ac, out, t, 0.06, 'highpass', 5000, 3000, 0.4); break; // clash ring
    case 'zap': nz(ac, out, t, 0.12, 'highpass', 3000, 9000, 0.35, 1, 0.005); tn(ac, out, t, 'square', 1800, 300, 0.1, 0.08); break;   // teleport / afterimage
    case 'streak': nz(ac, out, t, 0.2, 'bandpass', 2500, 600, 0.3, 3, 0.01); tn(ac, out, t, 'sawtooth', 900, 200, 0.18, 0.06); break;
    case 'beep': tn(ac, out, t, 'square', 880, 880, 0.16, 0.22); break;
    case 'go': [440, 554, 659].forEach((f) => tn(ac, out, t, 'sawtooth', f, f, 0.7, 0.11, 0.01)); tn(ac, out, t, 'sine', 110, 55, 0.5, 0.55); break;
    case 'crowd': [500, 900, 1500, 2300].forEach((f, i) => nz(ac, out, t, 1.9, 'bandpass', f, f * 1.15, 0.2 - i * 0.03, 1.5, 0.35));
      for (let i = 0; i < 4; i++) { const b = rand(380, 650), d = rand(0, 0.4); tn(ac, out, t + d, 'sine', b, b * 1.5, 0.7, 0.025, 0.15); } break;
    case 'murmur': [600, 1100].forEach((f) => nz(ac, out, t, 2.4, 'bandpass', f, f, 0.05, 1, 0.8)); break;
    case 'fanfare': [[523, 0], [659, 0.14], [784, 0.28], [1046, 0.46]].forEach(([f, d]) => { tn(ac, out, t + d, 'square', f, f, 0.22, 0.1); tn(ac, out, t + d, 'triangle', f / 2, f / 2, 0.22, 0.11); });
      [523, 659, 784, 1046].forEach((f) => tn(ac, out, t + 0.66, 'sawtooth', f, f, 1.2, 0.05, 0.02)); break;
    case 'sudden': tn(ac, out, t, 'sawtooth', 55, 50, 1.4, 0.28, 0.05); tn(ac, out, t, 'sawtooth', 82, 78, 1.4, 0.18, 0.05); nz(ac, out, t, 1.0, 'lowpass', 800, 60, 0.55); break;
  }
}
function sfx(kind, x = null, v = 1, p = 1) {
  if (S.game.sound === false) return;
  const gap = SND_GAP[kind] ?? 0.03;
  if (MANUAL) {
    if (clock - (AU.last[kind] ?? -9) < gap) return;
    AU.last[kind] = clock; AU.log.push([clock, kind, v, x, p]); return;
  }
  if (!AU.ctx || !AU.on || AU.ctx.state !== 'running') return;
  const now = AU.ctx.currentTime;
  if (now - (AU.last[kind] ?? -9) < gap) return;
  AU.last[kind] = now;
  try { voice(AU.ctx, AU.out, now + 0.005, kind, v, x, p); } catch (e) {}
}
// recording: render all logged sounds into a WAV (peak normalised to about -2 dB, no clipping)
async function renderAudio(dur, offset = 0) {
  const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr), out = makeOut(oc);
  if (SB.ok) startWind(oc, out, 0, dur);
  for (const [t, k, v, x, p] of AU.log) { const tt = t - offset; if (tt >= 0 && tt < dur) voice(oc, out, tt, k, v, x, p); }
  const buf = await oc.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
  let peak = 0; for (let i = 0; i < n; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; }
  const k = peak > 0 ? Math.min(3, 0.75 / peak) : 1;   // about -2.5 dB peak
  const ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); ws(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { dv.setInt16(o, clamp(L[i] * k, -1, 1) * 32767, true); dv.setInt16(o + 2, clamp(R[i] * k, -1, 1) * 32767, true); }
  const bytes = new Uint8Array(ab); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ============================================================ effects
const parts = [];      // particles (world space)
const texts = [];      // floating texts (world position, drawn in screen space)
const callouts = [];   // big center texts (screen)
const feed = [];       // event feed lines
const bullets = [], bombs = [], planes = [], ragdolls = [];
let fighters = [];
let clock = 0;         // seconds since start (real time)
const timeCtl = { scale: 1, slowT: 0, slowScale: 1, cooldown: 0, stop: 0 };
const fx = { impact: null, impactCd: 0, focusT: 0, focusX: 0, focusY: 0, streakT: 0, streakDir: 1, lines: [] };

function addPart(p) { if (parts.length < 1600) parts.push(p); }
function sparks(x, y, dir, n, colors, speed = 1) {
  n = Math.ceil(n * 0.55);
  for (let i = 0; i < n; i++) {
    const a = (dir > 0 ? 0 : PI) + rand(-0.9, 0.9) + (Math.random() < 0.25 ? PI : 0);
    const sp = rand(350, 1150) * speed;
    addPart({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200, life: rand(0.12, 0.35), max: 0.35, size: rand(1.5, 3.5), color: pick(colors), g: 0.6 });
  }
  addPart({ k: 'flash', x, y, life: 0.07, max: 0.07, size: 18, color: '#fff' });
}
function ring(x, y, size, color, life = 0.35, width = 6) { addPart({ k: 'ring', x, y, life, max: life, size, color, w: width }); }
function smoke(x, y, n, big = 1) {
  for (let i = 0; i < n; i++) addPart({ k: 'smoke', x: x + rand(-30, 30) * big, y: y + rand(-30, 20) * big, vx: rand(-120, 120) * big, vy: rand(-260, -40) * big, life: rand(0.6, 1.3), max: 1.3, size: rand(20, 46) * big, color: pick(['#3a3448', '#4b4458', '#2b2636']), g: -0.02 });
}
// dust puffs at the feet (landings, slides, skids, knockdowns)
function dust(x, y, n = 6, dir = 0, big = 1) {
  n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) {
    const vx = dir ? -dir * rand(60, 320) : rand(-260, 260);
    addPart({ k: 'dust', x: x + rand(-10, 10) * big, y: y - rand(0, 6), vx: vx * big, vy: -rand(20, 160) * big, life: rand(0.35, 0.7), max: 0.7, size: rand(6, 14) * big, color: pick(['#e0a46c', '#d0915a', '#ecbc8a']), g: 0.05 });
  }
}
function fire(x, y, n, big = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, PI * 2), sp = rand(150, 900) * big;
    addPart({ k: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 250, life: rand(0.25, 0.7), max: 0.7, size: rand(16, 40) * big, color: pick(['#ffd34d', '#ff8a1f', '#ff4d1a', '#fff2a8']), g: -0.05 });
  }
}
function confetti(n, colors) {
  for (let i = 0; i < n; i++) addPart({ k: 'conf', x: rand(0, W), y: rand(VIEW_TOP - 200, VIEW_TOP + 300), vx: rand(-150, 150), vy: rand(100, 500), life: rand(2.5, 4.5), max: 4.5, size: rand(5, 10), color: pick(colors), rot: rand(0, 6), vr: rand(-10, 10), g: 0.08 });
}
function healFx(f) {
  for (let i = 0; i < 6; i++) addPart({ k: 'plus', x: f.x + rand(-30, 30) * f.s, y: f.y - rand(40, 170) * f.s, vx: 0, vy: rand(-160, -80), life: rand(0.6, 1.0), max: 1, size: rand(14, 22), color: '#4dff88', g: 0 });
}
// a big anime slash line across a body (iaido finisher)
function slashMark(x, y, ang, len = 220) { addPart({ k: 'slashline', x, y, ang, len, life: 0.45, max: 0.45 }); }
function floatText(x, y, text, color = '#fff', size = 34, life = 0.9) {
  if (texts.length > 60) texts.shift();
  texts.push({ x, y, text: String(text), color, size, life, max: life, oy: 0, vy: -150 });
}
function callout(text, sub = '', color = '#ffd84a', size = 120, life = 1.7) {
  callouts.push({ text, sub, color, size, life, max: life });
  if (callouts.length > 2) callouts.shift();
}
function addFeed(parts_, life = 9) {
  feed.push({ parts: parts_, life, max: life });
  if (feed.length > 7) feed.shift();
}
// rules: shake only on heavy impacts (small values ignored), capped, smooth (see camView)
function shake(a) { if (a < 9) return; cam.shake = Math.min(22, Math.max(cam.shake, a * 0.9)); }
function slowmo(scale, dur, force = false) {
  if (S.game.slowMotion === false) return;
  if (!force && timeCtl.cooldown > 0) return;
  timeCtl.slowScale = scale; timeCtl.slowT = dur; timeCtl.cooldown = dur + 2.5;
}
// anime "impact frame": a frozen, inverted flash frame with radial speed lines
function impactFrame(x, y, dur = 0.07, force = false, mode = '') {
  if (!force && fx.impactCd > 0) return;
  fx.impact = { x, y, t: dur, dur, mode }; fx.impactCd = 1.6;
}
function focusLines(x, y, dur = 0.5) { fx.focusT = Math.max(fx.focusT, dur); fx.focusX = x; fx.focusY = y; }
function speedStreaks(dir, dur = 0.3) { fx.streakT = Math.max(fx.streakT, dur); fx.streakDir = dir; }

// --- reference-style effects ---
// big billowing desert dust cloud (knockdowns, slams, dashes)
function dustCloud(x, y, n = 10, big = 1, dir = 0) {
  n = Math.ceil(n * 0.35);
  for (let i = 0; i < n; i++) {
    const a = dir ? (dir > 0 ? 0 : PI) + rand(-0.5, 0.5) : rand(PI, TAU);
    const sp = rand(60, 380) * big;
    addPart({ k: 'cloud', x: x + rand(-20, 20) * big, y: y - rand(0, 20) * big, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp * 0.5 - rand(10, 60), life: rand(0.8, 1.5), max: 1.5, size: rand(12, 28) * big, grow: rand(1.0, 1.6), color: pick(['#d89a62', '#e4ad78', '#c88752', '#efc092']), g: -0.01 });
  }
}
// dirt kicked up by feet
function dirt(x, y, dir = 0, n = 8, big = 1) {
  n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) {
    const vx = (dir ? dir * rand(80, 520) : rand(-400, 400)) * big;
    addPart({ k: 'dirt', x: x + rand(-8, 8), y: y - 2, vx, vy: -rand(200, 700) * big, life: rand(0.35, 0.8), max: 0.8, size: rand(2, 4.5) * big, color: pick(['#9a5a30', '#b8703c', '#7a4424', '#c98a56']), g: 0.9 });
  }
}
// bright white circular hit flash with radial spikes (TikTok-safe: no blood)
function hitFlash(x, y, size = 1, color = '#ffffff') {
  addPart({ k: 'hitflash', x, y, life: 0.12, max: 0.12, size: 15 * Math.min(size, 1.3), color, rays: Array.from({ length: 8 }, () => [rand(0, TAU), rand(0.8, 1.6)]) });
}
// shockwave distortion ring
function shockRing(x, y, size = 1) {
  addPart({ k: 'shock', x, y, life: 0.7, max: 0.7, size: 260 * size });
  addPart({ k: 'shock', x, y, life: 0.5, max: 0.5, size: 170 * size });
}
function ember(f, n = 1) {
  const c = TEAMS[f.team].aura;
  for (let i = 0; i < n; i++) addPart({ k: 'ember', x: f.x + rand(-28, 28) * f.s, y: f.y - rand(0, 200) * f.s, vx: rand(-30, 30), vy: -rand(120, 320), life: rand(0.3, 0.7), max: 0.7, size: rand(2, 5) * f.s * 1.5, color: c, g: 0 });
}

// ============================================================ poses
// pose = [lean, leadUpperArm, leadForearm, rearUpperArm, rearForearm, leadThigh, leadShin, rearThigh, rearShin, swordAngle]
// angles are absolute: 0 = straight down, +PI/2 = pointing forward (towards the enemy), PI = straight up, negative = backwards
const P = (...a) => (a.length < 10 ? [...a, NaN] : a);
const POSES = {
  // --- reference-style set-piece poses ---
  coil:      P(0.6, 0.25, 1.2, -0.75, 0.55, 1.15, -0.2, -0.8, -1.45),     // coiled anticipation before the shockwave kick
  powerUp:   P(0.08, -0.4, 0.3, -0.55, 0.15, 0.6, 0.1, -0.55, -0.2),      // aura charge: arms flexed down, wide stance
  wcA:       P(0.1, 1.35, 2.25, 1.0, 2.6, 0.45, 0.15, -0.32, -0.5),       // wing chun tan sau
  wcB:       P(0.12, 1.15, 1.35, 1.45, 2.05, 0.45, 0.15, -0.32, -0.5),    // wing chun bong / pak sau
  wcHit:     P(0.26, 1.57, 1.57, 1.15, 2.3, 0.55, 0.12, -0.4, -0.55),     // chain punch
  matrix:    P(-1.2, -0.25, 0.7, -0.65, 0.25, 1.2, -0.3, 0.5, -0.5),      // matrix lean-back dodge
  overW:     P(-0.2, 2.95, 3.15, 2.75, 3.05, 1.3, 0.5, -0.2, -0.9),       // overhead strike wind-up (air)
  overA:     P(0.55, 1.25, 1.0, 1.05, 0.85, 0.9, -0.1, -0.6, -1.0),       // overhead strike release
  crouchG:   P(0.12, 2.15, 3.05, 1.95, 2.95, 1.15, -0.3, -0.85, -1.55),   // crouched overhead guard
  catchLeg:  P(0.22, 1.5, 1.95, 1.3, 1.95, 0.62, 0.12, -0.45, -0.6),
  slamUp:    P(-0.3, 2.7, 3.0, 2.55, 2.9, 0.55, 0.1, -0.5, -0.6),
  slamDn:    P(0.75, 0.85, 0.6, 0.7, 0.5, 0.95, -0.2, -0.75, -1.15),
  punchDn:   P(0.8, 0.95, 0.55, 0.35, 2.6, 1.05, 0.05, -0.85, -0.95),     // heavy downward punch
  dashLow:   P(0.85, -0.6, 0.2, -0.9, -0.2, 1.2, 0.2, -0.9, -1.4),        // low forward dash (silhouette slash)
  // --- unarmed martial arts ---
  stance:  P(0.12, 0.9, 2.6, 0.45, 2.85, 0.42, 0.18, -0.3, -0.48),      // guard up, fists at chin
  stance2: P(0.18, 0.95, 2.5, 0.5, 2.8, 0.62, 0.0, -0.45, -0.7),        // low bounce / ready to spring
  step:    P(0.24, 0.95, 2.45, 0.45, 2.8, 0.8, 0.25, -0.2, -0.45),
  jabW:    P(0.05, 0.75, 2.75, 0.45, 2.85, 0.45, 0.15, -0.32, -0.5),
  jabA:    P(0.3, 1.56, 1.56, 0.5, 2.8, 0.62, 0.12, -0.42, -0.55),
  crossW:  P(0.04, 0.9, 2.6, 0.25, 2.75, 0.42, 0.18, -0.3, -0.48),
  crossA:  P(0.44, 0.7, 2.75, 1.56, 1.58, 0.72, 0.15, -0.58, -0.5),
  hookW:   P(-0.02, 1.05, 2.15, 0.5, 2.8, 0.42, 0.18, -0.3, -0.48),
  hookA:   P(0.36, 1.75, 2.75, 0.6, 2.85, 0.62, 0.15, -0.46, -0.55),
  upW:     P(0.45, 0.85, 2.5, 0.2, 0.9, 0.95, -0.15, -0.75, -1.25),     // deep crouch, rear fist low
  upA:     P(-0.14, 0.8, 2.6, 2.75, 3.08, 0.35, 0.1, -0.2, -0.3),       // uppercut, body extends up
  elbowA:  P(0.42, 1.95, 4.5, 0.5, 2.8, 0.72, 0.15, -0.5, -0.5),
  kneeW:   P(0.12, 1.35, 1.0, 1.15, 1.0, 0.45, 0.12, -0.3, -0.48),      // hands grab the head
  kneeA:   P(-0.22, 1.25, 0.45, 1.05, 0.4, 0.1, 0.0, 2.0, 0.3),         // rear knee drives up
  palmW:   P(-0.06, 0.5, 2.0, 0.45, 2.85, 0.42, 0.18, -0.3, -0.48),
  palmA:   P(0.46, 1.5, 1.68, -0.55, 0.25, 0.98, 0.25, -0.88, -0.92),   // deep horse stance palm strike
  fkW:     P(-0.1, 0.9, 2.6, 0.45, 2.85, 1.95, 0.35, -0.2, -0.3),       // front kick chamber (knee up)
  fkA:     P(-0.4, 0.95, 2.5, 0.5, 2.7, 1.62, 1.64, -0.12, -0.15),      // front kick extended
  rhW:     P(-0.06, 1.0, 2.4, 0.6, 2.6, 0.15, 0.05, 1.35, -0.1),        // roundhouse chamber (rear knee)
  rhA:     P(-0.62, -0.25, 0.45, 1.2, 2.2, 0.06, 0.0, 1.98, 2.06),      // roundhouse at head height
  sbW:     P(0.25, 0.9, 2.6, 0.45, 2.85, 0.5, 0.1, -0.5, -1.2),         // spinning back kick (turned away)
  sbA:     P(0.62, 0.7, 2.0, 0.6, 2.2, 0.1, 0.0, -1.62, -1.62),         // back kick extended behind
  fsk:     P(-0.52, 0.85, 2.5, 0.4, 2.8, 1.62, 1.62, 0.95, -0.95),      // flying side kick
  fkn:     P(-0.25, 0.95, 0.35, 0.75, 0.3, -0.35, -1.65, 2.15, 0.35),   // flying knee
  tuck:    P(0.45, 1.5, 2.7, 1.25, 2.6, 2.35, 0.4, 2.05, 0.2),          // tucked in the air (flips)
  sweepW:  P(0.58, 0.3, 0.1, 0.55, 0.5, 1.3, -0.25, -1.35, -1.45),      // squat, rear leg stretched back on the floor
  sweepA:  P(0.62, 0.25, 0.1, 0.6, 0.6, 1.25, -0.3, 1.35, 1.5),         // leg swept to the front
  blockH:  P(-0.1, 1.35, 3.0, 1.05, 2.9, 0.5, 0.15, -0.38, -0.55),      // forearms crossed in front of the face
  blockL:  P(0.02, 1.0, 2.6, 0.6, 2.8, 1.35, 0.1, -0.3, -0.48),         // shin check
  parryW:  P(0.04, 1.05, 2.95, 0.45, 2.85, 0.45, 0.15, -0.32, -0.5),
  parryA:  P(0.18, 1.75, 2.15, 0.45, 2.85, 0.52, 0.15, -0.4, -0.55),    // lead hand swats the strike away
  slip:    P(0.9, 0.9, 2.7, 0.6, 2.8, 1.05, -0.35, -0.85, -1.5),        // duck under
  sway:    P(-0.78, 0.35, 1.7, -0.3, 1.0, 0.55, 0.0, -0.1, -0.4),       // lean back (matrix)
  hurtL:   P(-0.38, 0.5, 2.0, 0.2, 1.6, 0.35, 0.15, -0.3, -0.5),
  hurtG:   P(0.78, 0.95, 0.45, 0.85, 0.35, 0.3, 0.1, -0.3, -0.5),       // folded over (gut hit)
  hurtH:   P(-0.78, -0.6, -0.2, -1.1, -0.5, 0.62, 0.3, -0.1, -0.1),
  air:     P(0.0, 1.8, 2.6, -0.4, 0.4, 1.0, -0.3, 0.2, -0.9),
  fall:    P(-0.3, 2.4, 2.8, -2.2, -2.6, 1.2, 0.6, 0.4, -0.5),
  lie:     P(0.0, 2.7, 2.9, 2.3, 2.6, 0.5, -0.4, 0.15, 0.05),           // lying (used with body rotation)
  kipW:    P(0.0, 2.9, 3.2, 2.7, 3.1, 2.6, 0.5, 2.4, 0.3),              // legs tucked over the chest
  lock:    P(0.42, 1.45, 2.05, 1.3, 1.85, 0.95, 0.3, -0.85, -0.8),      // fists locked together, pushing
  grab:    P(0.32, 1.55, 1.5, 1.4, 1.5, 0.62, 0.15, -0.45, -0.55),
  throwA:  P(-0.58, 2.75, 3.4, 2.5, 3.3, 0.35, 0.1, -0.5, -0.4),        // over-the-shoulder throw
  slide:   P(-0.95, 0.5, 1.2, -0.4, 0.2, 1.48, 1.52, 0.6, -0.9),
  taunt1:  P(0.05, 1.5, 2.9, 0.4, 2.8, 0.42, 0.18, -0.3, -0.48),       // "come on" beckon
  taunt2:  P(0.05, 1.5, 1.9, 0.4, 2.8, 0.42, 0.18, -0.3, -0.48),
  cheer:   P(0, 2.7, 3.0, 2.5, 2.9, 0.25, 0.05, -0.25, -0.35),
  chinA:   P(-0.04, 0.35, 0.6, 1.15, 3.0, 0.3, 0.08, -0.25, -0.35),      // thumb wipes the chin
  chinB:   P(-0.08, 0.35, 0.6, 1.3, 3.45, 0.3, 0.08, -0.25, -0.35),
  neckA:   P(0.02, 2.25, 3.9, 2.05, 3.7, 0.32, 0.1, -0.28, -0.38),       // hands on the head, neck crack
  neckB:   P(-0.12, 2.45, 4.05, 1.85, 3.5, 0.32, 0.1, -0.28, -0.38),
  shrugA:  P(-0.1, 0.55, 1.65, -0.55, -1.6, 0.3, 0.08, -0.25, -0.35),     // "whatever" shrug, palms up
  shrugB:  P(-0.16, 0.85, 1.9, -0.85, -1.85, 0.3, 0.08, -0.25, -0.35),
  bow:     P(0.1, 1.2, 2.9, 1.25, 3.3, 0.2, 0.05, -0.2, -0.3),          // fist-in-palm salute
  // --- sword (kendo / samurai) ---
  swStance:  P(0.08, 0.75, 1.75, 0.95, 1.8, 0.38, 0.15, -0.32, -0.5, 1.95),    // chudan: blade points at the eyes
  swJodan:   P(-0.12, 2.75, 3.1, 2.5, 3.0, 0.4, 0.15, -0.35, -0.5, 4.0),       // overhead
  swKesa:    P(0.46, 1.25, 1.0, 1.1, 1.0, 0.88, 0.2, -0.78, -0.78, 0.7),       // diagonal cut down
  swLowW:    P(0.3, 0.3, 0.2, 0.4, 0.3, 0.6, 0.1, -0.5, -0.6, -0.5),
  swRise:    P(-0.16, 2.6, 2.95, 2.4, 2.9, 0.35, 0.1, -0.2, -0.3, 3.0),
  swThrustW: P(-0.05, 0.4, 1.0, 0.5, 1.1, 0.4, 0.15, -0.3, -0.48, 1.57),
  swThrustA: P(0.42, 1.57, 1.57, 1.45, 1.55, 1.02, 0.25, -0.98, -0.85, 1.57),
  swLock:    P(0.36, 1.3, 1.95, 1.2, 1.95, 0.88, 0.25, -0.82, -0.8, 2.35),
  swBlock:   P(-0.06, 1.2, 2.4, 1.1, 2.4, 0.45, 0.15, -0.35, -0.5, 3.05),
  swIaiW:    P(0.38, -0.3, 0.3, 0.2, 0.6, 0.88, -0.1, -0.8, -1.1, -2.2),        // crouched, blade low behind
  swIaiA:    P(0.56, 1.45, 1.55, -0.6, -0.3, 1.12, 0.3, -1.1, -1.0, 1.25),      // frozen after the cut
  swSheath:  P(0.05, 0.3, 1.5, 0.4, 1.5, 0.3, 0.1, -0.3, -0.45, -1.4),
  // --- guns ---
  gunAim:    P(0.05, 1.57, 1.57, 1.2, 1.5, 0.38, 0.12, -0.3, -0.45),
  reload:    P(0.12, 0.8, 1.9, 1.0, 1.7, 0.38, 0.12, -0.3, -0.45)
};
function basePose(f) { return f.weapon === 'sword' ? POSES.swStance : f.isGun() ? POSES.gunAim : POSES.stance; }
function poseOf(name, f) { return Array.isArray(name) ? name : name === 'base' ? basePose(f) : POSES[name] || POSES.stance; }

// ============================================================ moves (keyframed martial arts)
// fr: keyframes [time, pose, ease]  ('*' = the pose we came from)   imp: impulses [time, forwardSpeed, upSpeed]
// hits: strike windows. type: light | gut | heavy | launch | blast | knock   h: high | mid | low | any
const MV = {
  // ---------- strikes ----------
  jab: { dur: 0.32, cancel: 0.17, fr: [[0, '*'], [0.06, 'jabW'], [0.11, 'jabA', 'out'], [0.18, 'jabA'], [0.32, 'base']], imp: [[0.05, 300]], snd: [[0.07, 'wsh1']],
    hits: [{ t: 0.11, reach: 84, dmg: 5, type: 'light', h: 'high', limb: 'hF', kx: 150 }] },
  cross: { dur: 0.36, cancel: 0.2, fr: [[0, '*'], [0.07, 'crossW'], [0.13, 'crossA', 'out'], [0.2, 'crossA'], [0.36, 'base']], imp: [[0.06, 330]], snd: [[0.08, 'wsh1']],
    hits: [{ t: 0.13, reach: 88, dmg: 6, type: 'light', h: 'high', limb: 'hB', kx: 200 }] },
  hook: { dur: 0.42, cancel: 0.26, fr: [[0, '*'], [0.09, 'hookW', 'in'], [0.16, 'hookA', 'out'], [0.24, 'hookA'], [0.42, 'base']], imp: [[0.08, 230]], snd: [[0.1, 'wsh2']],
    hits: [{ t: 0.16, reach: 74, dmg: 8, type: 'heavy', h: 'high', limb: 'hF', kx: 380 }] },
  uppercut: { dur: 0.55, cancel: 0.3, fr: [[0, '*'], [0.12, 'upW', 'in'], [0.2, 'upA', 'out'], [0.32, 'upA'], [0.55, 'base']], imp: [[0.12, 260, -480]], snd: [[0.13, 'wsh2'], [0.12, 'kiai2']],
    hits: [{ t: 0.19, reach: 70, dmg: 9, type: 'launch', h: 'high', limb: 'hB', kx: 120, ky: -1250 }] },
  elbow: { dur: 0.4, cancel: 0.22, fr: [[0, '*'], [0.08, 'jabW'], [0.14, 'elbowA', 'out'], [0.22, 'elbowA'], [0.4, 'base']], imp: [[0.07, 280]], snd: [[0.09, 'wsh1']],
    hits: [{ t: 0.14, reach: 60, dmg: 7, type: 'heavy', h: 'high', limb: 'eF', kx: 320 }] },
  knee: { dur: 0.46, cancel: 0.26, plant: 'f', fr: [[0, '*'], [0.1, 'kneeW'], [0.17, 'kneeA', 'out'], [0.26, 'kneeA'], [0.46, 'base']], imp: [[0.1, 260]], snd: [[0.12, 'wsh2']],
    hits: [{ t: 0.17, reach: 62, dmg: 8, type: 'gut', h: 'mid', limb: 'kB', kx: 260 }] },
  palm: { dur: 0.58, fr: [[0, '*'], [0.14, 'palmW', 'in'], [0.21, 'palmA', 'out'], [0.36, 'palmA'], [0.58, 'base']], imp: [[0.13, 720]], snd: [[0.15, 'wsh3'], [0.13, 'kiai']],
    hits: [{ t: 0.21, reach: 98, dmg: 11, type: 'blast', h: 'mid', limb: 'hF', kx: 980, ky: -320 }] },
  fkick: { dur: 0.55, cancel: 0.34, plant: 'b', fr: [[0, '*'], [0.12, 'fkW', 'in'], [0.19, 'fkA', 'out'], [0.3, 'fkA'], [0.4, 'fkW'], [0.55, 'base']], imp: [[0.1, 260]], snd: [[0.13, 'wsh2']],
    hits: [{ t: 0.19, reach: 106, dmg: 9, type: 'heavy', h: 'mid', limb: 'fF', kx: 620, ky: -150 }] },
  roundhouse: { dur: 0.62, plant: 'f', fr: [[0, '*'], [0.13, 'rhW', 'in'], [0.21, 'rhA', 'out'], [0.33, 'rhA'], [0.46, 'rhW'], [0.62, 'base']], imp: [[0.1, 320]], snd: [[0.14, 'wsh3'], [0.12, 'kiai2', 0.8]],
    hits: [{ t: 0.21, reach: 112, dmg: 12, type: 'heavy', h: 'high', limb: 'fB', kx: 720, ky: -360 }] },
  spinback: { dur: 0.7, plant: 'f', spin: [[0, 1], [0.13, -1], [0.56, 1]], fr: [[0, '*'], [0.1, 'stance2'], [0.2, 'sbW', 'in'], [0.27, 'sbA', 'out'], [0.4, 'sbA'], [0.52, 'sbW'], [0.7, 'base']], imp: [[0.14, 360]], snd: [[0.2, 'wsh3'], [0.17, 'kiai']],
    hits: [{ t: 0.27, reach: 118, dmg: 14, type: 'blast', h: 'mid', limb: 'fB', kx: 1150, ky: -380 }] },
  sweep: { dur: 0.62, plant: 'f', fr: [[0, '*'], [0.12, 'sweepW', 'in'], [0.22, 'sweepA', 'out'], [0.36, 'sweepA'], [0.62, 'base']], imp: [[0.1, 300]], snd: [[0.15, 'wsh2'], [0.2, 'slide', 0.6]],
    hits: [{ t: 0.22, reach: 108, dmg: 8, type: 'knock', h: 'low', limb: 'fB', kx: 160, ky: -520 }] },
  flurry: { dur: 0.82, ghost: true, fr: [[0, '*'], [0.05, 'jabA', 'out'], [0.1, 'crossA', 'out'], [0.15, 'jabA', 'out'], [0.2, 'crossA', 'out'], [0.25, 'jabA', 'out'], [0.3, 'crossA', 'out'], [0.38, 'palmW', 'in'], [0.46, 'palmA', 'out'], [0.6, 'palmA'], [0.82, 'base']],
    imp: [[0.04, 220], [0.14, 220], [0.24, 220], [0.38, 650]], snd: [[0.04, 'wsh1'], [0.1, 'wsh1'], [0.16, 'wsh1'], [0.22, 'wsh1'], [0.28, 'wsh1'], [0.4, 'wsh3'], [0.36, 'kiai']],
    hits: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3].map((t, i) => ({ t, reach: 88, dmg: 3, type: 'light', h: 'high', limb: i % 2 ? 'hB' : 'hF', kx: 90 })).concat([{ t: 0.46, reach: 98, dmg: 9, type: 'blast', h: 'mid', limb: 'hF', kx: 950, ky: -350 }]) },
  // ---------- aerial ----------
  flyknee: { untilLand: true, minT: 0.3, onLand: 'land', fr: [[0, '*'], [0.08, 'stance2', 'in'], [0.2, 'fkn', 'out'], [0.5, 'fkn'], [0.75, 'air']], imp: [[0.08, 780, -980]], snd: [[0.08, 'jump'], [0.12, 'wsh3'], [0.09, 'kiai']],
    hits: [{ t: 0.14, win: 0.62, reach: 64, dmg: 12, type: 'blast', h: 'any', limb: 'kB', kx: 820, ky: -520 }] },
  flyside: { untilLand: true, minT: 0.3, onLand: 'land', ghost: true, fr: [[0, '*'], [0.1, 'stance2', 'in'], [0.22, 'fsk', 'out'], [0.6, 'fsk'], [0.82, 'air']], imp: [[0.1, 900, -820]], snd: [[0.1, 'jump'], [0.16, 'wsh3'], [0.11, 'kiai']],
    hits: [{ t: 0.18, win: 0.66, reach: 98, dmg: 13, type: 'blast', h: 'any', limb: 'fF', kx: 1000, ky: -420 }] },
  tornado: { untilLand: true, minT: 0.35, onLand: 'land', ghost: true, spin: [[0, 1], [0.12, -1], [0.19, 1], [0.26, -1], [0.33, 1]], fr: [[0, '*'], [0.08, 'stance2', 'in'], [0.16, 'tuck'], [0.33, 'tuck'], [0.39, 'fsk', 'out'], [0.55, 'fsk'], [0.8, 'air']],
    imp: [[0.08, 360, -1250]], snd: [[0.08, 'jump'], [0.16, 'wsh2'], [0.3, 'wsh3'], [0.34, 'kiai2']],
    hits: [{ t: 0.36, win: 0.6, reach: 100, dmg: 14, type: 'blast', h: 'any', limb: 'fF', kx: 950, ky: -450 }] },
  flipkick: { untilLand: true, minT: 0.3, onLand: 'land', ghost: true, rot: [[0, 0], [0.08, 0], [0.5, -TAU]], fr: [[0, '*'], [0.08, 'stance2', 'in'], [0.18, 'fkA', 'out'], [0.36, 'tuck'], [0.6, 'air']],
    imp: [[0.08, 120, -1350]], snd: [[0.08, 'wsh3'], [0.07, 'kiai2']],
    hits: [{ t: 0.12, win: 0.3, reach: 80, dmg: 12, type: 'launch', h: 'any', limb: 'fF', kx: 200, ky: -1300 }] },
  airkick: { untilLand: true, minT: 0.3, onLand: 'land', ghost: true, fr: [[0, '*'], [0.05, 'stance2', 'in'], [0.2, 'tuck'], [0.3, 'fsk', 'out'], [0.5, 'fsk'], [0.75, 'air']], imp: [[0.05, 380, -1300]], snd: [[0.05, 'jump'], [0.28, 'wsh3'], [0.27, 'kiai']],
    hits: [{ t: 0.26, win: 0.65, reach: 92, dmg: 10, type: 'blast', h: 'any', limb: 'fF', kx: 850, ky: -150 }] },
  // ---------- footwork ----------
  stepIn: { foot: true, dur: 0.22, fr: [[0, '*'], [0.08, 'step'], [0.22, 'base']], imp: [[0.02, 430]], snd: [[0.12, 'step']] },
  stepBack: { foot: true, dur: 0.24, fr: [[0, '*'], [0.08, 'stance2'], [0.24, 'base']], imp: [[0.02, -430]], snd: [[0.14, 'step']] },
  hopBack: { foot: true, untilLand: true, minT: 0.1, onLand: 'land', fr: [[0, '*'], [0.1, 'air']], imp: [[0.02, -420, -620]], snd: [[0.02, 'jump', 0.6]] },
  land: { foot: true, dur: 0.2, fr: [[0, '*'], [0.06, 'stance2'], [0.2, 'base']] },
  taunt: { foot: true, dur: 0.9, fr: [[0, '*'], [0.12, 'taunt1'], [0.3, 'taunt2'], [0.45, 'taunt1'], [0.6, 'taunt2'], [0.9, 'base']] },
  bow: { dur: 1.2, fr: [[0, '*'], [0.25, 'bow'], [0.95, 'bow'], [1.2, 'base']] },
  chinWipe: { foot: true, dur: 1.0, fr: [[0, '*'], [0.18, 'chinA'], [0.4, 'chinB'], [0.6, 'chinA'], [1.0, 'base']] },
  neckCrack: { foot: true, dur: 1.1, fr: [[0, '*'], [0.2, 'neckA'], [0.45, 'neckB'], [0.65, 'neckA'], [0.8, 'neckB'], [1.1, 'base']], snd: [[0.46, 'step', 0.25]] },
  shrug: { foot: true, dur: 1.0, fr: [[0, '*'], [0.2, 'shrugA'], [0.45, 'shrugB'], [0.7, 'shrugA'], [1.0, 'base']] },
  jumpOver: { untilLand: true, minT: 0.4, onLand: 'land', pass: true, evade: [0, 0.7, 'all'], rot: [[0, 0], [0.08, 0], [0.62, TAU]], fr: [[0, '*'], [0.08, 'stance2', 'in'], [0.18, 'tuck'], [0.55, 'tuck'], [0.7, 'air']],
    imp: [[0.08, 640, -1700]], snd: [[0.08, 'dodge']] },
  jumpUp: { untilLand: true, minT: 0.2, onLand: 'land', fr: [[0, '*'], [0.06, 'stance2', 'in'], [0.16, 'air']], imp: [[0.06, 230, -1680]], snd: [[0.06, 'jump']] },
  dashIn: { dur: 0.4, fr: [[0, '*'], [0.08, 'stance2', 'in'], [0.2, 'step'], [0.4, 'step']], imp: [[0.06, 820]], snd: [[0.08, 'wsh2'], [0.06, 'kiai2']] },
  skid: { dur: 0.55, lowFric: true, fr: [[0, '*'], [0.06, 'stance2'], [0.55, 'base']], snd: [[0, 'slide', 0.7]] },
  // ---------- getting hit ----------
  hurtL: { hurt: true, dur: 0.3, fr: [[0, '*'], [0.05, 'hurtL', 'out'], [0.3, 'base']] },
  hurtG: { hurt: true, dur: 0.44, fr: [[0, '*'], [0.06, 'hurtG', 'out'], [0.28, 'hurtG'], [0.44, 'base']] },
  hurtH: { hurt: true, dur: 0.55, fr: [[0, '*'], [0.06, 'hurtH', 'out'], [0.35, 'hurtH'], [0.55, 'base']] },
  staggered: { hurt: true, dur: 0.62, fr: [[0, '*'], [0.06, 'hurtL', 'out'], [0.45, 'hurtL'], [0.62, 'base']], imp: [[0, -220]] },
  launched: { hurt: true, untilLand: true, minT: 0.12, onLand: 'down', fr: [[0, '*'], [0.08, 'fall', 'out']], rot: [[0, '*'], [0.7, -PI * 1.15]] },
  knocked: { hurt: true, untilLand: true, minT: 0.1, onLand: 'down', fr: [[0, '*'], [0.08, 'fall', 'out']], rot: [[0, '*'], [0.3, -PI / 2]] },
  down: { hurt: true, lie: true, invuln: true, dur: 0.6, next: 'kip', hip: [[0, 6]], fr: [[0, '*'], [0.1, 'lie', 'out']], rot: [[0, '*'], [0.12, 'lie']], snd: [[0, 'thud']] },
  kip: { hurt: true, lie: true, invuln: true, dur: 0.6, hip: [[0, 6], [0.2, 8], [0.42, 70], [0.6, 72]], fr: [[0, 'lie'], [0.2, 'kipW', 'in'], [0.38, 'air', 'out'], [0.6, 'base']], rot: [[0, 'lie'], [0.2, 'lie'], [0.44, 0]], snd: [[0.22, 'jump', 0.8]] },
  grabbed: { hurt: true, dur: 0.9, fr: [[0, '*'], [0.06, 'hurtG', 'out'], [0.9, 'hurtG']] },
  thrown: { hurt: true, dur: 2, held: true, fr: [[0, '*'], [0.1, 'fall']] },
  stunned: { hurt: true, dur: 0.7, fr: [[0, '*'], [0.06, 'hurtL', 'out'], [0.7, 'hurtL']] },
  // ---------- set piece helpers ----------
  grab: { dur: 0.5, fr: [[0, '*'], [0.12, 'grab', 'out'], [0.5, 'grab']], imp: [[0.03, 380]], snd: [[0.05, 'wsh1']] },
  throw: { dur: 0.7, fr: [[0, '*'], [0.14, 'kneeW'], [0.32, 'throwA', 'out'], [0.5, 'throwA'], [0.7, 'base']], snd: [[0.12, 'kiai'], [0.2, 'wsh3']] },
  iaiReady: { dur: 0.55, fr: [[0, '*'], [0.25, 'swIaiW', 'in'], [0.55, 'swIaiW']], snd: [[0.1, 'iai']] },
  iaiCut: { dur: 0.9, pass: true, fr: [[0, '*'], [0.05, 'swIaiA', 'out'], [0.9, 'swIaiA']], snd: [[0, 'swing'], [0.02, 'kiai']] },
  sheath: { dur: 0.7, fr: [[0, '*'], [0.3, 'swSheath'], [0.55, 'swSheath'], [0.7, 'base']], snd: [[0.5, 'clang', 0.5]] },
  victory: { dur: 99, fr: [[0, '*'], [0.3, 'cheer']] },
  // ---------- sword ----------
  swKesa: { dur: 0.6, cancel: 0.36, fr: [[0, '*'], [0.15, 'swJodan', 'in'], [0.23, 'swKesa', 'out'], [0.36, 'swKesa'], [0.6, 'base']], imp: [[0.14, 420]], snd: [[0.16, 'swing'], [0.14, 'kiai', 0.8]],
    hits: [{ t: 0.22, reach: 130, dmg: 11, type: 'heavy', h: 'high', limb: 'sw', kx: 520, ky: -200, sword: true }] },
  swRise: { dur: 0.6, cancel: 0.34, fr: [[0, '*'], [0.12, 'swLowW', 'in'], [0.2, 'swRise', 'out'], [0.32, 'swRise'], [0.6, 'base']], imp: [[0.11, 300]], snd: [[0.13, 'swing']],
    hits: [{ t: 0.19, reach: 120, dmg: 10, type: 'launch', h: 'high', limb: 'sw', kx: 150, ky: -1100, sword: true }] },
  swThrust: { dur: 0.6, fr: [[0, '*'], [0.14, 'swThrustW', 'in'], [0.21, 'swThrustA', 'out'], [0.36, 'swThrustA'], [0.6, 'base']], imp: [[0.13, 880]], snd: [[0.15, 'swing'], [0.13, 'kiai2']],
    hits: [{ t: 0.21, reach: 142, dmg: 12, type: 'blast', h: 'mid', limb: 'sw', kx: 900, ky: -260, sword: true }] },
  swSpin: { dur: 0.75, spin: [[0, 1], [0.14, -1], [0.3, 1]], fr: [[0, '*'], [0.12, 'swJodan', 'in'], [0.2, 'swKesa', 'out'], [0.3, 'swJodan', 'out'], [0.4, 'swKesa', 'out'], [0.52, 'swKesa'], [0.75, 'base']], imp: [[0.1, 380], [0.3, 380]], snd: [[0.14, 'swing'], [0.34, 'swing']],
    hits: [{ t: 0.2, reach: 128, dmg: 8, type: 'heavy', h: 'high', limb: 'sw', kx: 300, sword: true }, { t: 0.4, reach: 128, dmg: 9, type: 'blast', h: 'high', limb: 'sw', kx: 800, ky: -300, sword: true }] },
  // ---------- guns (gun-fu) ----------
  reload: { dur: 0.9, refill: true, fr: [[0, '*'], [0.12, 'reload'], [0.78, 'reload'], [0.9, 'base']], imp: [[0, -260]], snd: [[0.05, 'reload']] },
  roll: { lie: true, pass: true, dur: 0.5, evade: [0, 0.45, 'all'], hip: [[0, 26], [0.45, 26], [0.5, 70]], rot: [[0, 0], [0.45, TAU]], fr: [[0, '*'], [0.06, 'tuck', 'out'], [0.42, 'tuck'], [0.5, 'base']], imp: [[0, 640]], lowFric: true, snd: [[0, 'roll']] }
};
// gun shooting (pistol 1 shot / rifle 3 shot burst)
MV.shoot = (f) => {
  const rifle = f.weapon === 'rifle', n = rifle ? 3 : 1, dur = rifle ? 0.5 : 0.34;
  return { dur, gun: true, fr: [[0, '*'], [0.06, 'gunAim', 'out'], [dur, 'gunAim']], shots: Array.from({ length: n }, (_, i) => 0.1 + i * 0.09) };
};
MV.shootClose = (f) => ({ dur: 0.32, gun: true, fr: [[0, '*'], [0.04, 'gunAim', 'out'], [0.32, 'gunAim']], shots: [0.06], close: true });
// defence: built for the exact time the strike arrives (th = seconds until impact)
MV.block = (f, o) => {
  const th = o.th, low = o.low, pose = f.weapon === 'sword' && !low ? 'swBlock' : low ? 'blockL' : 'blockH';
  return { guardMove: true, gtype: low ? 'blockL' : 'block', guard: [0.02, th + 0.16], actAfter: th + 0.08, dur: th + 0.32, plant: low ? 'b' : null,
    fr: [[0, '*'], [Math.max(0.03, Math.min(0.08, th * 0.6)), pose, 'out'], [th + 0.16, pose], [th + 0.32, 'base']] };
};
MV.parry = (f, o) => {
  const th = o.th, sw = f.weapon === 'sword';
  return { guardMove: true, gtype: 'parry', guard: [th - 0.08, th + 0.08], actAfter: th + 0.06, dur: th + 0.4,
    fr: [[0, '*'], [Math.max(0.03, th - 0.09), sw ? 'swBlock' : 'parryW'], [th + 0.02, sw ? 'swKesa' : 'parryA', 'out'], [th + 0.16, sw ? 'swKesa' : 'parryA'], [th + 0.4, 'base']] };
};
MV.slip = (f, o) => ({ evadeMove: true, evade: [0, o.th + 0.14, ['high']], actAfter: o.th + 0.1, dur: o.th + 0.36,
  fr: [[0, '*'], [Math.max(0.04, Math.min(0.1, o.th * 0.8)), 'slip', 'out'], [o.th + 0.14, 'slip'], [o.th + 0.36, 'base']], snd: [[0, 'dodge', 0.6]] });
MV.sway = (f, o) => ({ evadeMove: true, evade: [0, o.th + 0.14, ['high', 'mid']], actAfter: o.th + 0.1, dur: o.th + 0.38, imp: [[0, -160]],
  fr: [[0, '*'], [Math.max(0.04, Math.min(0.1, o.th * 0.8)), 'sway', 'out'], [o.th + 0.14, 'sway'], [o.th + 0.38, 'base']], snd: [[0, 'dodge', 0.6]] });
MV.backflip = { evadeMove: true, untilLand: true, minT: 0.4, onLand: 'land', evade: [0, 0.55, 'all'], rot: [[0, 0], [0.55, -TAU]], fr: [[0, '*'], [0.06, 'stance2'], [0.16, 'tuck'], [0.48, 'tuck'], [0.62, 'air']], imp: [[0.03, -440, -1180]], snd: [[0.03, 'dodge']] };
MV.hop = { evadeMove: true, untilLand: true, minT: 0.2, onLand: 'land', evade: [0, 0.45, ['low']], fr: [[0, '*'], [0.08, 'tuck']], imp: [[0, -40, -950]], snd: [[0, 'jump']] };
MV.slideUnder = { evadeMove: true, pass: true, plant: 'f', lowFric: true, dur: 0.6, evade: [0, 0.55, 'all'], fr: [[0, '*'], [0.08, 'slide', 'out'], [0.45, 'slide'], [0.6, 'base']], imp: [[0, 780]], snd: [[0, 'slide']] };
MV.lockHold = (f, o) => { const p = f.weapon === 'sword' ? 'swLock' : 'lock'; return { dur: o.dur || 1.1, fr: [[0, '*'], [0.06, p, 'out'], [o.dur || 1.1, p]], tremble: true }; };
// which moves count as "ready" (stance) for animation purposes
const AIR_MOVES = new Set(['flyknee', 'flyside', 'tornado', 'flipkick', 'airkick', 'jumpOver', 'jumpUp', 'backflip', 'hop', 'hopBack', 'launched', 'knocked']);
// mid-air exchange pieces (aerial set piece)
MV.airIdle = { untilLand: true, minT: 0.05, onLand: 'land', fr: [[0, '*'], [0.12, 'air']] };
MV.airAtk = { untilLand: true, minT: 0.05, onLand: 'land', fr: [[0, '*'], [0.05, 'tuck', 'in'], [0.11, 'fsk', 'out'], [0.28, 'fsk'], [0.45, 'air']], snd: [[0.06, 'wsh2'], [0.04, 'kiai2', 0.7]] };
MV.airAtk2 = { untilLand: true, minT: 0.05, onLand: 'land', fr: [[0, '*'], [0.05, 'rhW', 'in'], [0.11, 'rhA', 'out'], [0.28, 'rhA'], [0.45, 'air']], snd: [[0.06, 'wsh2'], [0.04, 'kiai', 0.7]] };
MV.airGuard = { untilLand: true, minT: 0.05, onLand: 'land', fr: [[0, '*'], [0.06, 'blockH', 'out'], [0.3, 'blockH'], [0.45, 'air']] };
// generic pose hold used by the choreographed set pieces
MV.hold = (f, o) => ({ dur: o.dur || 0.5, plant: o.plant || null, lowFric: o.lowFric, tremble: o.tremble, ghost: o.ghost, hurt: o.hurt,
  fr: [[0, '*'], [o.tin || 0.06, o.pose, o.ease || 'out'], [o.dur || 0.5, o.pose2 || o.pose]], snd: o.snd });

// ============================================================ fighter
let NEXT_ID = 1;
// 2-bone IK (thigh + shin): returns [knee, foot] relative to the hip, knee bends forward
function ik2(tx, ty, a, b, fwd) {
  let d = Math.hypot(tx, ty) || 0.001;
  if (d > a + b - 0.01) { const k = (a + b - 0.01) / d; tx *= k; ty *= k; d = a + b - 0.01; }
  d = Math.max(d, Math.abs(a - b) + 0.01);
  const ang = Math.atan2(ty, tx), al = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  const k1 = { x: Math.cos(ang + al) * a, y: Math.sin(ang + al) * a }, k2 = { x: Math.cos(ang - al) * a, y: Math.sin(ang - al) * a };
  return [(k1.x - k2.x) * fwd > 0 ? k1 : k2, { x: tx, y: ty }];
}
// keyframe channel (rotation / hip height): [[time, value], ...]  '*' = start value, 'lie' = lying angle
function kfInterp(list, t, M) {
  const val = (v) => (v === '*' ? M.r0 : v === 'lie' ? M.lieRot : v);
  if (t <= list[0][0]) return val(list[0][1]);
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (t <= b[0]) { const u = EASE.io(clamp((t - a[0]) / Math.max(1e-4, b[0] - a[0]), 0, 1)); return lerp(val(a[1]), val(b[1]), u); }
  }
  return val(list[list.length - 1][1]);
}
const TRAIL_KEYS = ['hF', 'hB', 'fF', 'fB', 'kB', 'sw'];
class Fighter {
  constructor(team, o = {}) {
    this.id = NEXT_ID++; this.team = team; this.name = TEAMS[team].name + ' HERO';
    this.s = o.scale || BASE_S; this.ts = this.s;
    this.maxHp = o.hp || 200; this.hp = this.maxHp;
    this.x = o.x ?? W / 2; this.y = o.y ?? FLOOR; this.vx = 0; this.vy = 0;
    this.face = o.face || 1; this.spinFace = 1; this.rot = 0;
    this.onGround = false; this.plat = null; this.dropT = 0; this.gMul = 1; this.wallT = 0;
    this.weapon = 'fists'; this.ammo = 0; this.mag = 0;
    this.mv = null; this.flash = 0; this.invuln = o.invuln ?? 0.6; this.superT = 0; this.giantT = 0; this.auraT = 0; this.hidden = false;
    this.combo = 0; this.comboT = 0; this.comboPop = 0; this.kills = 0;
    this.pose = POSES.stance.slice(); this.pose[9] = this.pose[2]; this.J = null; this.ghosts = []; this.ghostT = 0;
    this.tr = {}; for (const k of TRAIL_KEYS) this.tr[k] = [];
    this.alive = true; this.walkPh = rand(0, 6); this.lastStep = 0; this.walkV = 0; this.aim = 0;
    this.dropIn = !!o.dropIn; this.scripted = false; this.held = false;
    this.vo = { x: 0, y: 0 }; this.prevMode = null; this.prevHip = null;
    this.brain = new Brain(this);
    this.computeJoints();
  }
  get giant() { return this.ts > BASE_S * 1.5; }
  get foe() { for (const e of fighters) if (e !== this && e.alive) return e; return null; }
  setWeapon(w) {
    this.weapon = w; this.heavyBlade = w === 'sword' && this.team === 1;   // BLACK swings a heavy cleaver, WHITE a fast katana
    if (w === 'pistol') { this.ammo = 36; this.mag = 12; }
    if (w === 'rifle') { this.ammo = 90; this.mag = 30; }
  }
  isGun() { return this.weapon === 'pistol' || this.weapon === 'rifle'; }
  cy() { return this.y - 95 * this.s; }
  speed() { return (this.superT > 0 ? 1.3 : 1) * (teams[this.team].rageT > 0 ? 1.15 : 1) * (this.giant ? 0.85 : 1); }
  dmgMul() { return (this.superT > 0 ? 1.35 : 1) * (teams[this.team].rageT > 0 ? 1.25 : 1) * (this.giant ? 1.8 : 1); }
  sound(kind, v = 1) { sfx(kind, this.x, v, kind.startsWith('kiai') || kind === 'grunt' ? TEAMS[this.team].voice : 1); }
  busy() { const m = this.mv; return !!m && !m.d.foot; }
  play(name, o = {}) {
    const raw = MV[name]; if (!raw) return null;
    const d = typeof raw === 'function' ? raw(this, o) : raw;
    const e = this.foe;
    if (!o.keepFace && e && !this.held) this.face = e.x >= this.x ? 1 : -1;
    this.spinFace = 1;
    let r0 = this.rot / this.face; r0 = Math.atan2(Math.sin(r0), Math.cos(r0));
    const lieRot = Math.abs(r0 - PI / 2) < Math.abs(r0 + PI / 2) ? PI / 2 : -PI / 2;
    this.mv = { name, d, t: 0, fired: {}, from: this.pose.slice(), r0, lieRot, o };
    if (d.invuln) this.invuln = Math.max(this.invuln, d.dur || 0.6);
    if (d.hits && !o.noReact && e) e.brain.incoming(this, d);
    return this.mv;
  }
  guardState() { const M = this.mv; if (!M || !M.d.guard) return null; return M.t >= M.d.guard[0] && M.t <= M.d.guard[1] ? M.d.gtype : null; }
  evading(hh) {
    const M = this.mv; if (!M || !M.d.evade) return false;
    const [a, b, vs] = M.d.evade; if (M.t < a || M.t > b) return false;
    return vs === 'all' || vs.includes(hh) || (hh === 'any' && vs.includes('high'));
  }

  update(dt) {
    const T = this;
    T.auraT -= dt; if ((T.auraT > 0 || T.superT > 0) && Math.random() < dt * 35) ember(T);
    T.invuln -= dt; T.flash -= dt; T.comboT -= dt; T.superT -= dt; T.dropT -= dt; T.comboPop -= dt; T.wallT -= dt;
    if (T.comboT <= 0) T.combo = 0;
    if (Math.abs(T.s - T.ts) > 0.005) T.s = lerp(T.s, T.ts, Math.min(1, dt * 4));
    if (T.giantT > 0) { T.giantT -= dt; if (T.giantT <= 0) { T.ts = BASE_S; floatText(T.x, T.y - 200 * T.s, 'GIANT MODE OVER', '#aab', 22); } }
    if (round.state === 'end' && round.winner === T.team && T.onGround && (!T.mv || T.mv.name !== 'victory') && !T.busy()) T.play('victory', { keepFace: true });
    if (T.isGun()) { const e = T.foe; if (e) T.aim = clamp(Math.atan2(-(e.cy() - T.cy()), Math.abs(e.x - T.x) + 1), -0.7, 0.7); }
    if (T.mv) T.updateMove(dt);
    const M = T.mv, d = M ? M.d : null;
    if (!T.held) {
      if (!M && T.onGround) T.vx += (T.walkV - T.vx) * Math.min(1, 12 * dt);
      else if (T.onGround) T.vx *= Math.exp(-(d && d.lowFric ? 2.2 : 9) * dt);
      else if (!M) T.vx += (T.walkV * 0.5 - T.vx) * Math.min(1, 1.5 * dt);
      T.vy += G * T.gMul * dt;
      const oy = T.y, vyPre = T.vy, vxPre = T.vx;
      T.x += T.vx * dt; T.y += T.vy * dt;
      const was = T.onGround;
      T.onGround = false; T.plat = null;
      if (T.vy >= 0) for (const p of PLATS) {
        if (T.dropT <= 0 && oy <= p.y + 1 && T.y >= p.y && T.x > p.x1 && T.x < p.x2) { T.y = p.y; T.vy = 0; T.onGround = true; T.plat = p; break; }
      }
      if (T.y >= FLOOR) { T.y = FLOOR; T.vy = 0; T.onGround = true; }
      if (T.onGround && !was) T.landed(vyPre);
      const m = 16 * T.s + 6;
      if (T.x < WALL_L + m || T.x > WALL_R - m) {
        const side = T.x < W / 2 ? -1 : 1;
        T.x = side < 0 ? WALL_L + m : WALL_R - m;
        if (Math.abs(vxPre) > 620 && d && d.hurt && T.wallT <= 0) wallBounce(T, side, vxPre);
        else if (vxPre * side > 0) T.vx = 0;
      }
      if (T.onGround && !T.mv && Math.abs(T.vx) > 40) {
        T.walkPh += dt * Math.abs(T.vx) / (24 * T.s);
        const st = Math.floor(T.walkPh / PI); if (st !== T.lastStep) { T.lastStep = st; sfx('step', T.x, T.giant ? 1.1 : Math.abs(T.vx) > 420 ? 0.6 : 0.35); }
      }
    }
    // pose (smoothly follows the keyframes)
    const tp = T.targetPose();
    const k = 1 - Math.exp(-(T.mv ? 40 : 16) * dt);
    for (let i = 0; i < 10; i++) T.pose[i] += (tp[i] - T.pose[i]) * k;
    if (!T.mv || !T.mv.d.rot) { T.rot *= Math.exp(-14 * dt); if (Math.abs(T.rot) < 0.002) T.rot = 0; }
    T.vo.x *= Math.exp(-12 * dt); T.vo.y *= Math.exp(-12 * dt);
    T.computeJoints();
    T.recordTrails();
    T.ghostT -= dt;
    if ((T.superT > 0 || (T.mv && T.mv.d.ghost)) && T.ghostT <= 0) { T.ghostT = 0.035; T.ghosts.push({ J: T.J, life: 0.2 }); if (T.ghosts.length > 6) T.ghosts.shift(); }
    for (const g of T.ghosts) g.life -= dt;
    T.ghosts = T.ghosts.filter((g) => g.life > 0);
  }
  updateMove(dt) {
    const T = this, M = T.mv, d = M.d;
    M.t += dt * T.speed() * (M.o.rate || 1) * (T.heavyBlade && M.name.startsWith('sw') ? 0.82 : 1);
    const t = M.t, F = M.fired;
    if (d.imp) for (let i = 0; i < d.imp.length; i++) {
      const e = d.imp[i]; if (F['i' + i] || t < e[0]) continue;
      F['i' + i] = 1;
      if (e[1] != null) { T.vx = T.face * e[1] * (T.giant ? 0.8 : 1); if (Math.abs(e[1]) >= 600 && T.onGround) dust(T.x, T.y, 4, T.face * Math.sign(e[1])); }
      if (e[2] != null) { T.vy = e[2] * (T.giant ? 0.85 : 1); T.onGround = false; T.y -= 2; }
    }
    if (d.snd) for (let i = 0; i < d.snd.length; i++) { const e = d.snd[i]; if (!F['s' + i] && t >= e[0]) { F['s' + i] = 1; T.sound(e[1], e[2] ?? 1); } }
    if (d.spin) { let v = 1; for (const e of d.spin) if (t >= e[0]) v = e[1]; T.spinFace = v; }
    if (d.rot) T.rot = T.face * kfInterp(d.rot, t, M);
    if (d.shots) for (let i = 0; i < d.shots.length; i++) { if (!F['g' + i] && t >= d.shots[i]) { F['g' + i] = 1; T.fire(d.close); if (T.mv !== M) return; } }
    if (d.hits && !M.o.noHit) for (let i = 0; i < d.hits.length; i++) {
      if (T.mv !== M) return;
      const h = d.hits[i], key = 'h' + i; if (F[key]) continue;
      if (h.win != null) { if (t >= h.t && t <= h.win) { if (T.tryHit(h)) F[key] = 1; } else if (t > h.win) { F[key] = 1; T.brain.onWhiff(); } }
      else if (t >= h.t) { F[key] = 1; if (!T.tryHit(h)) T.brain.onWhiff(); }
    }
    if (T.mv !== M) return;
    if (d.untilLand) {
      if (t > (d.minT || 0.1) && T.onGround) { T.mv = null; if (d.onLand) T.play(d.onLand, { keepFace: d.onLand !== 'land' }); }
    } else if (t >= d.dur) {
      T.mv = null; T.spinFace = 1;
      if (d.refill) T.mag = Math.min(T.weapon === 'rifle' ? 30 : 12, T.ammo);
      if (d.next) T.play(d.next, { keepFace: true });
    }
  }
  landed(vy) {
    const T = this;
    if (!(T.mv && T.mv.d.rot)) T.rot = 0;
    if (vy > 500) { sfx('land', T.x, clamp(vy / 1600, 0.3, 1) * (T.giant ? 1.4 : 1)); dust(T.x, T.y, vy > 1100 ? 10 : 5, 0, T.giant ? 2 : 1); dirt(T.x, T.y, 0, 5); shake(vy > 1100 ? 7 : 3); if (vy > 1100) dustCloud(T.x, T.y, 5, 0.7); }
    if (T.dropIn) { T.dropIn = false; ring(T.x, T.y, 70 * T.s, TEAMS[T.team].accent, 0.4, 5); dust(T.x, T.y, 10); if (T.giant) shake(14); }
    if (T.mv && T.mv.d.hurt && T.mv.d.untilLand && vy > 300) { shake(12); dustCloud(T.x, T.y, 9, 1); dirt(T.x, T.y, 0, 10); sfx('thud', T.x, 0.8); }
  }
  tryHit(h) {
    const T = this, e = T.foe;
    if (!e || !e.alive || e.invuln > 0 || e.held) return false;
    const dxw = (e.x - T.x) * T.face;
    const reach = h.reach * T.s + 14 * e.s;
    if (dxw < -20 * T.s || dxw > reach) return false;
    const lp = T.J[h.limb] || T.J.hF;
    if (h.h === 'any') { if (Math.abs(e.cy() - T.cy()) > 175 * Math.max(T.s, e.s)) return false; }
    else if (lp.y < e.y - 215 * e.s || lp.y > e.y + 12) return false;
    resolveHit(T, e, h, lp);
    return true;
  }
  fire(close) {
    const T = this;
    if (!T.J || !T.isGun() || T.mag <= 0) return;
    const h = T.J.hF, rifle = T.weapon === 'rifle', e = T.foe;
    const a = T.aim + rand(-0.03, 0.03);
    const dx = Math.cos(a) * T.face, dy = -Math.sin(a), len = (rifle ? 70 : 28) * T.s;
    const mx = h.x + dx * len, my = h.y + dy * len;
    bullets.push({ x: mx, y: my, vx: dx * 2600, vy: dy * 2600, team: T.team, owner: T, dmg: rifle ? 6 : 7, life: 0.6 });
    addPart({ k: 'flash', x: mx, y: my, life: 0.06, max: 0.06, size: rifle ? 30 : 22, color: '#ffe27a' });
    addPart({ k: 'spark', x: mx, y: my, vx: dx * 500, vy: dy * 500 - 100, life: 0.12, max: 0.12, size: 3, color: '#ffd34d', g: 0 });
    T.vx -= T.face * (rifle ? 60 : 40);
    T.sound('shot', rifle ? 0.85 : 1);
    T.ammo--; T.mag--;
    if (e && !close) e.brain.incomingShot(T);
    if (T.ammo <= 0) { T.weapon = 'fists'; floatText(T.x, T.y - 220 * T.s, 'OUT OF AMMO', '#aab', 22); }
  }
  targetPose() {
    const T = this, M = T.mv;
    const sw = (p) => (isNaN(p[9]) ? p[2] : p[9]);
    let p;
    if (M) {
      const fr = M.d.fr, t = M.t;
      let i = 0; while (i < fr.length - 1 && t >= fr[i + 1][0]) i++;
      const A = fr[i], B = fr[Math.min(i + 1, fr.length - 1)];
      const pa = A[1] === '*' ? M.from : poseOf(A[1], T), pb = B[1] === '*' ? M.from : poseOf(B[1], T);
      let u = B === A ? 1 : clamp((t - A[0]) / Math.max(1e-4, B[0] - A[0]), 0, 1);
      u = EASE[B[2] || 'io'](u);
      p = new Array(10);
      for (let k = 0; k < 9; k++) p[k] = pa[k] + (pb[k] - pa[k]) * u;
      p[9] = sw(pa) + (sw(pb) - sw(pa)) * u;
      if (M.d.gun) { p[1] = PI / 2 + T.aim; p[2] = PI / 2 + T.aim; if (T.weapon === 'rifle') { p[3] = PI / 2 + T.aim - 0.45; p[4] = PI / 2 + T.aim; } p[9] = p[2]; }
      if (M.d.tremble) { const w = Math.sin(clock * 70 + T.id) * 0.05; p[0] += w; p[1] += w; p[3] -= w; }
      if (M.name === 'victory') { const w = Math.sin(clock * 8 + T.id); p[1] += w * 0.2; p[3] -= w * 0.2; }
      return p;
    }
    const base = basePose(T);
    p = base.slice(); p[9] = sw(base);
    if (!T.onGround) {
      const a = POSES.air;
      for (let k = 0; k < 9; k++) p[k] = a[k];
      if (T.weapon !== 'fists') { p[1] = base[1]; p[2] = base[2]; p[3] = base[3]; p[4] = base[4]; }
      else { p[1] = 1.0; p[2] = 2.5; p[3] = 0.6; p[4] = 2.7; }
      if (T.vy > 250) { p[5] = 0.55; p[6] = 0.25; p[7] = -0.35; p[8] = -0.7; }
    } else if (Math.abs(T.vx) > 40) {
      const ph = T.walkPh;
      if (Math.abs(T.vx) > 420) {   // run
        p[0] = 0.38;
        p[5] = 0.8 * Math.sin(ph); p[6] = p[5] - 1.0 * Math.max(0, Math.cos(ph));
        p[7] = 0.8 * Math.sin(ph + PI); p[8] = p[7] - 1.0 * Math.max(0, Math.cos(ph + PI));
        if (T.weapon === 'fists') { p[1] = 0.7 + 0.8 * Math.sin(ph + PI); p[2] = p[1] + 1.5; p[3] = 0.7 + 0.8 * Math.sin(ph); p[4] = p[3] + 1.5; }
      } else {                       // guarded shuffle step
        const a = Math.sin(ph);
        p[5] = base[5] + 0.24 * a; p[6] = base[6] + 0.18 * a - 0.25 * Math.max(0, Math.cos(ph));
        p[7] = base[7] - 0.24 * a; p[8] = base[8] - 0.18 * a - 0.25 * Math.max(0, -Math.cos(ph));
        p[0] = base[0] + 0.04 * Math.sin(ph * 2);
      }
    } else {
      const b = Math.sin(clock * 6.5 + T.id * 1.7);   // bounce on the balls of the feet
      p[5] += 0.07 * b; p[6] -= 0.06 * b; p[7] -= 0.06 * b; p[8] -= 0.09 * b; p[2] += 0.05 * b; p[4] += 0.05 * b; p[0] += 0.02 * b;
    }
    if (T.isGun()) { p[1] = PI / 2 + T.aim; p[2] = PI / 2 + T.aim; if (T.weapon === 'rifle') { p[3] = PI / 2 + T.aim - 0.45; p[4] = PI / 2 + T.aim; } p[9] = p[2]; }
    return p;
  }
  computeJoints() {
    const T = this, s = T.s, f = T.face * T.spinFace, p = T.pose, M = T.mv, d = M ? M.d : null;
    const Lt = 58 * s, Lua = 30 * s, Lfa = 30 * s, Lth = 38 * s, Lsh = 40 * s, hr = 15 * s;
    const dx = (a) => Math.sin(a) * f, dy = (a) => Math.cos(a);
    let kF = { x: dx(p[5]) * Lth, y: dy(p[5]) * Lth }, fF = { x: kF.x + dx(p[6]) * Lsh, y: kF.y + dy(p[6]) * Lsh };
    let kB = { x: dx(p[7]) * Lth, y: dy(p[7]) * Lth }, fB = { x: kB.x + dx(p[8]) * Lsh, y: kB.y + dy(p[8]) * Lsh };
    let mode, drop;
    if (d && d.lie) { mode = 'lie'; drop = kfInterp(d.hip, M.t, M) * s; }
    else if (T.onGround && !T.held) {
      mode = 'ground';
      const pl = d && d.plant;
      drop = pl === 'f' ? fF.y : pl === 'b' ? fB.y : Math.max(fF.y, fB.y);
      if (fF.y > drop - 10 * s) [kF, fF] = ik2(fF.x, drop, Lth, Lsh, f);
      if (fB.y > drop - 10 * s) [kB, fB] = ik2(fB.x, drop, Lth, Lsh, f);
    } else { mode = 'air'; drop = (Lth + Lsh) * 0.9; }
    const hip = { x: T.x, y: T.y - drop };
    const neck = { x: hip.x + Math.sin(p[0]) * f * Lt, y: hip.y - Math.cos(p[0]) * Lt };
    const head = { x: neck.x + Math.sin(p[0]) * f * (hr + 4 * s), y: neck.y - Math.cos(p[0]) * (hr + 4 * s) };
    const sh = { x: lerp(neck.x, hip.x, 0.08), y: lerp(neck.y, hip.y, 0.08) };
    const eF = { x: sh.x + dx(p[1]) * Lua, y: sh.y + dy(p[1]) * Lua }, hF = { x: eF.x + dx(p[2]) * Lfa, y: eF.y + dy(p[2]) * Lfa };
    const eB = { x: sh.x + dx(p[3]) * Lua, y: sh.y + dy(p[3]) * Lua }, hB = { x: eB.x + dx(p[4]) * Lfa, y: eB.y + dy(p[4]) * Lfa };
    const J = { head, neck, hip, eF, hF, eB, hB, kF: { x: hip.x + kF.x, y: hip.y + kF.y }, fF: { x: hip.x + fF.x, y: hip.y + fF.y }, kB: { x: hip.x + kB.x, y: hip.y + kB.y }, fB: { x: hip.x + fB.x, y: hip.y + fB.y } };
    if (T.weapon === 'sword') { const L = (T.heavyBlade ? 104 : 84) * s; J.sw = { x: hF.x + Math.sin(p[9]) * f * L, y: hF.y + Math.cos(p[9]) * L }; }
    else J.sw = { x: hF.x, y: hF.y };
    if (T.rot) {
      const c = mode === 'lie' ? { x: hip.x, y: hip.y } : { x: (hip.x + neck.x) / 2, y: (hip.y + neck.y) / 2 }, cs = Math.cos(T.rot), sn = Math.sin(T.rot);
      for (const k in J) { const q = J[k], x = q.x - c.x, y = q.y - c.y; J[k] = { x: c.x + x * cs - y * sn, y: c.y + x * sn + y * cs }; }
    }
    // smooth the switch between standing / flying / lying so the body never pops
    if (T.prevMode && mode !== T.prevMode && T.prevHip) { T.vo.x += T.prevHip.x - J.hip.x - (T.x - T.prevX); T.vo.y += T.prevHip.y - J.hip.y - (T.y - T.prevY); }
    T.prevMode = mode; T.prevHip = { x: J.hip.x, y: J.hip.y }; T.prevX = T.x; T.prevY = T.y;
    if (Math.abs(T.vo.x) + Math.abs(T.vo.y) > 0.3) for (const k in J) { J[k].x += T.vo.x; J[k].y += T.vo.y; }
    J.hr = hr;
    T.J = J;
  }
  recordTrails() {
    for (const k of TRAIL_KEYS) { const a = this.tr[k], q = this.J[k]; a.push({ x: q.x, y: q.y }); if (a.length > 7) a.shift(); }
    const J = this.J; this.jh = this.jh || []; this.jh.push({ eF: J.eF, hF: J.hF, eB: J.eB, hB: J.hB, kF: J.kF, fF: J.fF, kB: J.kB, fB: J.fB }); if (this.jh.length > 6) this.jh.shift();
    this.eyeTr = this.eyeTr || []; const hr = J.hr, fc = this.face * this.spinFace; this.eyeTr.push({ x: J.head.x + fc * hr * 0.42, y: J.head.y - hr * 0.12 }); if (this.eyeTr.length > 9) this.eyeTr.shift();
  }
}
function nameOf(f) { return f ? f.name : 'AIRSTRIKE'; }
function dmgMods(D) { return (S.game.damage ?? 1) * (round.sudden ? (S.game.suddenDeathDamage ?? 2) : 1) * (D.giant ? 0.6 : 1); }

// ---------- hit resolution: miss / parry / block / clean hit ----------
function resolveHit(A, D, h, lp) {
  const dir = A.face;
  if (D.evading(h.h)) {
    A.brain.onOutcome('miss'); D.brain.onEvaded(A);
    floatText(D.x, D.y - 215 * D.s, pick(['DODGE!', 'MISS!', 'EVADE!']), '#9fe3ff', 22, 0.6);
    return 'miss';
  }
  const g = D.guardState(), low = h.h === 'low';
  if (g === 'parry' && !low) {
    const hp = D.J.hF;
    sparks(hp.x, hp.y, -dir, 14, ['#ffffff', '#ffe27a', '#9fe3ff'], 1.2); ring(hp.x, hp.y, 40, '#ffffff', 0.25, 4);
    D.sound('ting'); floatText(D.x, D.y - 220 * D.s, 'PARRY!', '#ffe27a', 30, 0.8); bubble(D, pick(['HA!', 'NICE TRY!', 'NOPE!']), '😏', { pri: 2 }); hitFlash(hp.x, hp.y, 0.6); shake(5);
    A.mv = null; A.play('staggered', { keepFace: true }); A.brain.onOutcome('parried');
    D.brain.onParried(A);
    timeCtl.stop = Math.max(timeCtl.stop, 0.13); camPunch(0.08); duel.calm = Math.max(duel.calm, 0.3);
    return 'parry';
  }
  if ((g === 'block' && !low) || (g === 'blockL' && low)) {
    const bp = D.J.hF, cx = lerp(bp.x, lp.x, 0.5), cy = lerp(bp.y, lp.y, 0.5);
    if (h.sword && D.weapon === 'sword') {
      sparks(cx, cy, -dir, 26, ['#ffffff', '#ffe27a', '#bfe9ff'], 1.3); ring(cx, cy, 50, '#ffe27a', 0.25, 5);
      sfx('clash', cx); sfx('cring', cx, 0.6); floatText(cx, cy - 40, 'CLASH!', '#ffe27a', 30, 0.7); camPunch(0.06); hitFlash(cx, cy, 0.9); shake(9);
    } else {
      sparks(cx, cy, -dir, 9, ['#7fd4ff', '#ffffff']); sfx(h.sword ? 'clash' : 'clang', cx, h.sword ? 0.7 : 1);
      floatText(D.x, D.y - 215 * D.s, 'BLOCK!', '#7fd4ff', 24, 0.6); hitFlash(cx, cy, 0.45, '#e8f4ff'); shake(6);
      if (Math.random() < 0.18) bubble(D, pick(['NOPE!', 'BLOCKED!', 'WEAK!']), pick(['🛡️', '😏']));
    }
    const chip = Math.round(h.dmg * 0.12 * A.dmgMul() * DMG_SCALE * dmgMods(D));
    D.hp = Math.max(1, D.hp - chip);
    D.vx = dir * (Math.min(h.kx || 200, 700) * 0.45 + 140) * (D.giant ? 0.3 : 1); A.vx = -dir * 90;
    timeCtl.stop = Math.max(timeCtl.stop, 0.1); duel.calm = Math.max(duel.calm, 0.22);
    dirt(D.x, D.y, -dir, 5); dust(D.x, D.y, 3, dir);
    A.brain.onOutcome('block'); D.brain.onBlocked(A);
    return 'block';
  }
  dealDamage(A, D, h, D.x - dir * 8 * D.s, clamp(lp.y, D.y - 180 * D.s, D.y - 20 * D.s));
  return 'hit';
}
function dealDamage(A, D, h, px, py, o = {}) {
  if (!D.alive) return;
  const dir = o.dir ?? (A ? A.face : 1);
  const dmg = Math.max(1, Math.round(h.dmg * (A ? A.dmgMul() : 1) * DMG_SCALE * dmgMods(D)));
  D.hp -= dmg; D.flash = 0.08;
  const heavy = h.type !== 'light' && h.type !== 'gut';
  const big = h.type === 'blast' || h.type === 'launch';
  px = px ?? D.x - dir * 8 * D.s; py = py ?? D.cy();
  const cols = h.gun ? ['#ffd34d', '#fff'] : h.sword ? ['#bfe9ff', '#fff', '#7fd4ff'] : ['#fff', '#ffd84a', TEAMS[A ? A.team : 0].accent];
  sparks(px, py, dir, heavy ? 16 : 7, cols, heavy ? 1.2 : 0.8);
  hitFlash(px, py, big ? 1.5 : heavy ? 1 : 0.55);
  if (heavy) ring(px, py, big ? 80 : 50, '#ffffff', 0.25, big ? 6 : 4);
  floatText(px + rand(-14, 14), py - 30, dmg, dmg >= 14 ? '#ffd84a' : '#ffffff', dmg >= 14 ? 34 : 26, 0.7);
  const kicky = h.limb && (h.limb[0] === 'f' || h.limb === 'kB');
  const bodyHit = h.type === 'gut' || h.h === 'low' || py > D.y - 125 * D.s;
  sfx(h.sword ? 'slash' : h.gun ? 'punchB' : kicky ? 'kickhit' : bodyHit ? 'punchB' : 'punch', D.x, h.gun ? 0.6 : 1);
  if (big) { sfx('impact', D.x, 0.8); sfx('heavy', D.x, 0.7); }
  if (Math.random() < (heavy ? 0.7 : 0.25)) D.sound('grunt');
  shake(heavy ? 10 + dmg * 0.4 : 4 + dmg * 0.3);
  timeCtl.stop = Math.max(timeCtl.stop, A && A.combo >= 1 && !heavy ? 0.1 : big ? 0.2 : heavy ? 0.17 : 0.13);
  duel.calm = Math.max(duel.calm, big ? 0.7 : heavy ? 0.45 : 0.25);
  camPunch(big ? 0.16 : heavy ? 0.09 : 0.035);
  if (big) { impactFrame(px, py); focusLines(px, py, 0.3); }
  if (A) { A.combo++; A.comboT = 1.3; A.comboPop = 0.25; if (A.combo === 5) sfx('crowd', null, 0.6); A.brain.onOutcome('hit', h); }
  if (D.hp <= 0 && round.state === 'fight') { finisher(A, D, h, dir); return; }
  if (A && A.combo === 3) bubble(A, pick(['TOO SLOW!', 'TOO EASY!', 'HAHA!', 'KEEP UP!']), pick(['😤', '😎', '🔥']), { pri: 2 });
  else if (!D.lowSaid && D.hp < D.maxHp * 0.3) { D.lowSaid = true; bubble(D, pick(['NOT YET...', 'STILL HERE!', 'HELP ME!']), pick(['😰', '💦']), { pri: 3, dur: 1.7 }); }
  else if (Math.random() < (heavy ? 0.55 : 0.15)) bubble(D, pick(['ARGH!', 'OOF!', 'OUCH!', 'UGH!']), pick(['😵', '💢', '🤕', '😵']), { pri: heavy ? 2 : 1 });
  if (D.hp <= 0) D.hp = 1;
  if (o.noReact) return;
  D.brain.onHurt();
  const air = (name, vx, vy) => { D.play(name, { keepFace: true }); D.vx = dir * vx; D.vy = vy; D.onGround = false; D.y -= 2; };
  D.mv = null; D.face = -dir;
  if (D.giant && h.type !== 'light' && h.type !== 'gut') { D.play('hurtH', { keepFace: true }); D.vx = dir * 260; return; }
  switch (h.type) {
    case 'light': D.play('hurtL', { keepFace: true }); D.vx = dir * (h.kx || 160); break;
    case 'gut': D.play('hurtG', { keepFace: true }); D.vx = dir * (h.kx || 220); break;
    case 'heavy': D.play('hurtH', { keepFace: true }); D.vx = dir * (h.kx || 480); if (h.ky) { D.vy = h.ky; D.onGround = false; D.y -= 2; } break;
    case 'launch': air('launched', h.kx || 150, h.ky || -1200); break;
    case 'blast': air('launched', h.kx || 1000, h.ky || -420); camWhip(D); speedStreaks(dir, 0.3); slowmo(0.22, 0.7); break;   // slow-mo while the victim flies, then snap back
    case 'knock': air('knocked', h.kx || 200, h.ky || -500); break;
  }
}
function wallBounce(T, side, vx) {
  T.vx = -vx * 0.45; T.vy = Math.min(T.vy, -560); T.onGround = false; T.wallT = 0.6;
  const wx = side < 0 ? WALL_L : WALL_R;
  ring(wx, T.cy(), 90, '#ffffff', 0.3, 6); sparks(wx, T.cy(), -side, 14, ['#fff', '#9fc1ff']); dust(wx, T.cy(), 8, side);
  sfx('wall', wx); shake(12); camPunch(0.12); timeCtl.stop = Math.max(timeCtl.stop, 0.13);
  floatText(T.x, T.y - 230 * T.s, 'WALL BOUNCE!', '#ffd84a', 30, 0.9);
  T.mv = null; T.play('launched', { keepFace: true });
  const e = T.foe; if (e) e.brain.onWallBounce(T);
}
// the KO: impact frame, freeze, long slow motion, orbiting camera, ragdoll flies
function finisher(A, D, h, dir) {
  D.hp = 0; D.alive = false; D.mv = null;
  const rd = makeRagdoll(D, dir * Math.max(950, (h.kx || 600) * 1.25), Math.min(h.ky || -400, -500) - 450);
  ragdolls.push(rd);
  timeCtl.stop = 0.2; impactFrame(D.x, D.cy(), 0.1, true);
  slowmo(0.13, 2.4, true);
  camKO(D.x, D.cy(), rd);
  focusLines(D.x, D.cy(), 1.4);
  sparks(D.x, D.cy(), dir, 24, ['#fff', '#ffd84a', TEAMS[D.team].accent], 1.4); ring(D.x, D.cy(), 130, '#ffffff', 0.4, 8);
  sfx('impact'); sfx('ko', D.x); sfx('crowd'); if (A) A.sound('kiai');
  D.rd = rd; bubble(D, '', '💀', { force: true, pri: 9, dur: 2.4, dead: true });
  const W = A || D.foe; callout('K.O.!', W ? W.name + ' FINISHES IT!' : 'K.O.!', '#ff4545', 200, 2.4);
  if (A) A.kills++;
  addFeed([[nameOf(A), A ? TEAMS[A.team].ui : '#ffd84a'], [' K.O. ', '#ffd84a'], [nameOf(D), TEAMS[D.team].ui]], 6);
  shake(18);
  endSetPiece();
}
function separate() {
  const live = fighters.filter((f) => f.alive && !f.held);
  if (live.length < 2) return;
  const [a, b] = live;
  if ((a.mv && a.mv.d.pass) || (b.mv && b.mv.d.pass)) return;
  if (Math.abs(a.y - b.y) > 70 * Math.max(a.s, b.s)) return;
  const dx = b.x - a.x, min = 24 * (a.s + b.s);
  if (Math.abs(dx) < min) { const push = (min - Math.abs(dx)) * 0.5 * (dx >= 0 ? 1 : -1); a.x -= push; b.x += push; }
}

// ============================================================ brain (AI) + duel director (set pieces)
// combos: r = distance range (in fighter-size units) where the first move connects
const COMBOS_FIST = [
  { r: [50, 100], m: ['jab', 'cross'], w: 2 },
  { r: [50, 100], m: ['jab', 'cross', 'hook', 'cross'], w: 2, rate: 1.15 },   // bursty flurry
  { r: [45, 95], m: ['jab', 'cross', 'uppercut'], w: 2, rate: 1.1 },
  { r: [55, 100], m: ['jab', 'cross', 'roundhouse'], w: 1.5, rate: 1.1 },
  { r: [50, 100], m: ['jab', 'cross', 'hook'], w: 3 },
  { r: [50, 95], m: ['jab', 'cross', 'roundhouse'], w: 2 },
  { r: [40, 85], m: ['hook', 'uppercut'], w: 2.2 },
  { r: [30, 75], m: ['elbow', 'knee'], w: 1.6 },
  { r: [60, 112], m: ['fkick'], w: 1.3 },
  { r: [55, 100], m: ['jab', 'fkick'], w: 1.2 },
  { r: [75, 118], m: ['roundhouse'], w: 1.4 },
  { r: [70, 120], m: ['spinback'], w: 1.4 },
  { r: [60, 110], m: ['sweep'], w: 1.2 },
  { r: [65, 105], m: ['palm'], w: 1 },
  { r: [50, 95], m: ['jab', 'sweep'], w: 0.8 }
];
const COMBOS_SUPER = [
  { r: [50, 95], m: ['jab', 'cross', 'hook', 'uppercut'], w: 3 },
  { r: [50, 100], m: ['flurry'], w: 2.5 },
  { r: [70, 120], m: ['spinback'], w: 2 },
  { r: [45, 90], m: ['flipkick'], w: 1.5 },
  { r: [60, 110], m: ['sweep', 'roundhouse'], w: 1.2 }
];
const COMBOS_SWORD = [
  { r: [70, 140], m: ['swKesa'], w: 2 },
  { r: [70, 135], m: ['swKesa', 'swRise'], w: 2.5 },
  { r: [90, 155], m: ['swThrust'], w: 1.6 },
  { r: [70, 135], m: ['swSpin'], w: 1.4 },
  { r: [40, 80], m: ['fkick', 'swKesa'], w: 1 }
];
class Brain {
  constructor(f) { this.f = f; this.think = rand(0.3, 0.8); this.queue = []; this.chainOK = false; this.pend = 0; this.pendOn = false; this.last = ''; this.rep = 0; this.noReactT = 0; this.follow = 0; }
  // the enemy just started a strike: pick a defence timed to the moment it lands
  incoming(A, d) {
    const f = this.f;
    if (f.scripted || duel.sp || round.state !== 'fight' || this.noReactT > 0 || !f.onGround) return;
    const m = f.mv;
    if (m && !(m.d.foot || m.d.guardMove || m.d.evadeMove)) return;   // attacking or hurt: too late
    const h = d.hits[0];
    const th = Math.max(0.04, h.t / (A.speed() * ((A.mv && A.mv.o.rate) || 1))) * f.speed();
    const dist = Math.abs(A.x - f.x), flying = h.win != null;
    if (!flying && dist > (h.reach + 70) * A.s + 30) return;
    const r = this.chooseReaction(h, dist);
    if (r === 'hit') return;
    f.mv = null;
    if (r === 'block' || r === 'blockL') f.play('block', { th, low: r === 'blockL' });
    else if (r === 'parry' || r === 'slip' || r === 'sway') f.play(r, { th });
    else f.play(r);
  }
  chooseReaction(h, dist) {
    const f = this.f, low = h.h === 'low', flying = h.win != null;
    const w = { hit: 0.34, block: 0.3, parry: 0.13, evade: 0.23 };
    if (f.mv && f.mv.d.guardMove) w.block += 0.35;
    if (h.type === 'blast' || h.type === 'launch') w.evade += 0.1;
    if (f.hp < f.maxHp * 0.25) w.block += 0.1;
    if (low) w.parry = 0;
    if (this.rep >= 2 && w[this.last]) w[this.last] *= 0.25;
    let tot = 0; for (const k in w) tot += w[k];
    let r = Math.random() * tot, c = 'hit';
    for (const k in w) { r -= w[k]; if (r <= 0) { c = k; break; } }
    if (c === this.last) this.rep++; else { this.last = c; this.rep = 1; }
    if (c === 'evade') {
      if (low) return 'hop';
      if (flying) return dist > 150 && Math.random() < 0.5 ? 'slideUnder' : pick(['backflip', 'slip']);
      if (h.h === 'high') return pick(['slip', 'slip', 'sway', 'backflip']);
      return pick(['sway', 'backflip']);
    }
    if (c === 'block') return low ? 'blockL' : 'block';
    return c;
  }
  incomingShot(A) {
    const f = this.f;
    if (f.scripted || f.busy() || !f.onGround || duel.sp) return;
    const r = Math.random();
    if (r < 0.3) f.play('roll'); else if (r < 0.45) f.play('backflip');
  }
  onOutcome(k, h) {
    if (k === 'hit') { this.chainOK = true; if (h && h.type === 'launch') this.queue = ['airkick']; }
    else if (k === 'block') this.chainOK = Math.random() < 0.5;
    else { this.queue = []; this.chainOK = false; }
  }
  onWhiff() {}
  onBlocked(A) { if (Math.random() < 0.55) { this.counterIn(rand(0, 0.1)); A.brain.queue = []; } }
  onParried(A) { this.counterIn(0.02); }
  onEvaded(A) { if (Math.random() < 0.65) { this.counterIn(rand(0.02, 0.12)); A.brain.queue = []; } }
  onHurt() { this.queue = []; this.pendOn = false; this.follow = 0; }
  onWallBounce(T) { if (!this.f.scripted) { this.queue = []; this.follow = 0.12; } }
  counterIn(t) { this.pendOn = true; this.pend = t + 0.2; }   // let the block/dodge read before the counter
  update(dt) {
    const f = this.f, e = f.foe;
    f.walkV = 0;
    this.noReactT -= dt;
    if (!e || f.scripted || round.state !== 'fight' || f.held) return;
    const M = f.mv;
    if (M && this.queue.length && this.chainOK && ((M.d.cancel != null && M.t >= M.d.cancel) || (M.d.cancel == null && M.t >= (M.d.dur || 9) - 0.04))) { this.next(); return; }
    if (this.follow > 0) {
      this.follow -= dt;
      if (this.follow <= 0 && (!M || M.d.foot || M.t > 0.25)) { const u = Math.abs(e.x - f.x) / f.s; f.mv = null; f.play(u > 170 ? 'flyknee' : u > 95 ? 'palm' : 'uppercut'); duel.lastAtk = f.team; }
      return;
    }
    const canAct = !M || M.d.foot || ((M.d.guardMove || M.d.evadeMove) && M.t >= (M.d.actAfter ?? 9));
    if (!canAct) return;
    if (this.pendOn) { this.pend -= dt; if (this.pend <= 0) { this.pendOn = false; if (f.onGround) { f.mv = null; this.attack(true); } } return; }
    if (M) return;
    this.decide(dt, e);
  }
  next() {
    const f = this.f, e = f.foe, nx = this.queue.shift(); if (!e) return;
    const u = Math.abs(e.x - f.x) / f.s;
    if (nx === 'airkick') { if (!e.onGround && u < 280) { f.mv = null; f.play('airkick'); } else this.queue = []; return; }
    if (e.invuln > 0) { this.queue = []; return; }
    f.mv = null; f.play(nx, { rate: this.rate || 1 });
  }
  decide(dt, e) {
    const f = this.f, s = f.s, dx = e.x - f.x, dist = Math.abs(dx), u = dist / s, dy = e.y - f.y;
    f.face = dx >= 0 ? 1 : -1;
    this.think -= dt;
    const want = f.weapon === 'sword' ? 150 : f.isGun() ? 320 : 125;
    if (e.invuln > 0 || (e.mv && e.mv.d.lie)) {      // enemy is down: give space, taunt
      if (u < want) f.walkV = -f.face * 220;
      else if (this.think <= 0) { this.think = rand(0.6, 1.2); if (Math.random() < 0.4) bodyTaunt(f); }
      return;
    }
    if (f.weapon !== 'sword' && !f.isGun() && u > want + 90 && !e.busy() && !f.busy() && f.onGround && clock > (f.tauntCD || 4) && Math.random() < dt * 0.35) { f.tauntCD = clock + rand(7, 11); bodyTaunt(f); }
    if (dy < -150) {                                  // enemy on a platform above
      if (dist < 140 && f.onGround && this.think <= 0) { this.think = 0.6; f.play(Math.random() < 0.5 ? 'jumpUp' : 'flipkick'); }
      else f.walkV = f.face * 320;
      return;
    }
    if (dy > 150 && f.plat) {                         // I'm up on a platform: dive kick or drop down
      if (this.think <= 0) { this.think = 0.5; if (dist < 520 && dist > 100) f.play('flyside'); else { f.dropT = 0.3; f.y += 2; f.vy = 60; f.onGround = false; } }
      return;
    }
    if (f.isGun()) return this.gunThink(u, e);
    if (duel.calm > 0 && this.think <= 0) this.think = duel.calm + rand(0.05, 0.25);   // reaction beat: nobody starts a new attack yet
    if (this.think > 0) {                             // footwork: keep distance, bounce, shuffle in and out
      if (u > want + 220) f.walkV = f.face * 560;
      else if (u > want + 25) f.walkV = f.face * 230;
      else if (u < want - 35) f.walkV = -f.face * 210;
      else f.walkV = Math.sin(clock * 2.2 + f.id * 1.7) * 80;
      return;
    }
    this.think = rand(0.3, 0.75) / (f.superT > 0 ? 1.4 : 1);
    if (e.busy() && !(e.mv.d.foot || e.mv.d.guardMove || e.mv.d.evadeMove)) return;   // don't start a trade
    if (duel.lastAtk === f.team && Math.random() < 0.4) { if (Math.random() < 0.5) f.play(u < 100 ? 'stepBack' : 'stepIn'); return; }
    const cornered = (f.x < 140 && f.face > 0) || (f.x > W - 140 && f.face < 0);
    if (cornered && u < 150 && Math.random() < 0.35) { f.play('jumpOver'); return; }
    const r = Math.random();
    if (u > 430) { if (r < 0.2) f.play('stepIn'); return; }
    if (u > 170) {
      if (r < 0.45) { f.play(f.weapon === 'sword' ? 'stepIn' : u < 300 ? pick(['flyknee', 'flyside']) : 'flyside'); duel.lastAtk = f.team; }
      else if (r < 0.6 && f.superT > 0 && u < 230) { f.play('tornado'); duel.lastAtk = f.team; }
      else this.think = 0.12;
      return;
    }
    if (r < 0.2) { f.play(pick(['stepIn', 'stepBack', 'stepIn'])); return; }   // feints
    this.attack(false);
  }
  attack(counter) {
    const f = this.f, e = f.foe; if (!e) return;
    const u = Math.abs(e.x - f.x) / f.s;
    let list = f.weapon === 'sword' ? COMBOS_SWORD : f.superT > 0 ? COMBOS_SUPER.concat(COMBOS_FIST) : COMBOS_FIST;
    if (f.isGun()) list = [{ r: [0, 120], m: ['fkick', 'shootClose'], w: 1 }, { r: [0, 999], m: ['shoot'], w: 1 }];
    let c = list.filter((x) => u >= x.r[0] - (counter ? 15 : 0) && u <= x.r[1] + (counter ? 10 : 0));
    if (!c.length) { if (!counter || u > 100) f.play(u > 100 ? 'stepIn' : 'stepBack'); return; }
    if (counter) c = c.map((x) => ({ ...x, w: x.w * (x.m.length === 1 ? 1.6 : 1) }));
    const ch = wpick(c);
    this.queue = ch.m.slice(1); this.chainOK = true; this.rate = ch.rate || 1;
    f.play(ch.m[0], { rate: this.rate }); duel.lastAtk = f.team;
    if (counter) floatText(f.x, f.y - 235 * f.s, 'COUNTER!', '#ffd84a', 26, 0.7);
  }
  gunThink(u, e) {
    const f = this.f;
    if (f.mag <= 0 && f.ammo > 0) { f.play('reload'); floatText(f.x, f.y - 220 * f.s, 'RELOAD', '#9fc1ff', 22, 0.7); return; }
    if (this.think > 0) { f.walkV = u < 160 ? -f.face * 260 : u > 620 ? f.face * 300 : 0; return; }
    this.think = rand(0.35, 0.75);
    if (u < 110) { this.queue = ['shootClose']; this.chainOK = true; f.play(pick(['fkick', 'roundhouse', 'elbow'])); duel.lastAtk = f.team; return; }
    if (Math.random() < 0.18) { this.queue = ['shootClose']; this.chainOK = true; f.play('roll'); return; }
    f.play('shoot'); duel.lastAtk = f.team;
  }
}

// ---------- duel director: choreographed set pieces ----------
const duel = { spT: 5, sp: null, lastAtk: -1, want: null, calm: 0, crossT: 0, recent: [] };
const once = (sp, key, t) => { if (sp.t >= t && !sp.st[key]) { sp.st[key] = sp.t; return true; } return false; };
function clangAir(att, def, kind) {
  const cx = (att.J.fF.x + def.J.hF.x) / 2, cy = (att.J.fF.y + def.J.hF.y) / 2;
  sparks(cx, cy, att.face, 14, ['#fff', '#7fd4ff', '#ffe27a'], 1.1); ring(cx, cy, 50, '#fff', 0.25, 4);
  sfx(kind, cx); camPunch(0.07); timeCtl.stop = Math.max(timeCtl.stop, 0.05);
  floatText(cx, cy - 40, 'BLOCK!', '#7fd4ff', 24, 0.6);
}
const SP = {
  clash: {
    start(sp, a, b) { sp.end = 2.8; a.play('dashIn', { noReact: true }); b.play('dashIn', { noReact: true }); b.sound('kiai2'); },
    update(sp, dt, a, b) {
      const s = Math.max(a.s, b.s), dist = Math.abs(a.x - b.x);
      if (!sp.st.lock && (dist < 56 * s || sp.t > 0.5)) {
        sp.st.lock = sp.t; const mx = (a.x + b.x) / 2;
        a.x = mx - a.face * 27 * a.s; b.x = mx - b.face * 27 * b.s; a.vx = b.vx = 0;
        a.play('lockHold', { dur: 1.15, keepFace: true, noReact: true }); b.play('lockHold', { dur: 1.15, keepFace: true, noReact: true });
        const cx = mx, cy = a.y - 118 * a.s, swords = a.weapon === 'sword' && b.weapon === 'sword';
        sparks(cx, cy, 1, 30, ['#fff', '#ffe27a', '#bfe9ff'], 1.4); ring(cx, cy, 90, '#ffe27a', 0.35, 7);
        sfx(swords ? 'clash' : 'impact', cx); sfx('clang', cx); shake(12); camPunch(0.2); camTilt(pick([-1, 1]) * 0.09, 1.3);
        impactFrame(cx, cy, 0.07, true); focusLines(cx, cy, 1.2); timeCtl.stop = 0.1;
        floatText(cx, cy - 70, swords ? 'BLADE LOCK!' : 'CLASH!', '#ffe27a', 40, 1.1);
        sp.st.cx = cx; sp.st.cy = cy; sp.st.sk = 0;
      }
      if (sp.st.lock != null) {
        const lt = sp.t - sp.st.lock;
        if (lt < 1.15) {
          sp.st.sk -= dt;
          if (sp.st.sk <= 0) { sp.st.sk = 0.09; sparks(sp.st.cx, sp.st.cy + rand(-8, 8), pick([-1, 1]), 4, ['#fff', '#ffe27a'], 0.6); sfx('lock', sp.st.cx, 0.8); }
        } else if (!sp.st.push) {
          sp.st.push = 1;
          a.play('skid', { keepFace: true, noReact: true }); b.play('skid', { keepFace: true, noReact: true });
          a.vx = -a.face * 900; b.vx = -b.face * 900;
          ring(sp.st.cx, sp.st.cy, 140, '#ffffff', 0.4, 8); sparks(sp.st.cx, sp.st.cy, 1, 20, ['#fff', '#ffe27a'], 1.3);
          sfx('clash', sp.st.cx); shake(14); camPunch(0.1); dust(a.x, a.y, 8, -a.face); dust(b.x, b.y, 8, -b.face);
          sp.end = sp.t + 0.55;
        }
      }
    }
  },
  aerial: {
    start(sp, a, b) { sp.end = 2.6; a.play('land', { noReact: true }); b.play('land', { noReact: true }); },
    update(sp, dt, a, b) {
      if (once(sp, 'jump', 0.12)) {
        const d = Math.abs(a.x - b.x), v = Math.max(0, d - 62 * a.s) / 2 / 0.4;
        for (const f of [a, b]) { f.mv = null; f.vx = f.face * v; f.vy = -1450; f.onGround = false; f.y -= 2; f.play('airIdle', { keepFace: true, noReact: true }); f.sound('jump'); dust(f.x, f.y, 6); }
        a.sound('kiai');
      }
      if (once(sp, 'hang', 0.5)) { for (const f of [a, b]) { f.vx = 0; f.vy *= 0.15; f.gMul = 0.1; } camTilt(0.07, 1.3); focusLines((a.x + b.x) / 2, a.cy(), 1.0); }
      if (once(sp, 'k1', 0.52)) { a.play('airAtk', { keepFace: true, noReact: true }); b.play('airGuard', { keepFace: true, noReact: true }); }
      if (once(sp, 'c1', 0.62)) clangAir(a, b, 'clang');
      if (once(sp, 'k2', 0.74)) { b.play('airAtk2', { keepFace: true, noReact: true }); a.play('airGuard', { keepFace: true, noReact: true }); }
      if (once(sp, 'c2', 0.84)) clangAir(b, a, 'clang');
      if (once(sp, 'k3', 0.96)) { a.play('airAtk', { keepFace: true, noReact: true }); }
      if (once(sp, 'hit', 1.06)) {
        for (const f of [a, b]) f.gMul = 1;
        dealDamage(a, b, { dmg: 11, type: 'blast', kx: 750, ky: 250, limb: 'fF' }, b.x - a.face * 8 * b.s, b.cy());
      }
      if (sp.st.hit && sp.t > 1.4 && a.onGround) return false;
    }
  },
  slide: {
    start(sp, a, b) { sp.end = 1.8; a.play('flyside', { noReact: true }); },
    update(sp, dt, a, b) {
      if (once(sp, 'sl', 0.13)) { b.play('slideUnder', { noReact: true }); slowmo(0.4, 0.35); camTilt(-0.06 * b.face, 0.8); focusLines(b.x, b.y - 40, 0.4); }
      if (sp.t > 1.0 && a.onGround && b.onGround) { b.brain.counterIn(0.05); return false; }
    }
  },
  throw: {
    start(sp, a, b) { sp.end = 2.2; a.play('grab', { noReact: true }); },
    update(sp, dt, a, b) {
      if (once(sp, 'catch', 0.12)) {
        if (Math.abs(a.x - b.x) > 115 * a.s) return false;   // missed the grab
        b.mv = null; b.play('grabbed', { keepFace: true, noReact: true }); b.face = -a.face; b.held = true; b.vx = b.vy = 0;
        b.sound('grunt'); floatText(b.x, b.y - 220 * b.s, 'GRAB!', '#ffd84a', 28, 0.7);
      }
      if (sp.st.catch != null && sp.t < 0.45) { b.x = lerp(b.x, a.x + a.face * 34 * a.s, Math.min(1, dt * 14)); b.y = a.y; }
      if (once(sp, 'throw', 0.45)) { a.play('throw', { keepFace: true, noReact: true }); b.play('thrown', { keepFace: true, noReact: true }); camTilt(a.face * 0.08, 1); focusLines(a.x, a.y - 120 * a.s, 0.6); }
      if (sp.st.throw != null && !sp.st.rel) {
        const u = clamp((sp.t - 0.52) / 0.34, 0, 1), th = EASE.io(u) * PI;
        b.x = a.x + a.face * Math.cos(th) * 40 * a.s; b.y = a.y - Math.sin(th) * 120 * a.s;
        b.rot = b.face * -th * 1.15;
        if (u >= 1) {
          sp.st.rel = sp.t; b.held = false; b.x = a.x - a.face * 46 * a.s; b.y = Math.min(b.y, a.y - 10); b.vx = -a.face * 300; b.vy = 700;
          b.mv = null; b.play('knocked', { keepFace: true });
          dealDamage(a, b, { dmg: 14, type: 'knock', limb: 'hF' }, b.x, a.y - 30, { noReact: true, dir: -a.face });
          shake(16); dust(b.x, a.y, 14); ring(b.x, a.y - 10, 120, '#fff', 0.35, 7); sfx('thud', b.x); sfx('impact', b.x, 0.8); camPunch(0.15); impactFrame(b.x, a.y - 40, 0.07);
          floatText(b.x, a.y - 200 * b.s, 'THROW!', '#ffd84a', 36, 1);
        }
      }
      if (sp.st.rel && sp.t > sp.st.rel + 0.5) { a.play('land'); return false; }
    }
  },
  wall: {
    start(sp, a, b) { sp.end = 0.05; b.brain.noReactT = 0.7; a.scripted = false; a.play('spinback'); duel.lastAtk = a.team; },
    update() { return false; }
  },
  iai: {
    start(sp, a, b) { sp.end = 2.6; a.play('iaiReady', { noReact: true }); b.brain.noReactT = 2.5; focusLines(a.x, a.cy(), 0.6); camTilt(-a.face * 0.06, 1.2); },
    update(sp, dt, a, b) {
      if (once(sp, 'go', 0.55)) {
        sp.st.x0 = a.x; sp.st.tx = clamp(b.x + a.face * 110 * a.s, WALL_L + 40, WALL_R - 40); a.held = true;
        b.mv = null; b.play('stunned', { keepFace: true, noReact: true }); b.vx = 0;
        a.play('iaiCut', { keepFace: true, noReact: true }); speedStreaks(a.face, 0.4); sfx('wsh3', a.x); timeCtl.stop = 0.05;
      }
      if (sp.st.go != null && sp.st.arr == null) {
        const u = clamp((sp.t - sp.st.go) / 0.09, 0, 1); const px = a.x; a.x = lerp(sp.st.x0, sp.st.tx, u);
        addPart({ k: 'dash', x1: px, x2: a.x, y: a.y - 110 * a.s, life: 0.5, max: 0.5, s: a.s });
        if (u >= 1) { sp.st.arr = sp.t; a.held = false; a.vx = 0; slowmo(0.3, 0.6, true); }
      }
      if (sp.st.arr != null && once(sp, 'cut', sp.st.arr + 0.35)) {
        slashMark(b.x, b.cy(), -0.6 * a.face, 300); sfx('slash', b.x); sfx('iai', b.x, 0.7);
        floatText(b.x, b.y - 240 * b.s, 'IAIDO!', '#bfe9ff', 40, 1.2);
        a.play('sheath', { keepFace: true, noReact: true });
        dealDamage(a, b, { dmg: 22, type: 'blast', kx: 650, ky: -650, sword: true, limb: 'sw' }, b.x, b.cy(), { dir: -a.face });
        impactFrame(b.x, b.cy(), 0.08, true);
      }
      if (sp.st.cut != null && sp.t > sp.st.cut + 1.0) return false;
    }
  }
};
function setPieceOptions(a, b) {
  const d = Math.abs(a.x - b.x), out = [];
  const [x, y] = Math.random() < 0.5 ? [a, b] : [b, a];
  const swords = a.weapon === 'sword' && b.weapon === 'sword';
  if (d > 90 && d < 460 && !a.isGun() && !b.isGun()) out.push({ name: 'clash', a: x, b: y, w: swords ? 3 : 1.5 });
  if (d > 150 && d < 520 && !a.giant && !b.giant) out.push({ name: 'aerial', a: x, b: y, w: 1.4 });
  if (d > 220 && d < 480 && !x.isGun()) out.push({ name: 'slide', a: x, b: y, w: 1 });
  if (d < 140 && !y.giant) out.push({ name: 'throw', a: x, b: y, w: 1.2 });
  if (x.weapon === 'sword' && d > 130 && d < 460 && (y.hp < y.maxHp * 0.45 || Math.random() < 0.4)) out.push({ name: 'iai', a: x, b: y, w: 2 });
  const backToWall = (y.x < 300 && x.x > y.x) || (y.x > W - 300 && x.x < y.x);
  if (backToWall && d < 170 && d > 55 && !x.isGun()) out.push({ name: 'wall', a: x, b: y, w: 2 });
  return out;
}
function startSetPiece(name, a, b) {
  const def = SP[name]; if (!def || !a || !b || !a.alive || !b.alive) return false;
  for (const f of [a, b]) { f.scripted = true; f.walkV = 0; f.brain.queue = []; f.brain.pendOn = false; f.mv = null; }
  a.face = b.x >= a.x ? 1 : -1; b.face = -a.face;
  duel.sp = { name, a, b, t: 0, end: 2, st: {} };
  def.start(duel.sp, a, b);
  return true;
}
function endSetPiece() {
  const sp = duel.sp; if (!sp) return; duel.sp = null;
  for (const f of [sp.a, sp.b]) { f.scripted = false; f.held = false; f.gMul = 1; f.hidden = false; }
  fx.tintT = 0; duel.calm = Math.max(duel.calm, 0.6);   // a breath after every set piece
}
function updateDirector(dt) {
  if (round.state !== 'fight') { if (duel.sp) endSetPiece(); return; }
  if (duel.sp) {
    const sp = duel.sp; sp.t += dt;
    if (!sp.a.alive || !sp.b.alive) { endSetPiece(); return; }
    if (SP[sp.name].update(sp, dt, sp.a, sp.b) === false || sp.t > sp.end) endSetPiece();
    return;
  }
  duel.spT -= dt; duel.calm = Math.max(0, duel.calm - dt);
  const live = fighters.filter((f) => f.alive);
  if (duel.want) { duel.want.t -= dt; if (duel.want.t <= 0) duel.want = null; }
  if (live.length < 2) return;
  const [a, b] = live;
  const ready = [a, b].every((f) => f.onGround && !f.busy() && f.invuln <= 0 && !f.held) && Math.abs(a.y - b.y) <= 20;
  if (duel.want && ready) {   // a big gift asked for a special set piece: it jumps the queue
    const h = heroOf(duel.want.team), o = h && h.foe;
    if (!h) duel.want = null;
    else if (o && o.alive && !h.isGun() && !o.isGun()) { const nm = duel.want.name; duel.want = null; if (startSetPiece(nm, h, o)) { duel.spT = Math.max(duel.spT, rand(6, 9)); duel.recent.push(nm); if (duel.recent.length > 3) duel.recent.shift(); return; } }
  }
  const R = heroOf(0), B = heroOf(1);
  if (R && B && R.alive && B.alive && R.x > B.x + 20) duel.crossT += dt; else duel.crossT = 0;
  if (ready && duel.crossT > 1.2 && duel.calm <= 0 && R && B) {
    const j = R.x > W / 2 ? R : B;          // whoever has room jumps back over to their home side
    j.face = j.foe.x >= j.x ? 1 : -1; j.play('jumpOver'); duel.crossT = -1.5; duel.calm = 0.6; return;
  }
  if (!ready || duel.spT > 0 || duel.calm > 0 || duel.crossT > 0) return;
  let opts = setPieceOptions2(a, b);
  const fresh = opts.filter((o) => !duel.recent.includes(o.name));   // no repeats of the last 3 set pieces
  if (fresh.length) opts = fresh; else opts = opts.filter((o) => o.name !== duel.recent[duel.recent.length - 1]);   // never the same one twice in a row
  if (!opts.length) { duel.spT = 2; return; }
  const c = wpick(opts);
  if (startSetPiece(c.name, c.a, c.b)) { duel.spT = rand(7, 11); duel.recent.push(c.name); if (duel.recent.length > 3) duel.recent.shift(); }
}

// ============================================================ signature set pieces (reference-style choreography)
const HOLD = (f, pose, dur, o = {}) => { f.mv = null; f.play('hold', { pose, dur, keepFace: true, noReact: true, ...o }); };
const PLAY = (f, name, o = {}) => { f.mv = null; f.play(name, { keepFace: true, noReact: true, noHit: true, ...o }); };
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.cy() + b.cy()) / 2 });
function contactFx(x, y, size, o = {}) {
  hitFlash(x, y, size); sparks(x, y, o.dir || 1, Math.round(8 + size * 8), ['#ffffff', '#ffe9b0', '#ffd27a'], 0.8 + size * 0.3);
  shake(o.shake ?? 8 + size * 8); camPunch(o.punch ?? 0.05 + size * 0.05);
  if (o.stop) timeCtl.stop = Math.max(timeCtl.stop, o.stop);
  if (o.snd) for (const k of [].concat(o.snd)) sfx(k, x, o.vol || 1);
}
const afterimg = (f, life = 0.4) => addPart({ k: 'after', J: JSON.parse(JSON.stringify(f.J)), team: f.team, s: f.s, life, max: life });
Object.assign(SP, {
  // (1) dash-in smears, then a high roundhouse blocked by a forearm
  dashBlock: {
    start(sp, a, b) { sp.end = 2.2; PLAY(a, 'dashIn', { rate: 1.3 }); a.sound('kiai2'); sp.st.dv = Math.max(820, (Math.abs(a.x - b.x) - 85 * a.s) / 0.28); },
    update(sp, dt, a, b) {
      const s = a.s, d = Math.abs(a.x - b.x);
      if (!sp.st.rh && sp.t < 0.3) a.vx = a.face * sp.st.dv;
      if (!sp.st.rh && sp.t > 0.04 && Math.random() < 0.6) afterimg(a, 0.18);
      if (!sp.st.rh && (d < 92 * s || sp.t > 0.6)) { sp.st.rh = sp.t; a.vx *= 0.3; PLAY(a, 'roundhouse', { rate: 1.15 }); HOLD(b, 'blockH', 0.75, { tin: 0.05 }); }
      if (sp.st.rh != null && once(sp, 'hit', sp.st.rh + 0.19)) {
        const p = b.J.hF; contactFx(p.x, p.y, 1.1, { snd: ['clang', 'heavy'], vol: 0.8, stop: 0.13, shake: 18, dir: a.face });
        floatText(p.x, p.y - 50, 'BLOCKED!', '#e8f4ff', 30, 0.8); b.vx = -b.face * 520; dirt(b.x, b.y, -b.face, 10); dustCloud(b.x, b.y, 5, 0.7, -b.face);
        camTilt(a.face * 0.06, 0.6);
      }
      if (sp.st.hit != null && sp.t > sp.st.hit + 0.6) return false;
    }
  },
  // (2) 3-frame leg sweep into a heavy punch on the falling opponent
  sweepSlam: {
    start(sp, a, b) { sp.end = 2.6; PLAY(a, 'sweep', { rate: 1.5 }); },
    update(sp, dt, a, b) {
      if (once(sp, 'up', 0.15)) {
        b.mv = null; b.play('launched', { keepFace: true, noReact: true }); b.vx = a.face * 60; b.vy = -720; b.onGround = false; b.y -= 2;
        contactFx(b.x, b.y - 12 * b.s, 0.7, { snd: 'kickhit', dir: a.face }); dirt(b.x, b.y, a.face, 12); b.sound('grunt');
      }
      if (once(sp, 'wind', 0.32)) { HOLD(a, 'upW', 0.14, { tin: 0.08 }); a.vx = a.face * 240; camFocus(() => (a.x + b.x) / 2, () => b.cy(), 2.7, 0.55); }
      if (once(sp, 'punch', 0.46)) { HOLD(a, 'punchDn', 0.5, { tin: 0.04 }); a.sound('kiai'); }
      if (once(sp, 'slam', 0.5)) {
        const px = b.x, py = b.cy();
        dealDamage(a, b, { dmg: 13, type: 'knock', limb: 'hF' }, px, py, { noReact: true, dir: a.face });
        b.vy = 1900; b.vx = a.face * 120;
        contactFx(px, py, 1.6, { snd: ['heavy', 'punch'], stop: 0.12, shake: 24 }); impactFrame(px, py, 0.07, true);
        slowmo(0.3, 0.45, true); floatText(px, py - 70, 'SLAM!', '#ffd84a', 40, 1);
      }
      if (sp.st.slam != null && b.onGround && once(sp, 'land', 0)) { dustCloud(b.x, b.y, 16, 1.4); dirt(b.x, b.y, 0, 18, 1.3); ring(b.x, b.y, 160, '#ffe2c0', 0.4, 6); shake(26); sfx('wall', b.x, 0.8); }
      if (sp.st.land != null && sp.t > sp.st.land + 0.7) return false;
    }
  },
  // (3) close-up Wing Chun exchange: rapid circular blocks, camera tight on the arms
  wingChun: {
    start(sp, a, b) { sp.end = 3.2; a.walkV = 0; },
    update(sp, dt, a, b) {
      const s = a.s, d = Math.abs(a.x - b.x);
      if (!sp.st.go) {
        if (d > 52 * s && sp.t < 0.5) { a.x += a.face * Math.min(d - 52 * s, 700 * dt) / 2; b.x += b.face * Math.min(d - 52 * s, 700 * dt) / 2; return; }
        sp.st.go = sp.t; sp.st.n = 0; sp.st.nt = sp.t;
        camFocus(() => (a.x + b.x) / 2, () => a.y - 118 * a.s, 3.7, 1.75);
        floatText((a.x + b.x) / 2, a.y - 240 * s, 'WING CHUN!', '#ffe9b0', 30, 0.9);
      }
      if (sp.st.n < 11 && sp.t >= sp.st.nt) {
        const n = sp.st.n++, att = n % 3 === 2 ? b : a, def = att === a ? b : a;
        sp.st.nt = sp.t + 0.13;
        HOLD(att, n % 2 ? 'wcHit' : 'jabA', 0.13, { tin: 0.04 });
        HOLD(def, n % 2 ? 'wcA' : 'wcB', 0.13, { tin: 0.04 });
        const cx = (att.J.hF.x + def.J.hF.x) / 2, cy = (att.J.hF.y + def.J.hF.y) / 2;
        setTimeoutGame(() => { contactFx(cx, cy, 0.35, { snd: n % 2 ? 'ting' : 'clang', vol: 0.55, shake: 4, punch: 0.02 }); }, 0.05);
      }
      if (sp.st.n >= 11 && once(sp, 'palm', sp.st.nt + 0.05)) { PLAY(a, 'palm', { rate: 1.3 }); }
      if (sp.st.palm != null && once(sp, 'hit', sp.st.palm + 0.17)) {
        dealDamage(a, b, { dmg: 10, type: 'heavy', kx: 700, limb: 'hF' }, b.x - a.face * 8 * b.s, b.cy());
        hitFlash(b.x, b.cy(), 1.3); dustCloud(b.x, b.y, 6, 0.8, a.face);
      }
      if (sp.st.hit != null && sp.t > sp.st.hit + 0.5) return false;
    }
  },
  // (4) coiled shockwave kick with a distortion ring and a long slow-motion flight
  shockKick: {
    start(sp, a, b) {
      sp.end = 4.2; HOLD(a, 'coil', 0.62, { tin: 0.12, tremble: true }); a.auraT = Math.max(a.auraT, 1.6); a.sound('kiai2');
      sfx('hum', a.x); HOLD(b, 'stance2', 0.7); camFocus(() => a.x, () => a.y - 110 * a.s, 2.9, 0.55, 0.6);
    },
    update(sp, dt, a, b) {
      if (sp.t < 0.6 && Math.random() < dt * 30) dustCloud(a.x + rand(-40, 40), a.y, 1, 0.5);
      if (once(sp, 'go', 0.62)) { sp.st.x0 = a.x; sp.st.tx = b.x - a.face * 86 * a.s; PLAY(a, 'fkick', { rate: 1.4 }); a.sound('kiai'); speedStreaks(a.face, 0.3); }
      if (sp.st.go != null && sp.st.arr == null) {
        const u = clamp((sp.t - sp.st.go) / 0.07, 0, 1); a.x = lerp(sp.st.x0, sp.st.tx, u);
        if (u >= 1) sp.st.arr = sp.t;
      }
      if (once(sp, 'boom', 0.76)) {
        const px = b.x - a.face * 6 * b.s, py = b.cy();
        shockRing(px, py, 1.3); contactFx(px, py, 2.2, { snd: ['whoomp', 'heavy'], stop: 0.1, shake: 34, punch: 0.25 });
        impactFrame(px, py, 0.07, true); dustCloud(b.x, b.y, 18, 1.5); dirt(b.x, b.y, a.face, 20, 1.3);
        dealDamage(a, b, { dmg: 15, type: 'blast', kx: 1250, ky: -360, limb: 'fF' }, px, py, { dir: a.face });
        slowmo(0.18, 2.3, true);   // ~3 s of slow-motion flight
        floatText(px, py - 80, 'SHOCKWAVE!', '#ffffff', 44, 1.4);
      }
      if (sp.st.boom != null && sp.t > sp.st.boom + 0.4) { b.brain.noReactT = 0; return false; }
    }
  },
  // (5) mid-air leg catch, spin and slam into the ground
  legCatch: {
    start(sp, a, b) { sp.end = 3.0; PLAY(b, 'flyside'); HOLD(a, 'stance2', 0.5); },
    update(sp, dt, a, b) {
      const s = a.s;
      if (!sp.st.c && Math.abs(a.x - b.x) < 78 * s && !b.onGround) {
        sp.st.c = sp.t; b.mv = null; b.held = true; b.vx = b.vy = 0;
        HOLD(b, 'fsk', 2, { hurt: true }); HOLD(a, 'catchLeg', 0.5, { tin: 0.04 });
        contactFx(a.J.hF.x, a.J.hF.y, 0.6, { snd: 'clang', stop: 0.08 }); floatText(a.x, a.y - 240 * s, 'CAUGHT!', '#ffd84a', 32, 0.9);
        camFocus(() => (a.x + b.x) / 2, () => a.y - 120 * s, 3.0, 0.5);
        sp.st.bx = b.x; sp.st.by = b.y;
      }
      if (sp.st.c == null) { if (sp.t > 0.9) return false; return; }
      const t = sp.t - sp.st.c;
      if (t < 0.12) { b.x = lerp(b.x, a.x + a.face * 70 * s, 0.4); b.y = lerp(b.y, a.y - 60 * s, 0.4); }
      else if (t < 0.62) {
        if (once(sp, 'up', sp.st.c + 0.12)) { HOLD(a, 'slamUp', 0.3, { tin: 0.12 }); a.sound('kiai'); sfx('wsh3', a.x); }
        const u = EASE.io((t - 0.12) / 0.5), th = u * PI;
        b.x = a.x + a.face * Math.cos(th) * 75 * s; b.y = a.y - (60 + Math.sin(th) * 120) * s; b.rot = -a.face * th * 1.3;
        if (Math.random() < 0.5) afterimg(b, 0.25);
      } else if (once(sp, 'slam', sp.st.c + 0.62)) {
        HOLD(a, 'slamDn', 0.6, { tin: 0.05 }); b.held = false; b.x = a.x - a.face * 80 * s; b.y = a.y - 4;
        b.mv = null; b.play('knocked', { keepFace: true }); b.vy = 400; b.onGround = false;
        dealDamage(a, b, { dmg: 14, type: 'knock', limb: 'hF' }, b.x, a.y - 30, { noReact: true, dir: -a.face });
        timeCtl.stop = 0.3;   // the pause
        contactFx(b.x, a.y - 20, 1.8, { snd: ['heavy', 'wall'], shake: 30, punch: 0.2 }); impactFrame(b.x, a.y - 40, 0.07, true);
        dustCloud(b.x, a.y, 20, 1.6); dirt(b.x, a.y, 0, 20, 1.4); ring(b.x, a.y, 190, '#ffe2c0', 0.5, 8);
        floatText(b.x, a.y - 230 * s, 'SLAM!', '#ffd84a', 44, 1.1);
      }
      if (sp.st.slam != null && sp.t > sp.st.slam + 0.9) return false;
    }
  },
  // (6) aura clash: both power up, dash in, lock hands - heavy shake, dust blown away
  auraClash: {
    start(sp, a, b) {
      sp.end = 3.6;
      for (const f of [a, b]) { HOLD(f, 'powerUp', 0.7, { tin: 0.15, tremble: true }); f.auraT = Math.max(f.auraT, 2.6); }
      sfx('hum', (a.x + b.x) / 2); a.sound('kiai'); b.sound('kiai2');
    },
    update(sp, dt, a, b) {
      if (sp.t < 0.7 && Math.random() < dt * 20) { dustCloud(a.x, a.y, 1, 0.5, -a.face); dustCloud(b.x, b.y, 1, 0.5, -b.face); }
      if (once(sp, 'dash', 0.7)) { PLAY(a, 'dashIn', { rate: 1.3 }); PLAY(b, 'dashIn', { rate: 1.3 }); }
      const s = Math.max(a.s, b.s), dist = Math.abs(a.x - b.x);
      if (sp.st.dash != null && !sp.st.lock && (dist < 56 * s || sp.t > 1.2)) {
        sp.st.lock = sp.t; const mx = (a.x + b.x) / 2;
        a.x = mx - a.face * 27 * a.s; b.x = mx - b.face * 27 * b.s; a.vx = b.vx = 0;
        HOLD(a, 'lock', 1.2, { tremble: true }); HOLD(b, 'lock', 1.2, { tremble: true });
        const cx = mx, cy = a.y - 118 * a.s; sp.st.cx = cx; sp.st.cy = cy;
        contactFx(cx, cy, 2, { snd: ['impact', 'cring'], stop: 0.12, shake: 32, punch: 0.22 }); shockRing(cx, cy, 0.9); impactFrame(cx, cy, 0.07, true);
        floatText(cx, cy - 90, 'AURA CLASH!', '#ffe9b0', 42, 1.2); camTilt(pick([-1, 1]) * 0.08, 1.3);
      }
      if (sp.st.lock != null) {
        const lt = sp.t - sp.st.lock;
        if (lt < 1.2) {
          shake(14);
          if (Math.random() < dt * 25) { dustCloud(sp.st.cx + rand(-30, 30), a.y, 1, 0.9, pick([-1, 1])); dirt(sp.st.cx, a.y, pick([-1, 1]), 3, 1.2); }
          if (Math.random() < dt * 12) { sparks(sp.st.cx, sp.st.cy, pick([-1, 1]), 4, ['#fff', `rgb(${TEAMS[0].aura})`, `rgb(${TEAMS[1].aura})`], 0.8); sfx('lock', sp.st.cx, 0.6); }
        } else if (once(sp, 'push', sp.st.lock + 1.2)) {
          PLAY(a, 'skid'); PLAY(b, 'skid'); a.vx = -a.face * 1000; b.vx = -b.face * 1000;
          shockRing(sp.st.cx, sp.st.cy, 1.2); contactFx(sp.st.cx, sp.st.cy, 1.4, { snd: ['whoomp'], shake: 26 });
          dustCloud(sp.st.cx, a.y, 22, 1.5);
        }
      }
      if (sp.st.push != null && sp.t > sp.st.push + 0.6) return false;
    }
  },
  // (7) speed dome: both become bouncing coloured light streaks inside a spherical dust cloud
  speedDome: {
    start(sp, a, b) {
      sp.end = 3.4; const m = mid(a, b);
      sp.st.C = { x: clamp(m.x, 260, W - 260), y: FLOOR - 170 }; sp.st.R = 210;
      for (const f of [a, b]) { HOLD(f, 'stance2', 0.25); f.auraT = Math.max(f.auraT, 3.6); }
      sfx('hum', m.x); floatText(m.x, FLOOR - 420, 'SPEED DOME!', '#ffe9b0', 46, 1.4);
      camFocus(sp.st.C.x, sp.st.C.y + 40, 1.85, 3.0);
    },
    update(sp, dt, a, b) {
      const C = sp.st.C, R = sp.st.R;
      if (once(sp, 'vanish', 0.25)) {
        sp.st.P = [a, b].map((f, i) => ({ x: f.x, y: f.cy(), vx: (i ? -1 : 1) * 1900 * a.face, vy: rand(-900, -300), tr: [], col: TEAMS[f.team].aura }));
        for (const f of [a, b]) { afterimg(f, 0.4); f.hidden = true; f.held = true; f.mv = null; }
        sfx('zap', C.x); dustCloud(C.x, FLOOR, 18, 1.6); shockRing(C.x, C.y, 0.9);
      }
      if (sp.st.P && !sp.st.out) {
        for (const p of sp.st.P) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          const dx = p.x - C.x, dy = p.y - C.y, d = Math.hypot(dx, dy);
          if (d > R) {          // bounce off the dome wall
            const nx = dx / d, ny = dy / d, dot = p.vx * nx + p.vy * ny;
            p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny; const tw = rand(-0.5, 0.5), c = Math.cos(tw), sn = Math.sin(tw);
            [p.vx, p.vy] = [p.vx * c - p.vy * sn, p.vx * sn + p.vy * c];
            p.x = C.x + nx * R; p.y = C.y + ny * R; sfx('streak', p.x, 0.5); dirt(p.x, Math.min(FLOOR, p.y), 0, 3);
          }
          if (p.y > FLOOR - 10) { p.y = FLOOR - 10; p.vy = -Math.abs(p.vy); }
          p.tr.push({ x: p.x, y: p.y }); if (p.tr.length > 16) p.tr.shift();
        }
        const [p, q] = sp.st.P;
        sp.st.hitCd = (sp.st.hitCd || 0) - dt;
        if (Math.hypot(p.x - q.x, p.y - q.y) < 60 && sp.st.hitCd <= 0) { sp.st.hitCd = 0.12; contactFx((p.x + q.x) / 2, (p.y + q.y) / 2, 0.9, { snd: ['clang'], vol: 0.8, shake: 12, punch: 0.04 }); }
        sp.st.zap = (sp.st.zap || 0) - dt;
        if (sp.st.zap <= 0) { sp.st.zap = 0.17; const k = Math.random() < 0.5 ? 0 : 1, o = sp.st.P[1 - k], me = sp.st.P[k]; addPart({ k: 'laser', x: me.x, y: me.y, x2: o.x, y2: o.y, life: 0.12, max: 0.12, color: me.col }); contactFx(o.x, o.y, 0.6, { snd: 'punch', vol: 0.6, shake: 8, punch: 0.02 }); }
        if (Math.random() < dt * 30) addPart({ k: 'cloud', x: C.x + Math.cos(rand(PI, TAU)) * R * rand(0.9, 1.1), y: C.y + Math.sin(rand(PI, TAU)) * R * rand(0.9, 1.05), vx: 0, vy: 0, life: 1.2, max: 1.2, size: rand(30, 60), grow: 1, color: pick(['#d89a62', '#e4ad78']), g: 0 });
      }
      if (once(sp, 'out', 2.45)) {
        for (const f of [a, b]) { f.hidden = false; f.held = false; }
        a.x = clamp(C.x - a.face * 30, WALL_L + 40, WALL_R - 40); b.x = clamp(C.x + a.face * 50, WALL_L + 40, WALL_R - 40); a.y = b.y = FLOOR; a.onGround = b.onGround = true;
        HOLD(a, 'palmA', 0.6, { tin: 0.03 }); a.sound('kiai');
        contactFx(b.x, b.cy(), 2, { snd: ['heavy', 'whoomp'], shake: 32, punch: 0.2 }); shockRing(C.x, C.y, 1.6); impactFrame(b.x, b.cy(), 0.07, true);
        dustCloud(C.x, FLOOR, 30, 2.0);
        dealDamage(a, b, { dmg: 18, type: 'blast', kx: 1100, ky: -520, limb: 'hF' }, b.x, b.cy(), { dir: a.face });
      }
      if (sp.st.out != null && sp.t > sp.st.out + 0.5) return false;
    }
  },
  // (8) Matrix lean-back dodge (slow-mo, low angle), then a snap counter
  matrix: {
    start(sp, a, b) { sp.end = 2.4; PLAY(a, pick(['cross', 'roundhouse']), { rate: 1.1 }); },
    update(sp, dt, a, b) {
      if (once(sp, 'lean', 0.06)) { HOLD(b, 'matrix', 0.95, { tin: 0.12, ghost: true }); b.vx = -b.face * 120; sfx('dodge', b.x); camFocus(() => b.x - b.face * 10, () => b.y - 70 * b.s, 2.7, 0.9, 1); }
      if (once(sp, 'slow', 0.14)) { slowmo(0.22, 0.75, true); floatText(b.x, b.y - 250 * b.s, 'DODGE!', '#9fe3ff', 32, 0.9); }
      if (once(sp, 'snap', 0.95)) { PLAY(b, 'uppercut', { rate: 1.5 }); b.sound('kiai'); sfx('wsh3', b.x); }
      if (once(sp, 'hit', 1.07)) {
        dealDamage(b, a, { dmg: 11, type: 'launch', kx: 160, ky: -1250, limb: 'hB' }, a.x + b.face * 6 * a.s, a.cy() - 30 * a.s, { dir: b.face });
        floatText(a.x, a.y - 250 * a.s, 'COUNTER!', '#ffd84a', 36, 0.9);
      }
      if (sp.st.hit != null && sp.t > sp.st.hit + 0.9) return false;
    }
  },
  // (9) silhouette slash: black-and-red screen, white silhouette dash-through
  silSlash: {
    start(sp, a, b) {
      sp.end = 3.0; HOLD(a, a.weapon === 'sword' ? 'swIaiW' : 'coil', 0.6, { tin: 0.12, tremble: true }); a.auraT = Math.max(a.auraT, 2);
      HOLD(b, 'stance', 0.6); b.brain.noReactT = 2.5; sfx('hum', a.x, 0.8);
      camFocusCU(() => a.x + a.face * 4 * a.s, () => a.J ? a.J.head.y : a.y - 130 * a.s, 4.2, 0.55);   // extreme close-up on the glowing eyes
    },
    update(sp, dt, a, b) {
      if (once(sp, 'go', 0.6)) {
        sp.st.x0 = a.x; sp.st.tx = clamp(b.x + a.face * 140 * a.s, WALL_L + 40, WALL_R - 40);
        impactFrame((a.x + b.x) / 2, a.cy(), 0.62, true, 'red'); sfx('iai', a.x); sfx('slash', a.x); camFocus((sp.st.x0 + sp.st.tx) / 2, a.y - 100 * a.s, 2.2, 0.9);
        HOLD(a, a.weapon === 'sword' ? 'swIaiA' : 'dashLow', 0.9, { tin: 0.03 }); HOLD(b, 'stance', 0.9);
      }
      if (sp.st.go != null && sp.st.arr == null) {
        const u = clamp((sp.t - sp.st.go - 0.18) / 0.08, 0, 1), px = a.x; a.x = lerp(sp.st.x0, sp.st.tx, u);
        if (u > 0) addPart({ k: 'dash', x1: px, x2: a.x, y: a.y - 100 * a.s, life: 0.7, max: 0.7, s: a.s });
        if (u >= 1) sp.st.arr = sp.t;
      }
      if (once(sp, 'cut', 1.25)) {
        slashMark(b.x, b.cy(), -0.5 * a.face, 340); hitFlash(b.x, b.cy(), 2); sfx('heavy', b.x); shake(28);
        dealDamage(a, b, { dmg: 24, type: 'blast', kx: 520, ky: -760, sword: a.weapon === 'sword', limb: 'hF' }, b.x, b.cy(), { dir: a.face });
        floatText(b.x, b.y - 260 * b.s, 'CRITICAL!', '#ff4040', 48, 1.3);
      }
      if (sp.st.cut != null && sp.t > sp.st.cut + 0.6) return false;
    }
  },
  // (10) heavy cleaver vs fast katana: freeze on the clash, sparks, push back
  bladeClash: {
    start(sp, a, b) { sp.end = 2.4; PLAY(a, 'swKesa', { rate: a.heavyBlade ? 0.85 : 1.2 }); a.sound('kiai'); },
    update(sp, dt, a, b) {
      if (once(sp, 'def', 0.14)) PLAY(b, 'swRise', { rate: b.heavyBlade ? 1 : 1.5 });
      if (once(sp, 'clash', 0.36)) {
        const p = { x: (a.J.sw.x + b.J.sw.x + a.J.hF.x + b.J.hF.x) / 4, y: (a.J.sw.y + b.J.sw.y + a.J.hF.y + b.J.hF.y) / 4 };
        timeCtl.stop = 0.32; contactFx(p.x, p.y, 1.8, { snd: ['clash', 'cring', 'heavy'], shake: 26, punch: 0.2 });
        sparks(p.x, p.y, 1, 30, ['#fff', '#ffe27a', '#ffb347'], 1.5); camFocus(p.x, p.y + 40, 3.4, 0.55);
        floatText(p.x, p.y - 70, 'CLASH!', '#ffe27a', 44, 1.1); impactFrame(p.x, p.y, 0.07, true);
      }
      if (once(sp, 'push', 0.5)) {
        const lightOne = a.heavyBlade ? b : a, heavyOne = lightOne === a ? b : a;
        PLAY(lightOne, 'skid'); PLAY(heavyOne, 'skid'); lightOne.vx = -lightOne.face * 1050; heavyOne.vx = -heavyOne.face * 420;
        dustCloud(lightOne.x, lightOne.y, 8, 0.9, -lightOne.face); dirt(lightOne.x, lightOne.y, -lightOne.face, 12);
      }
      if (sp.st.push != null && sp.t > sp.st.push + 0.65) return false;
    }
  },
  // (11) aerial overhead heavy strike blocked - defender driven into the ground
  overhead: {
    start(sp, a, b) {
      sp.end = 2.6; HOLD(a, 'stance2', 0.12);
      sp.st.T = 0.62;
    },
    update(sp, dt, a, b) {
      if (once(sp, 'jump', 0.1)) {
        const tx = b.x - a.face * 40 * a.s; a.mv = null; a.vx = (tx - a.x) / sp.st.T; a.vy = -1450; a.onGround = false; a.y -= 2; a.gMul = 1;
        HOLD(a, 'overW', 0.45, { tin: 0.15 }); a.sound('kiai'); sfx('jump', a.x); dustCloud(a.x, a.y, 6, 0.8);
      }
      if (once(sp, 'guard', 0.32)) { HOLD(b, 'crouchG', 0.9, { tin: 0.08 }); camFocus(() => (a.x + b.x) / 2, () => b.y - 160 * b.s, 2.3, 0.6, 0.8); }
      if (once(sp, 'swing', 0.5)) { HOLD(a, 'overA', 0.4, { tin: 0.06 }); sfx('wsh3', a.x); a.vy = Math.max(a.vy, 900); }
      if (sp.st.swing != null && !sp.st.hit && (a.y > b.y - 150 * b.s || sp.t > 0.8)) {
        sp.st.hit = sp.t; const p = b.J.hF;
        a.vy = -380; a.vx = -a.face * 120;
        contactFx(p.x, p.y, 2, { snd: ['heavy', a.weapon === 'sword' ? 'clash' : 'clang'], stop: 0.14, shake: 32, punch: 0.22 }); impactFrame(p.x, p.y, 0.07, true);
        b.vx = -b.face * 420; HOLD(b, 'crouchG', 0.6, { lowFric: true });
        dustCloud(b.x, b.y, 22, 1.6); dirt(b.x, b.y, 0, 22, 1.4); ring(b.x, b.y, 200, '#f0e0d0', 0.5, 9);
        b.hp = Math.max(1, b.hp - 4); floatText(b.x, b.y - 250 * b.s, 'GUARD CRUSH!', '#ffd84a', 34, 1);
      }
      if (sp.st.hit != null && sp.t > sp.st.hit + 0.7 && a.onGround) return false;
    }
  },
  // (12) afterimage teleport exchange on a dark tinted screen with laser-like attack lines
  afterimage: {
    start(sp, a, b) { sp.end = 3.2; sp.st.n = 0; sp.st.nt = 0.2; fx.tintT = 2.6; sfx('hum', (a.x + b.x) / 2, 0.6); for (const f of [a, b]) f.auraT = Math.max(f.auraT, 2.6); },
    update(sp, dt, a, b) {
      if (sp.st.n < 7 && sp.t >= sp.st.nt) {
        const n = sp.st.n++, att = n % 2 ? b : a, def = att === a ? b : a;
        sp.st.nt = sp.t + 0.27;
        afterimg(att, 0.45); const ox = att.x, oy = att.cy();
        const side = Math.random() < 0.5 ? -1 : 1;
        att.x = clamp(def.x + side * 72 * att.s, WALL_L + 50, WALL_R - 50); att.face = def.x >= att.x ? 1 : -1; def.face = -att.face;
        att.y = def.y; att.vx = att.vy = 0;
        sfx('zap', att.x); addPart({ k: 'laser', x: ox, y: oy, x2: att.x, y2: att.cy(), life: 0.22, max: 0.22, color: TEAMS[att.team].aura });
        const last = n === 6;
        HOLD(att, pick(['jabA', 'rhA', 'palmA', 'crossA', 'fkA']), 0.22, { tin: 0.03 });
        if (!last) {
          HOLD(def, 'blockH', 0.22, { tin: 0.03 });
          setTimeoutGame(() => { const p = def.J.hF; contactFx(p.x, p.y, 0.8, { snd: 'clang', vol: 0.8, shake: 12 }); }, 0.05);
        } else {
          setTimeoutGame(() => {
            fx.tintT = 0; impactFrame(def.x, def.cy(), 0.07, true);
            dealDamage(att, def, { dmg: 15, type: 'blast', kx: 1000, ky: -480, limb: 'hF' }, def.x, def.cy(), { dir: att.face });
          }, 0.06);
          sp.st.done = sp.t;
        }
      }
      if (sp.st.done != null && sp.t > sp.st.done + 0.7) { fx.tintT = 0; return false; }
    }
  }
});
// small game-time timers for set pieces
const GT = [];
function setTimeoutGame(fn, t) { GT.push({ fn, t }); }
function updateGameTimers(dt) { for (let i = GT.length - 1; i >= 0; i--) { GT[i].t -= dt; if (GT[i].t <= 0) { const g = GT.splice(i, 1)[0]; try { g.fn(); } catch (e) {} } } }
function setPieceOptions2(a, b) {
  const out = setPieceOptions(a, b), d = Math.abs(a.x - b.x);
  const [x, y] = Math.random() < 0.5 ? [a, b] : [b, a];
  const noGun = !a.isGun() && !b.isGun(), noGiant = !a.giant && !b.giant;
  if (noGun && d > 110 && d < 420) out.push({ name: 'dashBlock', a: x, b: y, w: 1.4 });
  if (noGun && x.weapon !== 'sword' && d < 130 && noGiant) out.push({ name: 'sweepSlam', a: x, b: y, w: 1.3 });
  if (noGun && a.weapon !== 'sword' && b.weapon !== 'sword' && d < 160) out.push({ name: 'wingChun', a: x, b: y, w: 1.3 });
  if (noGun && d > 120 && d < 360 && noGiant) out.push({ name: 'shockKick', a: x, b: y, w: 1.2 });
  if (noGun && d > 160 && d < 420 && noGiant && y.weapon !== 'sword') out.push({ name: 'legCatch', a: x, b: y, w: 1.1 });
  if (noGun && d > 140 && d < 460 && noGiant) out.push({ name: 'auraClash', a: x, b: y, w: 0.9 });
  if (noGun && d < 120) out.push({ name: 'matrix', a: x, b: y, w: 1.3 });
  if (a.weapon === 'sword' && b.weapon === 'sword' && d > 70 && d < 170) out.push({ name: 'bladeClash', a: a.heavyBlade ? a : b, b: a.heavyBlade ? b : a, w: 3 });
  if (noGun && d > 100 && d < 380 && noGiant) out.push({ name: 'overhead', a: x, b: y, w: 1 });
  if (noGun && d < 300 && noGiant) out.push({ name: 'afterimage', a: x, b: y, w: 0.7 });
  if (noGun && d < 450 && (a.superT > 0 || b.superT > 0)) out.push({ name: 'speedDome', a: x, b: y, w: 0.6 });
  return out;
}

// ============================================================ ragdolls
const RD_KEYS = ['head', 'neck', 'hip', 'eF', 'hF', 'eB', 'hB', 'kF', 'fF', 'kB', 'fB'];
const RD_CONS = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10], [0, 2]];
function makeRagdoll(f, vx, vy) {
  const J = f.J, dt0 = 1 / 60, pts = [];
  const spin = rand(-1, 1) * 500;
  RD_KEYS.forEach((k, i) => {
    const q = J[k], up = (i <= 1 ? 1 : i >= 7 ? -1 : 0);
    const v = { x: vx * (f.giant ? 0.2 : 1) + rand(-120, 120) + up * spin, y: vy * (f.giant ? 0.3 : 1) + rand(-120, 120) };
    pts.push({ x: q.x, y: q.y, px: q.x - v.x * dt0, py: q.y - v.y * dt0 });
  });
  const cons = RD_CONS.map(([a, b]) => [a, b, Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y)]);
  return { pts, cons, team: f.team, s: f.s, life: 5, pdt: dt0, hr: J.hr, flash: 0.12 };
}
function updateRagdoll(r, dt) {
  if (dt <= 0) return;
  r.life -= dt; r.flash -= dt;
  const ratio = dt / r.pdt; r.pdt = dt;
  for (const p of r.pts) {
    const vx = (p.x - p.px) * ratio * 0.995, vy = (p.y - p.py) * ratio * 0.995;
    p.px = p.x; p.py = p.y;
    p.x += vx; p.y += vy + G * dt * dt;
    if (p.y > FLOOR) { const v = p.y - p.py; p.y = FLOOR; p.py = FLOOR + v * 0.35; p.px = p.x - (p.x - p.px) * 0.7; }
    for (const pl of PLATS) {
      if (p.py <= pl.y && p.y > pl.y && p.x > pl.x1 && p.x < pl.x2) { const v = p.y - p.py; p.y = pl.y; p.py = pl.y + v * 0.35; p.px = p.x - (p.x - p.px) * 0.7; }
    }
    if (p.x < WALL_L + 4) { p.x = WALL_L + 4; p.px = p.x + (p.x - p.px) * 0.5; }
    if (p.x > WALL_R - 4) { p.x = WALL_R - 4; p.px = p.x + (p.x - p.px) * 0.5; }
  }
  for (let it = 0; it < 5; it++) {
    for (const [a, b, L] of r.cons) {
      const A = r.pts[a], B = r.pts[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.001, k = (d - L) / d * 0.5;
      A.x += dx * k; A.y += dy * k; B.x -= dx * k; B.y -= dy * k;
    }
  }
}
// ============================================================ bullets / airstrikes
function updateBullets(dt) {
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.x < -50 || b.x > W + 50 || b.y > FLOOR + 5 || b.y < 0) { if (b.y > FLOOR) sparks(b.x, FLOOR, 1, 4, ['#ffd34d']); b.life = 0; continue; }
    for (const e of fighters) {
      if (!e.alive || e.team === b.team || e.invuln > 0) continue;
      if (Math.abs(b.x - e.x) < 24 * e.s && b.y > e.y - 185 * e.s && b.y < e.y + 5) {
        if (e.evading('high') || e.held) continue;   // rolled / flipped under the bullet
        dealDamage(b.owner && b.owner.alive ? b.owner : null, e, { dmg: b.dmg, type: 'light', gun: true, kx: 200 }, b.x, b.y, { dir: b.vx > 0 ? 1 : -1 });
        b.life = 0; break;
      }
    }
  }
  for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].life <= 0) bullets.splice(i, 1);
}
const strikeQueue = [];
function queueAirstrike(team, nick, times = 1) {
  for (let i = 0; i < Math.min(3, times); i++) strikeQueue.push({ team, nick, delay: 0.4 + i * 1.6 });
}
function launchPlane(team, nick) {
  const fromLeft = Math.random() < 0.5;
  planes.push({ x: fromLeft ? -260 : W + 260, y: rand(820, 900), vx: fromLeft ? 1250 : -1250, team, nick, bombs: 9, dropT: 0.15 });
  sfx('plane');
}
function updateAir(dt) {
  for (const q of strikeQueue) q.delay -= dt;
  while (strikeQueue.length && strikeQueue[0].delay <= 0 && round.state === 'fight') { const q = strikeQueue.shift(); launchPlane(q.team, q.nick); }
  for (const p of planes) {
    p.x += p.vx * dt; p.dropT -= dt;
    if (p.dropT <= 0 && p.bombs > 0 && p.x > 60 && p.x < W - 60) {
      p.dropT = 0.09; p.bombs--;
      bombs.push({ x: p.x, y: p.y + 30, vx: p.vx * 0.2, vy: 250, team: p.team, rot: 0 });
    }
  }
  for (let i = planes.length - 1; i >= 0; i--) if (planes[i].x < -400 || planes[i].x > W + 400) planes.splice(i, 1);
  for (const b of bombs) {
    const oy = b.y;
    b.vy += G * 0.55 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot = Math.atan2(b.vy, b.vx);
    let boom = b.y >= FLOOR;
    for (const pl of PLATS) if (b.y >= pl.y && oy < pl.y && b.x > pl.x1 && b.x < pl.x2 && Math.random() < 0.5) boom = true;
    for (const e of fighters) if (e.alive && e.team !== b.team && Math.abs(e.x - b.x) < 30 * e.s && b.y > e.y - 180 * e.s && b.y < e.y) boom = true;
    if (boom) { explode(b.x, Math.min(b.y, FLOOR), b.team); b.dead = true; }
  }
  for (let i = bombs.length - 1; i >= 0; i--) if (bombs[i].dead) bombs.splice(i, 1);
}
function explode(x, y, team) {
  // v6: smaller, shorter blasts so several airstrike bombs don't bury the fighters
  fire(x, y - 20, 9, 0.75); smoke(x, y - 20, 4, 1.0); ring(x, y - 20, 120, '#ffcf6a', 0.3, 8);
  sparks(x, y - 20, 1, 6, ['#ffd34d', '#fff', '#ff8a1f']);
  shake(14); cam.flash = Math.max(cam.flash, 0.08); cam.flashColor = '#ffe6b0';
  sfx('boom', x);
  for (const e of fighters) {
    if (!e.alive || e.team === team) continue;
    const d = Math.hypot(e.x - x, e.cy() - y);
    if (d < 165 && e.invuln <= 0) dealDamage(null, e, { dmg: 28 * (1 - d / 165 * 0.5), type: 'blast', kx: 700, ky: -1100 }, e.x, e.cy(), { dir: e.x >= x ? 1 : -1 });
  }
}

// ============================================================ teams, roster, rounds
// 1 vs 1 duel: one WHITE hero and one BLACK hero. Viewers are FANS who heal and power up their hero.
const supporters = new Map();  // viewer id -> { id, nick, team, points, coins, likes, pending: [] }
const round = { n: 0, state: 'countdown', t: 0, time: 0, winner: -1, mvp: null, sudden: false, sdT: 0, beeps: 0, mur: -1, bowed: false };
const heroes = [null, null];
const G_ = () => S.game;

function aliveOf(team) { return fighters.filter((f) => f.alive && f.team === team); }
function heroOf(team) { const h = heroes[team]; return h && h.alive ? h : null; }
function shieldCap(f) { return f.maxHp * ((S.gifts.maxShieldPercent ?? 150) / 100); }
function spawnHeroes() {
  fighters = [];
  const left = 0;   // screen direction: WHITE left, BLACK right
  for (let t = 0; t < NT; t++) {
    const x = t === left ? 330 : 750;
    const f = new Fighter(t, { x, y: FLOOR - 320, hp: G_().heroHp || 200, invuln: 0.5, dropIn: true, face: x < W / 2 ? 1 : -1 });
    heroes[t] = f; fighters.push(f);
  }
}
function startRound() {
  round.n++; round.state = 'countdown'; round.t = 0; round.time = 0; round.winner = -1; round.mvp = null;
  round.sudden = false; round.sdT = 0; round.beeps = 0; round.mur = -1; round.bowed = false; round.taunted = false; round.replied = false; round.tauntA = null;
  bubbles.length = 0;
  endSetPiece(); GT.length = 0; duel.want = null; fx.tintT = 0; duel.spT = rand(3.5, 6); duel.lastAtk = -1; cam.ko = null;
  bullets.length = 0; bombs.length = 0; planes.length = 0; strikeQueue.length = 0;
  for (const t of teams) { t.rageT = 0; }
  spawnHeroes();
  // power-ups that were sent while a hero was down / between rounds
  for (const s of supporters.values()) {
    if (s.pending && s.pending.length) { const list = s.pending; s.pending = []; for (const g of list) applyGift(s, g.info, g.count, g.label, true); }
  }
  callout('ROUND ' + round.n, 'WHITE vs BLACK - 1 ON 1', '#7fb2ff', 130, 1.4);
  sfx('crowd', null, 0.7);
}
function endRound(w) {
  round.state = 'end'; round.t = 0; round.winner = w;
  bullets.length = 0; bombs.length = 0; strikeQueue.length = 0;
  if (w >= 0) {
    teams[w].wins++;
    const fan = topSupporters(w, 1)[0];
    round.mvp = { kills: heroes[w] ? heroes[w].kills : 0, fan: fan ? fan.nick : '', flawless: !!(heroes[w] && heroes[w].hp >= heroes[w].maxHp - 0.5) };
    confetti(160, [TEAMS[w].ui, '#ffd84a', '#7fb2ff', '#ffffff']);
    if (heroes[w]) bubble(heroes[w], pick(['EZ!', 'TOO EASY!', "WHO'S NEXT?", 'GG!', 'BOW DOWN!']), '👑', { force: true, pri: 9, dur: 2.6 });
    addFeed([['TEAM ' + TEAMS[w].name, TEAMS[w].ui], [' WINS ROUND ' + round.n, '#ffd84a']], 10);
  } else callout('DRAW!', 'NOBODY SURVIVED', '#ffd84a', 150, 2);
  sfx('fanfare'); sfx('crowd');
}
function updateRound(dt) {
  round.t += dt;
  if (round.state === 'countdown') {
    while (round.beeps < 3 && round.t >= round.beeps * 0.8) { round.beeps++; sfx('beep'); }
    if (!round.taunted && round.t > 0.05) {
      round.taunted = true; const a = fighters[Math.floor(Math.random() * fighters.length)];
      if (a) { a.play('taunt'); bubble(a, pick(['COME ON!', 'IS THAT ALL?', "YOU'RE MINE!", "LET'S GO!"]), pick(['😏', '👊', '😤']), { force: true, dur: 1.4 }); round.tauntA = a; }
    }
    if (!round.replied && round.t > 1.05) { round.replied = true; const b = fighters.find((f) => f !== round.tauntA && f.alive); if (b) bubble(b, pick(['BRING IT!', 'WATCH THIS!', 'NO CHANCE!']), pick(['🔥', '😎', '💪']), { force: true, dur: 1.4 }); }
    if (!round.bowed && round.t > 0.95) { round.bowed = true; for (const f of fighters) if (f.alive) f.play('bow'); }
    if (round.t >= 2.4) { round.state = 'fight'; round.t = 0; callout('FIGHT!', '', '#ff4545', 190, 1.0); sfx('go'); sfx('crowd'); shake(10); }
  } else if (round.state === 'fight') {
    round.time += dt;
    const m = Math.floor(round.time / 2); if (m !== round.mur) { round.mur = m; sfx('murmur'); }
    const alive = new Set(fighters.filter((f) => f.alive).map((f) => f.team));
    if (alive.size <= 1 && round.t > 0.5) {
      if (timeCtl.slowT <= 0.05) endRound(alive.size ? [...alive][0] : -1);
      return;
    }
    if (!round.sudden && round.time > (G_().roundSeconds || 75)) {
      round.sudden = true; round.sdT = 0;
      callout('SUDDEN DEATH!', 'NO HEALS - DAMAGE x' + (G_().suddenDeathDamage ?? 2), '#ff4545', 140, 2.2);
      sfx('sudden'); sfx('crowd'); shake(16); cam.flash = 0.25; cam.flashColor = '#ff2020';
    }
    if (round.sudden) {
      round.sdT += dt;
      if (round.sdT > 15) {   // still no winner: everyone slowly loses HP so the round always ends
        for (const f of fighters) if (f.alive) { f.hp -= 4 * dt; if (f.hp <= 0) { f.hp = 0.5; dealDamage(null, f, { dmg: 5, type: 'blast', kx: 600, ky: -700 }, null, null, { dir: f.face * -1 }); } }
      }
    }
  } else if (round.state === 'end') {
    if (round.t > 6) startRound();
  }
}

// ============================================================ viewer events
const norm = (t) => String(t || '').toLowerCase().replace(/[!.?,#@*~\s]+/g, ' ').trim();
function matchJoin(text) {
  const t = norm(text), jw = S.gifts.joinWords || DEFAULT_SETTINGS.gifts.joinWords;
  const keys = TEAMS.map((t) => t.key);
  for (let i = 0; i < NT; i++) for (const w of [...(jw[keys[i]] || []), ...(i === 0 ? ['red', 'team red', ...(jw.red || [])] : [])]) if (t === norm(w)) return i;
  return null;
}
function supporter(u, teamIfNew) {
  let s = supporters.get(u.id);
  if (!s) { s = { id: u.id, nick: u.nick || u.id, team: teamIfNew, points: 0, coins: 0, likes: 0, pending: [] }; supporters.set(u.id, s); }
  if (u.nick) s.nick = u.nick;
  return s;
}
function supportersOf(team) { return [...supporters.values()].filter((s) => s.team === team); }
function topSupporters(team, n = 3) { return supportersOf(team).sort((a, b) => b.points - a.points).slice(0, n); }
function assignTeam() {
  if ((G_().unjoinedGiftRule || 'weakest') === 'random') return rint(0, NT - 1);
  // weakest = the living hero with the lowest HP (comeback!)
  let best = -1, bh = 1e9;
  for (let t = 0; t < NT; t++) { const h = heroOf(t); if (h && h.hp + Math.random() < bh) { bh = h.hp; best = t; } }
  return best >= 0 ? best : rint(0, NT - 1);
}
function join(u, team) {
  const ex = supporters.get(u.id);
  if (ex) {
    if (ex.team !== team) { ex.team = team; addFeed([[ex.nick, TEAMS[team].fan], [' now supports ' + TEAMS[team].name, '#bbc']]); }
    return;
  }
  const s = supporter(u, team);
  addFeed([[s.nick, TEAMS[team].fan], [' supports TEAM ' + TEAMS[team].name, '#ffffff']]);
  const h = heroOf(team); if (h) floatText(h.x, h.y - 215 * h.s, '+1 FAN', TEAMS[team].fan, 24, 0.8);
}
// heal a team's hero; above max HP becomes a SHIELD (up to maxShieldPercent)
function heal(team, amount, nick) {
  const h = heroOf(team);
  if (!h || amount <= 0 || round.state === 'end') return 0;
  if (round.sudden) { floatText(h.x, h.y - 230 * h.s, 'NO HEALS!', '#ff6a6a', 26, 0.8); return 0; }
  const hs = G_().healScale; amount *= hs === 'auto' || hs == null ? h.maxHp / 200 : +hs || 1;
  const cap = shieldCap(h), before = h.hp;
  h.hp = Math.min(cap, h.hp + amount);
  const got = Math.round(h.hp - before);
  if (got <= 0) { floatText(h.x, h.y - 230 * h.s, 'MAX SHIELD', '#7fe8ff', 24, 0.7); return 0; }
  healFx(h);
  floatText(h.x + rand(-50, 50), h.y - 235 * h.s - rand(0, 30), `+${got} HP @${nick}`, '#4dff88', 28, 1.3);
  if (before <= h.maxHp && h.hp > h.maxHp) { ring(h.x, h.cy(), 110 * h.s + 40, '#7fe8ff', 0.5, 8); floatText(h.x, h.y - 290 * h.s, 'SHIELD!', '#7fe8ff', 32, 1); }
  sfx('heal', h.x, got >= 20 ? 1 : 0.6);
  return got;
}
function giftInfo(name, coins) {
  const map = S.gifts.gifts || {};
  const key = Object.keys(map).find((k) => k.toLowerCase() === String(name).toLowerCase());
  let v = key ? map[key] : null;
  if (!v) v = (S.gifts.byCoins || []).find((t) => coins >= t.min && coins <= (t.max ?? 1e12)) || { heal: 8 };
  if (typeof v === 'string') v = { heal: 10, power: v };   // old style "Rose": "sword"
  return { heal: +v.heal || 0, power: v.power || null };
}
const POWER_TEXT = { sword: 'SWORD', super: 'KUNG FU MASTER', pistol: 'PISTOL', rifle: 'RIFLE', airstrike: 'AIRSTRIKE', giant: 'GIANT MODE', ultimate: 'GIANT + AIRSTRIKE', boost: 'RAGE MODE' };
function gift(ev) {
  const count = Math.max(1, ev.count || 1), coins = Math.max(1, ev.coins || 1);
  let s = supporters.get(ev.id);
  if (!s) { s = supporter(ev, assignTeam()); addFeed([[s.nick, TEAMS[s.team].fan], [' supports ' + TEAMS[s.team].name + ' with a gift', '#fff']]); }
  s.coins += coins * count; s.points += coins * count;
  const info = giftInfo(ev.giftName, coins);
  const label = `${ev.giftName}${count > 1 ? ' x' + count : ''}`;
  if (round.state === 'end') {
    if (info.power) { s.pending.push({ info: { heal: 0, power: info.power }, count, label }); addFeed([[s.nick, TEAMS[s.team].fan], [' sent ' + label + ' (saved for next round)', '#ffd84a']]); }
    return;
  }
  applyGift(s, info, count, label);
}
function applyGift(s, info, count, label, quiet = false) {
  const team = s.team, col = TEAMS[team].fan, h = heroOf(team);
  const got = heal(team, info.heal * count, s.nick);
  if (!quiet && !info.power && got > 0 && h && Math.random() < 0.6) bubble(h, 'THANKS @' + shortNick(s.nick) + '!', '💚', { pri: 4, dur: 1.5 });
  if (info.power) {
    if (h) applyPower(h, info.power, count, s);
    else { s.pending.push({ info: { heal: 0, power: info.power }, count, label }); if (!quiet) addFeed([[s.nick, col], [' ' + POWER_TEXT[info.power] + ' saved for next round', '#bbc']]); return; }
  }
  if (quiet) return;
  const parts_ = [[s.nick, col], [' ' + label + ' → ', '#ffd84a']];
  if (got > 0) parts_.push(['+' + got + ' HP ', '#4dff88']);
  if (info.power) parts_.push([POWER_TEXT[info.power] || info.power, '#ffffff']);
  addFeed(parts_);
  if (info.power) { callout(s.nick, (POWER_TEXT[info.power] || info.power) + '!', col, ['ultimate', 'giant', 'airstrike'].includes(info.power) ? 110 : 90, 1.8); sfx('crowd', null, 0.8); }
}
function applyPower(h, p, count, s) {
  const team = h.team;
  sfx('powerup', h.x);
  if (s && s.nick) { bubble(h, 'THANKS @' + shortNick(s.nick) + '!', pick(['🔥', '💪', '⚡']), { force: true, pri: 5, dur: 1.8 }); h.sound('kiai2', 0.8); }
  switch (p) {
    case 'sword': case 'pistol': case 'rifle':
      h.setWeapon(p); floatText(h.x, h.y - 250 * h.s, WEAPON_NAMES[p] + '!', '#ffd84a', 40, 1.2); ring(h.x, h.cy(), 90 * h.s + 30, '#ffd84a', 0.4, 6); break;
    case 'super':
      h.superT = Math.min(30, Math.max(0, h.superT) + 10 + 3 * (count - 1)); h.auraT = Math.max(h.auraT, h.superT); sfx('hum', h.x, 0.8); floatText(h.x, h.y - 250 * h.s, 'KUNG FU!', '#ffd84a', 44, 1.2); ring(h.x, h.cy(), 130, '#ffd84a', 0.5, 10); break;
    case 'airstrike':
      queueAirstrike(team, s.nick, count); h.auraT = Math.max(h.auraT, 8); duel.want = { name: 'speedDome', team, t: 6 }; break;
    case 'giant': case 'ultimate':
      h.ts = GIANT_S; h.giantT = Math.min(30, Math.max(0, h.giantT) + 15); h.setWeapon('sword'); h.superT = Math.max(h.superT, 15);
      ring(h.x, h.cy(), 240, TEAMS[team].ui, 0.6, 14); shake(20); sfx('land', h.x, 1.5);
      if (p === 'ultimate') { queueAirstrike(team, s.nick, Math.min(2, count)); h.auraT = Math.max(h.auraT, 12); duel.want = { name: 'silSlash', team, t: 8 }; }
      break;
    case 'boost': teamBoost(team); break;
  }
}
function teamBoost(team) {
  teams[team].rageT = 7;
  callout('TEAM ' + TEAMS[team].name, 'RAGE MODE!', TEAMS[team].ui, 90, 1.4);
}
function like(ev) {
  const s = supporters.get(ev.id);
  if (!s) return;   // comment 1/2/3 first, then your likes heal your hero
  const n = Math.max(1, ev.count || 1);
  s.likes += n; s.points += n * 0.1;
  const every = (S.gifts.likes && S.gifts.likes.every) || 10, hp = (S.gifts.likes && S.gifts.likes.heal) ?? 2;
  const tm = teams[s.team]; tm.likes += n;
  let k = 0; while (tm.likes >= every) { tm.likes -= every; k++; }
  if (k) heal(s.team, k * hp, s.nick);
}
function social(ev, kind) {
  let s = supporters.get(ev.id);
  if (!s) s = supporter(ev, assignTeam());
  s.points += 1;
  const amt = ((S.gifts[kind] || {}).heal) ?? 5;
  addFeed([[s.nick, TEAMS[s.team].fan], [kind === 'follow' ? ' followed! ' : ' shared the LIVE! ', '#7fb2ff'], ['+' + amt + ' HP', '#4dff88']]);
  heal(s.team, amt, s.nick);
}
function onEvent(ev) {
  if (!ev || !ev.type) return;
  switch (ev.type) {
    case 'status': if (ev.mode === 'live' && S.live.mode !== 'live') S.liveAt = performance.now(); S.live = ev; updateLiveInfo(); break;
    case 'chat': { const t = matchJoin(ev.text); if (t != null) join(ev, t); break; }
    case 'join': if (ev.team >= 0 && ev.team < NT) join(ev, ev.team); break;
    case 'gift': gift(ev); break;
    case 'like': like(ev); break;
    case 'follow': social(ev, 'follow'); break;
    case 'share': social(ev, 'share'); break;
    case 'viewers': S.viewers = ev.count; break;
  }
}


// ============================================================ background: SUNSET DESERT (v8 look: purple-orange sky, low sun, layered dunes)
// everything is drawn procedurally with gradients and shapes (no image assets). Sky + far dunes are drawn once
// into an offscreen canvas (parallax layer); clouds sit on their own canvas and drift slowly.
const BGM = 420;
const bg = document.createElement('canvas'); bg.width = W + BGM * 2; bg.height = H + BGM * 2;
const CLW = W + BGM * 2, CLH = HZ + BGM - 120;
const cl = document.createElement('canvas'); cl.width = CLW; cl.height = CLH;
const SUN = { x: W * 0.17, y: HZ - 38, r: 46 };
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
// smooth rolling dune ridge: y(x) from a few sines
function duneY(x, base, amp, k, ph) { return base - amp * (0.55 * Math.sin(x * k + ph) + 0.3 * Math.sin(x * k * 2.3 + ph * 1.7) + 0.15 * Math.sin(x * k * 5.1 + ph * 0.6)); }
function dunePath(b, x0, x1, base, amp, k, ph, depth, dx = 0, dy = 0) {
  b.beginPath(); b.moveTo(x0 + dx, base + depth + dy);
  for (let x = x0; x <= x1 + 60; x += 8) b.lineTo(x + dx, duneY(x, base, amp, k, ph) + dy);
  b.lineTo(x1 + 60 + dx, base + depth + dy); b.closePath();
}
// one dune band: shaded body, sunlit face (sun on the left) and a thin bright crest line
function duneLayer(b, x0, x1, base, amp, k, ph, top, bot, depth, rim, shade = 'rgba(110,40,24,0.55)') {
  const g = b.createLinearGradient(0, base - amp, 0, base + depth); g.addColorStop(0, top); g.addColorStop(1, bot);
  dunePath(b, x0, x1, base, amp, k, ph, depth); b.fillStyle = g; b.fill();
  b.save(); dunePath(b, x0, x1, base, amp, k, ph, depth); b.clip();
  b.fillStyle = shade; dunePath(b, x0, x1, base, amp, k, ph, depth); b.fill();          // whole band in shade...
  b.fillStyle = g; dunePath(b, x0, x1, base, amp, k, ph, depth, -46, 9); b.fill();         // ...then the sun-facing slopes lit again
  b.restore();
  if (rim) {
    b.strokeStyle = rim; b.lineWidth = 2; b.beginPath();
    for (let x = x0; x <= x1; x += 8) { const y = duneY(x, base, amp, k, ph); x === x0 ? b.moveTo(x, y) : b.lineTo(x, y); }
    b.stroke();
  }
}
function drawCloud(b, x, y, w, h, r) {
  // long wispy cloud: dark plum body with a red-orange sunlit underside
  const n = 4 + Math.floor(r() * 5), pts = [];
  for (let i = 0; i < n; i++) pts.push([x + (i / (n - 1) - 0.5) * w * 0.8 + (r() - 0.5) * w * 0.1, y - r() * h * 0.7, w * (0.12 + r() * 0.16), h * (0.5 + r() * 0.6)]);
  const lit = y < HZ - 600 ? 'rgba(235,80,60,0.9)' : 'rgba(255,130,70,0.9)';
  b.fillStyle = lit;
  b.beginPath(); b.ellipse(x, y + h * 0.34, w * 0.52, h * 0.3, 0, 0, TAU); b.fill();
  for (const p of pts) { b.beginPath(); b.ellipse(p[0] + w * 0.02, p[1] + h * 0.3, p[2], p[3], 0, 0, TAU); b.fill(); }
  const dark = y < HZ - 700 ? '#2c1234' : y < HZ - 450 ? '#3e1638' : '#5a1e34';
  b.fillStyle = dark;
  b.beginPath(); b.ellipse(x - w * 0.04, y + h * 0.12, w * 0.5, h * 0.28, 0, 0, TAU); b.fill();
  for (const p of pts) { b.beginPath(); b.ellipse(p[0], p[1], p[2], p[3], 0, 0, TAU); b.fill(); }
  // thin trailing wisps
  b.fillStyle = dark; for (let i = 0; i < 3; i++) { b.beginPath(); b.ellipse(x + (r() - 0.3) * w * 0.9, y + h * 0.3 + i * 3, w * (0.3 + r() * 0.3), 2.5 + r() * 3, 0, 0, TAU); b.fill(); }
}
function drawBackground() {
  const b = bg.getContext('2d');
  b.translate(BGM, BGM);
  const sky = b.createLinearGradient(0, -BGM, 0, HZ);
  // stops in world y: the purple part must be inside the visible game window (y ~ 300..HZ)
  const st = (y) => clamp((y + BGM) / (HZ + BGM), 0, 1);
  sky.addColorStop(0, '#12081f'); sky.addColorStop(st(260), '#2a1240'); sky.addColorStop(st(480), '#4e1a52'); sky.addColorStop(st(680), '#8e2650');
  sky.addColorStop(st(860), '#cc3c3a'); sky.addColorStop(st(1020), '#ec6a2c'); sky.addColorStop(st(1150), '#fb9a3e'); sky.addColorStop(1, '#ffc96c');
  b.fillStyle = sky; b.fillRect(-BGM, -BGM, W + BGM * 2, HZ + BGM + 10);
  // sun glow + disc low on the horizon
  let g = b.createRadialGradient(SUN.x, SUN.y, 10, SUN.x, SUN.y, 620);
  g.addColorStop(0, 'rgba(255,236,170,0.95)'); g.addColorStop(0.12, 'rgba(255,190,100,0.6)'); g.addColorStop(0.45, 'rgba(255,120,50,0.18)'); g.addColorStop(1, 'rgba(255,90,40,0)');
  b.fillStyle = g; b.fillRect(-BGM, HZ - 700, W + BGM * 2, 760);
  b.fillStyle = '#fff6d6'; b.beginPath(); b.arc(SUN.x, SUN.y, SUN.r, 0, TAU); b.fill();
  g = b.createLinearGradient(0, HZ - 90, 0, HZ + 20); g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(1, 'rgba(255,190,110,0.55)');
  b.fillStyle = g; b.fillRect(-BGM, HZ - 90, W + BGM * 2, 110);
  // far dunes (hazy, close to the sky colour) -> nearer, warmer and darker
  duneLayer(b, -BGM, W + BGM, HZ - 30, 46, 0.0065, 1.3, '#eda56a', '#d98a52', 140, 'rgba(255,214,150,0.5)', 'rgba(170,70,50,0.3)');
  duneLayer(b, -BGM, W + BGM, HZ + 5, 60, 0.0048, 4.1, '#df9054', '#c47340', 140, 'rgba(255,200,130,0.45)', 'rgba(150,56,36,0.4)');
  b.fillStyle = '#c47340'; b.fillRect(-BGM, HZ + 50, W + BGM * 2, H + BGM);
  // drifting cloud layer (own canvas, tiles horizontally)
  const c = cl.getContext('2d'), r = seeded(91);
  c.translate(0, BGM);
  for (let i = 0; i < 34; i++) {
    const y = 250 + Math.pow(r(), 0.9) * (HZ - 230 - 250), x = r() * CLW;
    const near = clamp((y - 250) / (HZ - 480), 0, 1), w = lerp(560, 300, near) * (0.6 + r() * 0.8), h = lerp(26, 11, near) * (0.7 + r() * 0.6);
    for (const ox of [0, -CLW, CLW]) if (x + ox > -w && x + ox < CLW + w) drawCloud(c, x + ox, y, w, h, seeded(i * 7919 + 13));
  }
}
let cloudDrift = 0;
function drawSkyLive() {   // called in the parallax transform, right after the static sky
  cloudDrift = (clock * 7) % CLW;
  ctx.drawImage(cl, -BGM - cloudDrift, -BGM); ctx.drawImage(cl, -BGM - cloudDrift + CLW, -BGM);
}
// ---------- desert floor (world layer, moves exactly with the fighters): near dunes, sand plane, shrubs, rocks
const AR = { x0: -900, y0: HZ - 140, w: W + 1800, h: H + 500 - (HZ - 140) };
const arenaC = document.createElement('canvas'); arenaC.width = AR.w; arenaC.height = AR.h; let arenaReady = false;
function buildArena() {
  const b = arenaC.getContext('2d'); b.translate(-AR.x0, -AR.y0);
  const x0 = AR.x0, x1 = AR.x0 + AR.w;
  duneLayer(b, x0, x1, HZ + 30, 80, 0.0036, 2.2, '#d98a4c', '#bc6a36', 200, 'rgba(255,200,130,0.4)');
  duneLayer(b, x0, x1, HZ + 120, 95, 0.0029, 5.6, '#d08046', '#b0602f', 260, 'rgba(255,196,124,0.35)');
  // the flat sand plane the fighters stand on
  const g = b.createLinearGradient(0, FLOOR - 150, 0, H + 500);
  g.addColorStop(0, '#d48a4c'); g.addColorStop(0.22, '#c97c42'); g.addColorStop(0.45, '#a85e30'); g.addColorStop(1, '#4a2216');
  b.fillStyle = g; b.beginPath(); b.moveTo(x0, H + 500);
  for (let x = x0; x <= x1; x += 10) b.lineTo(x, FLOOR - 120 - 26 * Math.sin(x * 0.0021 + 0.8) - 12 * Math.sin(x * 0.0057));
  b.lineTo(x1, H + 500); b.closePath(); b.fill();
  // wind ripples in the sand (thin light/dark curves)
  const r = seeded(4242);
  for (let i = 0; i < 70; i++) {
    const y = FLOOR - 100 + Math.pow(r(), 1.3) * 420, x = x0 + r() * AR.w, w = 60 + r() * 180, a = 0.05 + r() * 0.08;
    b.strokeStyle = `rgba(${r() < 0.5 ? '255,214,160' : '110,50,25'},${a})`; b.lineWidth = 2 + r() * 2;
    b.beginPath(); b.moveTo(x - w, y); b.quadraticCurveTo(x, y - 8 - r() * 8, x + w, y + (r() - 0.5) * 10); b.stroke();
  }
  // darker sand towards the viewer (depth)
  const v = b.createLinearGradient(0, FLOOR + 30, 0, FLOOR + 380); v.addColorStop(0, 'rgba(60,20,12,0)'); v.addColorStop(1, 'rgba(60,20,12,0.55)');
  b.fillStyle = v; b.fillRect(x0, FLOOR + 30, AR.w, 600);
  arenaReady = true;
}
const DECO = (() => {   // a few small shrubs and rocks on the sand (never in the middle of the fight line)
  const r = seeded(777), out = [];
  for (let i = 0; i < 26; i++) {
    const far = r() < 0.55, y = far ? FLOOR - 110 + r() * 80 : FLOOR + 30 + r() * 190, x = -400 + r() * (W + 800);
    out.push({ x, y, kind: r() < 0.45 ? 'shrub' : 'rock', sz: (far ? 0.5 : 1) * (0.7 + r() * 0.7), seed: Math.floor(r() * 1e6) });
  }
  return out.sort((a, b) => a.y - b.y);
})();
function drawDeco(d) {
  const r = seeded(d.seed), k = d.sz;
  if (d.kind === 'rock') {
    ctx.fillStyle = 'rgba(60,22,12,0.35)'; ctx.beginPath(); ctx.ellipse(d.x + 14 * k, d.y + 2, 22 * k, 4 * k, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a2c1a'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 4 * k, 12 * k, 7 * k, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,170,100,0.35)'; ctx.beginPath(); ctx.ellipse(d.x - 4 * k, d.y - 7 * k, 6 * k, 3 * k, 0, 0, TAU); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(60,22,12,0.35)'; ctx.beginPath(); ctx.ellipse(d.x + 18 * k, d.y + 2, 26 * k, 4 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3c1e14'; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = -PI / 2 + (r() - 0.5) * 2.2, l = (10 + r() * 16) * k;
      ctx.lineWidth = (2 + r() * 1.5) * k; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(d.x + Math.cos(a) * l * 0.5, d.y + Math.sin(a) * l * 0.4, d.x + Math.cos(a) * l, d.y + Math.sin(a) * l); ctx.stroke();
    }
    ctx.fillStyle = '#4a2618'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 4 * k, 9 * k, 5 * k, 0, 0, TAU); ctx.fill();
  }
}
function drawArena() {
  if (!arenaReady) buildArena();
  ctx.drawImage(arenaC, AR.x0, AR.y0);
  for (const d of DECO) drawDeco(d);
  // sandstone rock piles at the arena edges (the walls fighters bounce off), lit from the sun on the left
  for (const side of [-1, 1]) {
    const x = side < 0 ? WALL_L : WALL_R, P = (dx, dy) => [x + side * dx, FLOOR + dy];
    const shape = [P(-6, 30), P(-2, -150), P(14, -205), P(8, -240), P(40, -262), P(62, -232), P(95, -250), P(120, -205), P(150, -190), P(175, -130), P(210, -95), P(240, -40), P(270, 40)];
    ctx.fillStyle = '#4e2416'; ctx.beginPath(); shape.forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill();
    ctx.fillStyle = side < 0 ? 'rgba(255,150,80,0.30)' : 'rgba(255,150,80,0.14)'; ctx.beginPath(); [P(-2, -150), P(14, -205), P(8, -240), P(40, -262), P(48, -200), P(30, -120)].forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(30,8,6,0.35)'; ctx.beginPath(); [P(120, -205), P(150, -190), P(175, -130), P(210, -95), P(240, -40), P(150, -40)].forEach(([a, b], k) => (k ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(60,20,12,0.35)'; ctx.beginPath(); ctx.ellipse(x + side * 130 + 60, FLOOR + 36, 230, 18, 0, 0, PI * 2); ctx.fill();
  }
}
// long soft sunset shadow: the sun is low on the left, so shadows stretch to the right and slightly towards the viewer
function drawShadow(x, yTop, s, alpha = 1) {
  const h = clamp((FLOOR - yTop) / 500, 0, 1), k = 1 - h * 0.6, A = alpha * (1 - h * 0.7);
  ctx.save(); ctx.translate(x, FLOOR + 3 * s); ctx.rotate(0.07);
  const L = 150 * s * k, g = ctx.createLinearGradient(-10 * s, 0, L * 1.9, 0);
  g.addColorStop(0, `rgba(70,22,12,${0.55 * A})`); g.addColorStop(0.55, `rgba(70,22,12,${0.3 * A})`); g.addColorStop(1, 'rgba(70,22,12,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(L * 0.85, 0, L, 15 * s * k, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(55,18,10,${0.5 * A})`; ctx.beginPath(); ctx.ellipse(0, 0, 40 * s * k, 7 * s * k, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// ============================================================ drawing
// Reference style: solid-colour figures with THICK, muscular, tapered limbs, round head, no outline.
// tapered capsule from a to b: radius wa at a, wm in the middle (muscle bulge), wb at b
function taper(a, b, wa, wm, wb) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 0.001, nx = -dy / L, ny = dx / L, ang = Math.atan2(ny, nx);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, c = 2 * wm - (wa + wb) / 2;
  DC.beginPath(); DC.moveTo(a.x + nx * wa, a.y + ny * wa);
  DC.quadraticCurveTo(mx + nx * c, my + ny * c, b.x + nx * wb, b.y + ny * wb);
  DC.arc(b.x, b.y, wb, ang, ang - PI, true);
  DC.quadraticCurveTo(mx - nx * c, my - ny * c, a.x - nx * wa, a.y - ny * wa);
  DC.arc(a.x, a.y, wa, ang + PI, ang, true);
  DC.closePath(); DC.fill();   // each part filled on its own: overlapping parts never cancel (no holes)
}
let DC = ctx;   // current draw target for body shapes
function disc(x, y, r) { DC.beginPath(); DC.arc(x, y, r, 0, TAU); DC.fill(); }
// limb radii (x fighter size) - v8: thick, clean, almost even limbs like the sunset reference
const R_UA = [8.8, 9.0, 8.0], R_FA = [8.0, 8.0, 7.4], R_TH = [11.0, 11.2, 9.6], R_SH = [9.6, 9.4, 8.6];
const HEAD_K = 1.26;
function armPath(J, e, h, s, g) {
  taper(J.sh || J.neck, J[e], R_UA[0] * s + g, R_UA[1] * s + g, R_UA[2] * s + g);
  taper(J[e], J[h], R_FA[0] * s + g, R_FA[1] * s + g, R_FA[2] * s + g);
  disc(J[h].x, J[h].y, 9.2 * s + g);     // fist
}
function legPath(J, k, f, s, g) {
  taper(J.hip, J[k], R_TH[0] * s + g, R_TH[1] * s + g, R_TH[2] * s + g);
  taper(J[k], J[f], R_SH[0] * s + g, R_SH[1] * s + g, R_SH[2] * s + g);
  disc(J[f].x, J[f].y, 9.4 * s + g);     // rounded foot
}
function torsoPath(J, s, g) {
  const sh = { x: lerp(J.neck.x, J.hip.x, 0.1), y: lerp(J.neck.y, J.hip.y, 0.1) };
  taper(sh, J.hip, 12.6 * s + g, 12.8 * s + g, 11.4 * s + g);
  taper(J.neck, J.head, 6.4 * s + g, 6.4 * s + g, 6.4 * s + g);
  disc(J.head.x, J.head.y, J.hr * HEAD_K + g);
}
function withSh(J) { if (!J.sh) J.sh = { x: lerp(J.neck.x, J.hip.x, 0.1), y: lerp(J.neck.y, J.hip.y, 0.1) }; return J; }
// whole silhouette in one colour (impact frames, rim pass, afterimages)
function fillBody(J, s, color, g = 0) {
  withSh(J); DC.fillStyle = color;
  armPath(J, 'eB', 'hB', s, g); legPath(J, 'kB', 'fB', s, g); torsoPath(J, s, g); legPath(J, 'kF', 'fF', s, g); armPath(J, 'eF', 'hF', s, g);
}
// soft glow halo: silhouette drawn solid on an offscreen canvas, then blurred onto the scene (no seams at the joints)
const GLC = document.createElement('canvas'); GLC.width = W; GLC.height = H; const glx = GLC.getContext('2d');
const GLOW_KEYS = ['head', 'neck', 'hip', 'eF', 'hF', 'eB', 'hB', 'kF', 'fF', 'kB', 'fB'];
function glowPass(J, s, team, alpha) {
  const t = TEAMS[team], T = ctx.getTransform(), sc = Math.hypot(T.a, T.b);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const k of GLOW_KEYS) { const q = J[k]; if (!q) continue; const px = T.a * q.x + T.c * q.y + T.e, py = T.b * q.x + T.d * q.y + T.f; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
  const blur = clamp(10 * sc * s / 0.66, 5, 34), pad = (J.hr * HEAD_K + 16 * s) * sc + blur * 2.5;
  x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad)); x1 = Math.min(W, Math.ceil(x1 + pad)); y1 = Math.min(H, Math.ceil(y1 + pad));
  if (x1 - x0 < 2 || y1 - y0 < 2) return;
  glx.setTransform(1, 0, 0, 1, 0, 0); glx.clearRect(x0, y0, x1 - x0, y1 - y0);
  glx.setTransform(T); DC = glx; fillBody(J, s, `rgb(${t.glow})`, 4.5 * s); DC = ctx;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha * (team === 0 ? 0.95 : 1); ctx.filter = `blur(${(blur * VIEW.k).toFixed(1)}px)`;
  ctx.drawImage(GLC, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  if (team === 1) ctx.drawImage(GLC, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);   // red needs a 2nd pass to read on sand
  ctx.restore();
}
function drawBody(J, team, s, flash, alpha = 1) {
  const t = TEAMS[team]; withSh(J);
  if (alpha > 0.05) glowPass(J, s, team, alpha);
  ctx.globalAlpha = alpha;
  fillBody(J, s, t.rim, 2.2 * s);   // crisp bright outline (white / red)
  const front = flash ? t.flashC : t.body, rear = flash ? t.flashC : t.rear;
  ctx.fillStyle = rear; armPath(J, 'eB', 'hB', s, 0); legPath(J, 'kB', 'fB', s, 0);
  ctx.fillStyle = front; torsoPath(J, s, 0); legPath(J, 'kF', 'fF', s, 0); armPath(J, 'eF', 'hF', s, 0);
  ctx.globalAlpha = 1;
}
// small angry eyes on the head, facing the way the fighter faces (squint when hurt)
function drawFace(f) {
  const J = f.J, s = f.s, t = TEAMS[f.team], hr = J.hr * HEAD_K;
  if (!J || !J.head || !J.neck) return;
  const ang = Math.atan2(J.head.y - J.neck.y, J.head.x - J.neck.x) + PI / 2, fc = f.face * (f.spinFace || 1);
  const hurt = f.mv && f.mv.d && f.mv.d.hurt;
  ctx.save(); ctx.translate(J.head.x, J.head.y); ctx.rotate(ang); ctx.scale(fc, 1);
  ctx.strokeStyle = t.eye; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.6, hr * 0.17);
  if (f.team === 1) { ctx.shadowColor = 'rgba(255,40,20,0.95)'; ctx.shadowBlur = 6 * s / 0.66; }
  const y = -hr * 0.06, eyes = [hr * 0.08, hr * 0.5], w = hr * 0.16;
  eyes.forEach((cx, i) => {
    ctx.beginPath();
    if (hurt) { const d = i ? -1 : 1; ctx.moveTo(cx - w * d, y - w * 0.8); ctx.lineTo(cx + w * d, y); ctx.lineTo(cx - w * d, y + w * 0.8); }
    else if (i === 0) { ctx.moveTo(cx - w, y - w * 0.55); ctx.lineTo(cx + w, y + w * 0.25); }   // angry slant, both point down to the middle
    else { ctx.moveTo(cx - w, y + w * 0.25); ctx.lineTo(cx + w, y - w * 0.55); }
    ctx.stroke();
  });
  ctx.restore();
}

// compatibility helpers used elsewhere
function strokeStick(J, lw, color, headExtra) { fillBody(J, Math.max(0.3, (lw - 6) / 9), color, headExtra * 0.5); }
function drawStick(J, team, s, flash, alpha = 1) { drawBody(J, team, s, flash, alpha); }
function drawWeapon(f, sil) {
  const J = f.J, s = f.s;
  if (f.weapon === 'sword') {
    const tip = J.sw, h = J.hF;
    const ex = tip.x - h.x, ey = tip.y - h.y, l = Math.hypot(ex, ey) || 1, ux = ex / l, uy = ey / l, nx = -uy, ny = ux;
    if (f.heavyBlade) {
      // BLACK: big heavy cleaver / greatsword - wide blade, chopped tip
      const g0 = { x: h.x + ux * 10 * s, y: h.y + uy * 10 * s };
      ctx.fillStyle = sil ? (sil === true ? '#000' : sil) : '#3d4249';
      ctx.beginPath();
      ctx.moveTo(g0.x + nx * 7 * s, g0.y + ny * 7 * s); ctx.lineTo(tip.x + nx * 13 * s - ux * 6 * s, tip.y + ny * 13 * s - uy * 6 * s);
      ctx.lineTo(tip.x + nx * 4 * s, tip.y + ny * 4 * s); ctx.lineTo(tip.x - nx * 7 * s, tip.y - ny * 7 * s); ctx.lineTo(g0.x - nx * 6 * s, g0.y - ny * 6 * s); ctx.closePath(); ctx.fill();
      if (sil) return;
      ctx.strokeStyle = '#c9d0d8'; ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.moveTo(g0.x + nx * 7 * s, g0.y + ny * 7 * s); ctx.lineTo(tip.x + nx * 13 * s - ux * 6 * s, tip.y + ny * 13 * s - uy * 6 * s); ctx.lineTo(tip.x + nx * 4 * s, tip.y + ny * 4 * s); ctx.stroke();
      ctx.strokeStyle = '#1a1c20'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(h.x - ux * 12 * s, h.y - uy * 12 * s); ctx.lineTo(g0.x, g0.y); ctx.stroke();
      ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.moveTo(g0.x - nx * 10 * s, g0.y - ny * 10 * s); ctx.lineTo(g0.x + nx * 10 * s, g0.y + ny * 10 * s); ctx.stroke();
    } else {
      // WHITE: slim fast katana
      ctx.lineCap = 'round';
      ctx.strokeStyle = sil ? (sil === true ? '#000' : sil) : '#e9eef2'; ctx.lineWidth = 3.6 * s; ctx.beginPath(); ctx.moveTo(h.x, h.y);
      ctx.quadraticCurveTo(h.x + ex * 0.5 + nx * 5 * s, h.y + ey * 0.5 + ny * 5 * s, tip.x, tip.y); ctx.stroke();
      if (sil) return;
      ctx.strokeStyle = '#1b1b1f'; ctx.lineWidth = 4.5 * s; ctx.beginPath(); ctx.moveTo(h.x - ux * 12 * s, h.y - uy * 12 * s); ctx.lineTo(h.x + ux * 5 * s, h.y + uy * 5 * s); ctx.stroke();
      ctx.strokeStyle = '#c9a43a'; ctx.lineWidth = 3.5 * s; ctx.beginPath(); ctx.moveTo(h.x + ux * 6 * s - nx * 6 * s, h.y + uy * 6 * s - ny * 6 * s); ctx.lineTo(h.x + ux * 6 * s + nx * 6 * s, h.y + uy * 6 * s + ny * 6 * s); ctx.stroke();
    }
  } else if (f.isGun()) {
    const rifle = f.weapon === 'rifle';
    const a = Math.atan2(J.hF.y - J.eF.y, J.hF.x - J.eF.x);
    ctx.save(); ctx.translate(J.hF.x, J.hF.y); ctx.rotate(a); ctx.scale(s, s * (Math.cos(a) < 0 ? -1 : 1));
    ctx.fillStyle = sil ? (sil === true ? '#000' : sil) : '#1b1d22';
    if (rifle) { ctx.fillRect(-26, -6, 96, 11); ctx.fillRect(4, 4, 9, 16); ctx.fillRect(-26, -4, 14, 14); }
    else { ctx.fillRect(-4, -6, 32, 10); ctx.fillRect(-2, 2, 9, 14); }
    ctx.restore();
  }
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// SMEAR FRAMES: fast limbs get stretched between where they were and where they are (like hand-drawn smears)
function drawSmears(f) {
  const H_ = f.jh; if (!H_ || H_.length < 4) return;
  const old = H_[H_.length - 4], J = f.J, s = f.s, t = TEAMS[f.team];
  for (const [e, h, front] of [['eF', 'hF', 1], ['eB', 'hB', 0], ['kF', 'fF', 1], ['kB', 'fB', 0]]) {
    const d = Math.hypot(J[h].x - old[h].x, J[h].y - old[h].y);
    if (d < 26 * s) continue;
    const a = clamp((d - 26 * s) / (60 * s), 0.25, 0.75);
    ctx.globalAlpha = a; ctx.fillStyle = front ? t.body : t.rear;
    const r1 = (e[0] === 'k' ? R_SH[0] : R_FA[0]) * s, r2 = (e[0] === 'k' ? R_SH[2] : R_FA[2]) * s;
    ctx.beginPath();   // swept quad: old limb -> new limb
    ctx.moveTo(old[e].x, old[e].y); ctx.lineTo(old[h].x, old[h].y); ctx.lineTo(J[h].x, J[h].y); ctx.lineTo(J[e].x, J[e].y); ctx.closePath(); ctx.fill();
    taper(old[e], old[h], r1 * 0.8, r1 * 0.8, r2 * 0.8);
    ctx.globalAlpha = a * 0.6; ctx.strokeStyle = front ? t.body : t.rear; ctx.lineWidth = r2 * 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(old[h].x, old[h].y); ctx.lineTo(J[h].x, J[h].y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// light trails only for blades and power-ups
function drawTrails(f) {
  ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
  const col = f.superT > 0 || f.auraT > 0 ? TEAMS[f.team].aura : '255,255,255';
  const keys = f.superT > 0 || f.auraT > 0 ? ['hF', 'hB', 'fF', 'fB', 'sw'] : ['sw'];
  let best = null, bs = 0;   // rules: trail only the single fastest limb
  for (const k of keys) {
    if (k === 'sw' && f.weapon !== 'sword') continue;
    const a = f.tr[k]; if (!a || a.length < 3) continue;
    const n = a.length, v = Math.hypot(a[n - 1].x - a[n - 3].x, a[n - 1].y - a[n - 3].y);
    if (v > bs) { bs = v; best = k; }
  }
  for (const k of best ? [best] : []) {
    const a = f.tr[k];
    const n = a.length, sp = Math.hypot(a[n - 1].x - a[n - 3].x, a[n - 1].y - a[n - 3].y);
    if (sp < 24 * f.s) continue;
    const alpha = clamp((sp - 24 * f.s) / (60 * f.s), 0.15, 0.7);
    for (let i = 1; i < n; i++) {
      const u = i / (n - 1);
      ctx.strokeStyle = `rgba(${col},${alpha * u})`; ctx.lineWidth = (k === 'sw' ? 6 : 9) * f.s * u + 1;
      ctx.beginPath(); ctx.moveTo(a[i - 1].x, a[i - 1].y); ctx.lineTo(a[i].x, a[i].y); ctx.stroke();
    }
  }
  if (f.weapon === 'sword') {   // blade arc
    const h = f.tr.hF, t = f.tr.sw, n = t.length;
    if (n > 2 && Math.hypot(t[n - 1].x - t[n - 3].x, t[n - 1].y - t[n - 3].y) > 30 * f.s) {
      ctx.fillStyle = f.heavyBlade ? 'rgba(200,170,255,0.28)' : 'rgba(255,235,235,0.32)';
      ctx.beginPath(); ctx.moveTo(h[0].x, h[0].y);
      for (const p of t) ctx.lineTo(p.x, p.y);
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(h[i].x, h[i].y);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
function eyesOn(f) {
  const n = f.mv ? f.mv.name : '';
  return f.superT > 0 || f.auraT > 0 || (duel.sp && (duel.sp.a === f || duel.sp.b === f)) || f.combo >= 3 || f.hp < f.maxHp * 0.3 || /fly|tornado|spinback|uppercut|roundhouse|iai|sw/.test(n) || round.sudden;
}
// glowing eyes with a trailing streak during intense moments
function drawEyes(f) {
  if (!eyesOn(f) || !f.eyeTr || f.eyeTr.length < 2 || (f.mv && f.mv.d.lie)) return;
  const t = TEAMS[f.team], tr = f.eyeTr, s = f.s, p = tr[tr.length - 1];
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const glow = f.team === 1 ? '255,60,40' : '255,236,200';
  for (let i = 1; i < tr.length; i++) {
    const u = i / (tr.length - 1);
    ctx.strokeStyle = `rgba(${glow},${0.55 * u})`; ctx.lineWidth = 4.5 * s * u + 0.5;
    ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
  }
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 13 * s);
  g.addColorStop(0, `rgba(${glow},0.9)`); g.addColorStop(1, `rgba(${glow},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 13 * s, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}
// power-up aura: warm white for WHITE, red for BLACK
function drawAura(f) {
  const J = f.J, s = f.s, c = TEAMS[f.team].aura;
  ctx.globalCompositeOperation = 'lighter';
  for (const k of ['head', 'neck', 'hip', 'hF', 'hB', 'kF', 'kB', 'fF', 'fB']) {
    const q = J[k], r = (k === 'hip' || k === 'neck' ? 46 : 30) * s * (1 + 0.18 * Math.sin(clock * 17 + q.x * 0.05));
    const g = ctx.createRadialGradient(q.x, q.y - 6 * s, 2, q.x, q.y - 10 * s, r);
    g.addColorStop(0, `rgba(${c},0.32)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y - 10 * s, r, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawFighter(f) {
  if (f.hidden) return;
  const J = f.J, s = f.s;
  const aura = f.superT > 0 || f.auraT > 0 || teams[f.team].rageT > 0 || f.giant;
  if (aura) drawAura(f);
  for (const g of f.ghosts) { ctx.globalAlpha = g.life * 1.6; fillBody(g.J, s, aura ? `rgb(${TEAMS[f.team].aura})` : TEAMS[f.team].rear, 0); }
  ctx.globalAlpha = 1;
  drawTrails(f);
  drawSmears(f);
  const lying = f.mv && f.mv.d.lie;
  const blink = f.invuln > 0 && !lying && Math.floor(clock * 20) % 2 === 0;
  drawBody(J, f.team, s, f.flash > 0, blink ? 0.7 : 1);
  drawWeapon(f);
  drawEyes(f);
  if (!lying) drawFace(f);
}
function drawRagdoll(r) {
  const J = {}; RD_KEYS.forEach((k, i) => (J[k] = r.pts[i])); J.hr = r.hr;
  drawBody(J, r.team, r.s, r.flash > 0, clamp(r.life, 0, 1));
}
function drawPlane(p) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.vx > 0 ? 1 : -1, 1);
  ctx.fillStyle = '#20263a'; ctx.strokeStyle = '#8fa6d8'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(60, -16); ctx.lineTo(-90, -14); ctx.lineTo(-120, -50); ctx.lineTo(-140, -50); ctx.lineTo(-125, 0); ctx.lineTo(-90, 14); ctx.lineTo(60, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, 4); ctx.lineTo(-40, 50); ctx.lineTo(-62, 50); ctx.lineTo(-40, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = TEAMS[p.team].ui; ctx.fillRect(-80, -5, 120, 7);
  ctx.fillStyle = '#7fd4ff'; ctx.beginPath(); ctx.ellipse(55, -8, 20, 7, 0, 0, PI * 2); ctx.fill();
  const fl = ctx.createLinearGradient(-125, 0, -220, 0); fl.addColorStop(0, 'rgba(255,190,80,0.9)'); fl.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = fl; ctx.beginPath(); ctx.moveTo(-125, -8); ctx.lineTo(-220 - rand(0, 30), 0); ctx.lineTo(-125, 8); ctx.fill();
  ctx.restore();
}
function drawParticles(layer) {
  for (const p of parts) {
    if (layer === 'back' ? p.k !== 'cloud' : p.k === 'cloud') continue;
    const a = clamp(p.life / p.max, 0, 1);
    if (p.k === 'spark') {
      ctx.strokeStyle = p.color; ctx.globalAlpha = a; ctx.lineWidth = p.size; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022); ctx.stroke();
    } else if (p.k === 'flash') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.4 - a * 0.4), 0, PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    } else if (p.k === 'ring') {
      ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = p.w * a + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - a * 0.85), 0, PI * 2); ctx.stroke();
    } else if (p.k === 'smoke' || p.k === 'dust') {
      ctx.globalAlpha = a * (p.k === 'dust' ? 0.6 : 0.55); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.8 - a), 0, PI * 2); ctx.fill();
    } else if (p.k === 'fire') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    } else if (p.k === 'plus') {
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.font = `${p.size}px Russo, Arial`; ctx.textAlign = 'center'; ctx.fillText('+', p.x, p.y);
    } else if (p.k === 'conf') {
      ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
    } else if (p.k === 'dash') {          // iaido dash streak
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#7fd4ff'; ctx.lineWidth = 26 * p.s * a; ctx.beginPath(); ctx.moveTo(p.x1, p.y); ctx.lineTo(p.x2, p.y); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6 * p.s * a + 1; ctx.beginPath(); ctx.moveTo(p.x1, p.y); ctx.lineTo(p.x2, p.y); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.k === 'cloud') {          // billowing dust
      const u = 1 - a, r = p.size * (1 + u * p.grow);
      ctx.globalAlpha = Math.min(1, a * 1.6) * 0.34; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y + r * 0.15, r * 0.7, 0, TAU); ctx.arc(p.x + r * 0.4, p.y + r * 0.1, r * 0.65, 0, TAU); ctx.fill();
    } else if (p.k === 'dirt') {
      ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.k === 'hitflash') {       // white circle + radial spikes
      const age = p.max - p.life, k = clamp(age / 0.04, 0, 1), r = p.size * (0.5 + 0.6 * k);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.15); g.addColorStop(0, `rgba(255,255,255,${0.7 * a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.15, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55 * (1 - 0.4 * (1 - a)), 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
      for (const [ang, l] of p.rays) { const r1 = r * 0.7, r2 = r * (0.9 + l * (0.6 + k)); ctx.lineWidth = 3 * a + 1; ctx.beginPath(); ctx.moveTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1); ctx.lineTo(p.x + Math.cos(ang) * r2, p.y + Math.sin(ang) * r2); ctx.stroke(); }
    } else if (p.k === 'shock') {          // shockwave distortion ring
      const u = 1 - a, r = p.size * (0.15 + u * 1.1);
      ctx.globalAlpha = a * 0.85; ctx.lineWidth = 18 * a + 2; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.92, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 40 * a + 4; ctx.strokeStyle = 'rgba(255,240,230,0.12)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.93, r * 0.86, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = `rgba(40,20,20,${0.4 * a})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.05, r * 0.97, 0, 0, TAU); ctx.stroke();
    } else if (p.k === 'ember') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.fillStyle = `rgb(${p.color})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    } else if (p.k === 'laser') {          // afterimage attack line
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.globalAlpha = a * 0.5; ctx.strokeStyle = `rgb(${p.color})`; ctx.lineWidth = 16 * a + 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3 * a + 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.k === 'after') {          // afterimage silhouette
      ctx.globalAlpha = a * 0.55; fillBody(p.J, p.s, `rgb(${TEAMS[p.team].aura})`, 0);
    } else if (p.k === 'slashline') {     // big anime slash across the body
      const grow = clamp((p.max - p.life) / 0.06, 0, 1), L = p.len * grow, c = Math.cos(p.ang), sn = Math.sin(p.ang);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.globalAlpha = a * 0.6; ctx.strokeStyle = '#9fe3ff'; ctx.lineWidth = 18 * a + 2;
      ctx.beginPath(); ctx.moveTo(p.x - c * L / 2, p.y - sn * L / 2); ctx.lineTo(p.x + c * L / 2, p.y + sn * L / 2); ctx.stroke();
      ctx.globalAlpha = a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5 * a + 1;
      ctx.beginPath(); ctx.moveTo(p.x - c * L / 2, p.y - sn * L / 2); ctx.lineTo(p.x + c * L / 2, p.y + sn * L / 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
}
function updateParticles(dt) {
  for (const p of parts) {
    p.life -= dt;
    if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += G * (p.g || 0) * dt; if (p.k !== 'conf') p.vx *= Math.exp(-2 * dt); }
    if (p.k === 'conf') { p.rot += p.vr * dt; p.vx += Math.sin(p.life * 3) * 20 * dt; }
    if (p.k === 'dust' && p.y > FLOOR) { p.y = FLOOR; p.vy = 0; }
    if (p.k === 'dirt' && p.y > FLOOR + 4) { p.y = FLOOR + 4; p.vy *= -0.25; p.vx *= 0.5; }
    if (p.k === 'cloud') { p.vx *= Math.exp(-1.5 * dt); p.vy *= Math.exp(-1.5 * dt); if (p.y > FLOOR) p.y = FLOOR; }
  }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
}
function updateTexts(rdt) {
  for (const t of texts) { t.life -= rdt; t.oy += t.vy * rdt; t.vy *= Math.exp(-2.5 * rdt); }
  for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life <= 0) texts.splice(i, 1);
}
// ---------- reaction bubbles: speech bubble + big emoji over a fighter's head (one per fighter) ----------
const bubbles = [];
const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
function shortNick(n) { n = String(n || '').replace(/^@/, ''); return n.length > 12 ? n.slice(0, 11) + '…' : n; }
function bubble(f, text, emo = '', o = {}) {
  if (!f || (!f.alive && !o.dead)) return;
  const pri = o.pri || 1, i = bubbles.findIndex((b) => b.f === f);
  if (i >= 0) { const b = bubbles[i]; if (!o.force && (b.pri > pri || b.t < 0.6)) return; bubbles.splice(i, 1); }
  else if (!o.force && clock < (f.bubbleCD || 0) && pri < 3) return;
  bubbles.push({ f, text, emo, t: 0, dur: o.dur || 1.5, pri });
  f.bubbleCD = clock + (o.cd ?? 2.4);
}
const TAUNTS = [['taunt', ['COME ON!', 'IS THAT ALL?'], '😏'], ['chinWipe', ['THAT TICKLED!', 'IS THAT ALL?'], '😤'], ['neckCrack', ['WARMED UP!', 'MY TURN!'], '💪'], ['shrug', ['TOO EASY!', 'BORING!'], '🥱']];
function bodyTaunt(f) {
  const [mv, lines, emo] = pick(TAUNTS);
  f.mv = null; f.play(mv); bubble(f, pick(lines), emo, { pri: 1, dur: 1.4 });
}
function updateBubbles(rdt) {
  for (const b of bubbles) b.t += rdt;
  for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; if (b.t > b.dur || (!b.f.alive && !b.f.rd) || (b.f.rd && b.f.rd.life <= 0)) bubbles.splice(i, 1); }
}
function drawBubbles() {
  if (!bubbles.length) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const zk = clamp(Math.sqrt(cam.V.z), 1, 1.45), placed = [];
  const order = bubbles.slice().sort((a, b) => a.pri - b.pri);
  for (const b of order) {
    const f = b.f; let hx, hy;
    if (f.alive && f.J) { hx = f.J.head.x; hy = Math.min(f.J.head.y, f.J.hF.y, f.J.hB.y) - f.J.hr; }
    else if (f.rd) { const q = f.rd.pts[0]; hx = q.x; hy = Math.min(...f.rd.pts.map((p) => p.y)) - 20; }
    else continue;
    const head = w2s(hx, hy), foe = f.foe && f.foe.alive ? f.foe : null;
    const side = foe ? (foe.x > f.x ? -1 : 1) : 0;          // lean the bubble away from the foe (keeps contacts clear)
    const pop = b.t < 0.22 ? 1 + 0.25 * Math.sin(b.t / 0.22 * PI) - (1 - b.t / 0.22) * 0.9 : 1;
    const a = clamp((b.dur - b.t) / 0.25, 0, 1), sc = Math.max(0.1, pop) * zk;
    ctx.font = `${Math.round(66 * zk)}px Bangers, Impact, sans-serif`;
    const tw = b.text ? ctx.measureText(b.text).width : 0, es = Math.round((b.text ? 96 : 140) * zk);
    const bw = b.text ? tw + 46 * zk : 0, bh = 92 * zk, gapE = b.text ? 10 * zk : 0;
    const totW = bw + (b.emo ? es + gapE : 0);
    let cx = head.x + side * (totW * 0.32 + 30), cy = head.y - 115 * zk - bh / 2;
    cx = clamp(cx, totW / 2 + 16, W - totW / 2 - 16);
    cy = clamp(cy, VIEW_TOP + bh / 2 + 70, VIEW_BOT - 200);
    for (const q of placed) if (Math.abs(q.x - cx) < (q.w + totW) / 2 + 8 && Math.abs(q.y - cy) < bh + 6) cy = q.y - bh - 14;   // stack instead of overlap
    placed.push({ x: cx, y: cy, w: totW });
    const tcol = TEAMS[f.team].ui;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy + (1 - a) * -20); ctx.scale(sc / zk, sc / zk);
    const left = -totW / 2;
    if (b.text) {
      const bx = left + (side > 0 ? es + gapE : 0) * (b.emo ? 1 : 0), tailX = clamp(head.x - cx, bx + 30, bx + bw - 30);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 7 * zk;
      roundRect(bx, -bh / 2, bw, bh, 26 * zk);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tailX - 18 * zk, bh / 2 - 3); ctx.lineTo(tailX + 4 * zk, bh / 2 + 34 * zk); ctx.lineTo(tailX + 18 * zk, bh / 2 - 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(tailX - 18 * zk, bh / 2); ctx.lineTo(tailX + 4 * zk, bh / 2 + 34 * zk); ctx.lineTo(tailX + 18 * zk, bh / 2); ctx.stroke();
      ctx.fillStyle = TEAMS[f.team].bub || tcol; ctx.fillRect(bx + 20 * zk, -bh / 2 + 6 * zk, bw - 40 * zk, 6 * zk);   // team colour stripe
      ctx.font = `${Math.round(66 * zk)}px Bangers, Impact, sans-serif`; ctx.lineJoin = 'round';
      ctx.lineWidth = 9 * zk; ctx.strokeStyle = TEAMS[f.team].bub || tcol; ctx.strokeText(b.text, bx + bw / 2, 4 * zk);
      ctx.fillStyle = '#111'; ctx.fillText(b.text, bx + bw / 2, 4 * zk);
    }
    if (b.emo) {
      const ex = b.text ? (side > 0 ? left + es / 2 : left + bw + gapE + es / 2) : 0;
      ctx.font = `${es}px ${EMOJI_FONT}`; ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10; ctx.fillStyle = '#fff';
      ctx.save(); ctx.translate(ex, 4 * zk); ctx.rotate(Math.sin(b.t * 9) * 0.08 * (b.t < 0.6 ? 1 : 0.4)); ctx.fillText(b.emo, 0, 0); ctx.restore();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
}
function outlined(text, x, y, font, fill, stroke = '#000', lw = 8) {
  ctx.font = font; ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
// floating texts, name tags and HP bars are drawn in SCREEN space (always readable, also when zoomed in)
function drawWorldUI() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const zk = clamp(Math.sqrt(cam.V.z), 1, 1.45);
  const tags = [];
  for (const f of fighters) {
    if (!f.alive || !f.J) continue;
    const top = Math.min(f.J.head.y, f.J.hF.y, f.J.hB.y, f.J.fF.y, f.J.fB.y) - f.J.hr - 8;
    const p = w2s(f.x, top); p.y = clamp(p.y, VIEW_TOP + 80, VIEW_BOT - 20); tags.push([f, p]);
  }
  if (tags.length === 2) {   // keep the two name tags apart when the fighters are close
    const [A, B] = tags[0][1].x <= tags[1][1].x ? [tags[0][1], tags[1][1]] : [tags[1][1], tags[0][1]];
    const gap = 175 * zk - (B.x - A.x);
    if (gap > 0 && Math.abs(A.y - B.y) < 60 * zk) { A.x -= gap / 2; B.x += gap / 2; }
  }
  for (const [f, p] of tags) {
    p.x = clamp(p.x, 90, W - 90);
    const t = TEAMS[f.team], bw = 96 * zk, hp = clamp(f.hp / f.maxHp, 0, 1), sh = clamp((f.hp - f.maxHp) / f.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(p.x - bw / 2 - 2, p.y - 12, bw + 4, 12);
    ctx.fillStyle = hp > 0.5 ? '#3dff7a' : hp > 0.25 ? '#ffd23f' : '#ff4040'; ctx.fillRect(p.x - bw / 2, p.y - 10, bw * hp, 8);
    if (sh > 0) { ctx.fillStyle = '#6ee6ff'; ctx.fillRect(p.x - bw / 2, p.y - 17, bw * sh * 2, 5); }
    const label = (f.giant ? 'GIANT ' : '') + f.name + (f.superT > 0 ? ' ★' : '');
    const fs = Math.round(20 * zk);
    ctx.font = `${fs}px Russo, Arial, sans-serif`;
    const tw = ctx.measureText(label).width + 16, ty = p.y - 22;
    ctx.globalAlpha = 0.95; ctx.fillStyle = t.panel; roundRect(p.x - tw / 2, ty - fs - 3, tw, fs + 9, 8); ctx.fill();
    ctx.strokeStyle = t.ui; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = t.text; ctx.fillText(label, p.x, ty); ctx.globalAlpha = 1;
    if (f.weapon !== 'fists') { ctx.font = '17px Russo, Arial'; ctx.fillStyle = '#ffd84a'; ctx.fillText(WEAPON_NAMES[f.weapon] + (f.isGun() ? (f.mv && f.mv.name === 'reload' ? ' RELOAD' : ' ' + f.ammo) : ''), p.x, ty - fs - 10); }
    if (f.combo >= 2) {
      const sc = 1 + Math.max(0, f.comboPop) * 2;
      ctx.save(); ctx.translate(p.x, p.y - 100 * zk); ctx.scale(sc, sc); ctx.rotate(-0.08);
      outlined(f.combo + ' HITS!', 0, 0, '38px Bangers, Impact', '#ffd84a', '#000', 6); ctx.restore();
    }
  }
  for (const t of texts) {
    const p = w2s(t.x, t.y), a = clamp(t.life / t.max * 1.5, 0, 1), pop = 1 + Math.max(0, t.life - t.max + 0.12) * 4;
    const y = clamp(p.y + t.oy, VIEW_TOP + 40, VIEW_BOT - 20), x = clamp(p.x, 90, W - 90);
    ctx.globalAlpha = a; outlined(t.text, x, y, `${Math.round(t.size * pop * zk)}px Bangers, Impact, sans-serif`, t.color, '#000', 6);
  }
  ctx.globalAlpha = 1;
  for (const p of planes) { const q = w2s(p.x - p.vx * 0.1, p.y - 70); outlined('AIRSTRIKE by ' + p.nick, clamp(q.x, 200, W - 200), clamp(q.y, VIEW_TOP + 40, VIEW_BOT), '28px Russo, Arial', '#ffd84a', '#000', 5); }
}
const WEAPON_NAMES = { sword: 'KATANA', pistol: 'PISTOL', rifle: 'RIFLE', fists: 'FISTS' };
// ---------- cinematic overlays (screen space) ----------
function drawFocusLines(px, py, alpha, color) {
  ctx.fillStyle = color; ctx.globalAlpha = alpha;
  for (let i = 0; i < 64; i++) {
    const a = rand(0, TAU), w = rand(0.004, 0.014), r1 = rand(300, 520), r2 = 1700;
    ctx.beginPath(); ctx.moveTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
    ctx.lineTo(px + Math.cos(a - w) * r2, py + Math.sin(a - w) * r2); ctx.lineTo(px + Math.cos(a + w) * r2, py + Math.sin(a + w) * r2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawOverlays() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fx.focusT > 0) { const p = w2s(fx.focusX, fx.focusY); drawFocusLines(p.x, p.y, clamp(fx.focusT * 2, 0, 0.32), '#ffffff'); }
  if (fx.streakT > 0) {
    ctx.globalAlpha = clamp(fx.streakT * 2.5, 0, 0.45); ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) { const y = rand(VIEW_TOP, VIEW_BOT), x = rand(-200, W), l = rand(200, 700); ctx.fillRect(x, y, l, rand(1.5, 4)); }
    ctx.globalAlpha = 1;
  }
  if (cam.whipT > 0) {   // whip pan smear
    ctx.globalAlpha = clamp(cam.whipT * 1.6, 0, 0.35); ctx.fillStyle = '#c9d6ff';
    for (let i = 0; i < 40; i++) ctx.fillRect(rand(-300, W), rand(VIEW_TOP, VIEW_BOT), rand(300, 900), rand(1, 3));
    ctx.globalAlpha = 1;
  }
}
// anime impact frame: 1-2 frames of stark black/white (inverted on the 2nd frame); 'red' = silhouette-slash look
function drawImpact() {
  const I = fx.impact; if (!I || I.t <= 0) return;
  const age = I.dur - I.t, inv = I.mode === 'red' || I.mode === 'black' || (I.mode !== 'white' && age > 0.034);
  const bgc = I.mode === 'red' ? '#120204' : inv ? '#050505' : '#ffffff', fg = inv ? '#ffffff' : '#000000';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = bgc; ctx.fillRect(0, 0, W, H);
  if (I.mode === 'red') { const g = ctx.createRadialGradient(W / 2, VIEW_CY, 50, W / 2, VIEW_CY, 900); g.addColorStop(0, 'rgba(220,20,30,0.95)'); g.addColorStop(1, 'rgba(60,0,6,0.9)'); ctx.fillStyle = g; ctx.fillRect(0, VIEW_TOP, W, VIEW_BOT - VIEW_TOP); }
  setWorld(cam.V);
  if (I.mode !== 'red') { ctx.fillStyle = inv ? '#1a1a1a' : '#d8d8d8'; ctx.fillRect(-900, FLOOR, W + 1800, 900); }
  for (const r of ragdolls) { const J = {}; RD_KEYS.forEach((k, i) => (J[k] = r.pts[i])); J.hr = r.hr; fillBody(J, r.s, fg, 1); }
  for (const f of fighters) if (f.alive && !f.hidden) { fillBody(f.J, f.s, fg, 1); drawWeapon(f, fg); }
  if (I.mode === 'red') { ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; for (const q of parts) if (q.k === 'dash') { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); ctx.lineWidth = 14 * q.s; ctx.beginPath(); ctx.moveTo(q.x1, q.y); ctx.lineTo(q.x2, q.y); ctx.stroke(); } ctx.globalAlpha = 1; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const p = w2s(I.x, I.y); drawFocusLines(p.x, p.y, 0.8, inv ? (I.mode === 'red' ? '#ffffff' : '#ffffff') : '#000000');
}
function drawCrown(x, y, s, c) {
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4 * s, y - 10 * s); ctx.lineTo(x + 9 * s, y - 4 * s); ctx.lineTo(x + 14 * s, y - 12 * s); ctx.lineTo(x + 19 * s, y - 4 * s); ctx.lineTo(x + 24 * s, y - 10 * s); ctx.lineTo(x + 28 * s, y); ctx.closePath(); ctx.fill();
}
let legendCache = null;
function legendRows() {
  if (legendCache) return legendCache;
  const map = S.gifts.gifts || {}, rows = [], seen = {};
  const short = { sword: 'KATANA', super: 'KUNG FU', pistol: 'PISTOL', rifle: 'RIFLE', airstrike: 'AIRSTRIKE', giant: 'GIANT', ultimate: 'GIANT+BOMBS', boost: 'RAGE' };
  for (const [k, v0] of Object.entries(map)) {
    if (k.startsWith('_')) continue;
    const v = typeof v0 === 'string' ? { heal: 10, power: v0 } : v0;
    const key = v.power || 'heal';
    if (seen[key]) { if (seen[key].names.length < 2 && key !== 'heal') seen[key].names.push(k); continue; }
    seen[key] = { names: [k], txt: `+${v.heal || 0} HP` + (v.power ? ' + ' + (short[v.power] || v.power) : '') };
    rows.push(seen[key]);
  }
  const lk = S.gifts.likes || { every: 10, heal: 2 };
  const out = rows.slice(0, 7).map((r) => [r.names.join(' / '), r.txt]);
  out.push([`${lk.every} LIKES`, `+${lk.heal} HP`]);
  return (legendCache = out);
}
function drawHUD() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const now = clock;
  const tg = ctx.createLinearGradient(0, 0, 0, VIEW_TOP + 10); tg.addColorStop(0, 'rgba(2,3,10,0.97)'); tg.addColorStop(0.88, 'rgba(2,3,10,0.75)'); tg.addColorStop(1, 'rgba(2,3,10,0)');
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, VIEW_TOP + 10);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = '#2f7bff'; ctx.shadowBlur = 24;
  outlined(G_().title || 'STICK WAR LIVE', W / 2, 78, '76px Bangers, Impact, sans-serif', '#ffffff', '#1340a8', 10);
  ctx.shadowBlur = 0;
  const secs = Math.max(0, Math.ceil((G_().roundSeconds || 75) - round.time));
  const tstr = round.state === 'fight' ? (round.sudden ? 'SUDDEN DEATH!' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`) : round.state === 'end' ? 'WINNER!' : 'READY';
  outlined(`ROUND ${round.n}   •   ${tstr}`, W / 2, 120, '30px Russo, Arial, sans-serif', round.sudden ? '#ff5050' : '#9fc1ff', '#000', 6);
  ctx.textAlign = 'left'; ctx.font = '22px Russo, Arial';
  const m = S.live.mode;
  const st = m === 'live' ? ['● connected to @' + S.live.username, '#ff3b5c'] : m === 'simulator' ? ['● TEST MODE', '#ffd23f'] : m === 'offline' ? ['● waiting for @' + S.live.username + ' to go LIVE...', '#ffd0a0'] : m === 'error' ? ['● ' + (S.live.message || 'error'), '#ff8080'] : ['● connecting to @' + (S.live.username || '') + '...', '#c9d6ff'];
  const stHide = m === 'live' && performance.now() - (S.liveAt || 0) > 6000; // status hides itself once connected
  if (!QS.has('clean') && !stHide) { ctx.fillStyle = st[1]; ctx.fillText(st[0], 18, 28); }
  if (S.viewers) { ctx.textAlign = 'right'; ctx.fillStyle = '#c9d6ff'; ctx.fillText(S.viewers + ' watching', W - 18, 28); }
  // two big team cards
  const lk = S.gifts.likes || { every: 10, heal: 2 };
  for (let i = 0; i < NT; i++) {
    const t = TEAMS[i], w = 514, x = i === 0 ? 16 : W - 16 - w, y = 138, h = 262, tm = teams[i], hero = heroes[i], R = i === 1;
    ctx.fillStyle = t.panel; roundRect(x, y, w, h, 20); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = t.ui;
    if (round.state === 'end' && round.winner === i) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 8; }
    ctx.stroke();
    const L = R ? x + w - 22 : x + 22, al = R ? 'right' : 'left', ar = R ? 'left' : 'right', Rr = R ? x + 22 : x + w - 22;
    ctx.textAlign = al; ctx.font = '64px Bangers, Impact, sans-serif'; if (i === 0) { ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 16; ctx.fillStyle = '#ffffff'; } else { ctx.shadowColor = 'rgba(255,30,20,0.9)'; ctx.shadowBlur = 16; ctx.fillStyle = '#0b0a0c'; } ctx.fillText(t.name, L, y + 64); if (i === 1) { ctx.lineWidth = 2.5; ctx.strokeStyle = '#ff4040'; ctx.strokeText(t.name, L, y + 64); } ctx.shadowBlur = 0;
    ctx.textAlign = ar; ctx.font = '18px Russo, Arial'; ctx.fillStyle = '#ffd84a'; ctx.fillText(`COMMENT ${i + 1}`, Rr, y + 30);
    drawCrown(R ? x + 22 : x + w - 92, y + 66, 1.2, '#ffc93a');
    ctx.font = '34px Russo, Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = R ? 'left' : 'right'; ctx.fillText(String(tm.wins), R ? x + 62 : x + w - 22, y + 66);
    const bx = x + 20, by = y + 82, bw = w - 40, bh = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(bx, by, bw, bh, 10); ctx.fill();
    if (hero && hero.alive) {
      const r = clamp(hero.hp / hero.maxHp, 0, 1), sh = clamp((hero.hp - hero.maxHp) / hero.maxHp, 0, 1);
      const fw = Math.max(14, bw * r);
      ctx.fillStyle = r > 0.5 ? '#2fe36a' : r > 0.25 ? '#ffd23f' : '#ff4040'; roundRect(R ? bx + bw - fw : bx, by, fw, bh, 10); ctx.fill();
      if (sh > 0) { const sw = Math.max(14, bw * sh * 2); ctx.fillStyle = 'rgba(110,230,255,0.9)'; roundRect(R ? bx + bw - sw : bx, by, sw, 12, 6); ctx.fill(); }
      ctx.font = '22px Russo, Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
      const txt = `HP ${Math.ceil(hero.hp)}` + (sh > 0 ? `  (SHIELD +${Math.ceil(hero.hp - hero.maxHp)})` : '');
      ctx.strokeText(txt, bx + bw / 2, by + 28); ctx.fillText(txt, bx + bw / 2, by + 28);
    } else { ctx.font = '30px Bangers, Impact'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff6a6a'; ctx.fillText('K.O.', bx + bw / 2, by + 30); }
    ctx.textAlign = al; ctx.font = '22px Russo, Arial'; ctx.fillStyle = '#fff'; ctx.fillText(`FANS: ${supportersOf(i).length}`, L, y + 152);
    if (hero && hero.alive && (hero.weapon !== 'fists' || hero.superT > 0 || hero.giantT > 0)) {
      ctx.textAlign = ar; ctx.fillStyle = '#ffd84a'; ctx.font = '19px Russo, Arial';
      ctx.fillText([hero.giantT > 0 ? 'GIANT' : '', hero.superT > 0 ? 'KUNG FU' : '', hero.weapon !== 'fists' ? WEAPON_NAMES[hero.weapon] : ''].filter(Boolean).join(' + '), Rr, y + 152);
    }
    ctx.font = '20px Russo, Arial';
    const top = topSupporters(i, 3);
    if (!top.length) { ctx.textAlign = al; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.6; ctx.fillText(`comment ${i + 1} to be a fan!`, L, y + 184); ctx.globalAlpha = 1; }
    top.forEach((s, k) => {
      const yy = y + 182 + k * 25, nx = R ? x + w - 22 : x + 22;
      ctx.textAlign = al; ctx.fillStyle = ['#ffc93a', '#d9e0f0', '#e0a060'][k]; ctx.fillText(`${k + 1}.`, nx, yy);
      ctx.fillStyle = '#fff'; let nm = s.nick; while (ctx.measureText(nm).width > 300 && nm.length > 3) nm = nm.slice(0, -1);
      ctx.fillText(nm, R ? nx - 32 : nx + 32, yy);
      ctx.textAlign = ar; ctx.fillStyle = '#ffd84a'; ctx.fillText(String(Math.floor(s.points)), Rr, yy);
    });
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(x + 20, y + 236, w - 40, 16, 8); ctx.fill();
    ctx.fillStyle = '#ff4d8d'; roundRect(x + 20, y + 236, Math.max(16, (w - 40) * clamp(tm.likes / lk.every, 0, 1)), 16, 8); ctx.fill();
    ctx.font = '13px Russo, Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(`${lk.every} LIKES = +${lk.heal} HP`, x + w / 2, y + 249);
  }
  // VS badge
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(W / 2, 260, 40, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 4; ctx.stroke();
  ctx.textAlign = 'center'; outlined('VS', W / 2, 276, '44px Bangers, Impact', '#ffd84a', '#000', 5);
  // join strip
  ctx.fillStyle = 'rgba(10,20,60,0.85)'; roundRect(40, 408, W - 80, 50, 25); ctx.fill(); ctx.strokeStyle = '#2f7bff'; ctx.lineWidth = 3; ctx.stroke();
  const segs = [['COMMENT ', '#fff'], ['1', '#ffffff'], [' WHITE   ', '#e6ebf5'], ['2', '#ff4a4a'], [' BLACK ', '#ff4a4a'], ['  TO BE A FAN!', '#ffd84a']];
  ctx.font = '30px Russo, Arial'; let tw = 0; for (const s of segs) tw += ctx.measureText(s[0]).width;
  let sx = W / 2 - tw / 2; ctx.textAlign = 'left';
  for (const s of segs) { ctx.fillStyle = s[1]; ctx.fillText(s[0], sx, 444); sx += ctx.measureText(s[0]).width; }
  // bottom panels
  const py = VIEW_BOT;
  ctx.fillStyle = 'rgba(5,8,22,0.9)'; ctx.fillRect(0, py - 4, W, H - py + 4);
  ctx.fillStyle = 'rgba(5,8,22,0.82)'; roundRect(16, py + 6, 520, 306, 16); ctx.fill(); ctx.strokeStyle = 'rgba(47,123,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(5,8,22,0.82)'; roundRect(548, py + 6, 516, 306, 16); ctx.fill(); ctx.strokeStyle = 'rgba(255,200,60,0.7)'; ctx.stroke();
  ctx.textAlign = 'left'; outlined('BATTLE FEED', 34, py + 42, '32px Bangers, Impact', '#7fb2ff', '#000', 5);
  ctx.font = '21px Russo, Arial';
  feed.forEach((f, i) => {
    ctx.globalAlpha = clamp(f.life / f.max * 3, 0, 1);
    let x = 34; const yy = py + 78 + i * 33;
    for (const [s, c] of f.parts) {
      let txt = s; const room = 518 - x; if (room < 20) break;
      while (ctx.measureText(txt).width > room && txt.length > 2) txt = txt.slice(0, -2) + '…';
      ctx.fillStyle = c; ctx.fillText(txt, x, yy); x += ctx.measureText(txt).width;
    }
  });
  ctx.globalAlpha = 1;
  outlined('FEED YOUR HERO', 566, py + 42, '32px Bangers, Impact', '#ffd84a', '#000', 5);
  ctx.font = '19px Russo, Arial';
  legendRows().forEach(([g, a], i) => {
    const yy = py + 78 + i * 29;
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffb6d5'; let gtxt = g; while (ctx.measureText(gtxt).width > 235 && gtxt.length > 3) gtxt = gtxt.slice(0, -2);
    ctx.fillText(gtxt, 566, yy);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.fillText(a, 1048, yy);
  });
  // countdown / winner / callouts
  ctx.textAlign = 'center';
  if (round.state === 'countdown') {
    const n = Math.max(1, 3 - Math.floor(round.t / 0.8)), fr = (round.t % 0.8) / 0.8;
    ctx.globalAlpha = 1 - fr * 0.6;
    outlined(String(n), W / 2, 1180, `${Math.round(240 * (1.3 - fr * 0.3))}px Bangers, Impact`, '#ffffff', '#1340a8', 14);
    ctx.globalAlpha = 1;
  }
  if (round.state === 'end' && round.winner >= 0 && round.t > 1.2) {
    const t = TEAMS[round.winner], k = clamp((round.t - 1.2) * 3, 0, 1);
    ctx.save(); ctx.translate(W / 2, 760); ctx.scale(lerp(0.3, 1, k) + Math.sin(now * 5) * 0.015, lerp(0.3, 1, k));
    ctx.fillStyle = round.winner === 0 ? 'rgba(170,10,20,0.94)' : 'rgba(8,8,14,0.94)';
    roundRect(-500, -140, 1000, 280, 30); ctx.fill(); ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 8; ctx.stroke();
    ctx.shadowColor = '#ffd84a'; ctx.shadowBlur = 30;
    outlined(`${t.name} WINS!`, 0, -10, '150px Bangers, Impact', '#ffffff', '#ffd84a', 6);
    ctx.shadowBlur = 0;
    if (round.mvp && (round.mvp.fan || round.mvp.flawless)) outlined(round.mvp.fan ? `TOP FAN: ${round.mvp.fan}` : 'FLAWLESS!', 0, 74, '44px Russo, Arial', '#ffd84a', '#000', 7);
    ctx.font = '26px Russo, Arial'; ctx.fillStyle = '#c9d6ff'; ctx.fillText('next round soon... comment 1 or 2 to pick a side', 0, 120);
    ctx.restore();
  }
  for (let i = 0; i < callouts.length; i++) {
    const c = callouts[i], age = c.max - c.life, k = clamp(age * 6, 0, 1), a = clamp(c.life * 3, 0, 1);
    const y = 760 - (callouts.length - 1 - i) * 180;
    ctx.globalAlpha = a;
    ctx.save(); ctx.translate(W / 2, y); ctx.scale(lerp(1.8, 1, k), lerp(1.8, 1, k)); ctx.rotate(-0.04);
    let fs = c.size; ctx.font = `${fs}px Bangers, Impact`; while (ctx.measureText(c.text).width > 980 && fs > 40) { fs -= 6; ctx.font = `${fs}px Bangers, Impact`; }
    outlined(c.text, 0, 0, `${fs}px Bangers, Impact`, c.color, c.color === '#ffffff' || c.color === '#d9e0f0' ? '#1340a8' : '#000', 12);
    if (c.sub) outlined(c.sub, 0, 62, '54px Bangers, Impact', '#ffd84a', '#000', 9);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// speed dome: spherical dust cloud with two bouncing coloured light streaks
function drawDome() {
  const sp = duel.sp; if (!sp || sp.name !== 'speedDome' || !sp.st.P || sp.st.out) return;
  const C = sp.st.C, R = sp.st.R;
  const g = ctx.createRadialGradient(C.x, C.y, R * 0.3, C.x, C.y, R * 1.15);
  g.addColorStop(0, 'rgba(150,120,100,0.12)'); g.addColorStop(0.75, 'rgba(170,138,116,0.42)'); g.addColorStop(1, 'rgba(170,138,116,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C.x, C.y, R * 1.15, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const p of sp.st.P) {
    const tr = p.tr;
    for (let i = 1; i < tr.length; i++) {
      const u = i / (tr.length - 1);
      ctx.strokeStyle = `rgba(${p.col},${0.85 * u})`; ctx.lineWidth = 16 * u + 2; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * u})`; ctx.lineWidth = 4 * u + 1; ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
    }
    const q = tr[tr.length - 1]; if (q) { const gg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 30); gg.addColorStop(0, 'rgba(255,255,255,0.95)'); gg.addColorStop(1, `rgba(${p.col},0)`); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(q.x, q.y, 30, 0, TAU); ctx.fill(); }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ============================================================ cinematic camera
// The camera only moves the GAME WORLD. The HUD panels are drawn afterwards with a reset transform, so they never zoom.
const cam = { x: W / 2, y: VIEW_CY, z: 1, r: 0, vx: 0, vy: 0, vz: 0, vr: 0, punch: 0, tilt: 0, tiltT: 0, tiltDur: 1, whipT: 0, whipF: null, ko: null,
  shake: 0, flash: 0, flashColor: '#fff', V: { x: W / 2, y: VIEW_CY, z: 1, r: 0 }, tz: 1 };
// critically damped spring (smooth dolly / pan, no overshoot)
function spring(x, v, target, w, dt) {
  const f = 1 + 2 * dt * w, oo = w * w, hoo = dt * oo, hhoo = dt * hoo, det = 1 / (f + hhoo);
  return [(f * x + dt * v + hhoo * target) * det, (v + hoo * (target - x)) * det];
}
function camPunch(a) { if (a < 0.06) return; cam.punch = Math.min(0.1, Math.max(cam.punch, a * 0.5)); }                         // punch-in zoom on hits
function camTilt(a, dur = 0.8) { return;   // rules: no dutch angles during fights (horizon stays level)
 if (Math.abs(a) >= Math.abs(cam.tilt) || cam.tiltT <= 0) { cam.tilt = a; cam.tiltT = dur; cam.tiltDur = dur; } }   // dutch angle
function camWhip(f) { if (!cam.ko) { cam.whipT = 0.5; cam.whipF = f; } }                                 // whip-pan after a big knock
function camFocus(x, y, z, dur = 0.8, low = 0) { const ms = Math.max(BASE_S, ...fighters.map((f) => f.s || BASE_S)); z = Math.max(1.1, z * Math.pow(BASE_S / ms, 0.85)); cam.focus = { x, y, z: Math.min(z, 2.6), t: dur, low }; }
function camFocusCU(x, y, z, dur, low = 0) { camFocus(x, y, 1, dur, low); cam.focus.z = z * Math.pow(BASE_S / Math.max(BASE_S, ...fighters.map((f) => f.s || BASE_S)), 0.85); }   // close-up: build-up only, never on contact   // snap-zoom close-up (eyes, hands, blades)
function camKO(x, y, rd) { cam.ko = { t: 0, dur: 3.3, x, y, rd, side: Math.random() < 0.5 ? -1 : 1 }; cam.whipT = 0; }  // slow orbit on the K.O.
function frameBox() {
  let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9, n = 0;
  const add = (p) => { x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x); y1 = Math.min(y1, p.y); y2 = Math.max(y2, p.y); n++; };
  for (const f of fighters) if (f.alive && f.J) { add(f.J.head); add(f.J.fF); add(f.J.fB); add(f.J.hF); add(f.J.hB); add({ x: f.x, y: f.y }); }
  if (n === 0) for (const r of ragdolls) { add(r.pts[0]); add(r.pts[2]); }
  if (n === 0) return null;
  return { x1, x2, y1: y1 - 20, y2 };
}
function updateCamera(rdt) {
  const dt = Math.min(rdt, 0.05);
  let tx = W / 2, ty = VIEW_CY, tz = 1, w = 4.2, wz = 3.2, tr = 0;
  const box = frameBox();
  const wide = planes.length > 0 || bombs.length > 0 || strikeQueue.length > 0;
  if (cam.focus && cam.focus.t > 0 && !cam.ko) {
    const F = cam.focus; F.t -= dt;
    const fx_ = typeof F.x === 'function' ? F.x() : F.x, fy_ = typeof F.y === 'function' ? F.y() : F.y;
    tx = fx_; ty = fy_ - F.low * (VIEW_BOT - VIEW_CY) * 0.45 / F.z; tz = F.z; w = 16; wz = 13;
  } else if (cam.ko) {
    // dramatic slow orbit-style zoom on the knock-out
    const k = cam.ko; k.t += dt;
    const u = clamp(k.t / k.dur, 0, 1), e = EASE.io(u);
    // frame the flying loser AND the winner, orbit around them while zooming in
    let x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
    const add = (q) => { x1 = Math.min(x1, q.x); x2 = Math.max(x2, q.x); y1 = Math.min(y1, q.y); y2 = Math.max(y2, q.y); };
    if (k.rd && k.rd.pts) { add(k.rd.pts[0]); add(k.rd.pts[2]); add(k.rd.pts[8]); } else add({ x: k.x, y: k.y });
    for (const f of fighters) if (f.alive && f.J) { add(f.J.head); add({ x: f.x, y: f.y }); }
    const zfit = Math.min(W / (x2 - x1 + 300), (VIEW_BOT - VIEW_TOP) / (y2 - y1 + 320));
    tz = clamp(Math.min(lerp(1.7, 2.7, e), zfit), 1.2, 2.7);
    tx = (x1 + x2) / 2 + Math.cos(u * PI) * 60 * k.side / tz; ty = (y1 + y2) / 2 - 40 / tz;
    tr = lerp(-0.03, 0.03, e) * k.side;
    w = 6; wz = 4;
    if (k.t > k.dur) cam.ko = null;
  } else if (cam.whipT > 0 && cam.whipF) {
    // quick whip-pan that leads the flying fighter
    const f = cam.whipF; cam.whipT -= dt;
    tx = f.x + clamp(f.vx, -1500, 1500) * 0.22; ty = f.y - 100 * f.s; tz = 1.45; w = 15; wz = 6;
    if (!f.alive) cam.whipT = 0;
  } else if (wide || !box) {
    tx = W / 2; ty = VIEW_CY; tz = 1; w = 3; wz = 3;   // pull back wide for airstrikes
  } else {
    const bw = box.x2 - box.x1, bh = box.y2 - box.y1, dist = bw;
    const zfit = Math.min(W / (bw + 320), (VIEW_BOT - VIEW_TOP) / (bh + 300));
    let zt; w = 2.6; wz = 2.2;
    if (round.state === 'end') zt = 1.75;
    else if (round.state === 'countdown') zt = lerp(1.25, 1.85, clamp(round.t / 2.4, 0, 1));   // slow push-in while they bow
    else if (dist < 240) zt = lerp(2.25, 1.95, dist / 240);         // medium two-shot on the exchange
    else if (dist < 480) zt = lerp(1.95, 1.3, (dist - 240) / 240);  // medium-wide
    else zt = lerp(1.25, 1, clamp((dist - 480) / 300, 0, 1));      // wide when they separate
    tz = clamp(Math.min(zt, zfit), 1, 2.85);
    let lead = 0, nf = 0; for (const f of fighters) if (f.alive) { lead += clamp(f.vy || 0, -1600, 900); nf++; }
    tx = (box.x1 + box.x2) / 2; ty = (box.y1 + box.y2) / 2 - (VIEW_BOT - VIEW_CY) * 0.26 / tz + (nf ? lead / nf : 0) * 0.12;   // fighters sit in the lower part of the frame
    if (duel.sp) w = 3.6;   // a touch closer on set pieces
  }
  // dutch tilt envelope
  if (cam.tiltT > 0) { cam.tiltT -= dt; const u = 1 - cam.tiltT / cam.tiltDur; tr += cam.tilt * Math.sin(clamp(u, 0, 1) * PI); }
  // handheld drift
  tx += Math.sin(clock * 0.53) * 2.5 / cam.z;   // very light breathing, no handheld wobble
  ty += Math.sin(clock * 0.41 + 1) * 2 / cam.z;
  [cam.x, cam.vx] = spring(cam.x, cam.vx, tx, w, dt);
  [cam.y, cam.vy] = spring(cam.y, cam.vy, ty, w * 2, dt);   // faster vertical follow for jumps
  [cam.z, cam.vz] = spring(cam.z, cam.vz, tz, wz, dt);
  [cam.r, cam.vr] = spring(cam.r, cam.vr, tr, 5, dt);
  cam.tz = tz;
  cam.punch *= Math.exp(-dt * 7); if (cam.punch < 0.002) cam.punch = 0;
  cam.shake *= Math.exp(-dt * 11); if (cam.shake < 0.3) cam.shake = 0;
  cam.flash = Math.max(0, cam.flash - dt * 1.2);
}
function camView() {
  let z = cam.z * (1 + cam.punch);
  const sk = cam.shake / 22, amp = sk * sk * 22;   // trauma^2, smooth noise (Eiserloh)
  const r = cam.r + Math.sin(clock * 31.7) * amp * 0.0006;
  // keep the view inside the arena (the world is drawn a bit past the walls)
  const hw = (W / 2 * Math.abs(Math.cos(r)) + (VIEW_BOT - VIEW_TOP) / 2 * Math.abs(Math.sin(r))) / z;
  let x = clamp(cam.x, hw - 110, W + 110 - hw);
  const hh = (VIEW_BOT - VIEW_CY) / z;
  let y = Math.min(cam.y, FLOOR + 130 - hh * 0.62);
  y = Math.max(y, VIEW_TOP - 300 + hh);
  const sx = (Math.sin(clock * 47.3) + Math.sin(clock * 29.1 + 2)) * amp * 0.5, sy = (Math.sin(clock * 41.9 + 1) + Math.sin(clock * 23.7)) * amp * 0.5;
  cam.V = { x: x + sx / z, y: y + sy / z, z, r };
  return cam.V;
}
function setWorld(V) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(W / 2, VIEW_CY); ctx.rotate(V.r); ctx.scale(V.z, V.z); ctx.translate(-V.x, -V.y);
}
function w2s(x, y) {
  const V = cam.V, dx = (x - V.x) * V.z, dy = (y - V.y) * V.z, c = Math.cos(V.r), s = Math.sin(V.r);
  return { x: W / 2 + dx * c - dy * s, y: VIEW_CY + dx * s + dy * c };
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const V = camView();
  ctx.fillStyle = '#04050f'; ctx.fillRect(0, 0, W, H);
  // parallax background (moves less than the fighters = depth)
  const zb = 1 + (V.z - 1) * 0.55, xb = W / 2 + (V.x - W / 2) * 0.7, yb = VIEW_CY + (V.y - VIEW_CY) * 0.7;
  ctx.translate(W / 2, VIEW_CY); ctx.rotate(V.r); ctx.scale(zb, zb); ctx.translate(-xb, -yb);
  ctx.drawImage(bg, -BGM, -BGM);
  drawSkyLive();
  // world
  setWorld(V);
  drawArena();
  if (fx.tintT > 0) { ctx.fillStyle = `rgba(6,4,14,${Math.min(0.72, fx.tintT * 3)})`; ctx.fillRect(-1000, -1000, W + 2000, H + 2000); }
  for (const r of ragdolls) drawShadow(r.pts[2].x, r.pts[2].y, r.s, clamp(r.life, 0, 1));
  for (const f of fighters) if (f.alive && !f.hidden) drawShadow(f.x, f.y, f.s);
  for (const r of ragdolls) drawRagdoll(r);
  drawParticles('back');   // dust clouds billow behind the fighters
  drawDome();
  for (const f of fighters) if (f.alive && !f.giant) drawFighter(f);
  for (const f of fighters) if (f.alive && f.giant) drawFighter(f);
  ctx.lineCap = 'round';
  for (const b of bullets) {
    ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.01, b.y - b.vy * 0.01); ctx.stroke();
  }
  for (const b of bombs) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
    ctx.fillStyle = '#2a2f40'; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 20, 9, 0, 0, PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  for (const p of planes) drawPlane(p);
  drawParticles();
  // screen space from here on
  drawOverlays();
  drawWorldUI();
  drawBubbles();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (cam.flash > 0) { ctx.globalAlpha = Math.min(0.6, cam.flash); ctx.fillStyle = cam.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (timeCtl.slowT > 0 || cam.ko) {   // cinematic letterbox during slow motion
    const k = clamp(Math.max(timeCtl.slowT * 4, cam.ko ? 1 : 0), 0, 1) * 60;
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, VIEW_TOP, W, k); ctx.fillRect(0, VIEW_BOT - k, W, k);
  }
  drawImpact();
  drawHUD();
}

// ============================================================ main update
function step(dt) {
  for (const t of teams) t.rageT -= dt;
  updateGameTimers(dt);
  updateDirector(dt);
  for (const f of fighters) if (f.alive && f.brain) f.brain.update(dt);
  for (const f of fighters) if (f.alive) f.update(dt);
  separate();
  fighters = fighters.filter((f) => f.alive);
  updateBullets(dt);
  updateAir(dt);
  for (const r of ragdolls) updateRagdoll(r, dt);
  for (let i = ragdolls.length - 1; i >= 0; i--) if (ragdolls[i].life <= 0) ragdolls.splice(i, 1);
  updateParticles(dt);
  updateRound(dt);
}
function tick(rdt) {
  clock += rdt;
  if (timeCtl.slowT > 0) timeCtl.slowT -= rdt;
  timeCtl.cooldown -= rdt;
  const target = timeCtl.slowT > 0 ? timeCtl.slowScale : 1;
  timeCtl.scale += (target - timeCtl.scale) * Math.min(1, rdt * (target > timeCtl.scale ? 30 : 14));   // ease into slow-mo, SNAP back to speed
  fx.focusT -= rdt; fx.tintT = Math.max(0, (fx.tintT || 0) - rdt); fx.streakT -= rdt; fx.impactCd -= rdt;
  if (fx.impact) { fx.impact.t -= rdt; if (fx.impact.t <= 0) fx.impact = null; }
  for (const c of callouts) c.life -= rdt;
  for (let i = callouts.length - 1; i >= 0; i--) if (callouts[i].life <= 0) callouts.splice(i, 1);
  for (const f of feed) f.life -= rdt;
  for (let i = feed.length - 1; i >= 0; i--) if (feed[i].life <= 0) feed.splice(i, 1);
  updateTexts(rdt);
  updateBubbles(rdt);
  autoSim(rdt);
  updateCamera(rdt);
  // hit-stop: the action freezes for a few frames on heavy contact
  if (timeCtl.stop > 0) { timeCtl.stop -= rdt; return; }
  const dt = rdt * timeCtl.scale;
  const n = Math.max(1, Math.ceil(dt / (1 / 60)));
  for (let i = 0; i < n; i++) step(dt / n);
}

// ============================================================ simulator / test mode
const FAKE_NAMES = ['Ali_99', 'ZaraKhan', 'ninja_pk', 'Hamza.x', 'SilverGirl', 'Bilal786', 'Ayesha_k', 'GamerUAE', 'Usman_7', 'Sana.art', 'DarkKnight', 'Faisal_FC', 'Hira22', 'ShadowAce', 'Mustafa_x', 'Noor.ae', 'Raza_Gaming', 'Fatima_09', 'KingSaad', 'LunaStar'];
const SIM_GIFTS = [['Rose', 1, 'KeyQ'], ['Finger Heart', 5, 'KeyW'], ['Doughnut', 30, 'KeyE'], ['Hand Hearts', 100, 'KeyR'], ['Money Gun', 500, 'KeyT'], ['Galaxy', 1000, 'KeyY'], ['Lion', 29999, 'KeyU']];
let simCount = 0;
const sim = { auto: QS.has('demo'), t: 2 };
function newFake() { simCount++; return { id: 'sim' + simCount, nick: FAKE_NAMES[(simCount - 1) % FAKE_NAMES.length] + (simCount > FAKE_NAMES.length ? simCount : '') }; }
// a fake fan of a team ('r' = any team). Creates one if needed.
function fakeFan(team) {
  const pool = [...supporters.values()].filter((s) => s.id.startsWith('sim') && (team === 'r' || team == null || s.team === +team));
  if (pool.length && Math.random() < 0.75) { const s = pick(pool); return { id: s.id, nick: s.nick }; }
  const u = newFake();
  onEvent({ type: 'chat', ...u, text: String(team === 'r' || team == null ? rint(1, NT) : +team + 1) });
  return u;
}
function simJoin(team) { const u = newFake(); onEvent({ type: 'chat', ...u, text: String(team + 1) }); return u; }
function simSel() { return (document.getElementById('simTeam') || {}).value || 'r'; }
function simGift(name, coins, teamSel, count = 1) { const u = fakeFan(teamSel ?? simSel()); onEvent({ type: 'gift', ...u, giftName: name, coins, count }); return u; }
function simLikes(teamSel, count = 10) { const u = fakeFan(teamSel ?? simSel()); onEvent({ type: 'like', ...u, count }); return u; }
function autoSim(rdt) {
  if (!sim.auto) return;
  sim.t -= rdt;
  if (sim.t > 0) return;
  sim.t = rand(0.5, 1.4);
  const r = Math.random();
  if (r < 0.22) simJoin(rint(0, NT - 1));
  else if (r < 0.6) simLikes('r', rint(5, 20));
  else if (r < 0.78) simGift('Rose', 1, 'r', rint(1, 5));
  else if (r < 0.86) simGift('Finger Heart', 5, 'r');
  else if (r < 0.91) simGift('Doughnut', 30, 'r');
  else if (r < 0.95) simGift(pick(['Hand Hearts', 'Money Gun']), 300, 'r');
  else if (r < 0.97) simGift('Galaxy', 1000, 'r');
  else onEvent({ type: pick(['follow', 'share']), ...fakeFan('r') });
}
function setupPanel() {
  const panel = document.getElementById('sim');
  if (QS.has('clean') || MANUAL || USER) panel.classList.add('hidden'); // live link: test box hidden (press H to show)
  const gb = document.getElementById('giftBtns');
  SIM_GIFTS.forEach(([n, c, k]) => {
    const b = document.createElement('button'); b.textContent = `${n} (${k.slice(3)})`; b.title = `${c} coins`;
    b.onclick = () => simGift(n, c); gb.appendChild(b);
  });
  panel.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => simJoin(+b.dataset.join)));
  const likeBtn = () => simLikes(null, 10);
  const followBtn = () => onEvent({ type: 'follow', ...fakeFan(simSel()) });
  const shareBtn = () => onEvent({ type: 'share', ...fakeFan(simSel()) });
  const autoBtn = () => { sim.auto = !sim.auto; document.getElementById('autoBtn').classList.toggle('on', sim.auto); };
  const soundBtn = () => { audioInit(); AU.on = !AU.on; document.getElementById('soundBtn').textContent = AU.on ? 'Sound ON (M)' : 'Sound OFF (M)'; };
  const newRound = () => { if (round.state !== 'end') { round.state = 'end'; round.winner = -1; } round.t = 99; };
  document.getElementById('likeBtn').onclick = likeBtn;
  document.getElementById('followBtn').onclick = followBtn;
  document.getElementById('shareBtn').onclick = shareBtn;
  document.getElementById('autoBtn').onclick = autoBtn;
  document.getElementById('soundBtn').onclick = soundBtn;
  document.getElementById('newRoundBtn').onclick = newRound;
  document.getElementById('autoBtn').classList.toggle('on', sim.auto);
  document.getElementById('soundBtn').textContent = 'Sound ON (M)';
  // any tap/click/key turns the sound on (Android needs pointerup/touchend/click - pointerdown alone is not a 'gesture' there)
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) window.addEventListener(ev, () => { if (!audioRunning()) audioInit(); }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return;
    audioInit();
    if (e.code === 'Digit1') simJoin(0);
    else if (e.code === 'Digit2') simJoin(1);
    else if (e.code === 'KeyH') panel.classList.toggle('hidden');
    else if (e.code === 'KeyL') likeBtn();
    else if (e.code === 'KeyF') followBtn();
    else if (e.code === 'KeyS') shareBtn();
    else if (e.code === 'KeyA') autoBtn();
    else if (e.code === 'KeyM') soundBtn();
    else if (e.code === 'KeyN') newRound();
    else { const g = SIM_GIFTS.find((x) => x[2] === e.code); if (g) simGift(g[0], g[1]); }
  });
}
function updateLiveInfo() {
  const el = document.getElementById('liveInfo'); if (!el) return;
  const m = S.live.mode;
  el.textContent = m === 'live' ? `Connected to @${S.live.username} LIVE` : m === 'simulator' ? 'TEST MODE: add ?user=yourname to the link' : m === 'offline' ? `@${S.live.username} is not LIVE yet - retrying` : 'Connecting to TikTok...';
}

// ============================================================ TAP TO START (sound + full screen on phones)
const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const IS_APP = (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) || navigator.standalone === true;
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function goFullscreen() {
  if (isFull() || IS_APP) return;
  const el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!rq) return;
  try {
    const p = rq.call(el, { navigationUI: 'hide' });
    Promise.resolve(p).then(lockPortrait, () => {});
  } catch (e) {}
}
function lockPortrait() { try { const o = screen.orientation; if (o && o.lock) o.lock('portrait').catch(() => {}); } catch (e) {} }
function startSound() {
  audioInit();
  const ping = () => { if (audioRunning() && AU.on) { const k = AU.ctx.currentTime; tn(AU.ctx, AU.out, k + 0.02, 'triangle', 660, 660, 0.12, 0.18); tn(AU.ctx, AU.out, k + 0.14, 'triangle', 990, 990, 0.2, 0.18); } };
  if (AU.ctx) AU.ctx.resume().then(ping, () => {}); 
}
function setupStart() {
  const tap = document.getElementById('tap'), hint = document.getElementById('fsHint');
  if (!tap || MANUAL || QS.has('notap')) return;
  let started = false;
  const hide = () => { tap.classList.add('hidden'); };
  const start = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    startSound(); goFullscreen(); hide(); started = true;
  };
  tap.addEventListener('click', start);
  // phones always get the overlay (sound + full screen need a tap). On a PC it only shows if the browser blocked the sound;
  // in a PC LIVE Studio/OBS browser source (?clean) it never blocks the picture for more than 8 s.
  setTimeout(() => {
    if (IS_TOUCH || !audioRunning()) {
      tap.classList.remove('hidden');
      if (!IS_TOUCH && QS.has('clean')) setTimeout(hide, 8000);
    }
  }, 350);
  // left full screen (back button / swipe)? show a small hint; any tap goes full screen again
  const onFs = () => {
    const show = started && IS_TOUCH && !IS_APP && !isFull();
    hint.classList.toggle('hidden', !show);
  };
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
  window.addEventListener('click', (e) => {
    if (!hint.classList.contains('hidden') && !e.target.closest('#sim')) { goFullscreen(); if (!audioRunning()) startSound(); }
  });
  // coming back to the tab: wake the sound up again
  document.addEventListener('visibilitychange', () => { if (!document.hidden && AU.ctx && AU.ctx.state !== 'running') AU.ctx.resume().catch(() => {}); });
}

// ============================================================ websocket to server.js
function connectWS() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  let ws;
  try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${UQ}`); } catch (e) { return; }
  ws.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch (e) { console.error(e); } };
  ws.onclose = () => { if (S.live.mode === 'live') { S.live = { ...S.live, mode: 'connecting' }; updateLiveInfo(); } setTimeout(connectWS, 3000); };
}

// ============================================================ boot
let lastT = 0;
function frame(now) {
  const rdt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  tick(rdt); render(); paintBars();
  requestAnimationFrame(frame);
}
async function boot() {
  try {
    const r = await fetch('/settings.json' + UQ, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      S.game = { ...DEFAULT_SETTINGS.game, ...(j.game || {}) };
      S.gifts = { ...DEFAULT_SETTINGS.gifts, ...(j.gifts || {}) };
      S.live = j.live || S.live;
    }
  } catch (e) {}
  if (QS.has('round')) S.game.roundSeconds = +QS.get('round');
  if (QS.has('hp')) S.game.heroHp = +QS.get('hp');
  BASE_S = clamp(+S.game.fighterSize || 0.66, 0.4, 1.2); GIANT_S = BASE_S * 2.4;
  try { await Promise.all([document.fonts.load('40px Bangers'), document.fonts.load('20px Russo')]); } catch (e) {}
  drawBackground();
  layoutView();
  for (const ev of ['resize', 'orientationchange', 'fullscreenchange', 'webkitfullscreenchange']) window.addEventListener(ev, () => setTimeout(layoutView, 60));
  if (window.visualViewport) visualViewport.addEventListener('resize', () => setTimeout(layoutView, 60));
  setupPanel(); updateLiveInfo(); connectWS();
  loadSamples();
  audioInit();   // works right away if the browser allows autoplay, otherwise after the first click/key
  setupStart();
  if (!MANUAL && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  startRound();
  window.SF = {
    step: (n = 1, fps = 30) => { for (let i = 0; i < n; i++) tick(1 / fps); render(); },
    event: onEvent, round, fighters: () => fighters, heroes, supporters, sim, simGift, simJoin, simLikes, fakeFan, renderAudio, audioLog: () => AU.log.length,
    mostHurt: () => { let b = -1, bh = 1e9; for (let t = 0; t < NT; t++) { const h = heroOf(t); if (h && h.hp < bh) { bh = h.hp; b = t; } } return b; },
    sp: (name, first = 0, force = false) => { const a = heroOf(first), b = heroOf(1 - first); if (a && b && !duel.sp && round.state === 'fight' && [a, b].every((f) => f.onGround && !f.busy() && !f.held && f.invuln <= 0)) { const o = setPieceOptions2(a, b).find((c) => c.name === name); if (!o && !force) return false; startSetPiece(name, o && !force ? o.a : a, o && !force ? o.b : b); return true; } return false; },
    cam, duel, timeCtl, ready: true, soundsReady: () => loadSamples(), bubble, audioLogAll: () => AU.log
  };
  if (!MANUAL) requestAnimationFrame((t) => { lastT = t; frame(t); });
}
boot();
