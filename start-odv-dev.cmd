@echo off
rem ============================================================
rem  odv �?" dev launcher (two console windows)
rem  API  server :8040   |   Vite client :8050 (proxies /api -> :8040)
rem  Then opens the client in your default browser.
rem  NOTE: port 5173 is RESERVED for another app — never use it here.
rem
rem  Reliable approach: the cmd `start` builtin spawns each server in its
rem  own console window (Windows Terminal's `wt ... cmd /k` CLI fails here
rem  with 0x80070002).
rem ============================================================
setlocal
set "ROOT=%~dp0"

echo Starting odv:
echo   API    http://localhost:8040
echo   Client http://localhost:8050
echo.

start "odv API :8040" cmd /k "cd /d %ROOT%server && set PORT=8040 && npm start"
start "odv Client :8050" cmd /k "cd /d %ROOT%client && npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:8050"
endlocal
