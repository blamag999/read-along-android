@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:8765
  py -3 -m http.server 8765
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://127.0.0.1:8765
  python -m http.server 8765
  goto :eof
)
echo Python 3 was not found.
echo Install Python from https://www.python.org/downloads/windows/
echo During installation, enable "Add Python to PATH".
pause
