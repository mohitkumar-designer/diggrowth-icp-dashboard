@echo off
echo ===================================================
echo Starting DiGGrowth ICP & Competitor Analysis Dashboard
echo ===================================================
echo.
cd /d "%~dp0"
start "" http://localhost:8088/index.html
python -m http.server 8088
if %errorlevel% neq 0 (
  start "" index.html
)
pause
