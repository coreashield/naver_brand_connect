@echo off
chcp 65001 >nul
cd /d "%~dp0\.."

echo ========================================
echo   Supabase Portable Package Builder
echo   (Node.js + Browsers included)
echo ========================================
echo.

set PACKAGE_DIR=packages\supabase_standalone

if exist %PACKAGE_DIR% rmdir /s /q %PACKAGE_DIR%
mkdir %PACKAGE_DIR%

echo [1/8] Copying source files...
mkdir %PACKAGE_DIR%\src\writers
mkdir %PACKAGE_DIR%\src\supabase

copy src\writers\cafe_writer_supabase.js %PACKAGE_DIR%\src\writers\
copy src\writers\blog_writer_supabase.js %PACKAGE_DIR%\src\writers\
copy src\supabase\*.js %PACKAGE_DIR%\src\supabase\
copy src\supabase\*.sql %PACKAGE_DIR%\src\supabase\ 2>nul

copy full_sync_supabase.js %PACKAGE_DIR%\
copy test_supabase.js %PACKAGE_DIR%\
copy package.json %PACKAGE_DIR%\

echo [2/8] Creating output folder...
mkdir %PACKAGE_DIR%\output

echo [3/8] Copying env template...
copy scripts\templates\.env.template %PACKAGE_DIR%\

echo [4/8] Copying run scripts...
copy scripts\templates\START_CAFE.bat %PACKAGE_DIR%\
copy scripts\templates\START_BLOG.bat %PACKAGE_DIR%\
copy scripts\templates\START_SYNC.bat %PACKAGE_DIR%\
copy scripts\templates\TEST.bat %PACKAGE_DIR%\

echo [5/8] Copying Node.js portable...
xcopy scripts\node-portable %PACKAGE_DIR%\node\ /E /I /Q /Y >nul

echo [6/8] Copying node_modules...
xcopy node_modules %PACKAGE_DIR%\node_modules\ /E /I /Q /Y >nul

echo [7/8] Installing Playwright browser...
set PLAYWRIGHT_BROWSERS_PATH=%cd%\%PACKAGE_DIR%\browsers
call npx playwright install chromium

echo [8/8] Creating ZIP...
if exist packages\supabase_standalone.zip del packages\supabase_standalone.zip
powershell -Command "Compress-Archive -Path 'packages\supabase_standalone\*' -DestinationPath 'packages\supabase_standalone.zip' -Force"

echo.
echo ========================================
echo   Package created!
echo ========================================
echo   Folder: packages\supabase_standalone
echo   ZIP: packages\supabase_standalone.zip
echo.
echo   Includes: Node.js + Browsers + Modules
echo   No installation required on VM!
echo.
pause
