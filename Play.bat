@echo off
rem Starts the Ridgeline MX server (accounts + multiplayer) and opens the game.
rem Friends on the same Wi-Fi can join using the address printed below.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org & pause & exit /b)
start "" http://localhost:5323
node server/server.js
pause
