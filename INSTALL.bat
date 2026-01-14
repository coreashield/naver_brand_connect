@echo off
cd /d "%~dp0"
echo Shopping Connect Installer
echo.

:: Create temp PowerShell script
echo $ErrorActionPreference = 'Stop' > "%temp%\sc_install.ps1"
echo [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 >> "%temp%\sc_install.ps1"
echo Write-Host 'Checking GitHub...' >> "%temp%\sc_install.ps1"
echo try { >> "%temp%\sc_install.ps1"
echo     $r = Invoke-RestMethod -Uri 'https://api.github.com/repos/coreashield/naver_brand_connect/releases/latest' -Headers @{'User-Agent'='SC'} >> "%temp%\sc_install.ps1"
echo     $rv = $r.tag_name -replace 'v','' >> "%temp%\sc_install.ps1"
echo     Write-Host "Latest version: $rv" >> "%temp%\sc_install.ps1"
echo     $currentVersion = '0.0.0' >> "%temp%\sc_install.ps1"
echo     if (Test-Path 'version.json') { >> "%temp%\sc_install.ps1"
echo         $v = Get-Content 'version.json' -Raw ^| ConvertFrom-Json >> "%temp%\sc_install.ps1"
echo         $currentVersion = $v.version >> "%temp%\sc_install.ps1"
echo     } >> "%temp%\sc_install.ps1"
echo     Write-Host "Current version: $currentVersion" >> "%temp%\sc_install.ps1"
echo     if ($currentVersion -ne '0.0.0' -and [version]$currentVersion -ge [version]$rv) { >> "%temp%\sc_install.ps1"
echo         Write-Host 'Already up to date!' -ForegroundColor Green >> "%temp%\sc_install.ps1"
echo     } else { >> "%temp%\sc_install.ps1"
echo         $a = $r.assets ^| Where-Object { $_.name -like '*.zip' } ^| Select-Object -First 1 >> "%temp%\sc_install.ps1"
echo         Write-Host "Downloading $($a.name)..." >> "%temp%\sc_install.ps1"
echo         $ProgressPreference = 'SilentlyContinue' >> "%temp%\sc_install.ps1"
echo         Invoke-WebRequest -Uri $a.browser_download_url -OutFile 'update.zip' -UseBasicParsing >> "%temp%\sc_install.ps1"
echo         Write-Host 'Download complete!' -ForegroundColor Green >> "%temp%\sc_install.ps1"
echo         Write-Host 'Extracting...' >> "%temp%\sc_install.ps1"
echo         if (Test-Path 'update_temp') { Remove-Item 'update_temp' -Recurse -Force } >> "%temp%\sc_install.ps1"
echo         Expand-Archive -Path 'update.zip' -DestinationPath 'update_temp' -Force >> "%temp%\sc_install.ps1"
echo         $items = Get-ChildItem 'update_temp' >> "%temp%\sc_install.ps1"
echo         if ($items.Count -eq 1 -and $items[0].PSIsContainer) { >> "%temp%\sc_install.ps1"
echo             $src = $items[0].FullName >> "%temp%\sc_install.ps1"
echo         } else { >> "%temp%\sc_install.ps1"
echo             $src = 'update_temp' >> "%temp%\sc_install.ps1"
echo         } >> "%temp%\sc_install.ps1"
echo         Get-ChildItem $src ^| ForEach-Object { >> "%temp%\sc_install.ps1"
echo             $dest = $_.Name >> "%temp%\sc_install.ps1"
echo             if ($dest -eq '.env' -and (Test-Path '.env')) { Write-Host "  Skip: .env"; return } >> "%temp%\sc_install.ps1"
echo             if ($dest -eq 'output' -and (Test-Path 'output')) { Write-Host "  Skip: output"; return } >> "%temp%\sc_install.ps1"
echo             if ($dest -eq 'playwright-data' -and (Test-Path 'playwright-data')) { Write-Host "  Skip: playwright-data"; return } >> "%temp%\sc_install.ps1"
echo             if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue } >> "%temp%\sc_install.ps1"
echo             Copy-Item $_.FullName $dest -Recurse -Force >> "%temp%\sc_install.ps1"
echo             Write-Host "  OK: $dest" -ForegroundColor Green >> "%temp%\sc_install.ps1"
echo         } >> "%temp%\sc_install.ps1"
echo         Remove-Item 'update_temp' -Recurse -Force >> "%temp%\sc_install.ps1"
echo         Remove-Item 'update.zip' -Force >> "%temp%\sc_install.ps1"
echo         Write-Host '' >> "%temp%\sc_install.ps1"
echo         Write-Host "Installation complete! v$rv" -ForegroundColor Green >> "%temp%\sc_install.ps1"
echo         if (-not (Test-Path '.env') -and (Test-Path '.env.example')) { >> "%temp%\sc_install.ps1"
echo             Copy-Item '.env.example' '.env' >> "%temp%\sc_install.ps1"
echo             Write-Host '.env created - please edit!' -ForegroundColor Yellow >> "%temp%\sc_install.ps1"
echo         } >> "%temp%\sc_install.ps1"
echo     } >> "%temp%\sc_install.ps1"
echo } catch { >> "%temp%\sc_install.ps1"
echo     Write-Host "ERROR: $_" -ForegroundColor Red >> "%temp%\sc_install.ps1"
echo } >> "%temp%\sc_install.ps1"

:: Run the script
powershell -ExecutionPolicy Bypass -File "%temp%\sc_install.ps1"

:: Cleanup
del "%temp%\sc_install.ps1" 2>nul

echo.
pause
