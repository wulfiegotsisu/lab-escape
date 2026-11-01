@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
  echo Could not install dependencies. Verify that Python is installed.
  pause
  exit /b 1
)
echo.
echo Opening the game at http://localhost:8000
start "" "http://localhost:8000"
%PY% server.py
pause
