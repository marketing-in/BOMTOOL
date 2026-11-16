@echo off
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Start-Bom.ps1" -Online
if errorlevel 1 pause
