=====================================================
   STICK WAR LIVE  -  stick man battle for TikTok LIVE
=====================================================

1 ON 1 KUNG FU DUEL:  WHITE hero  vs  BLACK hero.
Viewers comment 1 (WHITE) or 2 (BLACK) to become a FAN of one hero.
Fans send likes and gifts to HEAL their hero and give power-ups
(katana, kung fu, guns, airstrikes, giant mode).
A ROUND is one long fight of about 3 minutes (longer when fans keep
healing). After 170 seconds comes SUDDEN DEATH, so every round ends.

LINK MODE (new): put your TikTok name in the game link, for example
   http://localhost:3000/?user=YOURNAME&clean=1
 The game then connects to that TikTok LIVE by itself (it keeps trying
 every 20-30 seconds until you are LIVE). Without ?user= it uses
 config.json, and without a name at all it runs in TEST MODE.
 clean=1 hides the test buttons and the small status text.

PLAY ON IPHONE (Safari) - v10:
 1. Open the game link in SAFARI (not Chrome, not the TikTok/Instagram
    in-app browser). The first open can take about 1 minute while the
    free server wakes up - just wait.
 2. Tap  TAP TO START  (turns the sound on). Flip the silent switch on
    the side of the iPhone OFF and turn the volume up.
 3. Full screen on iPhone = Home Screen app:
    tap the Share button (square with an arrow pointing up, bottom bar)
    -> scroll down -> "Add to Home Screen" -> Add.
    On newer iOS it can be hidden: Share -> "More" / "..." / "View More"
    -> "Add to Home Screen". (It only exists in Safari.)
    Then open Stick War from the new icon - no address bar, full screen.
 4. TikTok: screen share with audio, do not switch apps while live.
 Comment white or 1 = WHITE team, black or 2 = BLACK team.
 If something breaks, a tiny red line at the bottom shows the reason.

v11 - NAME IS REMEMBERED:
 - the game REMEMBERS your TikTok name. Open your link once with
   ?user=NAME&clean=1 and after that the bare link or the Home Screen icon
   uses the same name. Short link: /u/NAME (same as ?user=NAME&clean=1).
   To forget the name open  /?user=reset . On a phone with no name saved,
   the start screen asks "Your TikTok name".
 - Phones never show the test buttons box. To test on a phone (only
   without clean), tap with 3 fingers or hold the top-left corner 1 s.

PLAY FROM YOUR PHONE (TikTok "Mobile Gaming" screen share) - v9:
 1. Open your game link in Chrome on the phone, for example
      https://stickfight-game-hpug.onrender.com/?user=YOURNAME&clean=1
    (the free server sleeps - the first open can take about 1 minute)
 2. Tap the big  TAP TO START  screen. This turns the SOUND on and
    makes the game FULL SCREEN (no link bar, no bottom bar).
    If the bars come back, tap the game once ("Tap for full screen").
 3. Best way: Chrome menu (3 dots) -> "Add to Home screen" -> Install.
    Open the game from the new Stick War icon - it always opens full
    screen and already knows your TikTok name.
 4. Turn the phone's MEDIA volume up. When TikTok asks, allow it to
    record the screen WITH audio.
 5. Do not switch to other apps while live - the browser pauses the
    game in the background.
 The game now draws at the phone's full sharpness and fills the whole
 screen, so it looks much clearer for viewers.

VERSION 8 - "SUNSET DESERT" (new look, same game):
 - Fighters are now WHITE (left, soft white glow) vs BLACK (right,
   red glow), with thick round limbs and small angry eyes.
 - New background: purple-to-orange sunset sky, drifting dark clouds,
   low sun, orange dunes, shrubs and rocks, long soft shadows.
 - Comment 1 or white = WHITE team. Comment 2 or black = BLACK team.
   (Old word "red" still works for the WHITE team.)

VERSION 6 - "CLEAN FIGHT" (desert look of demo4 + real fight-animation rules):
 - WHITE always stands on the LEFT, BLACK on the RIGHT (like a real fight
   film). If they swap sides, one jumps back over to his own side.
 - ONE ACTION AT A TIME: attack -> hit or block -> reaction -> short
   breath. No more both fighters hitting at once.
 - Every hit FREEZES for a split second (hit-stop) so you can SEE it:
   block 3 frames, light hit 4, medium 5, heavy 6.
 - Cleaner screen: smaller flashes, less dust, only one motion trail,
   smaller explosions.
 - Steady camera: medium shot while they fight, close-ups only on
   special moments, no tilted angles, shake only on heavy hits.
 - Signature moves do not repeat back to back.
 - Gift heals grow with hero HP (healScale "auto").
 - Louder, cleaner sound (about -16 LUFS, TikTok level).
 - Hits react by place: head snaps back, body folds, legs buckle.

The fight looks like an anime / action movie:
 - real moves: jab, cross, hook, uppercut, elbow, knee, palm strike,
   front kick, roundhouse, spinning back kick, sweep, flying knee,
   jump spinning kick, air combos
 - defence: block (clang + sparks), parry, slip, backflip, then COUNTER
 - big moments: blade lock, aerial fight, slide under a kick,
   grab + throw, wall bounce, knock down + kip-up, iaido sword dash
 - katana fights with blade clashes, gun-fu with rolls and reloads
 - CAMERA: medium shot during the exchanges, follows them smoothly,
   small punch-in on big hits, goes wide for airstrikes, slow-motion
   orbit on the K.O. (the team boxes on top and bottom never move)
 - sound for every move: whoosh, clang, ting, hits, kiai shouts
 - DESERT ANIME STYLE: thick solid-colour fighters, brown desert,
   stormy sky, rocky mountains, white hit flashes, dust clouds,
   smear trails, black/white impact frames (no blood - TikTok safe)
 - SIGNATURE MOVES (they happen by themselves during the fight):
   dash-in kick blocked by the forearm, sweep + slam, Wing Chun
   close-up, shockwave kick with slow-motion flight, leg catch + spin
   slam, aura clash (hands locked, dust blown away), Matrix dodge +
   counter, heavy cleaver (BLACK) vs fast katana (WHITE) clash,
   overhead strike that drives the defender into the ground,
   afterimage teleport fight on a dark screen
 - BIG GIFTS = BIG SCENES:
     Galaxy        -> airstrike + glowing aura + SPEED DOME
                      (light streaks inside a dust sphere)
     Lion/Universe -> giant + aura + SILHOUETTE SLASH
                      (red screen, white silhouette dash-through)
     Doughnut etc. -> kung fu power with glowing aura


-----------------------------------------------------
 PART A - START THE GAME (Windows)
-----------------------------------------------------

1. Install Node.js (only once)
   - Go to  https://nodejs.org
   - Click the big green "LTS" button, download, install.
     Just click Next, Next, Next... Finish.

2. Unzip the game
   - Right-click  stickfight-game.zip  ->  "Extract All..."  ->  Extract.
   - Open the new  stickfight  folder.

3. Put your TikTok username
   - Right-click  config.json  ->  Open with  ->  Notepad.
   - Change   your_tiktok_username   to your username (without @).
       Example:   "tiktokUsername": "silvergirlanime",
   - Keep the " " quote marks!  Save (Ctrl + S) and close Notepad.

4. Double-click  start.bat
   - A black window opens. KEEP IT OPEN while you stream.
   - The first time it downloads some parts (about 1 minute).
   - The game opens by itself in a tall window.
     (If not, open Chrome or Edge and go to:  http://localhost:3000 )

5. Test it
   - The blue box on the right has TEST buttons (fake viewers and gifts).
     Click "+ White fan (1)" and "+ Black fan (2)", then click some gifts.
   - Press the  H  key to hide/show that box. HIDE IT before you go live.
   - Sound: if you hear nothing, click once on the game window.


-----------------------------------------------------
 PART B - PUT THE GAME ON YOUR TIKTOK LIVE
-----------------------------------------------------

6. Open TikTok LIVE Studio on your PC.

7. Click  "Add source"  ->  "Window capture".
   - In the list, pick the game window ("STICK WAR LIVE", msedge.exe or chrome.exe).
   - Turn OFF "Capture cursor".  Click Add.
   - Drag the corners so the game fills the whole tall screen.
   - Do NOT minimize the game window (it can sit behind other windows).

   Other way (if Window capture shows black):
   "Add source" -> "Link" -> paste   http://localhost:3000/?clean=1
   Width 1080, Height 1920.

8. Sound (optional): in LIVE Studio open "Audio mixer" and add your
   desktop / browser audio.

9. Go LIVE. In the black window you will see:
     *** CONNECTED to @yourname LIVE ***
   Now the comments, likes and gifts control the game.
   (If you start the game before going live, it waits and connects by itself.)


-----------------------------------------------------
 WHAT VIEWERS DO
-----------------------------------------------------

 Comment  1  or  white   ->  you are a fan of the WHITE hero
 Comment  2  or  black   ->  you are a fan of the BLACK hero
 (You can change team any time by commenting another number.)

 WHAT FANS SEND               WHAT YOUR HERO GETS
 (hero has 450 HP - the game also shows this list on screen)
 10 likes                     +2 HP
 Follow / Share               +11 HP
 Rose (and TikTok, GG...)     +8 HP
 Finger Heart                 +15 HP + SWORD
 Rosa / Perfume / Doughnut    +20 HP + KUNG FU MASTER
 Hand Hearts / Confetti       +40 HP + PISTOL
 Corgi / Money Gun            +60 HP + RIFLE
 Galaxy                       +100 HP + AIRSTRIKE (plane bombs the other hero)
 Lion / Universe              +150 HP + GIANT MODE + AIRSTRIKE
 Any other gift               by its coin price (see gifts.json)

 - Every heal shows on screen:  +8 HP @name
 - Too much HP becomes a blue SHIELD (up to 150%).
 - A gift without a comment first -> goes to the weakest hero.
 - A round lasts about 3 minutes. After 170 seconds: SUDDEN DEATH
   (no more heals, double damage). K.O. wins the round, then a new round
   starts by itself. Wins are counted in the team boxes.
 - Each team box shows: hero HP, shield, number of fans, top 3 fans, wins.


-----------------------------------------------------
 CHANGE SETTINGS (optional)
-----------------------------------------------------

 config.json  ->  tiktokUsername
                  roundSeconds (170 = time before sudden death)
                  heroHp       (450 = hero health; more = longer rounds)
                  healScale    ("auto" = gift heals grow with heroHp,
                                or a number like 2)
                  suddenDeathDamage (2 = double damage in sudden death)
                  damage       (1 = normal, 0.5 = slower fights, 2 = faster)
                  fighterSize  (0.66 = normal, smaller number = smaller)
                  title        (text on top)
                  volume       (0.8 = normal, 0.5 = quieter, 1 = louder)
                  slowMotion   (true / false)
 gifts.json   ->  "likes": every 10 likes = heal 2
                  "follow" / "share": heal 5
                  "maxShieldPercent": 150
                  "gifts": heal and power for each gift
                  Powers: sword, super (kung fu), pistol, rifle,
                          airstrike, giant, ultimate
 After editing: close the black window and double-click start.bat again.
 (Use Notepad. Keep all the " " and , marks.)

 TEST BUTTON KEYS:  1 = new White fan, 2 = new Black fan,  Q W E R T Y U = fake gifts,
                    L = 10 likes, F = follow, S = share, A = auto demo,
                    N = new round, M = sound on/off, H = hide test box


-----------------------------------------------------
 IMPORTANT TO KNOW
-----------------------------------------------------

 - Your TikTok account must have LIVE access to go live from LIVE Studio
   (usually 18+ years old and around 1,000+ followers; TikTok decides).
 - The game reads your LIVE with "tiktok-live-connector". It is FREE and
   needs no password, but it is NOT made by TikTok (unofficial). If TikTok
   changes something, it can stop working for a while. Then update it:
   open the folder, click the address bar, type  cmd  and press Enter, then type
       npm install tiktok-live-connector@latest
 - Never type your TikTok password anywhere for this game. It only needs
   your username.
 - The game is TikTok-safe: no blood, only flashes and sparks.
 - "Port 3000 is busy" = the game is already open in another black window.

 Problems?
   * Black window closes at once  -> install Node.js (step 1).
   * "not LIVE yet"               -> normal before you go live. It retries.
   * Gifts do nothing             -> look at the black window: it prints
                                     every gift. If nothing shows, restart
                                     start.bat after you are already live.

SOUNDS & REACTIONS (v7)
- Real fight sounds (punches, kicks, blocks, swords, guns, footsteps, grunts, crowd, desert wind)
  are in public/sounds (all CC0 / free for commercial use - see public/sounds/LICENSES.txt).
- To swap a sound, replace a file in public/sounds with another .ogg of the same name.
- Fighters now shout taunts and reactions with big emojis (COME ON!, ARGH!, TOO SLOW!, HA!,
  THANKS @name! when a gift powers them up, a skull on the K.O., a crown for the winner).
