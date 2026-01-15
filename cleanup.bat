@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   불필요한 파일 정리
echo ========================================
echo.
echo   삭제 대상:
echo   - 구버전 bat 파일들
echo   - 테스트/개발용 js 파일들
echo   - 임시 파일들
echo.
echo   삭제를 진행하시겠습니까?
echo.
pause

echo.
echo 정리 중...

:: 구버전 bat 파일
del /q setup.bat 2>nul
del /q start.bat 2>nul
del /q sync.bat 2>nul
del /q standalone_updater.bat 2>nul
del /q "카페글쓰기_supabase.bat" 2>nul
del /q "카페글쓰기_24시간.vbs" 2>nul

:: 개발/테스트용 js 파일
del /q start.js 2>nul
del /q auto_run.js 2>nul
del /q updater.js 2>nul
del /q update_script.js 2>nul
del /q build_package.js 2>nul
del /q get_cafe_info.js 2>nul
del /q solve_captcha.js 2>nul
del /q test_hashtag.js 2>nul
del /q test_supabase.js 2>nul
del /q test_parse_brandconnect.js 2>nul
del /q cleanup_off_products.js 2>nul
del /q fix_products_batch.js 2>nul
del /q install.ps1 2>nul
del /q RELEASE.bat 2>nul

:: 임시 파일
del /q nul 2>nul
del /q *.zip 2>nul
del /q *.log 2>nul

:: 불필요한 폴더 (주의: 개발환경에서만)
:: rmdir /s /q scripts 2>nul
:: rmdir /s /q dist 2>nul

echo.
echo ========================================
echo   정리 완료!
echo ========================================
echo.
echo   남은 bat 파일:
echo   - INSTALL.bat (업데이트)
echo   - 자동글쓰기.bat
echo   - 카페글쓰기.bat
echo   - 블로그글쓰기.bat
echo   - 상품정보업데이트.bat
echo.
pause
