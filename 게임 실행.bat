@echo off
rem cmd 기본 코드페이지에서 한글이 깨지므로 이 파일은 ASCII만 쓴다.
rem 상태 표시는 브라우저 DEV 패널에서 한글로 보인다.
chcp 65001 >nul
cd /d "%~dp0"
title LIFE GAME - dev server

echo.
echo   LIFE GAME - dev server
echo   ----------------------
echo.

if not exist node_modules (
  echo   Installing dependencies... first run only.
  call npm install
  echo.
)

echo   Starting server. Browser opens in a moment.
echo   Close this window or press Ctrl+C to stop.
echo.

start "" cmd /c "timeout /t 3 >nul & start http://localhost:5173"
call npm start

echo.
echo   Server stopped.
pause
