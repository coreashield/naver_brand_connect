/**
 * Shopping Connect 업데이터 스크립트
 * GitHub Releases에서 최신 버전 확인 및 다운로드
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
  owner: 'coreashield',
  repo: 'naver_brand_connect',
  // 업데이트 시 보존할 파일/폴더
  preserve: ['.env', 'output', 'playwright-data', 'browsers']
};

const currentVersion = process.argv[2] || '0.0.0';

function log(msg, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌', update: '🔄' };
  console.log(`${icons[type] || ''} ${msg}`);
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'ShoppingConnect-Updater' }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        httpsGet(res.headers.location).then(resolve).catch(reject);
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const makeRequest = (reqUrl) => {
      https.get(reqUrl, {
        headers: { 'User-Agent': 'ShoppingConnect-Updater' }
      }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          makeRequest(res.headers.location);
          return;
        }

        const total = parseInt(res.headers['content-length'], 10);
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          const pct = Math.round(downloaded / total * 100);
          process.stdout.write(`\r다운로드 중... ${pct}% (${Math.round(downloaded/1024/1024)}MB/${Math.round(total/1024/1024)}MB)  `);
        });

        res.pipe(file);

        file.on('finish', () => {
          console.log('');
          file.close();
          resolve(destPath);
        });

        file.on('error', reject);
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if ((parts1[i] || 0) < (parts2[i] || 0)) return -1;
    if ((parts1[i] || 0) > (parts2[i] || 0)) return 1;
  }
  return 0;
}

async function main() {
  try {
    // 1. 최신 릴리스 확인
    const apiUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/releases/latest`;
    const { statusCode, data } = await httpsGet(apiUrl);

    if (statusCode === 404) {
      log('릴리스가 없습니다.', 'warn');
      return;
    }

    if (statusCode !== 200) {
      log(`GitHub API 오류: ${statusCode}`, 'error');
      return;
    }

    const release = JSON.parse(data);
    const remoteVersion = release.tag_name.replace(/^v/, '');

    log(`최신 버전: v${remoteVersion}`);

    // 2. 버전 비교
    if (compareVersions(currentVersion, remoteVersion) >= 0) {
      log('이미 최신 버전입니다!', 'success');
      return;
    }

    log(`새 버전 발견: v${currentVersion} → v${remoteVersion}`, 'update');

    // 3. 다운로드 URL 찾기
    const asset = release.assets.find(a => a.name.endsWith('.zip'));

    if (!asset) {
      log('다운로드 가능한 파일이 없습니다.', 'error');
      return;
    }

    const sizeMB = Math.round(asset.size / 1024 / 1024);
    log(`다운로드: ${asset.name} (${sizeMB} MB)`, 'update');

    // 4. 다운로드
    const zipPath = path.join(process.cwd(), 'update.zip');
    await downloadFile(asset.browser_download_url, zipPath);
    log('다운로드 완료!', 'success');

    // 5. 압축 해제
    log('압축 해제 중...', 'update');
    const extractDir = path.join(process.cwd(), 'update_temp');

    try {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, {
        stdio: 'pipe'
      });
    } catch (e) {
      log('압축 해제 실패: ' + e.message, 'error');
      return;
    }

    // 6. 파일 복사 (보존 항목 제외)
    log('파일 업데이트 중...', 'update');

    // GitHub ZIP은 폴더 안에 내용이 있음
    const extractedItems = fs.readdirSync(extractDir);
    const sourceDir = extractedItems.length === 1 && fs.statSync(path.join(extractDir, extractedItems[0])).isDirectory()
      ? path.join(extractDir, extractedItems[0])
      : extractDir;

    const items = fs.readdirSync(sourceDir);
    let updated = 0;

    for (const item of items) {
      // 보존 항목 건너뛰기
      if (CONFIG.preserve.includes(item)) {
        log(`  건너뜀: ${item} (보존)`, 'info');
        continue;
      }

      const src = path.join(sourceDir, item);
      const dest = path.join(process.cwd(), item);

      try {
        // 기존 파일/폴더 삭제
        if (fs.existsSync(dest)) {
          fs.rmSync(dest, { recursive: true, force: true });
        }

        // 새 파일 복사
        fs.cpSync(src, dest, { recursive: true });
        log(`  ✓ ${item}`, 'success');
        updated++;
      } catch (e) {
        log(`  ✗ ${item}: ${e.message}`, 'warn');
      }
    }

    // 7. 정리
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(zipPath);

    log(`\n업데이트 완료! v${remoteVersion} (${updated}개 항목 업데이트)`, 'success');
    log('프로그램을 다시 실행하세요.', 'info');

  } catch (e) {
    log(`업데이트 실패: ${e.message}`, 'error');
  }
}

main();
