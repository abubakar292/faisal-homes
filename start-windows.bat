@echo off
title FAISAL HOMES - Server (keep this window open while using the software)
cd /d "%~dp0"
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://localhost:4000/api/health' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if %errorlevel%==0 (
  echo FAISAL HOMES is already running. Opening it in your browser...
  start "" http://localhost:4000
  timeout /t 3 >nul
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please run INSTALL-FAISAL-HOMES.bat first.
  pause
  exit /b 1
)
echo Starting FAISAL HOMES...
echo Keep this window open while you use the software. Close it to stop FAISAL HOMES.
echo.
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -Uri 'http://localhost:4000/api/health' -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process 'http://localhost:4000'; break } catch { Start-Sleep -Seconds 1 } }"
node server\src\index.js
echo.
echo FAISAL HOMES has stopped. Press any key to close this window.
pause >nul
