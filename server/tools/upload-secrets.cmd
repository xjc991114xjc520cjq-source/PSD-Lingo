@echo off
if "%~1"=="" (
  echo Usage: upload-secrets.cmd PRIVATE_DIRECTORY
  exit /b 1
)
cd /d "%~dp0.."
call npx wrangler secret put LEASE_PRIVATE_KEY < "%~1\lease-private.pem"
if errorlevel 1 exit /b 1
call npx wrangler secret put LEASE_PUBLIC_KEY < "%~1\lease-public.pem"
if errorlevel 1 exit /b 1
call npx wrangler secret put ADMIN_PASSWORD_HASH < "%~1\admin-password-hash.json"
if errorlevel 1 exit /b 1
call npx wrangler secret put ADMIN_TOKEN_SECRET < "%~1\admin-token-secret.txt"
if errorlevel 1 exit /b 1
call npx wrangler secret put BOOTSTRAP_SECRET < "%~1\bootstrap-secret.txt"
