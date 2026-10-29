#!/usr/bin/env python3
"""Yui voice lines (anime maid LIVE character).
Engine: edge-tts (Microsoft Edge online neural TTS), voice en-US-EmmaNeural with a light pitch lift.
Chosen after an audition of en-US-AnaNeural / AriaNeural / JennyNeural / AvaNeural / EmmaNeural, en-GB-MaisieNeural /
SoniaNeural / LibbyNeural and ja-JP-NanamiNeural (speaking English): all but Nanami transcribed 17/17 words with
Whisper small.en; Ana and Maisie are child voices (F0 ~300 Hz) so they were ruled out for this character; Emma had the
widest pitch movement (most playful) and is clear, adult and not breathy.
Emotion = per-style rate/pitch/volume, then ffmpeg: trim, bright clean EQ (no drive), light compression, tiny room,
-16 LUFS, -1.5 dBTP limiter. Output: public/yui/vo/<key>.ogg + .m4a and lines.json (length, text, mouth envelope).
Usage: python3 tools/make_yui_vo.py   (needs: pip install edge-tts numpy; ffmpeg)"""
import asyncio, json, os, re, subprocess, tempfile
import numpy as np, edge_tts
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'yui', 'vo')
VOICE = os.environ.get('YUI_VOICE', 'en-US-EmmaNeural')
BASE_PITCH = int(os.environ.get('YUI_PITCH', '12'))
STYLE = {  # rate %, pitch Hz (added to BASE_PITCH), volume %
    'tease': (-4, 0, 0), 'happy': (4, 8, 5), 'soft': (-8, 2, -5), 'shy': (-2, 10, 0), 'pout': (2, 4, 5), 'bored': (-10, -6, -5)}
def ff(*a): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *a], check=True)
def lufs(f, loop=0):
    e = subprocess.run(['ffmpeg', '-nostats', *(['-stream_loop', str(loop)] if loop else []), '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    i = re.findall(r'I:\s+(-?[\d.]+) LUFS', e); p = re.findall(r'Peak:\s+(-?[\d.inf]+) dBFS', e)
    return float(i[-1]) if i else None, float(p[-1]) if p and p[-1] not in ('-inf', 'inf') else None
CHAIN = ('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1,areverse,'
         'highpass=f=110,equalizer=f=300:t=q:w=1:g=-1.5,equalizer=f=3500:t=q:w=1.2:g=2.5,highshelf=f=9000:g=1.5,'
         'deesser=i=0.35,acompressor=threshold=-20dB:ratio=3:attack=6:release=90:makeup=2,apad=pad_dur=0.15,aecho=0.9:0.5:19|31:0.10|0.06')
async def tts(text, rate, pitch, vol, path):
    err = None
    for k in range(6):
        try:
            await edge_tts.Communicate(text, VOICE, rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz', volume=f'{vol:+d}%').save(path)
            if os.path.getsize(path) > 1000: return
        except Exception as e: err = e
        await asyncio.sleep(1 + k)
    raise RuntimeError(f'tts failed: {text} {err}')
async def main():
    cat = json.load(open(os.path.join(ROOT, 'tools', 'yui_lines.json')))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    tmp = tempfile.mkdtemp(); sem = asyncio.Semaphore(6); man = {}
    async def one(key, style, text):
        st = STYLE[style]
        async with sem: await tts(text, st[0], BASE_PITCH + st[1], st[2], f'{tmp}/{key}.mp3')
        ff('-i', f'{tmp}/{key}.mp3', '-af', CHAIN, '-ar', '44100', '-ac', '1', f'{tmp}/{key}_a.wav')
        I, _ = lufs(f'{tmp}/{key}_a.wav')
        if I is None or I < -60: I, _ = lufs(f'{tmp}/{key}_a.wav', 3)
        g = -16 - (I if I is not None else -16)
        ff('-i', f'{tmp}/{key}_a.wav', '-af', f'volume={g:.2f}dB,alimiter=limit=0.84:attack=2:release=40:level=false', f'{tmp}/{key}.wav')
        ff('-i', f'{tmp}/{key}.wav', '-c:a', 'libvorbis', '-q:a', '5', f'{OUT}/{key}.ogg')
        ff('-i', f'{tmp}/{key}.wav', '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', f'{OUT}/{key}.m4a')
        raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', f'{tmp}/{key}.wav', '-f', 's16le', '-'], capture_output=True).stdout
        x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768; n = 44100 // 30
        rms = np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) for i in range(0, len(x), n)]) + 1e-9
        db = 20 * np.log10(rms / rms.max()); env = ''.join(str(int(round(v))) for v in np.clip((db + 30) / 30 * 9, 0, 9))
        I2, P2 = lufs(f'{tmp}/{key}.wav')
        man[key] = {'d': round(len(x) / 44100, 3), 'e': env, 't': text, 'lufs': I2, 'peak': P2}
    jobs = [(f'{cmd}_{i}', s, t) for cmd, lines in cat.items() for i, (s, t) in enumerate(lines)]
    await asyncio.gather(*(one(*j) for j in jobs))
    meta = {'engine': 'edge-tts', 'voice': VOICE, 'pitch': BASE_PITCH, 'clips': {k: {'d': man[k]['d'], 't': man[k]['t'], 'e': man[k]['e']} for k in sorted(man)}}
    json.dump(meta, open(f'{OUT}/lines.json', 'w'), separators=(',', ':'))
    L = [m['lufs'] for m in man.values() if m['lufs'] is not None]; P = [m['peak'] for m in man.values() if m['peak'] is not None]
    print(f'{len(man)} clips  LUFS min {min(L):.1f} max {max(L):.1f}  peak max {max(P):.1f} dBFS  total {sum(m["d"] for m in man.values()):.0f}s')
asyncio.run(main())
