@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp002_over_zalohu.ps1" %*
echo.
pause
