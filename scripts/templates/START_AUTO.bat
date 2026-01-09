@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers
set PATH=%~dp0node;%PATH%

echo ========================================
echo   자동 글쓰기 통합 스크립트
echo   카페 200개 - 블로그 5개 (2시간) - 반복
echo ========================================
echo.
echo   [브라우저 모드]
echo   1. 브라우저 보이기 (기본)
echo   2. 백그라운드 실행
echo.
set /p MODE="선택 (1 또는 2): "

if "%MODE%"=="2" (
    set HEADLESS=true
    echo   백그라운드 모드로 실행...
) else (
    set HEADLESS=false
    echo   브라우저 표시 모드로 실행...
)

echo.
echo   [작동 순서]
echo   1. 카페 글 200개 작성 (2~3분 간격)
echo   2. 카페 완료 후 블로그 5개 (2시간 간격)
echo   3. 모두 완료 시 00시까지 대기
echo   4. 00시 리셋 후 카페부터 다시 시작
echo.
echo   Ctrl+C로 중지
echo ========================================
echo.
node src/writers/auto_writer.js
pause
