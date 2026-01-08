@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   코드 동기화 (src → packages/src)
echo ========================================
echo.

xcopy "src" "packages\src" /E /Y /I /Q

echo.
echo   동기화 완료!
echo   이제 packages\START_*.bat 실행 가능
echo.
pause
