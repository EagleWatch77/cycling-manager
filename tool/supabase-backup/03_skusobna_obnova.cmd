@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp003_skusobna_obnova.ps1" %*
echo.
pause
