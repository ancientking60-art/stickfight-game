/* YUI LIVE - interactive anime maid for TikTok LIVE. Viewers type commands (spin, bow, sit, dance, wink, look, hi)
   and send gifts; Yui reacts with poses, short voiced lines and effects. Plain HTML5 canvas, events come from
   server.js over WebSocket (/ws?user=NAME, same TikTok connection as the stick fight game) or the test buttons. */
'use strict';

// ============================================================ setup
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 1080, H = 1920;
const CHAR_Y = 128;            // sprite frame top is drawn this far down (head clears the TikTok top bar)
const CHAR_S = 1.15;           // sprite scale: fills the portrait frame, shoes/lower legs fall off the bottom
const FEET_Y = CHAR_Y + 1877 * CHAR_S;  // pivot for breathing / bounce
const SPX = (x) => 540 + (x - 540) * CHAR_S, SPY = (y) => CHAR_Y + y * CHAR_S;   // sprite px -> screen px
const SUB_Y = 1418;            // subtitle band centre
const MENU_Y = 1560;           // bottom menu top (kept above TikTok's comment bar)
const QS = new URLSearchParams(location.search);
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; };
const cleanName = (u) => String(u || '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
// remember the TikTok name: /yui/u/NAME or ?user=NAME is saved on this phone; the bare /yui link or the Home Screen
// icon uses the saved name again. ?user=reset forgets it. (own keys, separate from the stick fight game)
(function rememberUser() {
  if (QS.has('manual')) return;
  let pathUser = ''; try { const m = /^\/yui\/u\/([^/?#]+)/.exec(location.pathname); if (m) pathUser = decodeURIComponent(m[1]); } catch (e) {}
  const raw = String(QS.get('user') || pathUser || '').trim();
  let fix = !!pathUser;
  if (/^(reset|clear|forget|none)$/i.test(raw)) {
    LS('yui_user', null); LS('yui_clean', null); QS.delete('user'); QS.delete('clean'); fix = true;
  } else if (cleanName(raw)) {
    if (pathUser && !QS.has('clean')) QS.set('clean', '1');
    QS.set('user', cleanName(raw));
    LS('yui_user', cleanName(raw)); LS('yui_clean', QS.has('clean') ? '1' : '0');
  } else {
    const saved = cleanName(LS('yui_user'));
    if (saved) { QS.set('user', saved); if (LS('yui_clean') === '1') QS.set('clean', '1'); fix = true; }
  }
  if (fix) {
    try { history.replaceState(null, '', '/yui/' + (QS.toString() ? '?' + QS.toString() : '') + location.hash); } catch (e) {}
    try { const mf = document.getElementById('mf'); if (mf) mf.href = '/yui/manifest.webmanifest' + (QS.toString() ? '?' + QS.toString() : ''); } catch (e) {}
  }
})();
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MANUAL = QS.has('manual');
const USER = cleanName(QS.get('user'));
const UQ = USER ? '?user=' + encodeURIComponent(USER) : '';

// ============================================================ display (same approach as the stick fight game)
const VIEW = { k: 1, ox: 0, oy: 0, gw: W, gh: H, fixed: MANUAL };
const C2D = CanvasRenderingContext2D.prototype, _setT = C2D.setTransform, _getT = C2D.getTransform;
const _shB = Object.getOwnPropertyDescriptor(C2D, 'shadowBlur');
if (!VIEW.fixed) {
  ctx.setTransform = function (a, b, c, d, e, f) {
    if (a && typeof a === 'object') ({ a, b, c, d, e, f } = a);
    const k = VIEW.k; _setT.call(this, a * k, b * k, c * k, d * k, e * k + VIEW.ox, f * k + VIEW.oy);
  };
  ctx.getTransform = function () { const g = _getT.call(this), k = VIEW.k; return new DOMMatrix([g.a / k, g.b / k, g.c / k, g.d / k, (g.e - VIEW.ox) / k, (g.f - VIEW.oy) / k]); };
  Object.defineProperty(ctx, 'shadowBlur', { get() { return _shB.get.call(this) / VIEW.k; }, set(v) { _shB.set.call(this, v * VIEW.k); } });
}
let _probe = null;
function safeInsets() {
  try {
    if (!_probe) { _probe = document.createElement('div'); _probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(_probe); }
    const cs = getComputedStyle(_probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  } catch (e) { return { t: 0, r: 0, b: 0, l: 0 }; }
}
function layoutView() {
  if (VIEW.fixed) { document.body.classList.add('fixed'); return; }
  const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
  let dpr = window.devicePixelRatio || 1;
  const ins = safeInsets(), aw = Math.max(1, vw - ins.l - ins.r), ah = Math.max(1, vh - ins.t - ins.b);
  const kFull = Math.min(aw / W, ah / H) * dpr;
  if (kFull > 1.5) dpr *= 1.5 / kFull;
  const cw = Math.round(vw * dpr), ch = Math.round(vh * dpr);
  let k = Math.min(aw * dpr / W, ah * dpr / H);
  if (k > 1 && k < 1.02) k = 1;
  VIEW.k = k; VIEW.gw = Math.round(W * k); VIEW.gh = Math.round(H * k);
  VIEW.ox = Math.floor(ins.l * dpr + (aw * dpr - VIEW.gw) / 2); VIEW.oy = Math.floor(ins.t * dpr + (ah * dpr - VIEW.gh) / 2);
  if (cv.width !== cw) cv.width = cw;
  if (cv.height !== ch) cv.height = ch;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
}
// bands outside the 9:16 picture: the room, stretched and darkened, so a tall phone never shows black bars
function paintBars() {
  if (VIEW.fixed) return;
  const { ox, oy, gw, gh } = VIEW, cw = cv.width, ch = cv.height;
  if (ox <= 0 && oy <= 0) return;
  ctx.save(); _setT.call(ctx, 1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; _shB.set.call(ctx, 0);
  const room = IMG.room;
  if (oy > 0) {
    if (room) { ctx.drawImage(room, 0, 0, 1080, 6, ox, 0, gw, oy); ctx.drawImage(room, 0, 1914, 1080, 6, ox, oy + gh, gw, ch - oy - gh); }
    ctx.fillStyle = 'rgba(8,4,12,.55)'; ctx.fillRect(0, 0, cw, oy); ctx.fillRect(0, oy + gh, cw, ch - oy - gh);
  }
  if (ox > 0) { ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, ox, ch); ctx.fillRect(ox + gw, 0, cw - ox - gw, ch); }
  ctx.restore();
}
const rand = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const PI = Math.PI, TAU = PI * 2;
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIO = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const FONT = "'Fredoka', 'Arial Rounded MT Bold', Arial, sans-serif";

// ============================================================ images
const POSES = ['idle', 'blush', 'bored', 'bow', 'curtsy', 'dance1', 'dance2', 'dance3', 'happy', 'look', 'pout', 'sit', 'spin_back', 'spin_side', 'tease', 'wink'];
const IMG = {};
function loadImg(name, src) {
  return new Promise((res) => { const im = new Image(); im.decoding = 'async'; im.onload = () => { IMG[name] = im; res(true); }; im.onerror = () => res(false); im.src = src; });
}
function loadImages() {
  const first = ['room', 'idle', 'blink_face', 'talk_face'];
  const all = [loadImg('room', 'img/room.jpg'), ...POSES.map((p) => loadImg(p, 'img/' + p + '.webp')), loadImg('blink_face', 'img/blink_face.webp'), loadImg('talk_face', 'img/talk_face.webp')];
  return Promise.all(all).then(() => first.every((k) => IMG[k]));
}

// ============================================================ audio
// Synth sfx + music box are WebAudio. Yui's voice lines are pre-rendered (edge-tts, -16 LUFS) ogg + m4a.
// Every sound goes through sfx(): live it plays now, in recording mode (?manual) it is logged and rendered offline.
const AU = { ctx: null, out: null, on: !QS.has('mute'), music: !QS.has('nomusic'), log: [], el: null, unlocked: false };
const SK = { armed: false, since: 0, tries: 0, mixed: false, badge: null };
const VO = { man: null, raw: {}, buf: {}, busy: {}, dec: null, fmt: 'ogg' };
let clock = 0;
function soundFormat() {
  try {
    if (IS_IOS) return 'm4a';
    const a = document.createElement('audio');
    return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
  } catch (e) { return 'm4a'; }
}
async function loadVO() {
  try {
    VO.man = await (await fetch('vo/lines.json', { cache: 'no-cache' })).json();
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const dc = new OAC(1, 1, 44100);
    VO.fmt = soundFormat();
    VO.dec = (ab) => new Promise((res, rej) => { const r = dc.decodeAudioData(ab, res, rej); if (r && r.then) r.then(res, rej); });
    const keys = Object.keys(VO.man.clips);
    const fetchOne = async (k) => {
      for (const f of [VO.fmt, VO.fmt === 'ogg' ? 'm4a' : 'ogg']) {
        try { const r = await fetch('vo/' + k + '.' + f); if (r.ok) { const ab = await r.arrayBuffer(); try { VO.buf[k] = await VO.dec(ab); return true; } catch (e) {} } } catch (e) {}
      }
      return false;
    };
    // intro first, then the rest in small batches (3 MB total)
    await fetchOne('intro_0');
    for (let i = 0; i < keys.length; i += 6) await Promise.all(keys.slice(i, i + 6).filter((k) => !VO.buf[k]).map(fetchOne));
    return Object.keys(VO.buf).length;
  } catch (e) { return 0; }
}
function noiseBuf(ac) {
  if (!ac._noise) { const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; ac._noise = b; }
  return ac._noise;
}
function makeOut(ac) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 4; comp.ratio.value = 16; comp.attack.value = 0.001; comp.release.value = 0.12;
  const pre = ac.createGain(); pre.gain.value = 0.72;
  const post = ac.createGain(); post.gain.value = 1.25;
  pre.connect(comp); comp.connect(post); post.connect(ac.destination);
  const duck = ac.createGain(); duck.connect(pre); ac._vo = pre; ac._duck = duck;   // music + sfx are ducked under the voice
  return duck;
}
function audioInit() {
  if (MANUAL) return;
  try {
    if (!AU.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; AU.ctx = new AC(); AU.out = makeOut(AU.ctx); watchCtx(AU.ctx); }
    iosAudioSession();
    if (AU.ctx.state !== 'running') { const r = AU.ctx.resume(); if (r && r.catch) r.catch(() => {}); }
    if (!AU.unlocked) {
      const b = AU.ctx.createBuffer(1, 1, 22050), s = AU.ctx.createBufferSource(); s.buffer = b; s.connect(AU.ctx.destination); s.start(0);
      AU.unlocked = AU.ctx.state === 'running';
    }
  } catch (e) { AU.ctx = null; }
}
function iosAudioSession() {
  if (!IS_IOS) return;
  try { if (navigator.audioSession) { const t = SK.mixed ? 'ambient' : 'playback'; if (navigator.audioSession.type !== t) navigator.audioSession.type = t; } } catch (e) {}
  try {
    if (!AU.el) { AU.el = document.createElement('audio'); AU.el.src = '/sounds/silence.m4a'; AU.el.loop = true; AU.el.setAttribute('playsinline', ''); AU.el.volume = 0.01; }
    if (AU.el.paused) { const r = AU.el.play(); if (r && r.catch) r.catch(() => {}); }
  } catch (e) {}
}
function audioRunning() { return !!(AU.ctx && AU.ctx.state === 'running'); }
function env(g, t, vol, dur, att) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function tn(ac, out, t, type, f0, f1, dur, vol, att = 0.004) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); env(g, t, vol, dur, att); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function nz(ac, out, t, dur, type, f0, f1, vol, q = 1, att = 0.004) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf(ac);
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain(); env(g, t, vol, dur, att); s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
// music-box / bell note: sine + soft overtones, long decay
function bell(ac, out, t, f, vol, dur = 1.4) { tn(ac, out, t, 'sine', f, f, dur, vol, 0.003); tn(ac, out, t, 'sine', f * 2, f * 2, dur * 0.5, vol * 0.32, 0.002); tn(ac, out, t, 'sine', f * 3.01, f * 3.01, dur * 0.22, vol * 0.12, 0.002); }
const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
function playVO(ac, t, k) {
  const b = VO.buf[k]; if (!b) return;
  if (ac._voSrc) { try { ac._voSrc.stop(Math.max(0, t)); } catch (e) {} }
  const s = ac.createBufferSource(); s.buffer = b; ac._voSrc = s;
  const g = ac.createGain(); g.gain.value = 1.15; s.connect(g); g.connect(ac._vo); s.start(Math.max(0, t));
  if (ac._duck) { const d = ac._duck.gain; d.setTargetAtTime(0.42, t, 0.05); d.setTargetAtTime(1, t + b.duration, 0.25); }
}
function voice(ac, out, t, kind, a) {
  switch (kind) {
    case 'vo': playVO(ac, t, a); break;
    case 'note': bell(ac, out, t, NOTE(a), 0.05, 1.5); break;
    case 'bass': tn(ac, out, t, 'triangle', NOTE(a), NOTE(a), 0.5, 0.07, 0.01); break;
    case 'kick': tn(ac, out, t, 'sine', 140, 48, 0.22, 0.38, 0.002); break;
    case 'hat': nz(ac, out, t, 0.05, 'highpass', 7000, 9000, 0.07, 0.8, 0.001); break;
    case 'clap': nz(ac, out, t, 0.12, 'bandpass', 1500, 1200, 0.2, 1.2, 0.002); nz(ac, out, t + 0.012, 0.1, 'bandpass', 1700, 1300, 0.12, 1.2, 0.002); break;
    case 'pluck': tn(ac, out, t, 'triangle', NOTE(a), NOTE(a), 0.22, 0.06, 0.003); tn(ac, out, t, 'sine', NOTE(a + 12), NOTE(a + 12), 0.15, 0.03, 0.002); break;
    case 'pop': tn(ac, out, t, 'sine', 880, 1320, 0.07, 0.08, 0.002); break;
    case 'heart': tn(ac, out, t, 'sine', NOTE(a || 84), NOTE(a || 84), 0.18, 0.035, 0.002); break;
    case 'chimeS': bell(ac, out, t, NOTE(84), 0.16, 1.2); bell(ac, out, t + 0.09, NOTE(91), 0.13, 1.4); break;
    case 'chimeM': [79, 84, 88, 91].forEach((m, i) => bell(ac, out, t + i * 0.07, NOTE(m), 0.14, 1.4)); nz(ac, out, t + 0.05, 0.9, 'highpass', 6000, 9000, 0.05, 0.7, 0.2); break;
    case 'chimeB': [72, 76, 79, 84, 88, 91, 96, 100].forEach((m, i) => bell(ac, out, t + i * 0.055, NOTE(m), 0.13, 1.8));
      tn(ac, out, t, 'sine', NOTE(48), NOTE(48), 2.2, 0.16, 0.08); tn(ac, out, t, 'sine', NOTE(55), NOTE(55), 2.2, 0.09, 0.1);
      nz(ac, out, t + 0.1, 1.6, 'highpass', 5000, 9000, 0.07, 0.6, 0.4); break;
    case 'spin': nz(ac, out, t, 0.55, 'bandpass', 500, 2600, 0.22, 1.6, 0.15); nz(ac, out, t + 0.5, 0.5, 'bandpass', 2600, 700, 0.18, 1.6, 0.05); bell(ac, out, t + 1.05, NOTE(91), 0.09, 1); break;
    case 'wink': bell(ac, out, t, NOTE(96), 0.12, 0.9); bell(ac, out, t + 0.06, NOTE(103), 0.07, 0.7); break;
    case 'pout': tn(ac, out, t, 'triangle', 420, 300, 0.16, 0.08, 0.01); break;
    case 'swish': nz(ac, out, t, 0.35, 'bandpass', 900, 2000, 0.1, 1.2, 0.08); break;
    case 'sparkle': for (let i = 0; i < 4; i++) tn(ac, out, t + i * 0.05, 'sine', NOTE(96 + i * 3), NOTE(96 + i * 3), 0.25, 0.03, 0.002); break;
  }
}
// play now (live) or at game time tt (both modes) - live: offset from the current clock
function sfx(kind, a, tt = clock) {
  if (!AU.on) return;
  if (MANUAL) { AU.log.push([tt, kind, a]); return; }
  if (!audioRunning()) return;
  try { voice(AU.ctx, AU.out, AU.ctx.currentTime + Math.max(0, tt - clock) + 0.01, kind, a); } catch (e) {}
}
async function renderAudio(dur, offset = 0) {
  const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * dur), sr), out = makeOut(oc);
  for (const [t, k, a] of AU.log) { const tt = t - offset; if (tt >= 0 && tt < dur) voice(oc, out, tt, k, a); }
  const buf = await oc.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
  const ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); ws(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { dv.setInt16(o, clamp(L[i], -1, 1) * 32767, true); dv.setInt16(o + 2, clamp(R[i], -1, 1) * 32767, true); }
  const bytes = new Uint8Array(ab); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ============================================================ music (soft music box; a beat while she dances)
const MUS = { next: 0, step: 0, beatUntil: 0, beatStep: 0 };
const PROG = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];   // C  Am  F  G
const ARP = [0, 1, 2, 1, 2, 3, 2, 1];
function musicTick() {
  if (!AU.on || !AU.music) return;
  if (!MANUAL && !audioRunning()) { MUS.next = clock; return; }
  if (MUS.next < clock - 0.5) MUS.next = clock;
  while (MUS.next < clock + 0.35) {
    const t = MUS.next;
    if (t < MUS.beatUntil) {           // dance: 120 bpm, 16ths
      const s = MUS.beatStep++, beat = s % 16;
      if (beat % 4 === 0) sfx('kick', 0, t);
      if (beat % 8 === 4) sfx('clap', 0, t);
      if (beat % 2 === 1) sfx('hat', 0, t);
      const ch = PROG[Math.floor(s / 16) % 4];
      if (beat % 2 === 0) sfx('pluck', ch[[0, 2, 1, 2, 0, 2, 1, 2][(beat / 2) % 8]] + 12, t);
      if (beat === 0 || beat === 10) sfx('bass', ch[0] - 24, t);
      MUS.next += 0.125;
    } else {                            // 76 bpm eighths
      const s = MUS.step++, bar = Math.floor(s / 8) % 4, i = s % 8, ch = PROG[bar];
      const ix = ARP[i], m = ix === 3 ? ch[0] + 12 : ch[ix];
      if (Math.random() < 0.92) sfx('note', m + 12, t);
      if (i === 0) sfx('note', ch[0], t);
      if ((i === 0 || i === 4) && Math.random() < 0.55) sfx('note', ch[rint(0, 2)] + 24, t + 0.01);
      MUS.next += 60 / 76 / 2;
    }
  }
}

// ============================================================ voice lines
const LINES = { cur: null, last: {} };
function altKeys(cmd) { if (!VO.man) return []; const out = []; for (let i = 0; i < 9; i++) if (VO.man.clips[cmd + '_' + i]) out.push(cmd + '_' + i); return out; }
// choose an alt that was not used last time
function lineFor(cmd) {
  const ks = altKeys(cmd); if (!ks.length) return null;
  let k = pick(ks); if (ks.length > 1) { let n = 0; while (k === LINES.last[cmd] && n++ < 8) k = pick(ks); }
  LINES.last[cmd] = k; return k;
}
const sub = { text: '', t0: -9, d: 0, key: '', e: '' };
function say(key) {
  if (!key || !VO.man) return 0;
  const c = VO.man.clips[key]; if (!c) return 0;
  sub.text = c.t; sub.t0 = clock; sub.d = c.d; sub.key = key; sub.e = c.e || '';
  sfx('vo', key);
  return c.d;
}
function speaking() { return clock - sub.t0 < sub.d; }
function mouthOpen() {
  if (!speaking() || !sub.e) return 0;
  const i = Math.floor((clock - sub.t0) / sub.d * sub.e.length);
  return (+sub.e[clamp(i, 0, sub.e.length - 1)] || 0) / 9;
}

// ============================================================ Yui: pose state + actions
const Y = {
  pose: 'idle', prev: null, xf: 1, xfDur: 0.2, poseT: 0,
  base: 'idle',          // 'idle' or 'sit' (sit stays until 'stand')
  act: null,             // the action that is playing
  blinkAt: 3, blinkT: -1,
  blush: 0, glow: 0,
  anim: null,            // 'spin' | 'dance' | 'look'
};
function setPose(p, xf = 0.2) {
  if (p === Y.pose) return;
  Y.prev = Y.pose; Y.pose = p; Y.xf = 0; Y.xfDur = xf; Y.poseT = clock;
}
// [pose, minimum hold (s), voice line group, extra]
const ACT = {
  intro:  { pose: 'curtsy', hold: 2.0 },
  spin:   { anim: 'spin', hold: 1.45, after: 'tease', afterHold: 1.4, fx: 'spin' },
  bow:    { pose: 'bow', hold: 2.0, fx: 'swish' },
  sit:    { pose: 'sit', hold: 1.4, fx: 'swish' },
  stand:  { pose: 'happy', hold: 1.3, fx: 'swish' },
  dance:  { anim: 'dance', hold: 4.6 },
  look:   { anim: 'look', hold: 3.6 },
  wink:   { pose: 'wink', hold: 1.8, fx: 'wink' },
  hello:  { pose: 'dance3', hold: 1.8, fx: 'pop' },
  praise: { pose: 'tease', hold: 2.2, fx: 'sparkle' },
  giftS:  { pose: 'curtsy', hold: 1.7, fx: 'chimeS' },
  giftM:  { pose: 'happy', hold: 2.3, fx: 'chimeM' },
  giftB:  { pose: 'blush', hold: 3.6, fx: 'chimeB' },
  multi:  { pose: 'pout', hold: 2.0, fx: 'pout' },
  spam:   { pose: 'pout', hold: 2.0, fx: 'pout' },
  quiet:  { pose: 'bored', hold: 3.0 },
  follow: { pose: 'happy', hold: 1.8, fx: 'chimeS' },
  likes:  { pose: 'happy', hold: 1.6, fx: 'sparkle' },
};
const Q = [];   // queue of { kind, user, nick, extra }
const QMAX = 6;
function startAction(a) {
  const def = ACT[a.kind]; if (!def) return;
  const k = a.kind;
  if (k === 'sit') Y.base = 'sit';
  else if (k === 'stand' || k === 'spin' || k === 'dance') Y.base = 'idle';
  const d = say(lineFor(k));
  const backlog = Q.length >= 2;
  let hold = def.hold;
  let end = Math.max(hold, d + 0.25);
  if (backlog) end = Math.max(hold * 0.8, d + 0.05);       // chat is busy: keep it moving
  Y.act = { ...a, t0: clock, hold, end, def };
  Y.anim = def.anim || null;
  if (def.anim === 'spin') { setPose('idle', 0.08); }
  else if (def.anim === 'dance') { MUS.beatUntil = clock + def.hold - 0.2; MUS.beatStep = 0; MUS.next = clock; }
  else if (def.anim === 'look') setPose('look', 0.35);
  else setPose(def.pose, 0.18);
  if (def.fx) sfx(def.fx);
  // effects
  // bursts come from her sides (never over the face)
  const side = (kind, n, y, pw) => { burst(kind, Math.ceil(n / 2), 190, y, pw); burst(kind, Math.floor(n / 2), 890, y, pw); };
  if (k === 'giftS' || k === 'follow') side('heart', 8, 1000);
  if (k === 'giftM') { side('star', 18, 900); side('heart', 12, 1050); }
  if (k === 'giftB') { Y.blush = 1; Y.glow = 1; side('star', 40, 850, 1.3); side('heart', 30, 1050, 1.2); petals(36); }
  if (k === 'praise' || k === 'likes') side('star', 10, 700);
  if (k === 'wink') { addP({ k: 'star', x: 700, y: 520, vx: 60, vy: -40, life: 0.9, max: 0.9, size: 34, rot: 0, vr: 3, col: '#fff6c8' }); burst('heart', 4, 800, 560, 0.7); }
  if (k === 'spin') ring(540, 1150, 260);
  if (k === 'hello') burst('heart', 5, 860, 760, 0.8);
  if (a.nick && (k === 'giftM' || k === 'giftB')) banner(a);
}
function finishAction() {
  const a = Y.act; Y.act = null; Y.anim = null;
  setPose(Y.base === 'sit' ? 'sit' : 'idle', 0.28);
  return a;
}
function tickActions() {
  const a = Y.act;
  if (a) {
    const t = clock - a.t0;
    // after the pose hold, go back to the base pose while the line finishes (mouth keeps moving on idle)
    if (a.def.anim === 'spin' && t >= a.hold && Y.pose !== a.def.after && t < a.hold + a.def.afterHold) setPose(a.def.after, 0.12);
    const total = a.def.anim === 'spin' ? Math.max(a.end, a.hold + (Q.length >= 2 ? 0.6 : a.def.afterHold)) : a.end;
    if (!a.def.anim && t >= a.hold && Y.pose !== (Y.base === 'sit' ? 'sit' : 'idle') && t < total) {
      // stay in the pose while the line plays if it is short, else relax
      if (t >= a.hold + 0.6) setPose(Y.base === 'sit' ? 'sit' : 'idle', 0.3);
    }
    if (a.def.anim === 'look' && t >= a.hold - 0.35 && Y.pose === 'look') setPose(Y.base === 'sit' ? 'sit' : 'idle', 0.35);
    if (t >= total) finishAction();
  }
  if (!Y.act && Q.length) startAction(Q.shift());
  // quiet chat
  if (!Y.act && !Q.length && clock - CHAT.last > 45 && clock - CHAT.lastQuiet > 55 && clock > 20) { CHAT.lastQuiet = clock; startAction({ kind: 'quiet' }); }
}
function enqueue(a, front = false) {
  if (front) { let i = 0; while (i < Q.length && Q[i].prio) i++; Q.splice(i, 0, a); }
  else Q.push(a);
  while (Q.length > QMAX) { const i = Q.findIndex((x) => !x.prio); Q.splice(i >= 0 ? i : Q.length - 1, 1); }
}

// ============================================================ chat parsing
const WORDS = {
  spin: 'spin', twirl: 'spin', spins: 'spin', turn: 'spin',
  bow: 'bow', bows: 'bow', curtsy: 'bow',
  sit: 'sit', sits: 'sit', seat: 'sit',
  stand: 'stand', standup: 'stand', getup: 'stand',
  dance: 'dance', dancing: 'dance', danc: 'dance',
  look: 'look', closeup: 'look', zoom: 'look',
  wink: 'wink', winks: 'wink',
  hi: 'hello', hii: 'hello', hiii: 'hello', hello: 'hello', helo: 'hello', hey: 'hello', heyy: 'hello', yo: 'hello', hallo: 'hello', salam: 'hello', konnichiwa: 'hello',
  cute: 'praise', pretty: 'praise', beautiful: 'praise', love: 'praise', kawaii: 'praise', best: 'praise', gorgeous: 'praise', adorable: 'praise', lovely: 'praise', queen: 'praise',
};
function parseCommands(text) {
  const s = String(text || '').toLowerCase().replace(/stand\s+up/g, 'standup').replace(/get\s+up/g, 'getup').replace(/close\s*up/g, 'closeup');
  const words = s.match(/[a-z]+/g) || [];
  const out = [];
  for (const w of words) { const c = WORDS[w]; if (c && !out.includes(c)) out.push(c); }
  if (/[❤♥💕💖😍🥰]/u.test(s) && !out.includes('praise')) out.push('praise');
  return out;
}
const CHAT = { last: 0, lastQuiet: 0, users: new Map(), lastMulti: -99, lastSpam: -99, lastCmd: {}, likeWin: [], lastLikes: -99, likeAcc: 0, lastFollow: -99 };
const CMD_COOL = { hello: 5, praise: 7 };
function userRec(id) { let u = CHAT.users.get(id); if (!u) { u = { t: [], spamAt: -99, giftAct: null }; CHAT.users.set(id, u); } return u; }
function onChat(e) {
  const cmds = parseCommands(e.text);
  if (!cmds.length) return;
  CHAT.last = clock;
  const id = e.id || e.nick || '?', nick = e.nick || e.id || 'someone', u = userRec(id);
  u.t = u.t.filter((x) => clock - x < 8); u.t.push(clock);
  const queuedMine = Q.some((x) => x.user === id && !x.prio);
  // spam: 3+ commands in 8 s, or a new one while theirs still waits
  if (u.t.length >= 3 || queuedMine) {
    toast(`@${nick}: slow down`, 'spam');
    if (clock - u.spamAt > 15 && clock - CHAT.lastSpam > 6) { u.spamAt = clock; CHAT.lastSpam = clock; enqueue({ kind: 'spam', user: id, nick, prio: false }, true); }
    return;
  }
  const c = cmds[0];
  // the same harmless command from many people at once: play it once
  if (CMD_COOL[c] && (clock - (CHAT.lastCmd[c] || -99) < CMD_COOL[c] || Q.some((x) => x.kind === c))) { toast(`@${nick}: ${cmds.join(' + ')}`, 'cmd'); return; }
  if (Q.filter((x) => x.kind === c).length >= 2) { toast(`@${nick}: ${c}`, 'cmd'); return; }
  CHAT.lastCmd[c] = clock;
  const cmdQueued = Q.filter((x) => !x.prio && x.kind !== 'multi' && x.kind !== 'spam').length;
  if ((cmds.length >= 2 || cmdQueued >= 3) && clock - CHAT.lastMulti > 20) { CHAT.lastMulti = clock; enqueue({ kind: 'multi', user: id, nick }, cmds.length >= 2 ? false : true); }
  enqueue({ kind: c, user: id, nick });
  const pos = Q.length - (Y.act ? 0 : 1);
  toast(`@${nick}: ${cmds.length >= 2 ? cmds.join(' + ') : c}` + (pos >= 2 ? `  (#${pos})` : ''), 'cmd');
}
const TIER_RANK = { giftS: 1, giftM: 2, giftB: 3 };
function giftTier(v) { return v >= 100 ? 'giftB' : v >= 10 ? 'giftM' : 'giftS'; }
function onGift(e) {
  CHAT.last = clock;
  const id = e.id || e.nick || '?', nick = e.nick || e.id || 'someone', u = userRec(id);
  const value = Math.max(1, (+e.coins || 1) * Math.max(1, +e.count || 1));
  const gname = e.giftName || 'a gift';
  toast(`@${nick} sent ${gname}${(+e.count || 1) > 1 ? ' x' + e.count : ''}`, 'gift');
  burst('heart', Math.min(14, 3 + Math.round(Math.sqrt(value))), rand(820, 980), 1500, 0.8);
  // streaks: add to their queued reaction instead of stacking many
  const q = Q.find((x) => x.prio && x.user === id);
  if (q) { q.value += value; q.kind = giftTier(q.value); q.giftName = gname; return; }
  if (Y.act && Y.act.user === id && Y.act.prio && clock - Y.act.t0 < 5 && TIER_RANK[giftTier(value)] <= TIER_RANK[Y.act.kind]) return;   // still reacting to this streak
  enqueue({ kind: giftTier(value), user: id, nick, prio: true, value, giftName: gname }, true);
}
function onLike(e) {
  const n = Math.max(1, +e.count || 1);
  CHAT.likeAcc += n;
  const hearts = Math.min(10, Math.ceil(n / 3));
  for (let i = 0; i < hearts; i++) pendingHearts.push(clock + i * 0.09);
  CHAT.likeWin = CHAT.likeWin.filter((x) => clock - x[0] < 20); CHAT.likeWin.push([clock, n]);
  const sum = CHAT.likeWin.reduce((s, x) => s + x[1], 0);
  if (sum >= 100 && clock - CHAT.lastLikes > 60 && !Q.some((x) => x.kind === 'likes')) { CHAT.lastLikes = clock; CHAT.likeWin = []; enqueue({ kind: 'likes' }); }
}
function onFollow(e) {
  const nick = e.nick || e.id || 'someone';
  toast(`@${nick} followed ♡`, 'gift'); burst('heart', 6, rand(820, 980), 1500, 0.8);
  if (clock - CHAT.lastFollow > 25 && !Q.some((x) => x.kind === 'follow')) { CHAT.lastFollow = clock; enqueue({ kind: 'follow', user: e.id, nick }); }
}
const LIVE = { mode: 'connecting', username: USER };
function onEvent(e) {
  if (!e || !e.type) return;
  if (e.type === 'chat') onChat(e);
  else if (e.type === 'gift') onGift(e);
  else if (e.type === 'like') onLike(e);
  else if (e.type === 'follow') onFollow(e);
  else if (e.type === 'share') { toast(`@${e.nick || e.id || 'someone'} shared ♡`, 'gift'); burst('heart', 4, rand(820, 980), 1500, 0.7); }
  else if (e.type === 'status') { LIVE.mode = e.mode || LIVE.mode; LIVE.username = e.username || LIVE.username; updateLiveInfo(); }
}

// ============================================================ effects
const parts = [];
const pendingHearts = [];
function addP(p) { if (parts.length < 500) parts.push(p); }
const HEART_COLS = ['#ff4f8b', '#ff7aa8', '#ff2d6f', '#ffa3c4', '#ff5fa0'];
const STAR_COLS = ['#fff6c8', '#ffe08a', '#ffffff', '#ffd1f0'];
function burst(kind, n, x, y, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(160, 520) * power;
    if (kind === 'heart') addP({ k: 'heart', x: x + rand(-60, 60), y: y + rand(-40, 40), vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp * 0.5 - rand(200, 420), g: -40, drag: 1.6, life: rand(1.4, 2.4), max: 2.4, size: rand(26, 54) * Math.min(1.3, power), col: pick(HEART_COLS), rot: rand(-0.3, 0.3), vr: rand(-1, 1), sw: rand(0, TAU) });
    else addP({ k: 'star', x: x + rand(-120, 120), y: y + rand(-160, 160), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, g: 60, drag: 2.2, life: rand(0.7, 1.5), max: 1.5, size: rand(16, 40), col: pick(STAR_COLS), rot: rand(0, TAU), vr: rand(-4, 4) });
  }
}
function petals(n) {
  for (let i = 0; i < n; i++) addP({ k: 'petal', x: rand(-40, 1120), y: rand(-300, 0), vx: rand(-40, 40), vy: rand(150, 300), g: 0, drag: 0, life: rand(3.5, 5.5), max: 5.5, size: rand(16, 28), col: pick(['#ffb3cc', '#ff8fb5', '#ffd6e4', '#fff']), rot: rand(0, TAU), vr: rand(-3, 3), sw: rand(0, TAU) });
}
function ring(x, y, r) { addP({ k: 'ring', x, y, life: 0.7, max: 0.7, size: r }); }
function likeHeart() {
  addP({ k: 'heart', x: rand(900, 1010), y: 1520, vx: rand(-30, 30), vy: rand(-380, -260), g: 0, drag: 0, life: rand(2.2, 3), max: 3, size: rand(34, 52), col: pick(HEART_COLS), rot: rand(-0.2, 0.2), vr: 0, sw: rand(0, TAU), like: 1 });
}
let lastHeartSnd = -9;
function tickParts(dt) {
  while (pendingHearts.length && pendingHearts[0] <= clock) { pendingHearts.shift(); likeHeart(); if (clock - lastHeartSnd > 0.18) { lastHeartSnd = clock; sfx('heart', pick([84, 88, 91, 96])); } }
  if (pendingHearts.length > 60) pendingHearts.splice(0, pendingHearts.length - 60);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    if (p.k === 'ring') continue;
    const dr = Math.exp(-(p.drag || 0) * dt);
    p.vx *= dr; p.vy = p.vy * dr + (p.g || 0) * dt;
    if (p.like || p.k === 'petal') p.x += Math.sin(clock * 2.2 + p.sw) * (p.k === 'petal' ? 60 : 40) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; if (p.vr) p.rot += p.vr * dt;
  }
}
function heartPath(c, s) {
  c.beginPath(); c.moveTo(0, s * 0.35);
  c.bezierCurveTo(-s * 0.1, s * 0.25, -s * 0.55, s * 0.0, -s * 0.5, -s * 0.28);
  c.bezierCurveTo(-s * 0.45, -s * 0.55, -s * 0.1, -s * 0.55, 0, -s * 0.3);
  c.bezierCurveTo(s * 0.1, -s * 0.55, s * 0.45, -s * 0.55, s * 0.5, -s * 0.28);
  c.bezierCurveTo(s * 0.55, s * 0.0, s * 0.1, s * 0.25, 0, s * 0.35); c.closePath();
}
function starPath(c, s) {
  c.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.18 : s * 0.5, a = i * PI / 4 - PI / 2; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  c.closePath();
}
function drawParts() {
  for (const p of parts) {
    const f = p.life / p.max;
    ctx.save();
    if (p.k === 'ring') {
      const t = 1 - f; ctx.setTransform(1, 0, 0, 0.32, p.x, p.y); ctx.globalAlpha = f * 0.7;
      ctx.strokeStyle = '#ffe9f5'; ctx.lineWidth = 10 * f + 2; ctx.beginPath(); ctx.arc(0, 0, p.size * (0.6 + t * 0.8), 0, TAU); ctx.stroke(); ctx.restore(); continue;
    }
    const a = p.like ? clamp(f * 2.2, 0, 1) * 0.95 : clamp(f * 2.5, 0, 1);
    const pop = p.like ? clamp((p.max - p.life) * 6, 0, 1) : 1;
    ctx.setTransform(1, 0, 0, 1, p.x, p.y); ctx.rotate(p.rot || 0); ctx.globalAlpha = a;
    if (p.k === 'heart') {
      const s = p.size * (0.4 + 0.6 * easeOut(pop));
      ctx.shadowColor = 'rgba(255,60,120,.7)'; ctx.shadowBlur = 14;
      heartPath(ctx, s); ctx.fillStyle = p.col; ctx.fill(); ctx.shadowBlur = 0;
      ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-s * 0.24, -s * 0.24, s * 0.1, s * 0.06, -0.6, 0, TAU); ctx.fill();
    } else if (p.k === 'star') {
      const s = p.size * (0.6 + 0.4 * Math.sin(f * PI));
      ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = p.col; ctx.shadowBlur = 18;
      starPath(ctx, s); ctx.fillStyle = p.col; ctx.fill();
    } else if (p.k === 'petal') {
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.5, p.size * 0.28 * (0.6 + 0.4 * Math.sin(clock * 5 + p.sw)), 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
// dust motes in the lamp light (behind Yui)
const MOTES = Array.from({ length: 26 }, () => ({ x: rand(0, W), y: rand(200, 1500), s: rand(2, 5), v: rand(6, 18), ph: rand(0, TAU) }));
function drawMotes(dt) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const m of MOTES) {
    m.y -= m.v * dt; m.x += Math.sin(clock * 0.4 + m.ph) * 8 * dt; if (m.y < 150) { m.y = 1550; m.x = rand(0, W); }
    ctx.globalAlpha = 0.18 + 0.15 * Math.sin(clock * 1.3 + m.ph);
    ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(m.x, m.y, m.s, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ============================================================ HUD: toasts, banner, subtitle, menu
const toasts = [];
function toast(text, kind = 'cmd') {
  toasts.unshift({ text: String(text).slice(0, 42), kind, t: clock });
  if (toasts.length > 4) toasts.length = 4;
  if (kind !== 'gift') sfx('pop');
}
let ban = null;
function banner(a) { ban = { t: clock, nick: a.nick, gift: a.giftName || 'a gift', big: a.kind === 'giftB' }; }
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fitFont(text, weight, size, maxW) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) { size = Math.floor(size * maxW / w); ctx.font = `${weight} ${size}px ${FONT}`; }
  return size;
}
function drawToasts() {
  let y = 300;
  for (let i = 0; i < toasts.length; i++) {
    const t = toasts[i], age = clock - t.t, life = 3.4;
    if (age > life) { toasts.length = i; break; }
    const a = clamp(age * 8, 0, 1) * clamp((life - age) * 3, 0, 1);
    const slide = (1 - easeOut(age * 5)) * -60;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a * (i === 0 ? 1 : 0.85);
    const size = i === 0 ? 40 : 34;
    ctx.font = `600 ${size}px ${FONT}`;
    const w = Math.min(760, ctx.measureText(t.text).width + 56), h = size + 26, x = 30 + slide;
    const col = t.kind === 'gift' ? 'rgba(120,20,70,.82)' : t.kind === 'spam' ? 'rgba(60,20,40,.82)' : 'rgba(18,10,28,.78)';
    rr(x, y, w, h, h / 2); ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = t.kind === 'gift' ? 'rgba(255,160,200,.9)' : 'rgba(255,220,240,.45)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(t.text, x + 28, y + h / 2 + 2, w - 50);
    ctx.restore();
    y += h + 12;
  }
}
function drawBanner() {
  if (!ban) return;
  const age = clock - ban.t, life = ban.big ? 4 : 2.8;
  if (age > life) { ban = null; return; }
  const a = clamp(age * 5, 0, 1) * clamp((life - age) * 3, 0, 1), s = 0.8 + 0.2 * easeOut(age * 4);
  ctx.save(); ctx.setTransform(s, 0, 0, s, 540, 1205); ctx.globalAlpha = a;
  const t1 = '@' + ban.nick, t2 = 'sent ' + ban.gift + (ban.big ? '  ♡' : '');
  fitFont(t1, 700, 64, 900);
  const g = ctx.createLinearGradient(-460, 0, 460, 0); g.addColorStop(0, 'rgba(255,90,150,0)'); g.addColorStop(0.2, 'rgba(160,20,80,.85)'); g.addColorStop(0.8, 'rgba(160,20,80,.85)'); g.addColorStop(1, 'rgba(255,90,150,0)');
  ctx.fillStyle = g; ctx.fillRect(-540, -78, 1080, 156);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffe58a'; ctx.fillText(t1, 0, -26);
  fitFont(t2, 600, 46, 900); ctx.fillStyle = '#fff'; ctx.fillText(t2, 0, 36);
  ctx.restore();
}
// wraps text into lines that fit
function wrap(text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function drawSubtitle() {
  const age = clock - sub.t0, life = sub.d + 0.9;
  if (!sub.text || age > life) return;
  const a = clamp(age * 8, 0, 1) * clamp((life - age) * 2.5, 0, 1);
  const shown = Math.min(sub.text.length, Math.ceil(sub.text.length * clamp(age / Math.max(0.4, sub.d * 0.75), 0, 1)));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a;
  let size = 60; ctx.font = `600 ${size}px ${FONT}`;
  let lines = wrap(sub.text, 960);
  if (lines.length > 2) { size = 50; ctx.font = `600 ${size}px ${FONT}`; lines = wrap(sub.text, 980); }
  const lh = size * 1.2, h = lines.length * lh + 34, y0 = SUB_Y - h / 2;
  const g = ctx.createLinearGradient(0, y0 - 20, 0, y0 + h + 20); g.addColorStop(0, 'rgba(10,4,16,0)'); g.addColorStop(0.25, 'rgba(10,4,16,.62)'); g.addColorStop(0.75, 'rgba(10,4,16,.62)'); g.addColorStop(1, 'rgba(10,4,16,0)');
  ctx.fillStyle = g; ctx.fillRect(0, y0 - 20, W, h + 40);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  let left = shown;
  lines.forEach((ln, i) => {
    const vis = ln.slice(0, Math.max(0, left)); left -= ln.length + 1;
    const y = y0 + 17 + lh * (i + 0.5);
    // full line is measured for centring, the unrevealed part is drawn faint so the text does not jump
    const wFull = ctx.measureText(ln).width, x0 = 540 - wFull / 2;
    ctx.textAlign = 'left';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(20,6,24,.95)'; ctx.strokeText(vis, x0, y);
    ctx.fillStyle = '#fff'; ctx.fillText(vis, x0, y);
  });
  ctx.restore();
}
function drawMenu() {
  if (QS.has('nomenu')) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const x = 36, y = MENU_Y, w = W - 72, h = 196;
  rr(x, y, w, h, 34); ctx.fillStyle = 'rgba(14,6,20,.74)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,214,232,.55)'; ctx.stroke();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const l1a = 'TYPE: ', l1b = 'spin · bow · sit · dance · wink · look · hi';
  let size = 60; ctx.font = `700 ${size}px ${FONT}`;
  let wa = ctx.measureText(l1a).width, wb = ctx.measureText(l1b).width;
  if (wa + wb > w - 50) { size = Math.floor(size * (w - 50) / (wa + wb)); ctx.font = `700 ${size}px ${FONT}`; wa = ctx.measureText(l1a).width; wb = ctx.measureText(l1b).width; }
  let tx = 540 - (wa + wb) / 2;
  ctx.fillStyle = '#ffd36e'; ctx.fillText(l1a, tx, y + 62);
  ctx.fillStyle = '#ffffff'; ctx.fillText(l1b, tx + wa, y + 62);
  const l2 = 'GIFTS = special reactions 🎁';
  fitFont(l2, 600, 50, w - 60); ctx.textAlign = 'center';
  const pulse = 0.85 + 0.15 * Math.sin(clock * 3);
  ctx.globalAlpha = pulse; ctx.fillStyle = '#ff9cc6'; ctx.fillText(l2, 540, y + 142);
  ctx.restore();
}
function drawNameplate() {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `700 46px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffe7f1'; ctx.fillText('Yui', 1040, 246);
  ctx.font = `500 26px ${FONT}`; ctx.fillStyle = '#ffb6d2'; ctx.fillText('your maid ♡ LIVE', 1040, 286);
  ctx.restore();
}

// ============================================================ drawing Yui
function drawSprite(name, alpha, tr) {
  const im = IMG[name]; if (!im || alpha <= 0) return;
  ctx.save();
  const look = name === 'look';
  const py = look ? 1920 : FEET_Y, px = 540;
  ctx.setTransform(1, 0, 0, 1, px + (tr.dx || 0), py + (tr.dy || 0));
  if (tr.rot) ctx.rotate(tr.rot);
  const ks = look ? 1 : CHAR_S;
  ctx.scale((tr.sx || 1) * ks * (look ? tr.lz || 1 : 1), (tr.sy || 1) * ks * (look ? tr.lz || 1 : 1));
  ctx.globalAlpha = alpha;
  const oy = look ? -1920 : -1877;
  ctx.drawImage(im, -540, oy, 1080, 1920);
  if (name === 'idle') {          // face overlays: talking mouth + blink (idle sprite only, same frame)
    const m = mouthOpen(), bl = Y.blinkT >= 0;
    if (bl && IMG.blink_face) ctx.drawImage(IMG.blink_face, 390 - 540, 150 + oy);
    else if (m > 0.42 && IMG.talk_face) ctx.drawImage(IMG.talk_face, 390 - 540, 150 + oy);
  }
  ctx.restore();
}
function charTransform(name, t) {
  // breathing + slow sway on every pose
  const br = Math.sin(clock * 2.2), sw = Math.sin(clock * 0.85);
  const tr = { sx: 1 + br * 0.0025, sy: 1 + br * 0.0065, dx: sw * 5, dy: 0, rot: sw * 0.004 };
  const pe = clamp((clock - Y.poseT) / 0.35, 0, 1);    // small 'settle' when a pose appears
  if (Y.pose === name && name !== 'idle' && name !== 'sit' && name !== 'look') tr.sy *= 1 + (1 - easeOut(pe)) * 0.012, tr.dy += (1 - easeOut(pe)) * 10;
  if (speaking() && name !== 'idle') tr.sy *= 1 + mouthOpen() * 0.0035;   // talking bob
  if (name === 'look') tr.lz = 1 + (1 - easeOut(clamp((clock - Y.poseT) / 0.6, 0, 1))) * 0.08 + Math.sin(clock * 1.4) * 0.004;
  return tr;
}
function drawYui() {
  const a = Y.act;
  if (Y.anim === 'spin' && a) {
    const t = clock - a.t0, dur = a.hold;
    if (t < dur) {
      const th = easeIO(t / dur) * TAU, c = Math.cos(th), sn = Math.sin(th);
      // front -> side -> back -> side (mirrored) -> front; width squashes at each change
      const ph = ((th + PI / 4) % TAU) / (PI / 2) | 0;
      const name = ph === 0 ? 'idle' : ph === 1 ? 'spin_side' : ph === 2 ? 'spin_back' : 'spin_side';
      const mir = ph === 3 ? -1 : 1;
      const sq = 0.72 + 0.28 * Math.abs(Math.cos(2 * th));
      const hop = Math.sin(t / dur * PI) * 26;
      drawSprite(name, 1, { sx: sq * mir, sy: 1, dx: sn * 6, dy: -hop, rot: 0 });
      return;
    }
  }
  if (Y.anim === 'dance' && a) {
    const t = clock - a.t0, beat = 0.5;
    if (t < a.hold - 0.2) {
      const seq = ['dance1', 'dance3', 'dance2', 'dance3', 'dance1', 'happy', 'dance2', 'dance3'];
      const i = Math.floor(t / beat) % seq.length, f = (t % beat) / beat;
      const name = seq[i], prevName = seq[(i + seq.length - 1) % seq.length];
      const bounce = Math.abs(Math.sin(f * PI)) * 34, side = (i % 2 ? 1 : -1);
      const tr = { sx: 1, sy: 1 - (f < 0.15 ? (0.15 - f) * 0.2 : 0), dx: side * 14 * Math.sin(f * PI), dy: -bounce, rot: side * 0.025 * Math.sin(f * PI) };
      // near-cut on the beat (a long crossfade between different silhouettes looks ghosted)
      if (f < 0.1 && t > beat) drawSprite(prevName, 1, tr);
      drawSprite(name, f < 0.1 && t > beat ? f / 0.1 : 1, tr);
      return;
    }
  }
  // normal: crossfade previous -> current pose
  if (Y.xf < 1 && Y.prev) {
    const f = Y.xf;
    drawSprite(Y.prev, clamp(2 * (1 - f), 0, 1), charTransform(Y.prev));
    drawSprite(Y.pose, clamp(2 * f, 0, 1), charTransform(Y.pose));
  } else drawSprite(Y.pose, 1, charTransform(Y.pose));
}
function drawRoom() {
  const im = IMG.room;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (im) { const z = 1.03, sw = Math.sin(clock * 0.85) * 3; ctx.drawImage(im, -W * (z - 1) / 2 - sw, -H * (z - 1) / 2, W * z, H * z); }
  else { ctx.fillStyle = '#1a0f18'; ctx.fillRect(0, 0, W, H); }
  // warm lamp flicker (sconce on the right) + cool window light (left)
  const fl = 0.10 + 0.03 * Math.sin(clock * 7.3) * Math.sin(clock * 2.1);
  let g = ctx.createRadialGradient(930, 640, 10, 930, 640, 420); g.addColorStop(0, `rgba(255,190,110,${fl})`); g.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
function drawOverlay() {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  // blush: pink glow from the edges + warm cheeks (big gifts)
  if (Y.blush > 0.01) {
    const b = Y.blush;
    const g = ctx.createRadialGradient(540, 820, 300, 540, 820, 1150); g.addColorStop(0, 'rgba(255,120,170,0)'); g.addColorStop(1, `rgba(255,90,150,${0.38 * b})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (Y.pose === 'blush' || Y.pose === 'idle') {
      ctx.globalCompositeOperation = 'source-over';
      for (const [cx, cy] of [[SPX(468), SPY(306)], [SPX(592), SPY(294)]]) { const cg = ctx.createRadialGradient(cx, cy, 2, cx, cy, 42); cg.addColorStop(0, `rgba(255,80,120,${0.32 * b})`); cg.addColorStop(1, 'rgba(255,80,120,0)'); ctx.fillStyle = cg; ctx.fillRect(cx - 50, cy - 50, 100, 100); }
    }
  }
  // vignette
  const v = ctx.createRadialGradient(540, 900, 520, 540, 900, 1250); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(6,0,10,.5)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  drawRoom();
  drawMotes(FRAME_DT);
  drawYui();
  drawOverlay();
  drawParts();
  drawNameplate();
  drawBanner();
  drawToasts();
  drawSubtitle();
  drawMenu();
}

// ============================================================ tick
let FRAME_DT = 1 / 60;
function tick(dt) {
  FRAME_DT = dt;
  clock += dt;
  if (Y.xf < 1) Y.xf = Math.min(1, Y.xf + dt / Y.xfDur);
  // blink every 2.5-5.5 s (idle only)
  if (Y.blinkT >= 0) { Y.blinkT += dt; if (Y.blinkT > 0.13) { Y.blinkT = -1; Y.blinkAt = clock + (Math.random() < 0.2 ? 0.25 : rand(2.5, 5.5)); } }
  else if (clock >= Y.blinkAt) { if (Y.pose === 'idle' && Y.xf >= 1) Y.blinkT = 0; else Y.blinkAt = clock + 0.5; }
  Y.blush = Math.max(0, Y.blush - dt / (Y.act && Y.act.kind === 'giftB' ? 4.5 : 0.8));
  if (Y.act && Y.act.kind === 'giftB') { if (Math.random() < dt * 5) burst('heart', 1, Math.random() < 0.5 ? rand(120, 330) : rand(750, 960), rand(800, 1300), 0.6); if (Math.random() < dt * 8) burst('star', 1, Math.random() < 0.5 ? rand(100, 340) : rand(740, 980), rand(300, 1200), 0.4); }
  if (Y.anim === 'dance' && Math.random() < dt * 3) burst('star', 1, Math.random() < 0.5 ? rand(90, 300) : rand(780, 990), rand(400, 1200), 0.4);
  tickActions();
  tickParts(dt);
  musicTick();
  autoSim(dt);
}

// ============================================================ test panel / simulator
const FAKE = ['Ali_99', 'ZaraKhan', 'ninja_pk', 'Hamza.x', 'SilverGirl', 'Bilal786', 'Ayesha_k', 'GamerUAE', 'Usman_7', 'Sana.art', 'DarkKnight', 'Faisal_FC', 'Hira22', 'ShadowAce', 'Noor.ae', 'LunaStar', 'KingSaad', 'Mira.chan'];
let simN = 0;
function fake() { simN++; const n = FAKE[(simN - 1) % FAKE.length]; return { id: 'sim_' + n, nick: n }; }
const simCmd = (text, u = fake()) => { onEvent({ type: 'chat', ...u, text }); return u; };
const simGift = (name, coins, count = 1, u = fake()) => { onEvent({ type: 'gift', ...u, giftName: name, coins, count }); return u; };
const simLikes = (n = 15) => onEvent({ type: 'like', ...fake(), count: n });
const sim = { auto: QS.has('demo'), t: 3 };
function autoSim(dt) {
  if (!sim.auto) return;
  sim.t -= dt; if (sim.t > 0) return;
  sim.t = rand(1.2, 3.2);
  const r = Math.random();
  if (r < 0.45) simCmd(pick(['spin', 'bow', 'sit', 'stand', 'dance', 'wink', 'look', 'hi', 'so cute']));
  else if (r < 0.75) simLikes(rint(5, 25));
  else if (r < 0.88) simGift('Rose', 1, rint(1, 3));
  else if (r < 0.95) simGift('Doughnut', 30);
  else simGift('Galaxy', 1000);
}
const SIM_GIFTS = [['Rose', 1, 'KeyQ'], ['Finger Heart', 5, 'KeyW'], ['Doughnut', 30, 'KeyE'], ['Hand Hearts', 100, 'KeyR'], ['Galaxy', 1000, 'KeyT']];
const SIM_CMDS = [['spin', 'Digit1'], ['bow', 'Digit2'], ['sit', 'Digit3'], ['stand', 'Digit4'], ['dance', 'Digit5'], ['wink', 'Digit6'], ['look', 'Digit7'], ['hi', 'Digit8'], ['so cute', 'Digit9']];
function setupPanel() {
  const panel = document.getElementById('sim');
  const TOUCH_UI = IS_IOS || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
  if (QS.has('clean') || MANUAL || USER || TOUCH_UI) panel.classList.add('hidden');
  if (TOUCH_UI && !QS.has('clean') && !MANUAL) {   // phones (test link only): 3-finger tap or hold the top-left corner
    let holdT = 0; const toggle = () => panel.classList.toggle('hidden');
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 3) { clearTimeout(holdT); toggle(); return; }
      const t = e.touches[0]; if (e.touches.length === 1 && t && t.clientX < 70 && t.clientY < 90) holdT = setTimeout(toggle, 1000);
    }, { passive: true });
    const cancel = () => clearTimeout(holdT);
    window.addEventListener('touchend', cancel, { passive: true }); window.addEventListener('touchmove', cancel, { passive: true });
  }
  const cb = document.getElementById('cmdBtns');
  SIM_CMDS.forEach(([c, k]) => { const b = document.createElement('button'); b.textContent = `${c} (${k.slice(5)})`; b.onclick = () => simCmd(c); cb.appendChild(b); });
  const gb = document.getElementById('giftBtns');
  SIM_GIFTS.forEach(([n, c, k]) => { const b = document.createElement('button'); b.textContent = `${n} ${c} (${k.slice(3)})`; b.onclick = () => simGift(n, c); gb.appendChild(b); });
  const $ = (id) => document.getElementById(id);
  const multi = () => simCmd('spin and dance and wink');
  const spam = () => { const u = fake(); for (let i = 0; i < 4; i++) simCmd(pick(['spin', 'dance', 'wink']), u); };
  const flood = () => { for (let i = 0; i < 5; i++) simCmd(pick(['spin', 'bow', 'dance', 'wink', 'look'])); };
  const quiet = () => { CHAT.last = clock - 46; CHAT.lastQuiet = -99; };
  const auto = () => { sim.auto = !sim.auto; $('autoBtn').classList.toggle('on', sim.auto); };
  const sound = () => { audioInit(); AU.on = !AU.on; $('soundBtn').textContent = AU.on ? 'Sound ON (M)' : 'Sound OFF (M)'; };
  const music = () => { AU.music = !AU.music; $('musicBtn').textContent = AU.music ? 'Music ON (B)' : 'Music OFF (B)'; };
  $('likeBtn').onclick = () => simLikes(20); $('followBtn').onclick = () => onEvent({ type: 'follow', ...fake() });
  $('multiBtn').onclick = multi; $('spamBtn').onclick = spam; $('floodBtn').onclick = flood; $('quietBtn').onclick = quiet;
  $('autoBtn').onclick = auto; $('soundBtn').onclick = sound; $('musicBtn').onclick = music;
  $('autoBtn').classList.toggle('on', sim.auto);
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) window.addEventListener(ev, () => { if (!audioRunning()) audioInit(); }, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    audioInit();
    const c = SIM_CMDS.find((x) => x[1] === e.code); if (c) return void simCmd(c[0]);
    const g = SIM_GIFTS.find((x) => x[2] === e.code); if (g) return void simGift(g[0], g[1]);
    if (e.code === 'KeyH') panel.classList.toggle('hidden');
    else if (e.code === 'KeyL') simLikes(20);
    else if (e.code === 'KeyF') onEvent({ type: 'follow', ...fake() });
    else if (e.code === 'KeyX') multi();
    else if (e.code === 'KeyS') spam();
    else if (e.code === 'KeyA') auto();
    else if (e.code === 'KeyM') sound();
    else if (e.code === 'KeyB') music();
  });
}
function updateLiveInfo() {
  const el = document.getElementById('liveInfo'); if (!el) return;
  const m = LIVE.mode;
  el.textContent = m === 'live' ? `Connected to @${LIVE.username} LIVE` : m === 'simulator' ? 'TEST MODE: open /yui/u/yourname' : m === 'offline' ? `@${LIVE.username} is not LIVE yet - retrying` : 'Connecting to TikTok...';
}

// ============================================================ TAP TO START + sound keeper (same as the stick fight game)
const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const IS_APP = (window.matchMedia && matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) || navigator.standalone === true;
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function goFullscreen() {
  if (isFull() || IS_APP || IS_IOS) return;
  const el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen; if (!rq) return;
  try { const p = rq.call(el, { navigationUI: 'hide' }); Promise.resolve(p).then(() => { try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) {} }, () => {}); } catch (e) {}
}
let introDone = false;
function intro() { if (introDone) return; introDone = true; CHAT.last = clock; enqueue({ kind: 'intro' }, true); }
function setupStart() {
  const tap = document.getElementById('tap'), hint = document.getElementById('fsHint');
  if (!tap || MANUAL || QS.has('notap')) { if (!MANUAL) setTimeout(intro, 800); return; }
  let started = false;
  const start = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    SK.armed = true; audioInit(); goFullscreen(); tap.classList.add('hidden'); started = true; setTimeout(sndUpdate, 1200);
    setTimeout(intro, 500);
  };
  tap.addEventListener('click', start);
  const nb = document.getElementById('nameBox');
  if (nb && !USER && (IS_TOUCH || IS_IOS)) {
    nb.classList.remove('hidden');
    for (const ev of ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) nb.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev.startsWith('touch') });
    nb.addEventListener('submit', (e) => { e.preventDefault(); const n = cleanName(document.getElementById('nameIn').value); if (n) location.replace('/yui/u/' + encodeURIComponent(n)); });
  }
  if (IS_IOS) { const t2 = tap.querySelector('.t2'); if (t2) t2.innerHTML = IS_APP ? 'turns on sound' : 'turns on sound<br><span class="ios">Full screen on iPhone: tap Share <b>&#x2191;</b> then <b>Add to Home Screen</b> and open Yui from the new icon</span>'; }
  setTimeout(() => {
    if (IS_TOUCH || !audioRunning()) { tap.classList.remove('hidden'); if (!IS_TOUCH && QS.has('clean')) setTimeout(() => { if (!tap.classList.contains('hidden')) start(); }, 8000); }
    else intro();
  }, 350);
  const onFs = () => hint.classList.toggle('hidden', !(started && IS_TOUCH && !IS_APP && !IS_IOS && !isFull()));
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
  window.addEventListener('click', (e) => { if (!hint.classList.contains('hidden') && !e.target.closest('#sim')) { goFullscreen(); audioInit(); } });
}
function sndWanted() { return !MANUAL && AU.on && SK.armed; }
function kickSound(gesture) {
  if (MANUAL || !AU.on) return;
  if (gesture) SK.armed = true;
  if (!AU.ctx) { if (gesture) audioInit(); return; }
  if (IS_IOS) iosAudioSession();
  let ac = AU.ctx;
  if (ac.state === 'running') return;
  if (gesture && SK.since && performance.now() - SK.since > 1500 && ac.state !== 'closed') {   // stuck context: build a fresh one inside the tap
    try {
      const AC = window.AudioContext || window.webkitAudioContext, nc = new AC();
      try { const c = ac.close(); if (c && c.catch) c.catch(() => {}); } catch (e) {}
      AU.ctx = ac = nc; AU.out = makeOut(nc); AU.unlocked = false; watchCtx(nc);
      const b = nc.createBuffer(1, 1, 22050), s = nc.createBufferSource(); s.buffer = b; s.connect(nc.destination); s.start(0);
    } catch (e) {}
  }
  try {
    SK.tries++;
    const r = (ac.state === 'interrupted' && SK.tries % 2 === 0 && ac.suspend) ? Promise.resolve(ac.suspend()).catch(() => {}).then(() => ac.resume()) : ac.resume();
    if (r && r.then) r.then(() => sndUpdate(), () => {});
  } catch (e) {}
  if (!SK.mixed && SK.tries >= 6 && navigator.audioSession) { SK.mixed = true; iosAudioSession(); }
}
function watchCtx(ac) {
  if (!ac || ac._sk) return; ac._sk = true;
  try { ac.addEventListener('statechange', () => { sndUpdate(); if (ac.state !== 'running' && ac.state !== 'closed') setTimeout(() => kickSound(false), 150); }); } catch (e) {}
}
function sndUpdate() {
  const ok = audioRunning();
  if (ok) { SK.armed = true; SK.since = 0; SK.tries = 0; } else if (!SK.since) SK.since = performance.now();
  const b = SK.badge; if (!b) return;
  const t = document.getElementById('tap'), tapOpen = t && !t.classList.contains('hidden');
  b.classList.toggle('hidden', !(sndWanted() && !ok && !document.hidden && !tapOpen && SK.since && performance.now() - SK.since > 700));
}
function setupSoundKeeper() {
  if (MANUAL) return;
  const b = document.getElementById('sndBadge'); SK.badge = b;
  if (b) b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); kickSound(true); setTimeout(sndUpdate, 300); });
  if (AU.ctx) watchCtx(AU.ctx);
  const wake = () => { if (!document.hidden) { kickSound(false); setTimeout(sndUpdate, 400); } else sndUpdate(); };
  document.addEventListener('visibilitychange', wake); window.addEventListener('pageshow', wake); window.addEventListener('focus', wake);
  try { if (navigator.audioSession && navigator.audioSession.addEventListener) navigator.audioSession.addEventListener('statechange', wake); } catch (e) {}
  const g = () => { if (sndWanted() && !audioRunning()) { kickSound(true); setTimeout(sndUpdate, 300); } else if (IS_IOS && AU.el && AU.el.paused && AU.on) iosAudioSession(); };
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) window.addEventListener(ev, g, { capture: true, passive: true });
  setInterval(() => { try { if (sndWanted() && !document.hidden && AU.ctx && !audioRunning()) kickSound(false); sndUpdate(); } catch (e) {} }, 1000);
}
function registerSW() {
  if (MANUAL || location.protocol !== 'https:' || !('serviceWorker' in navigator)) return;
  try { const r = navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }); if (r && r.then) r.then((reg) => { try { reg.update(); } catch (e) {} }, () => {}); } catch (e) {}
}
function connectWS() {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  let ws;
  try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${UQ}`); } catch (e) { return; }
  ws.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch (e) { console.error(e); } };
  ws.onclose = () => { if (LIVE.mode === 'live') { LIVE.mode = 'connecting'; updateLiveInfo(); } setTimeout(connectWS, 3000); };
}

// ============================================================ boot
let lastT = 0;
const ERRS = {};
function showErr(where, e) { const msg = where + ': ' + ((e && (e.message || e)) || 'error'); console.error(msg, e); if (ERRS[msg]) return; ERRS[msg] = 1; if (typeof window.__sfErr === 'function') window.__sfErr(msg); }
function safe(where, fn) { try { const r = fn(); if (r && r.catch) r.catch((e) => showErr(where, e)); return r; } catch (e) { showErr(where, e); } }
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
  try { tick(dt); } catch (e) { showErr('tick', e); }
  try { render(); paintBars(); } catch (e) { showErr('draw', e); try { ctx.restore(); ctx.globalAlpha = 1; } catch (e2) {} }
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
async function boot() {
  safe('layout', layoutView);
  const relayout = () => setTimeout(() => safe('layout', layoutView), 60);
  for (const ev of ['resize', 'orientationchange', 'fullscreenchange', 'webkitfullscreenchange']) window.addEventListener(ev, relayout);
  if (window.visualViewport) visualViewport.addEventListener('resize', relayout);
  try { if (document.fonts && document.fonts.load) await withTimeout(Promise.all([document.fonts.load(`600 40px Fredoka`), document.fonts.load(`700 40px Fredoka`)]), 2500); } catch (e) {}
  const imgs = loadImages();
  await withTimeout(imgs, MANUAL ? 30000 : 6000);
  const vo = loadVO();
  if (MANUAL) await vo;
  safe('panel', setupPanel); safe('live', updateLiveInfo); safe('ws', connectWS);
  safe('sound', audioInit);
  safe('start', setupStart);
  safe('soundkeeper', setupSoundKeeper);
  safe('sw', registerSW);
  window.YUI = {
    ready: true, event: onEvent, Y, Q, CHAT, sub, toasts, parseCommands,
    step: (n = 1, fps = 30) => { for (let i = 0; i < n; i++) tick(1 / fps); render(); },
    clock: () => clock, intro, simCmd, simGift, simLikes, fake, quietNow: () => { CHAT.last = clock - 46; CHAT.lastQuiet = -99; },
    voCount: () => Object.keys(VO.buf).length, renderAudio, audioLog: () => AU.log.length,
    pose: (p) => { Y.act = null; Y.anim = null; Q.length = 0; setPose(p, 0.001); Y.xf = 1; },
    play: (kind) => { Q.length = 0; Y.act = null; startAction({ kind }); },
  };
  if (!MANUAL) requestAnimationFrame((t) => { lastT = t; frame(t); });
}
boot().catch((e) => showErr('boot', e));
