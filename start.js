/**
 * 통합 시작 스크립트
 * 업데이트 확인 후 선택한 작업 실행
 */

import { spawn } from 'child_process';
import { checkForUpdates, performUpdate, getLocalVersion } from './updater.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 ${scriptPath} 실행 중...\n`);

    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env
    });

    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Exit code: ${code}`));
    });

    child.on('error', reject);
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     Shopping Connect - 통합 실행기             ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  console.log(`현재 버전: v${getLocalVersion()}\n`);

  // 업데이트 확인 (--skip-update 옵션으로 스킵 가능)
  if (!process.argv.includes('--skip-update')) {
    try {
      const updateInfo = await checkForUpdates();

      if (updateInfo.available) {
        console.log(`\n🆕 새 버전 발견: v${updateInfo.remoteVersion}`);

        if (updateInfo.notes) {
          console.log('\n📋 변경사항:');
          console.log(updateInfo.notes.slice(0, 200) + (updateInfo.notes.length > 200 ? '...' : ''));
        }

        const answer = await ask('\n지금 업데이트하시겠습니까? (y/N): ');

        if (answer.toLowerCase() === 'y') {
          const success = await performUpdate(updateInfo);
          if (success) {
            console.log('\n✅ 업데이트 완료! 스크립트를 다시 시작해주세요.');
            rl.close();
            process.exit(0);
          }
        } else {
          console.log('업데이트를 건너뜁니다.\n');
        }
      }
    } catch (e) {
      console.log(`⚠️ 업데이트 확인 실패: ${e.message}\n`);
    }
  }

  // 메뉴 표시
  console.log('─'.repeat(50));
  console.log('실행할 작업을 선택하세요:\n');
  console.log('  1. 카페 자동 글쓰기');
  console.log('  2. 블로그 자동 글쓰기');
  console.log('  3. 전체 동기화 (링크 발급 + 크롤링)');
  console.log('  4. 계정 관리 UI');
  console.log('  5. 업데이트 확인');
  console.log('  0. 종료');
  console.log('─'.repeat(50));

  const choice = await ask('\n선택 (0-5): ');

  rl.close();

  const scripts = {
    '1': 'src/writers/cafe_writer_supabase.js',
    '2': 'src/writers/blog_writer_supabase.js',
    '3': 'full_sync_supabase.js',
    '4': 'serve_ui.js',
    '5': 'updater.js'
  };

  if (choice === '0') {
    console.log('종료합니다.');
    process.exit(0);
  }

  if (!scripts[choice]) {
    console.log('잘못된 선택입니다.');
    process.exit(1);
  }

  try {
    await runScript(scripts[choice]);
  } catch (e) {
    console.error(`\n❌ 실행 오류: ${e.message}`);
    process.exit(1);
  }
}

main();
