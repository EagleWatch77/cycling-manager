@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp000_over_nastroje.ps1" %*
echo.
pause
