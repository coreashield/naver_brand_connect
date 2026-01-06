import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();

// 카테고리 목록
const CATEGORIES = [
  '가전', '디지털/컴퓨터', '여성패션', '남성패션', '패션잡화',
  '화장품/미용', '생활/건강', '식품', '가구/인테리어', '출산/육아',
  '여가/여행', '스포츠/레저', '취미/펫', '도서'
];

const CATEGORY_URL = 'https://brandconnect.naver.com/904249244338784/affiliate/products/category';
const OUTPUT_DIR = 'output';
const ISSUED_LOG = `${OUTPUT_DIR}/issued_links.json`;

// 발급 기록 로드
function loadIssuedLog() {
  try {
    if (fs.existsSync(ISSUED_LOG)) {
      return JSON.parse(fs.readFileSync(ISSUED_LOG, 'utf-8'));
    }
  } catch (e) {}
  return { lastRun: null, totalIssued: 0, sessions: [] };
}

// 발급 기록 저장
function saveIssuedLog(log) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.writeFileSync(ISSUED_LOG, JSON.stringify(log, null, 2), 'utf-8');
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   자동 링크 발급기                     ║');
  console.log('║   모든 카테고리의 미발급 상품 처리     ║');
  console.log('║   Ctrl+C로 종료                        ║');
  console.log('╚════════════════════════════════════════╝\n');

  const issuedLog = loadIssuedLog();
  let sessionIssued = 0;

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    // 1. 로그인
    console.log('[1/3] 네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(3000);
    console.log('  ✅ 로그인 완료\n');

    // 2. 카테고리 페이지로 이동
    console.log('[2/3] 카테고리 페이지 이동...');
    await page.goto(CATEGORY_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('  ✅ 페이지 로드 완료\n');

    // 3. 각 카테고리 순회
    console.log('[3/3] 링크 발급 시작...\n');

    for (const category of CATEGORIES) {
      console.log(`\n════════════════════════════════════════`);
      console.log(`📂 카테고리: ${category}`);
      console.log(`════════════════════════════════════════`);

      // 카테고리 탭 클릭
      try {
        const categoryTab = await page.$(`[role="tab"]:has-text("${category}")`);
        if (categoryTab) {
          await categoryTab.click();
          await page.waitForTimeout(1500);
        } else {
          console.log(`  ⚠️ 카테고리 탭을 찾을 수 없음: ${category}`);
          continue;
        }
      } catch (e) {
        console.log(`  ⚠️ 카테고리 전환 오류: ${e.message}`);
        continue;
      }

      // 스크롤해서 모든 상품 로드
      let prevHeight = 0;
      for (let i = 0; i < 50; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(200);

        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === prevHeight) {
          await page.waitForTimeout(500);
          const newHeight = await page.evaluate(() => document.body.scrollHeight);
          if (newHeight === currentHeight) break;
        }
        prevHeight = currentHeight;
      }

      // 스크롤 위로
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // "링크 발급" 버튼 찾기
      let issuedInCategory = 0;
      let processedCount = 0;

      while (true) {
        // 현재 페이지에서 "링크 발급" 버튼 찾기
        const issueButtons = await page.$$('button:has-text("링크 발급")');

        if (issueButtons.length === 0) {
          console.log(`  ✅ ${category}: 발급할 상품 없음 (이미 모두 발급됨)`);
          break;
        }

        // 첫 번째 버튼 클릭
        const btn = issueButtons[0];

        try {
          // 버튼이 보이도록 스크롤
          await btn.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);

          // 상품명 가져오기 (부모 요소에서)
          let productName = '';
          try {
            const listItem = await btn.evaluateHandle(el => el.closest('li') || el.closest('[class*="item"]'));
            productName = await listItem.evaluate(el => {
              const link = el.querySelector('a');
              return link ? link.textContent.substring(0, 40) : '';
            });
          } catch (e) {}

          // 클릭
          await btn.click();
          await page.waitForTimeout(800);

          // 모달 확인 버튼 클릭
          const confirmBtn = await page.$('button:has-text("확인")');
          if (confirmBtn) {
            await confirmBtn.click();
            await page.waitForTimeout(500);
          }

          issuedInCategory++;
          sessionIssued++;
          processedCount++;

          console.log(`    ✅ [${processedCount}] 발급: ${productName || '(상품명 미확인)'}...`);

          // 너무 빠른 요청 방지
          await page.waitForTimeout(300);

        } catch (e) {
          console.log(`    ⚠️ 버튼 클릭 오류: ${e.message}`);
          // 페이지 새로고침 후 재시도
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForTimeout(2000);
          break;
        }

        // 100개마다 잠시 쉬기
        if (processedCount % 100 === 0) {
          console.log(`    ⏳ ${processedCount}개 처리 완료, 잠시 대기...`);
          await page.waitForTimeout(3000);
        }
      }

      console.log(`  📊 ${category} 완료: ${issuedInCategory}개 발급`);
    }

    // 결과 저장
    issuedLog.lastRun = new Date().toISOString();
    issuedLog.totalIssued += sessionIssued;
    issuedLog.sessions.push({
      date: new Date().toISOString(),
      issued: sessionIssued
    });
    saveIssuedLog(issuedLog);

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   링크 발급 완료!                      ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║   이번 세션: ${sessionIssued}개 발급`);
    console.log(`║   누적 발급: ${issuedLog.totalIssued}개`);
    console.log('╚════════════════════════════════════════╝\n');

    // link_crawler.js 실행 안내
    console.log('💡 이제 link_crawler.js를 실행하여 발급된 링크를 수집하세요:');
    console.log('   node link_crawler.js\n');

  } catch (error) {
    console.error('\n❌ 오류:', error.message);

    // 중간 저장
    issuedLog.lastRun = new Date().toISOString();
    issuedLog.totalIssued += sessionIssued;
    if (sessionIssued > 0) {
      issuedLog.sessions.push({
        date: new Date().toISOString(),
        issued: sessionIssued,
        error: error.message
      });
    }
    saveIssuedLog(issuedLog);

  } finally {
    await browser.close();
  }
}

main();
