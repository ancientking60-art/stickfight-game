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
  The page connects to that TikTok LIVE (it keeps retrying until
  you are live). clean=1 hides the test box. The name is remembered
  on that phone; /?user=reset forgets it.

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
