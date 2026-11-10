@echo off
cd /d "%~dp0"
if exist "runtime\PSD Lingo.exe" (
  start "" "runtime\PSD Lingo.exe"
  exit /b
)
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" "%~dp0"
  exit /b
)
echo Runtime not found. Please extract the complete portable package first.
pause
