@echo off
chcp 65001 > nul
title 티스토리 자동 글쓰기

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║   티스토리 자동 글쓰기                                     ║
echo ║   카카오 로그인 → 모바일 인증 → 자동 포스팅                ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

echo [INFO] 티스토리 자동 글쓰기를 시작합니다...
echo [INFO] 카카오 모바일 인증이 필요할 수 있습니다.
echo.

node src/writers/tistory_writer.js

echo.
pause
