@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在生成数据分析……
node analyze.mjs
if exist "分析报告.md" start "" "分析报告.md"
echo.
pause
