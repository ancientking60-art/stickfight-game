#!/usr/bin/env python3
"""v15 voice lines: renders every spoken line in tools/vo_catalog.json (dumped from SF.voCatalog()) per hero voice.
Engine: edge-tts (Microsoft Edge online neural TTS). White = en-US-AndrewNeural, Black = en-GB-RyanNeural (+ darker EQ).
The free Edge endpoint ignores SSML <mstts:express-as> styles, so emotion = per-category rate/pitch/volume + punctuation,
then ffmpeg: trim, EQ (White brighter / Black darker), compression, light drive for taunts, small room reverb,
loudness to -16 LUFS, -1.5 dBTP limiter. Output: public/sounds/vo/<key>.ogg + .m4a and lines.json (length + mouth envelope).
Usage: python3 tools/make_vo.py   (needs: pip install edge-tts numpy; ffmpeg)"""
import asyncio, json, os, re, subprocess, sys, tempfile
import numpy as np, edge_tts
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'sounds', 'vo')
VOICE = {0: 'en-US-AndrewNeural', 1: 'en-GB-RyanNeural'}
PITCH_OFF = {0: 0, 1: -4}
STYLE = {   # rate %, pitch Hz, volume %, drive
    'arrogant': (-5, -3, 15, True), 'taunt': (4, 2, 20, True), 'desperate': (12, 10, 10, False),
    'hype': (8, 5, 20, False), 'shock': (0, 14, 20, True)}
CAT = {'gloat': 'arrogant', 'brag': 'arrogant', 'win': 'arrogant', 'roastA': 'taunt', 'taunt': 'taunt', 'parry': 'taunt', 'block': 'taunt',
       'combo': 'taunt', 'intro': 'taunt', 'giftS': 'taunt', 'giftM': 'taunt', 'giftB': 'taunt', 'giftAny': 'taunt',
       'beg': 'desperate', 'low': 'desperate', 'greply': 'desperate', 'shock': 'shock'}
FIX = [(r'\bez!', 'Easy!'), (r'\bgg!', 'Good game!'), (r'\bhaha!', 'Ha ha!'), (r'^ha!', 'Hah!'), (r' = ', ", that's "),
       (r' > ', ' are better than '), (r'\bhp\b', 'HP'), (r'\bi\b', 'I'), (r"\bi'm\b", "I'm"), (r'\bwhite\b', 'White'), (r'\bblack\b', 'Black')]
def slug(t): return re.sub(r'^_+|_+$', '', re.sub(r'[^a-z0-9]+', '_', t.lower()))[:48]
def speech(t):
    x = t.lower()
    for a, b in FIX: x = re.sub(a, b, x)
    x = re.sub(r'(^|[.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), x)
    return x
def chain(team, drive):
    tone = ('highpass=f=85,equalizer=f=220:t=q:w=1:g=1.5,equalizer=f=3200:t=q:w=1.2:g=3,highshelf=f=8000:g=2' if team == 0 else
            'highpass=f=70,lowshelf=f=140:g=3.5,equalizer=f=1200:t=q:w=1:g=1.5,equalizer=f=2600:t=q:w=1:g=-1.5,highshelf=f=7000:g=-2.5')
    comp = 'acompressor=threshold=-20dB:ratio=%s:attack=5:release=80:makeup=2' % ('4' if team else '3.5')
    drv = ',volume=1.8,asoftclip=type=tanh,volume=0.6' if drive else ''
    room = 'aecho=0.85:0.6:23|37:0.16|0.09' if team == 0 else 'aecho=0.85:0.65:31|53|79:0.18|0.11|0.06'
    trim = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse'
    return f'{trim},{tone},{comp}{drv},apad=pad_dur=0.12,{room}'
def ff(*a): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *a], check=True)
def lufs(f, loop=0):   # very short clips (<0.4 s) are measured looped, integrated loudness needs >400 ms
    e = subprocess.run(['ffmpeg', '-nostats', *(['-stream_loop', str(loop)] if loop else []), '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    i = re.findall(r'I:\s+(-?[\d.]+) LUFS', e); p = re.findall(r'Peak:\s+(-?[\d.inf]+) dBFS', e)
    return float(i[-1]) if i else None, float(p[-1]) if p and p[-1] not in ('-inf', 'inf') else None
async def tts(text, voice, rate, pitch, vol, path):
    for k in range(5):
        try:
            await edge_tts.Communicate(text, voice, rate=f'{rate:+d}%', pitch=f'{pitch:+d}Hz', volume=f'{vol:+d}%').save(path)
            if os.path.getsize(path) > 1000: return
        except Exception as e: err = e
        await asyncio.sleep(1 + k)
    raise RuntimeError(f'tts failed: {text}')
async def main():
    cat = json.load(open(os.path.join(ROOT, 'tools', 'vo_catalog.json')))
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    jobs = {}
    for c in cat:
        k = 'vo_' + ('b' if c['team'] else 'w') + '_' + slug(c['text'])
        if k not in jobs: jobs[k] = c
    tmp = tempfile.mkdtemp(); sem = asyncio.Semaphore(8); man = {}
    async def one(k, c):
        st = STYLE[CAT.get(c['cat'], 'hype')]; t = c['team']
        async with sem: await tts(speech(c['text']), VOICE[t], st[0], st[1] + PITCH_OFF[t], st[2], f'{tmp}/{k}.mp3')
        ff('-i', f'{tmp}/{k}.mp3', '-af', chain(t, st[3]), '-ar', '44100', '-ac', '1', f'{tmp}/{k}_a.wav')
        I, _ = lufs(f'{tmp}/{k}_a.wav')
        if I is None or I < -60: I, _ = lufs(f'{tmp}/{k}_a.wav', 3)
        g = -16 - (I if I is not None else -16)
        ff('-i', f'{tmp}/{k}_a.wav', '-af', f'volume={g:.2f}dB,alimiter=limit=0.8:attack=2:release=40:level=false', f'{tmp}/{k}.wav')
        ff('-i', f'{tmp}/{k}.wav', '-c:a', 'libvorbis', '-q:a', '5', f'{OUT}/{k}.ogg')
        ff('-i', f'{tmp}/{k}.wav', '-c:a', 'aac', '-b:a', '112k', '-movflags', '+faststart', f'{OUT}/{k}.m4a')
        raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', f'{tmp}/{k}.wav', '-f', 's16le', '-'], capture_output=True).stdout
        x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768; n = 44100 // 30
        rms = np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) for i in range(0, len(x), n)]) + 1e-9
        db = 20 * np.log10(rms / rms.max()); env = ''.join(str(int(round(v))) for v in np.clip((db + 30) / 30 * 9, 0, 9))
        I2, P2 = lufs(f'{tmp}/{k}.wav')
        if I2 is None or I2 < -60: I2 = lufs(f'{tmp}/{k}.wav', 3)[0]
        man[k] = {'d': round(len(x) / 44100, 3), 'e': env, 't': c['text'], 'lufs': I2, 'peak': P2}
    await asyncio.gather(*(one(k, c) for k, c in jobs.items()))
    meta = {'engine': 'edge-tts (Microsoft Edge neural TTS)', 'voices': {'white': VOICE[0], 'black': VOICE[1]}, 'clips': {}}
    for k in sorted(man): meta['clips'][k] = {'d': man[k]['d'], 'e': man[k]['e']}
    json.dump(meta, open(f'{OUT}/lines.json', 'w'), separators=(',', ':'))
    L = [m['lufs'] for m in man.values() if m['lufs'] is not None]; P = [m['peak'] for m in man.values() if m['peak'] is not None]
    print(f'{len(man)} clips  LUFS min {min(L):.1f} max {max(L):.1f} mean {np.mean(L):.1f}  peak max {max(P):.1f} dBFS  total {sum(m["d"] for m in man.values()):.0f}s')
    json.dump(man, open('/tmp/vo_report.json', 'w'), indent=0)
asyncio.run(main())
