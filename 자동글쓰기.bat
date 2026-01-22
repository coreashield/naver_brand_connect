@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PATH=%~dp0node;%PATH%
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers

echo ========================================
echo   자동 글쓰기 v1.15.1
echo ========================================
echo.
echo   [기능]
echo   - 카페 150개 자동 작성 (2~3분 간격)
echo   - 150개 한도 도달 시 자동 감지
echo   - 실패 시 같은 콘텐츠로 최대 3회 재시도
echo   - 카페 완료 후 블로그 5개 (2시간 간격)
echo   - 00시 리셋 후 자동 반복
echo.
echo   [브라우저 모드]
echo   1. 브라우저 보이기 (기본)
echo   2. 백그라운드 실행
echo.
set /p MODE="선택 (1 또는 2): "

if "%MODE%"=="2" (
    set HEADLESS=true
    echo.
    echo   백그라운드 모드로 실행...
) else (
    set HEADLESS=false
    echo.
    echo   브라우저 표시 모드로 실행...
)

echo.
echo   Ctrl+C로 중지
echo ========================================
echo.
node src/writers/auto_writer.js
pause
