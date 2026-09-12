@echo off
rem ============================================================
rem  odv launcher — starts the server in its own cmd window
rem  and opens the app in the default browser.
rem ============================================================
cd /d "%~dp0"

rem 1) Start the odv server in a separate console window (DEV_MODE=1 allows dev JWT secret)
start "odv Server" cmd /k "set DEV_MODE=1 && npm --prefix server start"

rem 2) Give the server a moment to boot, then open the default browser
timeout /t 3 /nobreak >nul
start "" "http://localhost:8050"
