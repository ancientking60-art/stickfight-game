=====================================================
  STICK FIGHT  -  free-for-all for TikTok LIVE
=====================================================

Anyone in the live can drop their own stickman into the pit.
They fight on their own. Last one standing wins, then a new
round starts with everyone who has joined.

HOW VIEWERS JOIN
  LIKE     joins once, at 50 HP. More likes do not make a copy.
  FOLLOW   joins at 100 HP. If they are already in, HP is raised
           up to 100 (a bigger gift total is not cut down).
  GIFT     makes that fighter stronger. The reward is double the
           gift's coin value: a 1-coin Rose gives +2, a 100-coin
           gift gives +200. That number is added as HP, and it
           also makes their hits harder (200 extra HP = 2x damage).
           If the gifter is not in the pit yet, they drop in too
           (they still get the 50 HP join, then the gift on top).

The same people come back every round, keeping the HP and power
they earned from follows and gifts.

HOW MANY CAN FIGHT AT ONCE
  14. That is the hard cap (config.json game.maxFighters, from 8 to 30).
  Past 14, the extra people wait. The screen shows "waiting: N".
  When someone is knocked out, the next waiter drops in. Each new
  round also rotates who starts, so the same 14 are not always first.
  14 is the phone limit: more than that and the names pile up, the
  stickmen shrink, and the glow on every fighter gets heavy.

PROFILE PICTURES
  Each fighter's head is that viewer's TikTok photo, in a circle.
  If there is no photo, or it fails to load, the plain stickman
  face is used instead. Test mode draws a coloured placeholder
  with their initials so you can see it without going live.

ON SCREEN
  A small legend stays at the top:
    LIKE = JOIN 50 HP  ·  FOLLOW = 100 HP  ·  GIFT = 2× POWER
  Trash-talk lines show in a big bubble: before the fight, during
  the fight, after a win, plus chat call-outs and lines on big hits.
  Names and HP sit over each fighter. The layout is vertical, for
  a phone / TikTok LIVE capture.

RUN IT
  npm install
  node server.js
  Open http://localhost:3000

  No TikTok name  ->  TEST MODE. Press H to hide or show the test
  box. Keys: L new like, K same person likes again, F new follow,
  G follow that person, Q rose (1→2), R 100 coins (→200), A auto
  demo, N new round, M sound.

  Your live:  http://localhost:3000/?user=YOUR_TIKTOK_NAME&clean=1
  Short link: /u/YOUR_TIKTOK_NAME
  The page connects to that TikTok LIVE and keeps retrying until
  you are live. A small line at the top stays on screen:
  connecting / connected to @name / the error. clean=1 hides the
  test box only. The name is remembered on that phone;
  /?user=reset forgets it.

  If the line says "TikTok blocked lookup — set SIGN_API_KEY":
  make a free key at https://www.eulerstream.com and add it on
  Render as the environment variable SIGN_API_KEY, then redeploy.
  Do not put the key in config.json.

  Rain and thunder sounds are off. The storm is still drawn.
  Fight sounds and voices stay.

  Trash talk is spoken by the referee as a real audio file. The
  game asks the server (/tts) and plays the mp3. TikTok Live Studio's
  link source (and OBS) plays it by itself — no click. Turn the voice
  off with game.refereeVoice false in config.json. Volume is
  game.refereeVolume (0 to 1). In Live Studio, leave the link source
  unmuted. If the server cannot make the audio, the page tries the
  browser's own speech as a last resort, and the words still show.

  The winner stays in the pit for the next round at their join HP
  (50 for a like, 100 for a follow). The referee calls them the
  champion. Anyone who was knocked out stays out until that person
  likes, follows, or sends a gift again. A like from someone still
  fighting does not make a second stickman.

  Put your username in config.json "tiktokUsername" if you want a
  default. Leave it blank for test mode.

PHONE / TIKTOK
  Open the link, tap TAP TO START (sound + full screen).
  On iPhone use Safari, then Share → Add to Home Screen, and open
  Stick Fight from the new icon.
  Screen-share that screen in TikTok with the volume up.
  Do not switch apps while you are live — the browser pauses.

The server also relays likes, follows, gifts, chat and viewer
count over WebSocket. Deploy is unchanged: `node server.js` on
Render, auto-deploy from main. Do not need to change the start
command.
