@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo 카페 자동 글쓰기 시작...
node src/writers/cafe_writer.js
pause
