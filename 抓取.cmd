@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在抓取小黑盒数据……
node scrape.mjs
echo.
pause
