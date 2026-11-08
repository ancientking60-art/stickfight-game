// Referee speech for the stream. TikTok Live Studio has no speechSynthesis voices,
// so the page plays real mp3s from /tts. Edge neural voice first, Google Translate if Edge is blocked.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { getAudioUrl } from 'google-tts-api';

const DIR = path.join(os.tmpdir(), 'stickfight-tts');
try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) {}

// Every fixed trash-talk line. Built once at startup so the first shout is instant.
export const FIXED_LINES = [
  'You sure you wanna embarrass yourself in front of everybody?',
  'Pick your fighter carefully. Your dignity is on the line.',
  'I hope you warmed up. You\'re about to get cooked.',
  'Talk is cheap. Let\'s see those hands.',
  'Even the loading screen is stronger than you.',
  'STOP! You\'re fighting like your controller is disconnected!',
  'Is that your special move? I\'ve seen better from a sleeping hamster.',
  'Bro, you\'re not fighting me. You\'re fighting for survival.',
  'Your health bar is disappearing faster than your confidence.',
  'Dodge! Oh wait, you don\'t know how!',
  'I would tell you to fight back, but I don\'t want to embarrass you more.',
  'That punch had a delivery delay!',
  'THANK YOU FOR THE FREE WIN!',
  'Somebody call an ambulance… for his gaming career!',
  'That wasn\'t a fight. That was a public demonstration.',
  'Your character needs a refund.',
  'GG! Good Game? More like Goodbye, Gamer!',
  'CHAT! Should I finish him or give him another chance?',
  'LEFT TEAM OR RIGHT TEAM? WHO\'S GETTING DESTROYED?',
  'If you think he can win, DOUBLE TAP!',
  'COMMENT 1 IF I SHOULD SHOW MERCY. COMMENT 2 IF I SHOULD END HIM!',
  'WHO\'S THE REAL BOSS HERE? YOU DECIDE!',
  'If I lose, I\'ll let CHAT choose my next fighter!',
  'BRO, THIS IS A FIGHTING GAME, NOT A CHARITY EVENT!',
  'YOU\'VE GOT 100% HEALTH AND 0% SKILL!',
  'EVEN YOUR SHADOW IS TRYING TO RUN AWAY!',
  'THAT WASN\'T A COMBO. THAT WAS A CRY FOR HELP!',
  'CHAT, PLEASE DON\'T CLIP THIS… OH WAIT, CLIP IT!'
];

const mem = new Map();
const inflight = new Map();
let engine = 'pending';
let edge = null;
let edgeReady = null;
let chain = Promise.resolve();

export function ttsEngine() { return engine; }

export function cleanTtsText(text) {
  return String(text || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function looksLikeMp3(buf) {
  if (!buf || buf.length < 80) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

function fileFor(text) {
  return path.join(DIR, crypto.createHash('sha1').update(text).digest('hex') + '.mp3');
}

function escapeXml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function ensureEdge() {
  if (!edge) edge = new MsEdgeTTS({ connectionTimeoutMs: 12000, synthesisTimeoutMs: 20000 });
  if (!edgeReady) edgeReady = edge.setMetadata('en-US-GuyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  await edgeReady;
}

async function edgeSpeak(text) {
  await ensureEdge();
  const { audioStream } = edge.toStream(escapeXml(text), { rate: '+12%', pitch: '-6%', volume: 'loud' });
  const buf = await readStream(audioStream);
  if (!looksLikeMp3(buf)) throw new Error('edge audio was not mp3');
  return buf;
}

async function googleSpeak(text) {
  const url = getAudioUrl(text, { lang: 'en', slow: false });
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('google tts ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!looksLikeMp3(buf)) throw new Error('google audio was not mp3');
  return buf;
}

async function synth(text) {
  if (engine !== 'google') {
    try {
      const buf = await edgeSpeak(text);
      if (engine !== 'edge') {
        engine = 'edge';
        console.log('Referee voice: Microsoft Edge en-US-GuyNeural');
      }
      return buf;
    } catch (e) {
      edgeReady = null;
      try { if (edge) edge.close(); } catch (err) {}
      edge = null;
      engine = 'google';
      console.log('Edge TTS unavailable (' + (e && e.message ? e.message : e) + '). Using Google Translate TTS.');
    }
  }
  const buf = await googleSpeak(text);
  engine = 'google';
  return buf;
}

function remember(text, buf) {
  mem.set(text, buf);
  if (mem.size > 400) mem.delete(mem.keys().next().value);
  try { fs.writeFileSync(fileFor(text), buf); } catch (e) {}
  return buf;
}

export function speak(text) {
  const clean = cleanTtsText(text);
  if (!clean) return Promise.reject(new Error('empty'));
  if (mem.has(clean)) return Promise.resolve(mem.get(clean));
  try {
    const file = fileFor(clean);
    if (fs.existsSync(file)) {
      const buf = fs.readFileSync(file);
      if (looksLikeMp3(buf)) { mem.set(clean, buf); return Promise.resolve(buf); }
    }
  } catch (e) {}
  if (inflight.has(clean)) return inflight.get(clean);
  const run = chain.then(() => synth(clean)).then((buf) => remember(clean, buf));
  chain = run.then(() => {}, () => {});
  const job = run.finally(() => inflight.delete(clean));
  inflight.set(clean, job);
  return job;
}

export async function warmReferee() {
  let ok = 0;
  for (const line of FIXED_LINES) {
    try { await speak(line); ok++; }
    catch (e) {
      console.log('Referee warmup stopped:', e && e.message ? e.message : e);
      break;
    }
  }
  console.log('Referee lines ready: ' + ok + ' cached, engine ' + engine);
}
