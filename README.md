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

**In the game:** Lobby > Create party, then share the 6-letter code (or Friends > Invite). Friends
type the code under Join. The leader picks mode and track (Change), everyone else presses Ready Up,
and the leader presses Start. Party members stand next to you in the 3D lobby.

**Same Wi-Fi:** run Play.bat. The window prints an address like `http://192.168.1.20:5323`.
Friends open that address in their browser and join your party code.

**Anywhere:** the game uses the online server `https://ridgeline-mx.onrender.com` (Render free
tier, built from the GitHub repo). After pushing changes to GitHub, press **Manual Deploy** on Render.

### What the online side needs (and costs)
| Thing | How it works now | To make it better |
|---|---|---|
| Accounts, coins, friends | Stored on the home server (`PUBLIC_SERVER` in `client/js/config.js`) | Free Render servers forget accounts when they restart. Add a Render disk (paid plan, about $7/month plus the disk) and set `DATA_DIR` to it |
| Server regions | One region (North America, Oregon). The game pings every region and uses the closest; a party code is found in any region | Deploy another copy of the repo on Render in Frankfurt or Singapore, add it to `REGIONS` in `client/js/config.js`, rebuild. Free servers share 750 hours a month, so more than one always-on region needs a paid plan |
| Sleeping | Free servers sleep after 15 minutes alone; the first connect takes about 30 s | A paid Render instance (about $7/month) never sleeps |
| Ping | Shown top-right in the menus, top-centre while riding, and per rider in the party list | Closer regions (above) |

### Keeping accounts forever (free)
Free Render servers wipe their disk on every restart, so accounts would disappear. The server
can keep them in a free Upstash Redis database instead (`server/store.js`):
1. Make a free account at upstash.com, create a **Redis** database (any region, free plan).
2. On the database page, under **REST API**, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In Render, open the **ridgeline-mx** service > **Environment** > add both as environment variables, save.
4. Render restarts the server; its log says `Accounts: loaded N from the cloud save`.
Only the main (North America) server needs this - it is the one that keeps accounts.
Test it locally with `node tools/store-test.js`.

## Models
- Dirt bikes: `client/models/kx_dirt_bike.glb`, made from the Tinkercad bike by `tools/bake-kx-bike.py`
  (Blender), which splits it into wheels, fork, swingarm and body.
- Rider helmet: `client/models/rider_helmet.glb`, made by `tools/bake-helmet.py` (logos removed; the
  shell takes each rider's colour).
- Quad, side-by-side and buggy: `pro_450r_quad.glb`, `viper_rs_turbo.glb`, `trophy_buggy.glb`.
- Pivots and seat / grip / peg points for each model are in `MODELS` in `shared/vehicles.js`.

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
