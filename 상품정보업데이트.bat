@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   상품 상세 정보 일괄 업데이트
echo ========================================
echo.
echo   기존 상품들의 상세 정보를 크롤링합니다.
echo   (카테고리, 브랜드, 평점, 리뷰수 등)
echo.
echo   CAPTCHA가 나오면 수동으로 풀어주세요.
echo.
echo   아무 키나 누르면 시작합니다...
pause >nul
echo.
node src/crawlers/batch_update_products.js
echo.
pause
