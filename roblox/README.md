# Control Screen (Roblox)

Server-controlled screen effects for players.

## Setup
1. `roblox/ServerScriptService/ScreenControlServer.lua` → **ServerScriptService**, ModuleScript, name `ScreenControlServer`
2. `roblox/StarterPlayer/StarterPlayerScripts/ScreenControlClient.lua` → **StarterPlayerScripts**, LocalScript, name `ScreenControlClient`

## Usage (server scripts only)
```lua
local ScreenControl = require(game.ServerScriptService.ScreenControlServer)

ScreenControl.Send(player, "Message", { Text = "Round starts!", Duration = 3 })
ScreenControl.Send("All", "Shake", { Intensity = 1, Duration = 0.8 })
ScreenControl.Send(player, "Flash", { Color = Color3.new(1, 0, 0), Duration = 0.5 })
ScreenControl.Send(player, "Fade", { Duration = 1.5 })       -- fade to black, stays until Clear
ScreenControl.Send(player, "Freeze", { Duration = 5 })       -- Duration 0 = until Unfreeze
ScreenControl.Send(player, "Unfreeze")
ScreenControl.Send({ p1, p2 }, "Message", { Text = "Hi" })   -- list of players
ScreenControl.Send(player, "Clear")                         -- removes all visual effects
```

Effects: `Message`, `Flash`, `Fade`, `Shake`, `Freeze`, `Unfreeze`, `Clear`.

## Notes
- Only the server can call `Send`, so players cannot fake effects.
- `Freeze` locks movement on the server (WalkSpeed/JumpPower/JumpHeight), so it can't be bypassed client-side. It resets on respawn.
- Durations are clamped to 0–60s; text is capped at 200 characters.
- To use from a trigger, call `Send` from a `Touched` handler or a Tool/remote you control. Add your own admin check before calling it from player input.
