@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" /min node server.mjs
timeout /t 2 >nul
start "" http://127.0.0.1:7789/
