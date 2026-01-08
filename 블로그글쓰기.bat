@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   블로그 자동 글쓰기
echo   (AI 스타일 랜덤 적용)
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
echo   [글쓰기 스타일 - 랜덤 선택]
echo   - 친근한 후기 / 전문가 분석
echo   - 일상 에피소드 / 비교 분석
echo   - 감성 공유 / 실용 정보
echo   - 트렌드 소개 / 가성비 분석
echo.
echo   Ctrl+C로 중지
echo ========================================
echo.
node src/writers/blog_writer_supabase.js
pause
