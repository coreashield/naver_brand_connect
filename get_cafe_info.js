import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const CAFE_URL = 'https://cafe.naver.com/todaydeuktem';

async function getCafeInfo() {
  console.log('카페 정보 수집 중...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    // 로그인
    console.log('[1/3] 네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(5000);
    console.log('  ✅ 로그인 완료\n');

    // 카페 페이지 이동
    console.log('[2/3] 카페 페이지 이동...');
    await page.goto(CAFE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 카페 정보 추출
    console.log('[3/3] 카페 정보 추출...\n');

    // 메인 페이지에서 카페 ID 추출
    const pageContent = await page.content();

    // 카페 ID 패턴 찾기
    const cafeIdPatterns = [
      /clubid=(\d+)/,
      /cafe\.naver\.com\/(\d+)/,
      /cafes\/(\d+)/,
      /"clubId":(\d+)/,
      /"cafeId":(\d+)/
    ];

    console.log('=== 카페 ID 검색 ===');
    for (const pattern of cafeIdPatterns) {
      const match = pageContent.match(pattern);
      if (match) {
        console.log(`  ✅ 패턴 ${pattern}: ${match[1]}`);
      }
    }

    // iframe 내 모든 링크 확인
    console.log('\n=== iframe 내 글쓰기 관련 링크 ===');
    const cafeMainFrame = page.frameLocator('#cafe_main');

    try {
      const allLinks = await cafeMainFrame.locator('a[href]').all();
      console.log(`  총 링크 수: ${allLinks.length}`);

      for (const link of allLinks) {
        const href = await link.getAttribute('href');
        const text = await link.innerText().catch(() => '');
        if (href && (href.includes('write') || href.includes('Write') || text.includes('글쓰기'))) {
          console.log(`  ✅ "${text.trim().substring(0, 20)}" -> ${href}`);
        }
      }
    } catch (e) {
      console.log('  링크 추출 실패:', e.message);
    }

    // 글쓰기 가능한 모든 버튼/링크
    console.log('\n=== 모든 버튼 확인 ===');
    try {
      const allButtons = await cafeMainFrame.locator('button, a.btn, [class*="btn"]').all();
      console.log(`  총 버튼 수: ${allButtons.length}`);

      for (const btn of allButtons.slice(0, 20)) {
        const text = await btn.innerText().catch(() => '');
        const cls = await btn.getAttribute('class') || '';
        if (text.trim()) {
          console.log(`  "${text.trim().substring(0, 15)}" (${cls.substring(0, 30)})`);
        }
      }
    } catch (e) {}

    // 페이지 스크린샷
    await page.screenshot({ path: 'output/cafe_screenshot.png', fullPage: true });
    console.log('\n스크린샷 저장: output/cafe_screenshot.png');

    // 새 탭에서 직접 글쓰기 URL 시도
    console.log('\n=== 직접 글쓰기 URL 테스트 ===');
    const testUrls = [
      'https://cafe.naver.com/todaydeuktem/write',
      'https://cafe.naver.com/ca-fe/todaydeuktem/articles/write',
      'https://m.cafe.naver.com/ca-fe/todaydeuktem/articles/write'
    ];

    for (const url of testUrls) {
      try {
        console.log(`  시도: ${url}`);
        const testPage = await context.newPage();
        await testPage.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        const finalUrl = testPage.url();
        console.log(`    결과: ${finalUrl}`);
        await testPage.close();
      } catch (e) {
        console.log(`    실패: ${e.message.substring(0, 50)}`);
      }
    }

    console.log('\n완료! 브라우저를 확인하고 글쓰기 버튼을 눌러보세요.');
    console.log('URL이 바뀌면 그 URL을 알려주세요.');
    console.log('\n2분 후 자동 종료...');

    await page.waitForTimeout(120000);

  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await browser.close();
  }
}

getCafeInfo();
