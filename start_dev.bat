@echo off
title Auto Video Generator Launcher
echo ===================================================
echo   Auto Video Generator - Starting...
echo ===================================================
echo.

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
    echo [1/3] Server dependencies ready.
)

:: Install client deps if needed
if not exist "%~dp0client\node_modules\vite" (
    echo [2/3] Installing client dependencies...
    cd /d "%~dp0client"
    call npm install
    cd /d "%~dp0"
) else (
    echo [2/3] Client dependencies ready.
)

echo.
echo [3/3] Starting Backend & Frontend...
start "Auto Video Backend" cmd /k "cd /d "%~dp0server" && node server.js"
start "Auto Video Frontend" cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo ===================================================
echo Services Started!
echo.
echo PC Access:   http://localhost:5173
echo.
echo Phone Access (Same Wi-Fi):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /r /c:"IPv4 Address.*[0-9]"') do (
    echo   -> http:%%a:5173
)
echo.
echo Open that link on your phone's browser (Chrome/Safari)
echo to use the app with your home network!
echo ===================================================
timeout /t 10 >nul
