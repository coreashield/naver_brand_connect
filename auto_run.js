/**
 * 자동 실행 스크립트 (백그라운드/스케줄러용)
 * 업데이트 자동 적용 후 지정된 작업 실행
 *
 * 사용법:
 *   node auto_run.js cafe     # 카페 글쓰기
 *   node auto_run.js blog     # 블로그 글쓰기
 *   node auto_run.js both     # 둘 다 (카페 먼저)
 */

import { spawn } from 'child_process';
import { checkForUpdates, performUpdate, getLocalVersion } from './updater.js';

const SCRIPTS = {
  cafe: 'src/writers/cafe_writer_supabase.js',
  blog: 'src/writers/blog_writer_supabase.js',
  sync: 'full_sync_supabase.js',
  ui: 'serve_ui.js'
};

function log(message) {
  const timestamp = new Date().toLocaleString('ko-KR');
  console.log(`[${timestamp}] ${message}`);
}

async function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    log(`실행: ${scriptPath}`);

    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env
    });

    child.on('close', code => resolve(code));
    child.on('error', reject);
  });
}

async function main() {
  const mode = process.argv[2] || 'cafe';

  log(`Shopping Connect 자동 실행 (모드: ${mode})`);
  log(`현재 버전: v${getLocalVersion()}`);

  // 업데이트 확인 및 자동 적용
  if (!process.argv.includes('--skip-update')) {
    try {
      log('업데이트 확인 중...');
      const updateInfo = await checkForUpdates();

      if (updateInfo.available) {
        log(`새 버전 발견: v${updateInfo.remoteVersion}`);
        log('자동 업데이트 진행...');

        const success = await performUpdate(updateInfo);

        if (success) {
          log('업데이트 완료! 스크립트 재시작...');
          // 자기 자신을 다시 실행 (업데이트 스킵)
          await runScript(process.argv[1]);
          process.exit(0);
        }
      } else {
        log('최신 버전 사용 중');
      }
    } catch (e) {
      log(`업데이트 확인 실패: ${e.message}`);
    }
  }

  // 스크립트 실행
  if (mode === 'both') {
    // 카페 먼저, 그 다음 블로그
    await runScript(SCRIPTS.cafe);
    await runScript(SCRIPTS.blog);
  } else if (SCRIPTS[mode]) {
    await runScript(SCRIPTS[mode]);
  } else {
    log(`알 수 없는 모드: ${mode}`);
    log('사용 가능: cafe, blog, both, sync, ui');
    process.exit(1);
  }
}

main().catch(e => {
  log(`오류: ${e.message}`);
  process.exit(1);
});
