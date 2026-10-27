# Ridgeline MX

Browser motocross: dirt bikes and quads, 4 tracks, AI races, tricks, a shop,
accounts, and online parties with 6-character codes.

## Playing

| How | What you get |
|---|---|
| Double-click **RidgelineMX.html** | Single player. Accounts are saved in this browser. |
| Double-click **Play.bat** | Starts the server and opens the game: online accounts + multiplayer. |

## Controls
W throttle · S brake (hold at a stop to reverse) · A/D steer · Space rear brake (slides) ·
Shift clutch · **Q / E lean back / forward** · R reset · T quick retry · C camera · Esc pause

- **Wheelie:** hold **Q** + throttle to lift the front. Keep holding Q / throttle to hold it up,
  **E** or **Space** to bring it down. Pull it too far and you loop out.
- **Flips:** in the air hold **Q** (backflip) or **E** (front flip). Let go in time to land on two wheels.
- **Whips:** in the air hold **A** or **D** to throw the bike sideways. Let go before you land.
- Tricks, laps, race finishes, records and big air earn **coins** for the Shop.

## Play with friends

**Same Wi-Fi:** run Play.bat. The window prints an address like `http://192.168.1.20:5323`.
Friends open that address in their browser, go to Multiplayer and type your party code.

**Anywhere (different houses, phones on mobile data):** the server has to be on the internet.
Free way, about 10 minutes:
1. Put this folder on GitHub (github.com > New repository > upload the files).
2. Go to render.com, sign up, click **New > Blueprint**, pick the repository. `render.yaml` does the rest.
3. Render gives you an address like `https://ridgeline-mx.onrender.com`. Anyone can open it and play.
4. To make the double-click file use it too: put the address in `client/js/config.js`
   (`PUBLIC_SERVER`) and run `node tools/build-html.js`.
   Or, in the game: Multiplayer > Server > type the address > Use this server.

Free Render servers sleep when nobody plays (first connect takes ~30 s) and forget accounts when
they restart. For accounts that never reset, add a Render disk and set `DATA_DIR` to it.

## Your models
Put `.glb` files in `client/models/` with the names in `shared/vehicles.js`
(`dirtbike_450.glb`, `dirtbike_250.glb`, `atv_450.glb`, `atv_700.glb`). Name the wheel objects
`Wheel_Front` / `Wheel_Rear` (bikes) or `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR` (quads) so
they spin; `Handlebar` turns with the steering. Missing files fall back to the built-in models.

## Changing things (for later)
| To change | Edit |
|---|---|
| Tracks, jumps, new maps | `shared/tracks.js` (then `node tools/check-jumps.js` to test every jump) |
| Bike / quad power, grip, suspension | `shared/vehicles.js` |
| Handling feel | `client/js/sim/bike.js`, `client/js/sim/atv.js` |
| Shop items and coin rewards | `shared/shop.js` |
| Server address for online play | `client/js/config.js` |

After any change: `node tools/build-html.js` to rebuild RidgelineMX.html.

Tests: `node tools/sim-test.js` (physics), `node tools/trick-test.js` (wheelies/flips),
`node tools/check-jumps.js` (every jump on every track).
