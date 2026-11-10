@echo off
cd /d "%~dp0.."
findstr /c:"REPLACE_WITH_YOUR_D1_ID" wrangler.toml >nul
if not errorlevel 1 (
  echo Configure your independently created D1 ID in wrangler.toml first.
  exit /b 1
)
call npx wrangler d1 migrations apply psd-lingo-authorization --remote
if errorlevel 1 exit /b 1
call npx wrangler deploy
