# Ridgeline MX on CrazyGames

The CrazyGames version is a **single-player, offline** build of the same game. It is made from the same code with one flag:

```
node tools/build-html.js --crazy
```

That writes `dist-crazygames/index.html` (one file, about 18 MB, no server needed). To upload it, zip it so that
`index.html` is at the top of the zip:

```
powershell Compress-Archive -Path dist-crazygames\index.html -DestinationPath dist-crazygames\RidgelineMX-crazygames.zip -Force
```

## What is different in that build
- No accounts or login: one local profile ("Rider"), saved in the browser, with **every vehicle unlocked** and 20,000 starting coins.
- No ranked, leaderboards, levels, friends, party / multiplayer, chat, casino, Premium Pass or challenges (hidden; nothing connects to a server).
- Still there: Free Ride, races against AI, Time Trial, Freestyle, the garage (skins, gear, upgrades with coins), the shop and every track.
- **CrazyGames SDK** (`client/js/crazy.js`): starts the SDK, reports loading and gameplay start / stop, shows a **midgame ad** before each new race, and the shop's "Watch an ad: +5,000 coins" button plays a **rewarded ad** (20 a day, 2 minutes apart). Game sound is muted during ads.
- The game follows CrazyGames' own mute button (tick "supports muting audio through SDK" on the form).
- Progress is saved with LocalStorage (choose "Yes, using LocalStorage" on the form).
- The Google Fonts link is removed so the only outside request is CrazyGames' own SDK script. (The page falls back to a system font.)

## Submitting
1. Make a developer account at https://developer.crazygames.com and add a new game.
2. Upload the zip. Choose the Basic launch (a single HTML file is fine; keep the first download under their size limit - this one is about 18 MB).
3. Fill in the page: title, description, how to play (controls: see the Controls screen in the game), tags (racing, motocross, bike, 3D).
4. Upload the cover images they ask for (landscape 16:9, portrait and square). Take screenshots from the game for these.
5. Use their QA preview ("Test" in the developer portal, which adds `?` debug options) to check: the game loads, ads show and the sound mutes, the game does not freeze if an ad fails.
6. Submit for review and wait for their reply. They may ask for changes.

## Things to check before submitting
- Play a few races in the preview on a normal laptop and fix anything that stutters (CrazyGames players are often on weak computers).
- Mobile: the game is built for keyboard. Say so in the description (desktop only) unless you add touch controls.
- Read their current developer terms: revenue share, whether the deal is exclusive, and the rules about content and links.
