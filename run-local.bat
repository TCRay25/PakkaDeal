@echo off
echo ==============================================
echo        Starting PakkaDeal Local Dev
echo ==============================================
echo.
echo [1/2] Launching Backend on http://localhost:8000 ...
start "PakkaDeal Backend (:8000)" cmd /k "cd /d %~dp0backend && npm run dev"

echo [2/2] Launching Frontend on http://localhost:3000 ...
start "PakkaDeal Frontend (:3000)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers are running!
echo - Web App: http://localhost:3000
echo - API:     http://localhost:8000
echo ==============================================
