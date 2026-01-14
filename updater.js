/**
 * 자동 업데이트 시스템
 * GitHub Releases에서 최신 버전 확인 및 다운로드
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync, spawn } from 'child_process';
import { createWriteStream, unlinkSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ========== 설정 ==========
const CONFIG = {
  // GitHub 저장소 설정
  github: {
    owner: 'coreashield',
    repo: 'naver_brand_connect',
    branch: 'main'
  },
  // 로컬 파일 경로
  versionFile: path.join(__dirname, 'version.json'),
  backupDir: path.join(__dirname, 'backup'),
  tempDir: path.join(__dirname, 'temp_update'),
  // 업데이트 제외 파일/폴더
  excludeFromUpdate: [
    '.env',
    'playwright-data',
    'output',
    'downloads',
    'node_modules',
    'backup',
    'temp_update'
  ]
};

// ========== 유틸리티 ==========

function log(message, type = 'info') {
  const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌', update: '🔄' };
  console.log(`${icons[type] || ''} ${message}`);
}

function getLocalVersion() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG.versionFile, 'utf-8'));
    return data.version;
  } catch (e) {
    return '0.0.0';
  }
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

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'ShoppingConnect-Updater',
        ...options.headers
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        httpsGet(res.headers.location, options).then(resolve).catch(reject);
        return;
      }

      if (options.stream) {
        resolve(res);
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on('error', reject);
  });
}

async function downloadFile(url, destPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpsGet(url, { stream: true });
      const file = createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ========== GitHub API ==========

async function getLatestRelease() {
  const url = `https://api.github.com/repos/${CONFIG.github.owner}/${CONFIG.github.repo}/releases/latest`;

  try {
    const { statusCode, data } = await httpsGet(url);

    if (statusCode === 404) {
      log('릴리스가 없습니다. 태그 확인 중...', 'warn');
      return await getLatestTag();
    }

    if (statusCode !== 200) {
      throw new Error(`GitHub API 오류: ${statusCode}`);
    }

    const release = JSON.parse(data);
    return {
      version: release.tag_name.replace(/^v/, ''),
      zipUrl: release.zipball_url,
      tarUrl: release.tarball_url,
      notes: release.body,
      publishedAt: release.published_at
    };
  } catch (e) {
    log(`릴리스 확인 실패: ${e.message}`, 'error');
    return null;
  }
}

async function getLatestTag() {
  const url = `https://api.github.com/repos/${CONFIG.github.owner}/${CONFIG.github.repo}/tags`;

  try {
    const { statusCode, data } = await httpsGet(url);

    if (statusCode !== 200 || !data) {
      return null;
    }

    const tags = JSON.parse(data);
    if (tags.length === 0) return null;

    const latestTag = tags[0];
    return {
      version: latestTag.name.replace(/^v/, ''),
      zipUrl: `https://github.com/${CONFIG.github.owner}/${CONFIG.github.repo}/archive/refs/tags/${latestTag.name}.zip`,
      notes: ''
    };
  } catch (e) {
    return null;
  }
}

// ========== 업데이트 로직 ==========

async function checkForUpdates() {
  log('업데이트 확인 중...', 'update');

  const localVersion = getLocalVersion();
  log(`현재 버전: v${localVersion}`);

  const latest = await getLatestRelease();

  if (!latest) {
    log('최신 버전 정보를 가져올 수 없습니다.', 'warn');
    return { available: false, localVersion };
  }

  log(`최신 버전: v${latest.version}`);

  const comparison = compareVersions(localVersion, latest.version);

  if (comparison >= 0) {
    log('이미 최신 버전입니다.', 'success');
    return { available: false, localVersion, remoteVersion: latest.version };
  }

  log(`새 버전 발견: v${localVersion} → v${latest.version}`, 'update');

  return {
    available: true,
    localVersion,
    remoteVersion: latest.version,
    zipUrl: latest.zipUrl,
    notes: latest.notes
  };
}

async function performUpdate(updateInfo) {
  const { zipUrl, remoteVersion } = updateInfo;

  log('업데이트 다운로드 중...', 'update');

  ensureDir(CONFIG.tempDir);
  ensureDir(CONFIG.backupDir);

  const zipPath = path.join(CONFIG.tempDir, 'update.zip');

  try {
    // 1. ZIP 다운로드
    await downloadFile(zipUrl, zipPath);
    log('다운로드 완료', 'success');

    // 2. 현재 파일 백업
    const backupPath = path.join(CONFIG.backupDir, `backup_v${getLocalVersion()}_${Date.now()}`);
    ensureDir(backupPath);

    log('현재 버전 백업 중...', 'update');

    const filesToBackup = fs.readdirSync(__dirname).filter(f =>
      !CONFIG.excludeFromUpdate.includes(f) &&
      !f.startsWith('.') &&
      f !== 'backup' &&
      f !== 'temp_update'
    );

    for (const file of filesToBackup) {
      const src = path.join(__dirname, file);
      const dest = path.join(backupPath, file);
      try {
        fs.cpSync(src, dest, { recursive: true });
      } catch (e) {}
    }

    log(`백업 완료: ${backupPath}`, 'success');

    // 3. ZIP 압축 해제 (PowerShell 사용)
    log('압축 해제 중...', 'update');

    const extractDir = path.join(CONFIG.tempDir, 'extracted');
    ensureDir(extractDir);

    try {
      execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, {
        stdio: 'pipe'
      });
    } catch (e) {
      throw new Error('압축 해제 실패: ' + e.message);
    }

    // 4. 추출된 폴더 찾기 (GitHub은 폴더 안에 넣음)
    const extractedFolders = fs.readdirSync(extractDir);
    const sourceDir = extractedFolders.length === 1
      ? path.join(extractDir, extractedFolders[0])
      : extractDir;

    // 5. 파일 복사 (제외 항목 제외)
    log('파일 업데이트 중...', 'update');

    const updateFiles = fs.readdirSync(sourceDir).filter(f =>
      !CONFIG.excludeFromUpdate.includes(f)
    );

    for (const file of updateFiles) {
      const src = path.join(sourceDir, file);
      const dest = path.join(__dirname, file);

      try {
        // 기존 파일 삭제 후 복사
        if (existsSync(dest)) {
          fs.rmSync(dest, { recursive: true, force: true });
        }
        fs.cpSync(src, dest, { recursive: true });
        log(`  ${file}`, 'success');
      } catch (e) {
        log(`  ${file} 복사 실패: ${e.message}`, 'warn');
      }
    }

    // 6. 임시 파일 정리
    fs.rmSync(CONFIG.tempDir, { recursive: true, force: true });

    // 7. 버전 파일 업데이트
    const versionData = {
      version: remoteVersion,
      updated_at: new Date().toISOString().split('T')[0],
      changes: updateInfo.notes ? updateInfo.notes.split('\n').slice(0, 5) : []
    };
    fs.writeFileSync(CONFIG.versionFile, JSON.stringify(versionData, null, 2));

    log(`\n업데이트 완료! v${remoteVersion}`, 'success');
    log('npm install을 실행하여 의존성을 업데이트하세요.', 'info');

    return true;

  } catch (e) {
    log(`업데이트 실패: ${e.message}`, 'error');

    // 임시 파일 정리
    try {
      fs.rmSync(CONFIG.tempDir, { recursive: true, force: true });
    } catch {}

    return false;
  }
}

// ========== 메인 ==========

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║      Shopping Connect 업데이터             ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const updateInfo = await checkForUpdates();

  if (!updateInfo.available) {
    process.exit(0);
  }

  // 업데이트 노트 표시
  if (updateInfo.notes) {
    console.log('\n📋 업데이트 내용:');
    console.log('─'.repeat(40));
    console.log(updateInfo.notes);
    console.log('─'.repeat(40));
  }

  // 자동 모드 확인
  const autoMode = process.argv.includes('--auto') || process.argv.includes('-y');

  if (!autoMode) {
    // 사용자 확인
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('\n업데이트를 진행하시겠습니까? (y/N): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'y') {
      log('업데이트 취소됨', 'warn');
      process.exit(0);
    }
  }

  const success = await performUpdate(updateInfo);
  process.exit(success ? 0 : 1);
}

// 모듈로 사용 시
export { checkForUpdates, performUpdate, getLocalVersion };

// 직접 실행 시
if (process.argv[1] && process.argv[1].includes('updater')) {
  main();
}
