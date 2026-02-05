@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PATH=%~dp0node;%PATH%
set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers

echo ========================================
echo   OFF 상품 자동 정리
echo ========================================
echo.
echo   Brand Connect에서 진행상태 OFF인 상품을
echo   DB에서 자동으로 삭제합니다.
echo.
echo   [1] 실제 삭제 실행
echo   [2] 테스트 모드 (삭제 안함, 매칭만 확인)
echo.
set /p CHOICE="선택하세요 (1-2): "

if "%CHOICE%"=="1" (
    echo.
    echo 실제 삭제를 진행합니다...
    echo CAPTCHA가 나오면 수동으로 풀어주세요.
    echo.
    node cleanup_off_products.js
) else if "%CHOICE%"=="2" (
    echo.
    echo 테스트 모드로 실행합니다 (삭제 안함)
    echo.
    node cleanup_off_products.js --dry-run
) else (
    echo 잘못된 선택입니다.
)

echo.
pause
