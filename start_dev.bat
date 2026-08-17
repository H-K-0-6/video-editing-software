@echo off
title Auto Video Generator Launcher
echo ===================================================
echo   Auto Video Generator - Starting...
echo ===================================================
echo.

:: Check yt-dlp is bundled
if not exist "%~dp0server\bin\yt-dlp.exe" (
    echo ERROR: server\bin\yt-dlp.exe is missing!
    echo Please re-run the setup or contact support.
    pause
    exit /b 1
) else (
    echo [OK] yt-dlp found in server\bin\
)

:: Check node is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%V in ('node --version') do echo [OK] Node.js %%V found
)

:: Install server deps if needed
if not exist "%~dp0server\node_modules\express" (
    echo [1/3] Installing server dependencies...
    cd /d "%~dp0server"
    call npm install
    cd /d "%~dp0"
) else (
    echo [1/3] Server dependencies already installed.
)

echo.
echo [2/3] Starting Backend Server on http://localhost:3001...
start "Auto Video Backend" cmd /k "cd /d "%~dp0server" && node server.js"

echo [3/3] Starting Frontend Client on http://localhost:5173...
start "Auto Video Frontend" cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo ===================================================
echo Both services launched!
echo Open http://localhost:5173 in your browser.
echo.
echo TIP: For YouTube audio, make sure you are logged
echo      into YouTube in Google Chrome.
echo ===================================================
timeout /t 5 >nul
