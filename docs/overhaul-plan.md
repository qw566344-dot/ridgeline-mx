# Ridgeline MX - planned overhaul (waiting on vehicle models)

Status (2026-10-27): NOT STARTED. The overhaul begins only after the owner finishes the
4 vehicle models below and says to go ahead.

## Vehicle roster (racing only, 4 vehicles)
1. **Factory 450 MX** - 450cc motocross bike. Slim/tall, long flat seat, high front fender, bright plastics,
   white number plates, silver aluminium frame, short muffler on the right, gold forks, aluminium swingarm,
   21" front / 19" rear knobbies, tapered bars with hand guards.
2. **Pro 450R Race Quad** - low, wide sport quad. Angular plastics, nose number plate, short seat, black
   frame, nerf bars, front grab bar, skid plate, long front A-arms with coloured shocks, rear swingarm with
   solid axle, fatter rear tyres, exhaust on the right.
3. **Viper RS Turbo** - 2-seat turbo race UTV. Low, wide, wedge nose, black tube roll cage with short roof,
   bucket seats with harnesses, half doors, LED roof bar, long-travel A-arms/trailing arms with big shocks,
   beadlock rims with desert tyres, rear-mounted turbo engine.
4. **Desert Race Buggy** - open-wheel desert race car. Long/low, single centre seat, exposed tube chassis in
   team colours, long-travel suspension, rear wing or whip flag, spare tyre behind the driver, light bar.

Separate parts in every model: each wheel, handlebars / steering wheel, moving suspension parts
(bike: lower forks + swingarm; others: A-arms + shocks). No rider/driver in the model.
New physics type needed for the UTV and buggy (car with a seated driver); bike and quad types exist.

## The owner's overhaul request (verbatim)

1. Driving Physics - completely improve physics for all vehicles: acceleration, braking, steering, traction,
   suspension, weight, momentum; smooth/responsive; bumps, corners, jumps, rough terrain; each vehicle handles
   differently by size/weight/design; fix unwanted bouncing, spinning, sliding, unstable landings.
2. More and Better Maps - multiple new high-quality maps; improve existing layouts; fix bumps/jumps that don't
   line up; every jump aligned takeoff/landing; natural flow, approach angles, realistic distances, spacing;
   more MX tracks (berms, rollers, rhythm, doubles, triples, tables, big jumps); freestyle areas, practice
   maps, difficulty levels; work with all vehicle types; better terrain/scenery/visuals.
3. Better 3D Models - better vehicle models and assets; consistent stylized-realistic style; tyres,
   suspension, frames, bodywork, materials; good proportions; optimized for multiplayer.
4. Rocket League-Style Lobby - 3D lobby showing everyone's selected vehicles; smooth camera; party
   management, names, online status, ready-up; pick maps and modes; smooth lobby-to-game transition.
5. Better Air Control and Tricks - pitch/roll/yaw/rotation; whips, scrubs, backflips, front flips, spins;
   natural whips that return; correct rotation before landing; trick scoring and combos; easy to learn,
   deep to master.
6. Vehicle Selection and Shop - fully redesign both with clearly different layouts/purposes: selection =
   view/compare/preview/choose; shop = buy/unlock vehicles, skins, upgrades, customization; 3D previews,
   categories, item cards, prices, unlock info; easy to expand.
7. Improved UI - clean, modern, professional; menus, buttons, HUD, fonts, spacing, icons, animations,
   transitions; consistent everywhere; readable HUD; all screen sizes.
8. Friends and Party System - search/add/accept/remove friends; status (online, in lobby, playing);
   invite to parties; party/invite codes; leaving, disconnecting, inviting players already in a match.
9. Better Ping and Regional Servers - stability and latency; real regional servers/matchmaking (NA, EU,
   others where practical) on the actual hosting; ping display; less lag/desync/rubber-banding; consistent
   collisions between players; graceful disconnects/reconnects/server failures.
10. Better Animations and Presentation - suspension, wheels, steering, body movement, weight transfer;
    airborne/whips/tricks/crashes/landings; camera follow and transitions; subtle camera effects; dust,
    dirt and tyre effects.
11. Fix Barrier Collisions and Recovery - no trampoline bounce off barriers: lose momentum, collide
    naturally or crash; no clipping or getting stuck; recovery when going over a barrier or out of bounds,
    to a safe spot facing the right way, never inside obstacles or other players; manual recovery;
    consistent on all maps and vehicles.
12. Bug Fixes and Stability - inspect everything; fix physics, collision, UI, multiplayer bugs; no
    duplicate systems, conflicting controls, leaks, needless background work; every menu/button/setting
    works; test for regressions; handle errors gracefully.
13. Performance - smooth in a browser with many players, detailed vehicles, particles, bigger maps;
    optimize rendering, lighting, shadows, physics, collisions, network; LOD and efficient loading; good on
    average gaming PCs without looking worse.
14. Implementation - work with the existing project; inspect first; keep working features; prioritize
    physics, track design, collisions and multiplayer reliability; no placeholder buttons; test each major
    change; organized, expandable code; explain any extra server infrastructure needed.

## Infrastructure notes for later
- Regional servers: Render can run the same service in several regions (Oregon, Ohio, Virginia, Frankfurt,
  Singapore). Each region is another web service (free tier limits apply); the client would ping each and
  pick the lowest. Accounts/friends then need ONE shared database all regions use (a Render Postgres or
  similar), because today accounts live in a file on a single server and are wiped when it restarts.
- Friends system needs the same persistent shared database.
