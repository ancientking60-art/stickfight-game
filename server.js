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
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.ttf': 'font/ttf'
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
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- TikTok sessions (one per username)
function who(data) {
  const u = data?.user || {};
  const id = String(u.uniqueId || u.userId || data?.userId || 'viewer');
  const nick = String(u.nickname || u.uniqueId || 'viewer').slice(0, 18);
  return { id, nick };
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

    conn.on(WebcastEvent.CHAT, (d) => B({ type: 'chat', ...who(d), text: String(d.comment || '') }));
    conn.on(WebcastEvent.GIFT, (d) => {
      const u = who(d);
      const g = d.giftDetails || {};
      const ext = d.extendedGiftInfo || {};
      const giftName = String(g.giftName || ext.name || `Gift ${d.giftId}`);
      const coins = Number(g.diamondCount || ext.diamond_count || 1);
      const giftType = Number(g.giftType ?? ext.type ?? 0);
      const total = Math.max(1, Number(d.repeatCount || 1));
      let count = total;
      if (giftType === 1) {
        // streakable gift: events repeat with growing repeatCount; only send the new ones
        const key = `${u.id}|${d.giftId}|${d.groupId || ''}`;
        const seen = this.streaks.get(key) || 0;
        count = total - seen;
        if (d.repeatEnd) this.streaks.delete(key); else this.streaks.set(key, total);
        if (this.streaks.size > 5000) this.streaks.clear();
      }
      if (count <= 0) return;
      B({ type: 'gift', ...u, giftName, giftId: d.giftId, coins, count });
    });
    conn.on(WebcastEvent.LIKE, (d) => B({ type: 'like', ...who(d), count: Number(d.likeCount || 1) }));
    conn.on(WebcastEvent.FOLLOW, (d) => B({ type: 'follow', ...who(d) }));
    conn.on(WebcastEvent.SHARE, (d) => B({ type: 'share', ...who(d) }));
    conn.on(WebcastEvent.ROOM_USER, (d) => B({ type: 'viewers', count: Number(d.total ?? d.viewerCount ?? 0) }));
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
  if (SIM_ONLY) console.log('No TikTok username in the link or config.json -> SIMULATOR mode (bots + test buttons).');
  else console.log(`Default TikTok account (config.json): @${username} - connects when the game page opens.`);
  if (config.openBrowser !== false && !process.env.NO_BROWSER && !process.env.RENDER) openBrowser(url);
});
