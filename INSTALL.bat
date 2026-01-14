@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Shopping Connect 설치/업데이트

echo.
echo ╔════════════════════════════════════════════════╗
echo ║   Shopping Connect 설치/업데이트 프로그램     ║
echo ╚════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: 현재 버전 확인
if exist "version.json" (
    for /f "tokens=2 delims=:," %%a in ('findstr "version" version.json') do (
        set "CURRENT_VERSION=%%~a"
        set "CURRENT_VERSION=!CURRENT_VERSION: =!"
        set "CURRENT_VERSION=!CURRENT_VERSION:"=!"
    )
    echo 현재 버전: v!CURRENT_VERSION!
) else (
    set "CURRENT_VERSION=0.0.0"
    echo 현재 버전: 설치되지 않음
)

echo.
echo GitHub에서 최신 버전 확인 중...
echo.

:: PowerShell로 GitHub API 호출 및 다운로드
powershell -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference = 'Stop'; ^
try { ^
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/coreashield/naver_brand_connect/releases/latest' -Headers @{'User-Agent'='ShoppingConnect'}; ^
    $remoteVersion = $release.tag_name -replace 'v',''; ^
    $currentVersion = '%CURRENT_VERSION%'; ^
    Write-Host \"최신 버전: v$remoteVersion\"; ^
    Write-Host ''; ^
    if ($currentVersion -ne '0.0.0' -and [version]$currentVersion -ge [version]$remoteVersion) { ^
        Write-Host '이미 최신 버전입니다!' -ForegroundColor Green; ^
        exit 0; ^
    } ^
    if ($currentVersion -eq '0.0.0') { ^
        Write-Host \"설치할 버전: v$remoteVersion\" -ForegroundColor Yellow; ^
    } else { ^
        Write-Host \"업데이트: v$currentVersion → v$remoteVersion\" -ForegroundColor Yellow; ^
    } ^
    $asset = $release.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1; ^
    if (-not $asset) { Write-Host 'ERROR: 다운로드 파일 없음' -ForegroundColor Red; exit 1; } ^
    $sizeMB = [math]::Round($asset.size / 1MB, 1); ^
    Write-Host \"다운로드: $($asset.name) ($sizeMB MB)\"; ^
    Write-Host ''; ^
    Write-Host '다운로드 중... (약 3-5분 소요)' -ForegroundColor Cyan; ^
    $ProgressPreference = 'SilentlyContinue'; ^
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile 'update.zip' -UseBasicParsing; ^
    Write-Host '다운로드 완료!' -ForegroundColor Green; ^
    Write-Host ''; ^
    Write-Host '압축 해제 중...' -ForegroundColor Cyan; ^
    if (Test-Path 'update_temp') { Remove-Item 'update_temp' -Recurse -Force; } ^
    Expand-Archive -Path 'update.zip' -DestinationPath 'update_temp' -Force; ^
    $extracted = Get-ChildItem 'update_temp' | Select-Object -First 1; ^
    $sourceDir = if ($extracted.PSIsContainer) { $extracted.FullName } else { 'update_temp' }; ^
    $preserve = @('.env', 'output', 'playwright-data'); ^
    Get-ChildItem $sourceDir | ForEach-Object { ^
        $itemName = $_.Name; ^
        if ($preserve -contains $itemName -and (Test-Path (Join-Path (Get-Location) $itemName))) { ^
            Write-Host \"  건너뜀: $itemName (설정 보존)\"; ^
        } else { ^
            $dest = Join-Path (Get-Location) $itemName; ^
            if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue; } ^
            Copy-Item $_.FullName $dest -Recurse -Force; ^
            Write-Host \"  OK $itemName\" -ForegroundColor Green; ^
        } ^
    }; ^
    Remove-Item 'update_temp' -Recurse -Force; ^
    Remove-Item 'update.zip' -Force; ^
    Write-Host ''; ^
    Write-Host \"설치 완료! v$remoteVersion\" -ForegroundColor Green; ^
    Write-Host ''; ^
    if (-not (Test-Path '.env')) { ^
        if (Test-Path '.env.example') { ^
            Copy-Item '.env.example' '.env'; ^
            Write-Host '.env 파일이 생성되었습니다. 편집하세요!' -ForegroundColor Yellow; ^
        } ^
    } ^
} catch { ^
    Write-Host \"ERROR: $_\" -ForegroundColor Red; ^
    exit 1; ^
}"

echo.
echo ════════════════════════════════════════════════
echo  완료! 다음 단계:
echo  1. .env 파일 편집 (계정정보 입력)
echo  2. START_CAFE.bat 또는 START_BLOG.bat 실행
echo ════════════════════════════════════════════════
echo.
pause
