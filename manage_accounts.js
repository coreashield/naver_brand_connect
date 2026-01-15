#!/usr/bin/env node
/**
 * 네이버 계정 관리 CLI 도구
 * 사용법: node manage_accounts.js [command]
 *
 * Commands:
 *   add      - 새 계정 추가 (대화형)
 *   list     - 모든 계정 목록 조회
 *   quick    - 빠른 계정 추가 (인자로 전달)
 *   status   - 계정 상태 변경
 *   delete   - 계정 삭제
 */

import 'dotenv/config';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 색상 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// readline 인터페이스
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function ask(rl, question, defaultValue = '') {
  const suffix = defaultValue ? ` (기본값: ${defaultValue})` : '';
  return new Promise(resolve => {
    rl.question(`${colors.cyan}${question}${suffix}: ${colors.reset}`, answer => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

// === 계정 추가 (대화형) ===
async function addAccountInteractive() {
  const rl = createReadline();

  log('\n╔════════════════════════════════════════╗', 'green');
  log('║     네이버 계정 등록                   ║', 'green');
  log('╚════════════════════════════════════════╝\n', 'green');

  try {
    const naverId = await ask(rl, '네이버 ID');
    if (!naverId) {
      log('❌ ID는 필수입니다.', 'red');
      rl.close();
      return;
    }

    const naverPw = await ask(rl, '네이버 비밀번호');
    if (!naverPw) {
      log('❌ 비밀번호는 필수입니다.', 'red');
      rl.close();
      return;
    }

    const blogId = await ask(rl, '블로그 ID', naverId);
    const cafeUrl = await ask(rl, '카페 글쓰기 URL (전체 URL)');
    const dailyCafeLimit = await ask(rl, '일일 카페 포스팅 제한', '200');
    const dailyBlogLimit = await ask(rl, '일일 블로그 포스팅 제한', '5');
    const memo = await ask(rl, '메모 (선택)');

    rl.close();

    // 확인
    log('\n📋 입력 정보 확인:', 'yellow');
    log(`   ID: ${naverId}`);
    log(`   PW: ${'*'.repeat(naverPw.length)}`);
    log(`   블로그: ${blogId}`);
    log(`   카페 URL: ${cafeUrl || '(미설정)'}`);
    log(`   일일 제한: 카페 ${dailyCafeLimit}건, 블로그 ${dailyBlogLimit}건`);
    log(`   메모: ${memo || '(없음)'}`);

    const { data, error } = await supabase
      .from('naver_accounts')
      .insert({
        naver_id: naverId,
        naver_pw: naverPw,
        blog_id: blogId,
        cafe_url: cafeUrl || null,
        daily_cafe_limit: parseInt(dailyCafeLimit),
        daily_blog_limit: parseInt(dailyBlogLimit),
        memo: memo || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        log(`\n❌ 이미 등록된 ID입니다: ${naverId}`, 'red');
      } else {
        throw error;
      }
    } else {
      log(`\n✅ 계정 등록 완료! (ID: ${data.id})`, 'green');
    }

  } catch (err) {
    log(`\n❌ 오류: ${err.message}`, 'red');
  }
}

// === 빠른 계정 추가 (인자로) ===
async function addAccountQuick(args) {
  // node manage_accounts.js quick <id> <pw> [blogId] [cafeUrl] [memo]
  const [naverId, naverPw, blogId, cafeUrl, ...memoArr] = args;
  const memo = memoArr.join(' ');

  if (!naverId || !naverPw) {
    log('사용법: node manage_accounts.js quick <id> <pw> [blogId] [cafeUrl] [memo]', 'yellow');
    log('예시: node manage_accounts.js quick myid mypw myblog https://cafe.naver.com/... "테스트 계정"', 'gray');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('naver_accounts')
      .insert({
        naver_id: naverId,
        naver_pw: naverPw,
        blog_id: blogId || naverId,
        cafe_url: cafeUrl || null,
        memo: memo || null
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        log(`❌ 이미 등록된 ID: ${naverId}`, 'red');
      } else {
        throw error;
      }
    } else {
      log(`✅ 등록 완료: ${naverId} (ID: ${data.id})`, 'green');
    }
  } catch (err) {
    log(`❌ 오류: ${err.message}`, 'red');
  }
}

// === 계정 목록 조회 ===
async function listAccounts() {
  try {
    const { data, error } = await supabase
      .from('naver_accounts')
      .select('*')
      .order('id');

    if (error) throw error;

    if (!data || data.length === 0) {
      log('\n등록된 계정이 없습니다.', 'yellow');
      return;
    }

    log('\n╔═══════════════════════════════════════════════════════════════════════════════╗', 'cyan');
    log('║                           네이버 계정 목록                                    ║', 'cyan');
    log('╠═══╦═══════════════════╦════════╦═══════════════╦═══════════════╦══════════════╣', 'cyan');
    log('║ # ║ 네이버 ID         ║ 상태   ║ 카페 (사용/제한) ║ 블로그 (사용/제한) ║ 메모         ║', 'cyan');
    log('╠═══╬═══════════════════╬════════╬═══════════════╬═══════════════╬══════════════╣', 'cyan');

    for (const acc of data) {
      const status = acc.status === 'active' ? `${colors.green}활성${colors.cyan}` : `${colors.red}중지${colors.cyan}`;
      const cafeInfo = `${acc.today_cafe_count}/${acc.daily_cafe_limit}`;
      const blogInfo = `${acc.today_blog_count}/${acc.daily_blog_limit}`;
      const memoShort = acc.memo ? acc.memo.substring(0, 10) : '';

      console.log(
        `${colors.cyan}║${colors.reset} ${String(acc.id).padEnd(1)} ` +
        `${colors.cyan}║${colors.reset} ${acc.naver_id.padEnd(17)} ` +
        `${colors.cyan}║${colors.reset} ${status.padEnd(6)} ` +
        `${colors.cyan}║${colors.reset} ${cafeInfo.padStart(13)} ` +
        `${colors.cyan}║${colors.reset} ${blogInfo.padStart(13)} ` +
        `${colors.cyan}║${colors.reset} ${memoShort.padEnd(12)} ${colors.cyan}║${colors.reset}`
      );
    }

    log('╚═══╩═══════════════════╩════════╩═══════════════╩═══════════════╩══════════════╝\n', 'cyan');
    log(`총 ${data.length}개 계정`, 'gray');

  } catch (err) {
    log(`❌ 오류: ${err.message}`, 'red');
  }
}

// === 계정 상태 변경 ===
async function changeStatus(args) {
  const [accountId, newStatus] = args;

  if (!accountId) {
    log('사용법: node manage_accounts.js status <accountId> [active|suspended]', 'yellow');
    return;
  }

  const status = newStatus || (newStatus === 'suspended' ? 'suspended' : 'active');

  try {
    const { error } = await supabase
      .from('naver_accounts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', accountId);

    if (error) throw error;
    log(`✅ 계정 ${accountId} 상태 변경: ${status}`, 'green');
  } catch (err) {
    log(`❌ 오류: ${err.message}`, 'red');
  }
}

// === 계정 삭제 ===
async function deleteAccount(args) {
  const [accountId] = args;

  if (!accountId) {
    log('사용법: node manage_accounts.js delete <accountId>', 'yellow');
    return;
  }

  const rl = createReadline();
  const confirm = await ask(rl, `정말 계정 ${accountId}를 삭제하시겠습니까? (yes/no)`);
  rl.close();

  if (confirm.toLowerCase() !== 'yes') {
    log('취소되었습니다.', 'yellow');
    return;
  }

  try {
    const { error } = await supabase
      .from('naver_accounts')
      .delete()
      .eq('id', accountId);

    if (error) throw error;
    log(`✅ 계정 ${accountId} 삭제 완료`, 'green');
  } catch (err) {
    log(`❌ 오류: ${err.message}`, 'red');
  }
}

// === 다중 계정 추가 (CSV 형식) ===
async function addMultiple() {
  const rl = createReadline();

  log('\n╔════════════════════════════════════════╗', 'green');
  log('║     다중 계정 등록                     ║', 'green');
  log('╚════════════════════════════════════════╝\n', 'green');
  log('형식: id,pw,blogId,cafeUrl,memo (한 줄에 하나씩)', 'gray');
  log('예시: user1,pass1,blog1,https://cafe...,메모', 'gray');
  log('입력 완료 후 빈 줄 입력하면 종료\n', 'gray');

  const accounts = [];

  const askLine = () => {
    return new Promise(resolve => {
      rl.question(`${colors.cyan}계정 ${accounts.length + 1}: ${colors.reset}`, answer => {
        resolve(answer.trim());
      });
    });
  };

  while (true) {
    const line = await askLine();
    if (!line) break;

    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 2) {
      log('⚠️ 최소 id,pw는 필요합니다.', 'yellow');
      continue;
    }

    const [naverId, naverPw, blogId, cafeUrl, ...memoArr] = parts;
    accounts.push({
      naver_id: naverId,
      naver_pw: naverPw,
      blog_id: blogId || naverId,
      cafe_url: cafeUrl || null,
      memo: memoArr.join(',') || null
    });
    log(`   ✓ ${naverId} 추가됨`, 'green');
  }

  rl.close();

  if (accounts.length === 0) {
    log('등록할 계정이 없습니다.', 'yellow');
    return;
  }

  log(`\n${accounts.length}개 계정 등록 중...`, 'cyan');

  let success = 0;
  let failed = 0;

  for (const acc of accounts) {
    try {
      const { error } = await supabase
        .from('naver_accounts')
        .insert(acc);

      if (error) {
        if (error.code === '23505') {
          log(`   ✗ ${acc.naver_id}: 이미 존재`, 'yellow');
        } else {
          log(`   ✗ ${acc.naver_id}: ${error.message}`, 'red');
        }
        failed++;
      } else {
        log(`   ✓ ${acc.naver_id}: 등록 완료`, 'green');
        success++;
      }
    } catch (err) {
      log(`   ✗ ${acc.naver_id}: ${err.message}`, 'red');
      failed++;
    }
  }

  log(`\n완료: 성공 ${success}건, 실패 ${failed}건`, success > 0 ? 'green' : 'yellow');
}

// === 메뉴 ===
function showHelp() {
  log('\n╔════════════════════════════════════════╗', 'cyan');
  log('║     네이버 계정 관리 도구              ║', 'cyan');
  log('╚════════════════════════════════════════╝\n', 'cyan');
  log('사용법: node manage_accounts.js <command>\n', 'bright');
  log('Commands:', 'yellow');
  log('  add       새 계정 추가 (대화형)');
  log('  multi     다중 계정 추가 (CSV 형식)');
  log('  quick     빠른 추가: quick <id> <pw> [blogId] [cafeUrl] [memo]');
  log('  list      계정 목록 조회');
  log('  status    상태 변경: status <id> [active|suspended]');
  log('  delete    계정 삭제: delete <id>');
  log('\n예시:', 'gray');
  log('  node manage_accounts.js add');
  log('  node manage_accounts.js quick user1 pass1');
  log('  node manage_accounts.js list');
  log('');
}

// === Main ===
async function main() {
  const [,, command, ...args] = process.argv;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 설정되지 않았습니다.', 'red');
    log('.env 파일을 확인하세요.', 'gray');
    process.exit(1);
  }

  switch (command) {
    case 'add':
      await addAccountInteractive();
      break;
    case 'multi':
      await addMultiple();
      break;
    case 'quick':
      await addAccountQuick(args);
      break;
    case 'list':
      await listAccounts();
      break;
    case 'status':
      await changeStatus(args);
      break;
    case 'delete':
      await deleteAccount(args);
      break;
    default:
      showHelp();
  }

  process.exit(0);
}

main().catch(err => {
  log(`❌ 치명적 오류: ${err.message}`, 'red');
  process.exit(1);
});
