-- ScreenControlServer (ModuleScript) -> place in ServerScriptService, rename to "ScreenControlServer"
-- Server-authoritative: only server code can call Send(), so clients cannot fake effects.
--
-- Usage from any server script:
--   local ScreenControl = require(game.ServerScriptService.ScreenControlServer)
--   ScreenControl.Send(player, "Message", { Text = "Round starts!", Duration = 3 })
--   ScreenControl.Send("All", "Shake", { Intensity = 1, Duration = 0.8 })
--   ScreenControl.Send(player, "Freeze", { Duration = 5 })   -- Duration 0 = until Unfreeze
--   ScreenControl.Send(player, "Fade", { Duration = 1.5 })   -- fade to black
--   ScreenControl.Send(player, "Clear")                      -- remove visual effects

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ScreenControl = {}

local MAX_DURATION = 60
local MAX_TEXT_LENGTH = 200
local VALID_EFFECTS = {
	Message = true,
	Flash = true,
	Fade = true,
	Shake = true,
	Freeze = true,
	Unfreeze = true,
	Clear = true,
}

local remote = Instance.new("RemoteEvent")
remote.Name = "ScreenControlRemote"
remote.Parent = ReplicatedStorage

-- [Player] = { walkSpeed, jumpPower, jumpHeight, token }
local frozenState = {}

local function getHumanoid(player)
	local character = player.Character
	return character and character:FindFirstChildOfClass("Humanoid")
end

local function sanitize(effect, opts)
	opts = typeof(opts) == "table" and opts or {}
	local out = {}

	local duration = opts.Duration
	if typeof(duration) ~= "number" or duration ~= duration then
		duration = 2 -- default; also rejects NaN
	end
	out.Duration = math.clamp(duration, 0, MAX_DURATION)

	if effect == "Message" then
		out.Text = typeof(opts.Text) == "string" and string.sub(opts.Text, 1, MAX_TEXT_LENGTH) or ""
	elseif effect == "Flash" then
		out.Color = typeof(opts.Color) == "Color3" and opts.Color or Color3.new(1, 1, 1)
	elseif effect == "Shake" then
		local intensity = typeof(opts.Intensity) == "number" and opts.Intensity or 0.5
		out.Intensity = math.clamp(intensity, 0, 3)
	end

	return out
end

local function setFrozen(player, on, duration)
	local state = frozenState[player]

	if on then
		if not state then
			local humanoid = getHumanoid(player)
			state = {
				walkSpeed = humanoid and humanoid.WalkSpeed or 16,
				jumpPower = humanoid and humanoid.JumpPower or 50,
				jumpHeight = humanoid and humanoid.JumpHeight or 7.2,
				token = 0,
			}
			frozenState[player] = state

			if humanoid then
				humanoid.WalkSpeed = 0
				humanoid.JumpPower = 0
				humanoid.JumpHeight = 0
			end
		end

		-- Token prevents an older timed freeze from unfreezing a newer one.
		state.token += 1
		if duration > 0 then
			local myToken = state.token
			task.delay(duration, function()
				local current = frozenState[player]
				if current and current.token == myToken then
					setFrozen(player, false)
					remote:FireClient(player, "Unfreeze", {})
				end
			end)
		end
	elseif state then
		frozenState[player] = nil
		local humanoid = getHumanoid(player)
		if humanoid then
			humanoid.WalkSpeed = state.walkSpeed
			humanoid.JumpPower = state.jumpPower
			humanoid.JumpHeight = state.jumpHeight
		end
	end
end

local function resolveTargets(targets)
	if targets == "All" then
		return Players:GetPlayers()
	end
	if typeof(targets) == "Instance" and targets:IsA("Player") then
		return { targets }
	end

	local list = {}
	if typeof(targets) == "table" then
		for _, value in targets do
			if typeof(value) == "Instance" and value:IsA("Player") then
				table.insert(list, value)
			end
		end
	end
	return list
end

-- targets: Player | { Player } | "All"
function ScreenControl.Send(targets, effect, opts)
	if not VALID_EFFECTS[effect] then
		warn("[ScreenControl] Unknown effect: " .. tostring(effect))
		return
	end

	local data = sanitize(effect, opts)

	for _, player in resolveTargets(targets) do
		if effect == "Freeze" then
			setFrozen(player, true, data.Duration)
		elseif effect == "Unfreeze" then
			setFrozen(player, false)
		end
		remote:FireClient(player, effect, data)
	end
end

-- Respawning clears freeze state on both server and client.
local function onPlayerAdded(player)
	player.CharacterAdded:Connect(function()
		if frozenState[player] then
			frozenState[player] = nil
			remote:FireClient(player, "Unfreeze", {})
		end
	end)
end

for _, player in Players:GetPlayers() do
	onPlayerAdded(player)
end
Players.PlayerAdded:Connect(onPlayerAdded)

Players.PlayerRemoving:Connect(function(player)
	frozenState[player] = nil
end)

return ScreenControl
