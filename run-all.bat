@echo off
echo Starting PakkaDeal Platform...
start "PakkaDeal Backend (:8000)" cmd /k "cd backend && npm run dev"
start "PakkaDeal Frontend (:3000)" cmd /k "cd frontend && npm run dev"
echo Both servers are launching in separate windows!
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3000
pause
