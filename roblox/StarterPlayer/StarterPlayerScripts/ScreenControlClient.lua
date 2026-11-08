-- ScreenControlClient (LocalScript) -> place in StarterPlayer > StarterPlayerScripts
-- Renders the effects sent by ScreenControlServer. Visuals only; gameplay lock is server-side.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local player = Players.LocalPlayer
local remote = ReplicatedStorage:WaitForChild("ScreenControlRemote")

local gui = Instance.new("ScreenGui")
gui.Name = "ScreenControlGui"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.DisplayOrder = 1000
gui.Parent = player:WaitForChild("PlayerGui")

local function makeFullFrame(name, color, transparency)
	local frame = Instance.new("Frame")
	frame.Name = name
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = color
	frame.BackgroundTransparency = transparency
	frame.BorderSizePixel = 0
	frame.Parent = gui
	return frame
end

local flashFrame = makeFullFrame("Flash", Color3.new(1, 1, 1), 1)
local fadeFrame = makeFullFrame("Fade", Color3.new(0, 0, 0), 1)
local dimFrame = makeFullFrame("Dim", Color3.new(0, 0, 0), 1)

local banner = Instance.new("TextLabel")
banner.Name = "Banner"
banner.AnchorPoint = Vector2.new(0.5, 0)
banner.Position = UDim2.fromScale(0.5, 0.08)
banner.Size = UDim2.new(0.8, 0, 0, 60)
banner.BackgroundTransparency = 1
banner.Font = Enum.Font.GothamBold
banner.TextScaled = true
banner.TextColor3 = Color3.new(1, 1, 1)
banner.TextTransparency = 1
banner.TextStrokeTransparency = 1
banner.Text = ""
banner.Parent = gui

local bannerSize = Instance.new("UITextSizeConstraint")
bannerSize.MaxTextSize = 48
bannerSize.Parent = banner

-- One active tween per object so new effects replace old ones cleanly.
local activeTweens = {}

local function tweenTo(object, seconds, props)
	local old = activeTweens[object]
	if old then
		old:Cancel()
	end
	local tween = TweenService:Create(object, TweenInfo.new(seconds, Enum.EasingStyle.Quad), props)
	activeTweens[object] = tween
	tween:Play()
	return tween
end

local bannerToken = 0
local function showMessage(text, duration)
	bannerToken += 1
	local myToken = bannerToken
	banner.Text = text
	tweenTo(banner, 0.25, { TextTransparency = 0, TextStrokeTransparency = 0.3 })

	if duration > 0 then
		task.delay(duration, function()
			if bannerToken == myToken then
				tweenTo(banner, 0.4, { TextTransparency = 1, TextStrokeTransparency = 1 })
			end
		end)
	end
end

local function hideMessage()
	bannerToken += 1
	tweenTo(banner, 0.3, { TextTransparency = 1, TextStrokeTransparency = 1 })
end

local function flash(color, duration)
	flashFrame.BackgroundColor3 = color
	flashFrame.BackgroundTransparency = 0
	tweenTo(flashFrame, math.max(duration, 0.1), { BackgroundTransparency = 1 })
end

local function fade(duration)
	tweenTo(fadeFrame, math.max(duration, 0.05), { BackgroundTransparency = 0 })
end

local function unfade()
	tweenTo(fadeFrame, 0.5, { BackgroundTransparency = 1 })
end

local function setDim(on)
	tweenTo(dimFrame, 0.3, { BackgroundTransparency = on and 0.5 or 1 })
end

-- Camera shake: offsets the camera after the default camera update each frame.
local shakeUntil = 0
local shakeIntensity = 0
local SHAKE_FADE_OUT = 0.3

RunService:BindToRenderStep("ScreenControlShake", Enum.RenderPriority.Camera.Value + 1, function()
	local now = os.clock()
	if now >= shakeUntil then
		return
	end
	local camera = workspace.CurrentCamera
	if not camera then
		return
	end

	local remaining = shakeUntil - now
	local amp = shakeIntensity * math.min(1, remaining / SHAKE_FADE_OUT)
	local px = (math.random() * 2 - 1) * amp * 0.4
	local py = (math.random() * 2 - 1) * amp * 0.4
	local rz = (math.random() * 2 - 1) * amp * 0.03
	camera.CFrame *= CFrame.new(px, py, 0) * CFrame.Angles(0, 0, rz)
end)

local function shake(intensity, duration)
	shakeIntensity = intensity
	shakeUntil = os.clock() + duration
end

local function clearAll()
	shakeUntil = 0
	hideMessage()
	unfade()
	tweenTo(flashFrame, 0.1, { BackgroundTransparency = 1 })
	setDim(false)
end

remote.OnClientEvent:Connect(function(effect, data)
	data = data or {}
	local duration = data.Duration or 2

	if effect == "Message" then
		showMessage(data.Text or "", duration)
	elseif effect == "Flash" then
		flash(data.Color or Color3.new(1, 1, 1), duration)
	elseif effect == "Fade" then
		fade(duration)
	elseif effect == "Shake" then
		shake(data.Intensity or 0.5, duration)
	elseif effect == "Freeze" then
		setDim(true)
	elseif effect == "Unfreeze" then
		setDim(false)
	elseif effect == "Clear" then
		clearAll()
	end
end)
