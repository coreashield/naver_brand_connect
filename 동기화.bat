@echo off
chcp 65001 >nul
cd /d "%~dp0"

:: Node.js 경로 설정 (portable 버전 우선, 없으면 시스템 Node 사용)
if exist "%~dp0node\node.exe" (
    set PATH=%~dp0node;%PATH%
)

:: Playwright 브라우저 경로
if exist "%~dp0browsers" (
    set PLAYWRIGHT_BROWSERS_PATH=%~dp0browsers
)

echo ========================================
echo   발급 링크 동기화
echo ========================================
echo.
echo   Brand Connect에서 발급된 ON 상품을
echo   DB와 동기화합니다.
echo.
echo   [1] 테스트 모드 (저장 안함, 결과만 확인)
echo   [2] 실제 동기화 (신규 상품만 추가)
echo   [3] 전체 업데이트 (기존 상품 affiliate_link도 갱신)
echo.
set /p CHOICE="선택하세요 (1-3): "

if "%CHOICE%"=="1" (
    echo.
    echo 테스트 모드로 실행합니다...
    echo.
    node sync_issued_links.js --dry-run
) else if "%CHOICE%"=="2" (
    echo.
    echo 신규 상품만 추가합니다...
    echo CAPTCHA가 나오면 수동으로 풀어주세요.
    echo.
    node sync_issued_links.js
) else if "%CHOICE%"=="3" (
    echo.
    echo 전체 업데이트를 진행합니다...
    echo CAPTCHA가 나오면 수동으로 풀어주세요.
    echo.
    node sync_issued_links.js --force-update
) else (
    echo 잘못된 선택입니다.
)

echo.
pause
