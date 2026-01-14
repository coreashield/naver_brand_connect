@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

title Shopping Connect Updater

echo.
echo ╔════════════════════════════════════════════════╗
echo ║     Shopping Connect 자동 업데이터             ║
echo ╚════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: portable node가 있으면 사용, 없으면 시스템 node 사용
if exist "node\node.exe" (
    set "NODE=node\node.exe"
    set "PATH=%~dp0node;%PATH%"
) else (
    where node >nul 2>nul
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Node.js가 없습니다. 수동으로 설치하세요.
        pause
        exit /b 1
    )
    set "NODE=node"
)

:: 현재 버전 확인
if not exist "version.json" (
    echo [INFO] 최초 설치입니다. 최신 버전을 다운로드합니다.
    set "CURRENT_VERSION=0.0.0"
) else (
    for /f "tokens=2 delims=:," %%a in ('findstr "version" version.json') do (
        set "CURRENT_VERSION=%%~a"
        set "CURRENT_VERSION=!CURRENT_VERSION: =!"
        set "CURRENT_VERSION=!CURRENT_VERSION:"=!"
    )
)

echo 현재 버전: v%CURRENT_VERSION%
echo.
echo GitHub에서 최신 버전 확인 중...

:: GitHub API로 최신 릴리스 확인 및 다운로드 수행
%NODE% -e "const https=require('https');const fs=require('fs');const path=require('path');const{execSync}=require('child_process');const cv='%CURRENT_VERSION%';const repo='coreashield/naver_brand_connect';function get(url,cb){https.get(url,{headers:{'User-Agent':'ShoppingConnect'}},r=>{if(r.statusCode===301||r.statusCode===302){get(r.headers.location,cb);return;}let d='';r.on('data',c=>d+=c);r.on('end',()=>cb(null,r.statusCode,d));}).on('error',cb);}get('https://api.github.com/repos/'+repo+'/releases/latest',(e,st,d)=>{if(e||st!==200){console.log('[ERROR] 릴리스 정보 확인 실패');process.exit(1);}const rel=JSON.parse(d);const rv=rel.tag_name.replace('v','');console.log('최신 버전: v'+rv);if(cv.localeCompare(rv,undefined,{numeric:true})>=0){console.log('\n이미 최신 버전입니다!');process.exit(0);}console.log('\n새 버전 발견: v'+cv+' -> v'+rv);const asset=rel.assets.find(a=>a.name.endsWith('.zip'));if(!asset){console.log('[ERROR] 다운로드 파일 없음');process.exit(1);}console.log('다운로드: '+asset.name+' ('+Math.round(asset.size/1024/1024)+'MB)');const zipPath=path.join(process.cwd(),'update.zip');const file=fs.createWriteStream(zipPath);let downloaded=0;get(asset.browser_download_url,(e,st,stream)=>{});https.get(asset.browser_download_url,{headers:{'User-Agent':'ShoppingConnect'}},r=>{if(r.statusCode===301||r.statusCode===302){https.get(r.headers.location,{headers:{'User-Agent':'ShoppingConnect'}},r2=>{const total=parseInt(r2.headers['content-length'],10);r2.on('data',c=>{downloaded+=c.length;const pct=Math.round(downloaded/total*100);process.stdout.write('\\r다운로드 중... '+pct+'%%  ');});r2.pipe(file);file.on('finish',()=>{console.log('\\n다운로드 완료!');file.close();console.log('압축 해제 중...');try{execSync('powershell -Command \"Expand-Archive -Path update.zip -DestinationPath update_temp -Force\"',{stdio:'pipe'});const dirs=fs.readdirSync('update_temp');const src=dirs.length===1?path.join('update_temp',dirs[0]):'update_temp';const items=fs.readdirSync(src);for(const item of items){if(item==='.env'||item==='output'||item==='playwright-data')continue;const s=path.join(src,item);const d=path.join(process.cwd(),item);try{if(fs.existsSync(d))fs.rmSync(d,{recursive:true,force:true});fs.cpSync(s,d,{recursive:true});}catch(e){}}fs.rmSync('update_temp',{recursive:true,force:true});fs.unlinkSync('update.zip');console.log('\\n업데이트 완료! v'+rv);console.log('프로그램을 다시 실행하세요.');}catch(e){console.log('[ERROR] 압축 해제 실패: '+e.message);}});});return;}const total=parseInt(r.headers['content-length'],10);r.on('data',c=>{downloaded+=c.length;const pct=Math.round(downloaded/total*100);process.stdout.write('\\r다운로드 중... '+pct+'%%  ');});r.pipe(file);});});"

echo.
pause
