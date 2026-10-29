// Stick War LIVE - local server
// Serves the game (public/) and relays TikTok LIVE events to it over WebSocket.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const CHECK_ONLY = process.argv.includes('--check');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch (e) {
    console.log(`\n!! Could not read ${file}: ${e.message}`);
    console.log('!! Check the file for a missing comma or quote. Using defaults.\n');
    return fallback;
  }
}

const config = readJson('config.json', {});
const PORT = Number(process.env.PORT || config.port || 3000);
const username = String(config.tiktokUsername || '').trim().replace(/^@/, '');
const SIM_ONLY = !username || username === 'your_tiktok_username' || username.toLowerCase() === 'simulator';

// ---------------------------------------------------------------- web server
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const cleanUser = (u) => String(u || '').trim().replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30);
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 25);
let liveState = { mode: SIM_ONLY ? 'simulator' : 'connecting', username, message: '' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/settings.json') {
    // re-read every time so edits apply after a page refresh
    const cfg = readJson('config.json', {});
    const gifts = readJson('gifts.json', {});
    const qu = cleanUser(url.searchParams.get('user'));
    const s = qu ? sessions.get(qu.toLowerCase()) : null;
    const live = qu ? (s ? s.status() : { mode: 'connecting', username: qu, message: '' }) : liveState;
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ game: cfg.game || {}, gifts, live }));
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, sessions: [...sessions.values()].map((x) => ({ user: x.user, mode: x.mode, clients: x.clients.size })) }));
    return;
  }
  if (url.pathname === '/manifest.webmanifest') {
    // 'Add to Home screen' app: opens the same ?user= link full screen without the browser bars
    const qu = cleanUser(url.searchParams.get('user'));
    const q = new URLSearchParams(); if (qu) q.set('user', qu); if (url.searchParams.has('clean')) q.set('clean', '1');
    const qs = q.toString() ? '?' + q.toString() : '';
    res.writeHead(200, { 'Content-Type': MIME['.webmanifest'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      id: '/' + qs, name: qu ? `Stick War LIVE - @${qu}` : 'Stick War LIVE', short_name: 'Stick War',
      start_url: qu && q.has('clean') ? '/u/' + encodeURIComponent(qu) : '/' + qs, scope: '/', display: 'fullscreen', display_override: ['fullscreen', 'standalone'], orientation: 'portrait',
      background_color: '#05060d', theme_color: '#05060d',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    }));
    return;
  }
  if (url.pathname === '/yui/manifest.webmanifest') {
    // Yui (anime maid LIVE character) home-screen app; same ?user / clean rules as the game
    const qu = cleanUser(url.searchParams.get('user'));
    const q = new URLSearchParams(); if (qu) q.set('user', qu); if (url.searchParams.has('clean')) q.set('clean', '1');
    const qs = q.toString() ? '?' + q.toString() : '';
    res.writeHead(200, { 'Content-Type': MIME['.webmanifest'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      id: '/yui/' + qs, name: qu ? `Yui LIVE - @${qu}` : 'Yui LIVE', short_name: 'Yui',
      start_url: qu && q.has('clean') ? '/yui/u/' + encodeURIComponent(qu) : '/yui/' + qs, scope: '/yui/', display: 'fullscreen', display_override: ['fullscreen', 'standalone'], orientation: 'portrait',
      background_color: '#0b0710', theme_color: '#0b0710',
      icons: [
        { src: '/yui/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/yui/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/yui/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    }));
    return;
  }
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  // Yui page: '/yui', '/yui/' or the short streaming link '/yui/u/NAME' (= ?user=NAME&clean=1)
  const yu = /^\/yui\/u\/([^/]+)\/?$/.exec(p);
  if (p === '/yui' || p === '/yui/' || p === '/yui/index.html' || yu) {
    fs.readFile(path.join(PUBLIC, 'yui', 'index.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(500); res.end(); return; }
      const qu = cleanUser(yu ? yu[1] : url.searchParams.get('user'));
      const q = new URLSearchParams(); if (qu && !/^(reset|clear|forget|none)$/i.test(qu)) q.set('user', qu); if (yu || url.searchParams.has('clean')) q.set('clean', '1');
      const out = html.replace('href="/yui/manifest.webmanifest"', `href="/yui/manifest.webmanifest${q.toString() ? '?' + q.toString().replace(/&/g, '&amp;') : ''}"`);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      res.end(out);
    });
    return;
  }
  // the game page: '/', '/index.html' or the short streaming link '/u/NAME' (= ?user=NAME&clean=1).
  // The Home Screen manifest link already carries the name, so 'Add to Home Screen' always keeps it.
  const um = /^\/u\/([^/]+)\/?$/.exec(p);
  if (p === '/' || p === '/index.html' || um) {
    fs.readFile(path.join(PUBLIC, 'index.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(500); res.end(); return; }
      const qu = cleanUser(um ? um[1] : url.searchParams.get('user'));
      const q = new URLSearchParams(); if (qu && !/^(reset|clear|forget|none)$/i.test(qu)) q.set('user', qu); if (um || url.searchParams.has('clean')) q.set('clean', '1');
      const out = html.replace('href="/manifest.webmanifest"', `href="/manifest.webmanifest${q.toString() ? '?' + q.toString().replace(/&/g, '&amp;') : ''}"`);
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      res.end(out);
    });
    return;
  }
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    // byte ranges: iPhone Safari only plays <audio> files from servers that support them
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const size = data.length;
      let start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
      res.writeHead(206, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      res.end(data.subarray(start, end + 1)); return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Content-Length': data.length });
    res.end(data);
  });
});

// ---------------------------------------------------------------- TikTok sessions (one per username)
// tiktok-live-connector 2.x (tiktok-live-proto v3) shape: d.user = { id, displayId (= @name), nickname, secUid };
// older 1.x shape: d.uniqueId / d.userId / d.nickname at the top level. Accept both.
function who(data) {
  const d = data || {}, u = d.user || {};
  const name = u.uniqueId || u.displayId || u.username || d.uniqueId || '';
  const id = String(name || u.userId || u.id || u.idStr || d.userId || u.secUid || u.nickname || d.nickname || 'viewer');
  const nick = String(u.nickname || d.nickname || name || 'viewer').slice(0, 18);
  return { id, nick };
}
const num = (...v) => { for (const x of v) { const n = Number(x); if (x !== undefined && x !== null && x !== '' && Number.isFinite(n)) return n; } return 0; };
// one raw sample of each event type in the log (truncated) - for debugging field names
const SAMPLED = new Set();
function sample(user, type, d) {
  if (SAMPLED.has(type)) return; SAMPLED.add(type);
  try {
    const seen = new WeakSet();
    const j = JSON.stringify(d, (k, v) => {
      if (k === 'common' || /image|avatar|icon|badge|Effect|monitor/i.test(k)) return undefined;
      if (typeof v === 'object' && v) { if (seen.has(v)) return undefined; seen.add(v); }
      return typeof v === 'bigint' ? String(v) : v;
    });
    console.log(`[${user}] sample ${type}:`, (j || '').slice(0, 700));
  } catch (e) { console.log(`[${user}] sample ${type}: (unprintable)`, e?.message); }
}
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };

let lib = null;
async function loadLib() {
  if (lib) return lib;
  try {
    lib = await import('tiktok-live-connector');
    // connector 2.5.0 bug: it builds http:// URLs for www.tiktok.com (its https check is inverted).
    // Always use https for real hosts so it also works behind strict networks/proxies.
    const P = lib.WebcastHttpClient?.prototype;
    if (P && typeof P.getBaseUrl === 'function' && !P.__httpsFix) {
      P.getBaseUrl = function (host) { return /^(localhost|127\.|\[?::1)/.test(host) ? `http://${host}` : `https://${host}`; };
      P.__httpsFix = true;
    }
  } catch (e) {
    console.log('!! tiktok-live-connector is not installed. Run start.bat again (it installs it).');
    lib = null;
  }
  return lib;
}

const sessions = new Map(); // lowercase username -> Session
const rnd = (a, b) => a + Math.random() * (b - a);

class Session {
  constructor(user) {
    this.user = user; this.clients = new Set(); this.mode = 'connecting'; this.message = '';
    this.conn = null; this.retryTimer = null; this.closed = false; this.streaks = new Map();
  }
  status() { return { mode: this.mode, username: this.user, message: this.message }; }
  broadcast(msg) { const s = JSON.stringify(msg); for (const c of this.clients) send(c, s); }
  setState(mode, message = '') { this.mode = mode; this.message = message; this.broadcast({ type: 'status', ...this.status() }); }
  add(ws) { this.clients.add(ws); send(ws, { type: 'status', ...this.status() }); }
  remove(ws) {
    this.clients.delete(ws);
    if (!this.clients.size) {
      // small grace period so a page refresh does not drop the TikTok connection
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => { if (!this.clients.size) this.close(); }, 15000);
    }
  }
  close() {
    this.closed = true; clearTimeout(this.retryTimer); clearTimeout(this.idleTimer);
    try { this.conn?.removeAllListeners?.(); this.conn?.disconnect?.(); } catch {}
    sessions.delete(this.user.toLowerCase());
    console.log(`[${this.user}] no viewers of the game left -> TikTok connection closed`);
  }
  scheduleRetry(sec) {
    if (this.closed) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), sec * 1000);
  }
  async connect() {
    if (this.closed) return;
    const L = await loadLib();
    if (!L) { this.setState('error', 'connector not installed'); return; }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = L;
    try { this.conn?.removeAllListeners?.(); this.conn?.disconnect?.(); } catch {}
    const options = { processInitialData: false };
    if (config.signApiKey) options.signApiKey = config.signApiKey;
    const conn = this.conn = new TikTokLiveConnection(this.user, options);
    const B = (m) => { if (this.conn === conn) this.broadcast(m); };

    conn.on(WebcastEvent.CHAT, (d) => { sample(this.user, 'chat', d); B({ type: 'chat', ...who(d), text: String(d.content ?? d.comment ?? d.text ?? '') }); });
    conn.on(WebcastEvent.GIFT, (d) => {
      sample(this.user, 'gift', d);
      const u = who(d);
      const g = d.gift || d.giftDetails || {};          // v3: d.gift = { id, name, diamondCount, type }; 1.x: d.giftDetails
      const ext = d.extendedGiftInfo || {};
      const gid = d.giftId || g.id || ext.id || '';
      const giftName = String(g.name || g.giftName || ext.name || d.giftName || `Gift ${gid}`);
      const coins = Math.max(1, num(g.diamondCount, g.diamond_count, ext.diamond_count, ext.diamondCount, d.diamondCount, 1));
      const giftType = num(g.type, g.giftType, ext.type, d.giftType, 0);
      const total = Math.max(1, num(d.repeatCount, d.comboCount, d.groupCount, 1));
      let count = total;
      if (giftType === 1) {
        // streakable gift: events repeat with growing repeatCount; only send the new ones
        const key = `${u.id}|${gid}|${d.groupId || ''}`;
        const seen = this.streaks.get(key) || 0;
        count = total - seen;
        if (d.repeatEnd) this.streaks.delete(key); else this.streaks.set(key, total);
        if (this.streaks.size > 5000) this.streaks.clear();
      }
      if (count <= 0) return;
      B({ type: 'gift', ...u, giftName, giftId: gid, coins, count });
    });
    // v3: d.count = likes in this event (d.total = room total); 1.x: d.likeCount
    conn.on(WebcastEvent.LIKE, (d) => { sample(this.user, 'like', d); B({ type: 'like', ...who(d), count: Math.max(1, Math.min(500, num(d.count, d.likeCount, 1))) }); });
    conn.on(WebcastEvent.FOLLOW, (d) => { sample(this.user, 'follow', d); B({ type: 'follow', ...who(d) }); });
    conn.on(WebcastEvent.SHARE, (d) => { sample(this.user, 'share', d); B({ type: 'share', ...who(d) }); });
    conn.on(WebcastEvent.ROOM_USER, (d) => { sample(this.user, 'viewers', d); B({ type: 'viewers', count: num(d.total, d.totalUser, d.viewerCount, 0) }); });
    conn.on(WebcastEvent.STREAM_END, () => {
      if (this.conn !== conn) return;
      console.log(`[${this.user}] LIVE ended, waiting for the next LIVE`);
      this.setState('offline', 'LIVE ended');
      this.scheduleRetry(rnd(20, 30));
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.conn !== conn || this.closed) return;
      if (this.mode === 'live') {
        console.log(`[${this.user}] disconnected from TikTok, reconnecting in 10 s`);
        this.setState('connecting', 'reconnecting');
        this.scheduleRetry(10);
      }
    });
    conn.on(ControlEvent.ERROR, (e) => console.log(`[${this.user}] TikTok error:`, e?.info || e?.message || e));

    try {
      if (this.mode !== 'offline') this.setState('connecting');
      const state = await Promise.race([
        conn.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timed out (TikTok did not answer)')), 60000))
      ]);
      if (this.closed || this.conn !== conn) { try { conn.disconnect(); } catch {} return; }
      console.log(`[${this.user}] *** CONNECTED to LIVE (room ${state?.roomId}) ***`);
      this.setState('live');
    } catch (e) {
      if (this.closed || this.conn !== conn) return;
      const name = e?.constructor?.name || '';
      const offline = /offline/i.test(name) || /offline|not.*live/i.test(String(e?.message));
      const wait = rnd(20, 30);
      if (offline) {
        console.log(`[${this.user}] not LIVE yet, checking again in ${wait.toFixed(0)} s`);
        this.setState('offline', 'not live yet');
      } else {
        console.log(`[${this.user}] could not connect: ${e?.message || e} - retrying in ${wait.toFixed(0)} s`);
        this.setState('offline', 'connect failed');
      }
      this.scheduleRetry(wait);
    }
  }
}

function getSession(user) {
  const k = user.toLowerCase();
  let s = sessions.get(k);
  if (s) { clearTimeout(s.idleTimer); return s; }
  if (sessions.size >= MAX_SESSIONS) return null;
  s = new Session(user); sessions.set(k, s);
  console.log(`[${user}] game opened -> connecting to TikTok LIVE`);
  s.connect();
  return s;
}

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const user = cleanUser(url.searchParams.get('user')) || (SIM_ONLY ? '' : username);
  if (!user) { send(ws, { type: 'status', mode: 'simulator', username: '', message: '' }); return; }
  const s = getSession(user);
  if (!s) { send(ws, { type: 'status', mode: 'error', username: user, message: 'server busy' }); return; }
  s.add(ws);
  ws.on('close', () => s.remove(ws));
});
// keep connections alive through the tunnel
setInterval(() => { for (const c of wss.clients) { try { c.ping(); } catch {} } }, 25000).unref();

async function checkConnector() {
  const L = await loadLib();
  if (!L) return;
  const c = new L.TikTokLiveConnection(username || 'tiktok', { processInitialData: false });
  console.log('connector loaded OK:', typeof c.connect === 'function', Object.keys(L.WebcastEvent).length, 'event types');
}

// ---------------------------------------------------------------- start
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      // Edge "app" window = no address bar, easy to capture in TikTok LIVE Studio
      spawn('cmd', ['/c', 'start', '""', 'msedge', `--app=${url}`, '--window-size=560,1000', '--autoplay-policy=no-user-gesture-required'], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    }
  } catch {}
}

if (CHECK_ONLY) {
  await checkConnector();
  console.log('config OK, port', PORT, SIM_ONLY ? '(simulator mode: no username set)' : `(username @${username})`);
  process.exit(0);
}

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n!! Port ${PORT} is busy. The game is probably already running in another window.`);
    console.log(`!! Close the other black window, or open http://localhost:${PORT}\n`);
  } else console.log(e);
  process.exit(1);
});

server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log('==============================================');
  console.log('  STICK WAR LIVE is running!');
  console.log(`  Game:  ${url}`);
  console.log('  Press H in the game to show/hide test buttons');
  console.log('  Keep this black window open while you stream.');
  console.log('==============================================');
  console.log(`\nTip: open ${url}/?user=YOUR_TIKTOK_NAME to connect to any TikTok LIVE.`);
  console.log(`Yui (anime maid character): ${url}/yui/?user=YOUR_TIKTOK_NAME  (stream link: /yui/u/NAME)`);
  if (SIM_ONLY) console.log('No TikTok username in the link or config.json -> SIMULATOR mode (bots + test buttons).');
  else console.log(`Default TikTok account (config.json): @${username} - connects when the game page opens.`);
  if (config.openBrowser !== false && !process.env.NO_BROWSER && !process.env.RENDER) openBrowser(url);
});
