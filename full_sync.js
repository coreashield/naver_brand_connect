import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import { getAccountById } from './src/supabase/db.js';

dotenv.config();

// Supabase에서 계정 정보 가져오기 (ACCOUNT_ID=1 사용)
const ACCOUNT_ID = parseInt(process.env.ACCOUNT_ID) || 1;
let NAVER_ID, NAVER_PW;

async function loadAccount() {
  const account = await getAccountById(ACCOUNT_ID);
  if (!account) {
    throw new Error(`계정 ID ${ACCOUNT_ID}를 찾을 수 없습니다. naver_accounts 테이블을 확인하세요.`);
  }
  NAVER_ID = account.naver_id;
  NAVER_PW = account.naver_pw;
  console.log(`  📧 계정: ${NAVER_ID}`);
}

// URLs
const CATEGORY_URL = 'https://brandconnect.naver.com/904249244338784/affiliate/products/category';
const LINKS_URL = 'https://brandconnect.naver.com/904249244338784/affiliate/products-link?persist=true';

// 카테고리 목록
const CATEGORIES = [
  '가전', '디지털/컴퓨터', '여성패션', '남성패션', '패션잡화',
  '화장품/미용', '생활/건강', '식품', '가구/인테리어', '출산/육아',
  '여가/여행', '스포츠/레저', '취미/펫', '도서'
];

const OUTPUT_DIR = 'output';
const OUTPUT_FILE = `${OUTPUT_DIR}/product_links.json`;
const OUTPUT_CSV = `${OUTPUT_DIR}/product_links.csv`;
const SYNC_LOG = `${OUTPUT_DIR}/sync_log.json`;

// 기존 데이터 로드
function loadExistingProducts() {
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      return new Map(data.map(p => [p.productId, p]));
    }
  } catch (e) {}
  return new Map();
}

// 결과 저장
function saveResults(productsMap) {
  const products = Array.from(productsMap.values());

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // JSON 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2), 'utf-8');

  // CSV 저장
  const csvHeader = '상품ID,상품명,스토어,할인가,원가,수수료,상태,상품URL,어필리에이트링크,수집일시\n';
  const csvRows = products.map(p =>
    `"${p.productId}","${p.name.replace(/"/g, '""')}","${p.store}","${p.price}","${p.originalPrice}","${p.commission}","${p.status}","${p.productUrl}","${p.affiliateLink}","${p.crawledAt}"`
  ).join('\n');
  fs.writeFileSync(OUTPUT_CSV, '\uFEFF' + csvHeader + csvRows, 'utf-8');

  return products.length;
}

// 동기화 로그 저장
function saveSyncLog(log) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  fs.writeFileSync(SYNC_LOG, JSON.stringify(log, null, 2), 'utf-8');
}

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Full Sync - 링크 발급 + 크롤링 통합          ║');
  console.log('║   1. 모든 카테고리에서 신규 상품 링크 발급     ║');
  console.log('║   2. 발급 링크 관리에서 데이터 수집            ║');
  console.log('║   3. product_links.json 업데이트               ║');
  console.log('║   Ctrl+C로 종료                                ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const syncLog = {
    startTime: new Date().toISOString(),
    issued: 0,
    crawled: 0,
    total: 0
  };

  const browser = await chromium.launch({
    headless: false,
    slowMo: 30
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    permissions: ['clipboard-read', 'clipboard-write']
  });

  const page = await context.newPage();

  try {
    // ===== 1. 로그인 =====
    console.log('═══════════════════════════════════════════════');
    console.log('[1/3] 네이버 로그인');
    console.log('═══════════════════════════════════════════════\n');

    // Supabase에서 계정 정보 로드
    await loadAccount();

    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(3000);
    console.log('  ✅ 로그인 완료\n');

    // ===== 2. 링크 발급 =====
    console.log('═══════════════════════════════════════════════');
    console.log('[2/3] 신규 상품 링크 발급');
    console.log('═══════════════════════════════════════════════\n');

    await page.goto(CATEGORY_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    let totalIssued = 0;

    for (const category of CATEGORIES) {
      console.log(`\n📂 ${category}`);

      // 카테고리 탭 클릭
      try {
        const categoryTab = await page.$(`[role="tab"]:has-text("${category}")`);
        if (categoryTab) {
          await categoryTab.click();
          await page.waitForTimeout(1500);
        } else {
          console.log(`  ⚠️ 탭 없음`);
          continue;
        }
      } catch (e) {
        console.log(`  ⚠️ 전환 오류`);
        continue;
      }

      // 스크롤해서 모든 상품 로드
      let prevHeight = 0;
      for (let i = 0; i < 30; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(150);
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === prevHeight) break;
        prevHeight = currentHeight;
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      // "링크 발급" 버튼 처리
      let categoryIssued = 0;
      let maxAttempts = 200; // 카테고리당 최대 200개

      while (maxAttempts-- > 0) {
        const issueButtons = await page.$$('button:has-text("링크 발급")');
        if (issueButtons.length === 0) break;

        try {
          const btn = issueButtons[0];
          await btn.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          await btn.click();
          await page.waitForTimeout(600);

          const confirmBtn = await page.$('button:has-text("확인")');
          if (confirmBtn) {
            await confirmBtn.click();
            await page.waitForTimeout(300);
          }

          categoryIssued++;
          totalIssued++;

          if (categoryIssued % 20 === 0) {
            console.log(`    ${categoryIssued}개 발급...`);
          }
        } catch (e) {
          break;
        }
      }

      console.log(`  ✅ ${categoryIssued}개 발급`);
    }

    syncLog.issued = totalIssued;
    console.log(`\n📊 총 ${totalIssued}개 링크 발급 완료\n`);

    // ===== 3. 크롤링 =====
    console.log('═══════════════════════════════════════════════');
    console.log('[3/3] 발급 링크 수집 및 저장');
    console.log('═══════════════════════════════════════════════\n');

    const productsMap = loadExistingProducts();
    console.log(`  기존 데이터: ${productsMap.size}개\n`);

    await page.goto(LINKS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    let pageNum = 1;
    let totalNew = 0;

    while (true) {
      console.log(`  [페이지 ${pageNum}] 수집 중...`);

      // 스크롤
      let prevHeight = 0;
      for (let i = 0; i < 30; i++) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(150);
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === prevHeight) break;
        prevHeight = currentHeight;
      }

      // 테이블에서 데이터 추출
      const rows = await page.$$('tr');
      let newCount = 0;

      for (const row of rows) {
        try {
          const productLink = await row.$('a[href*="/products/"]');
          if (!productLink) continue;

          const href = await productLink.getAttribute('href');
          const productIdMatch = href.match(/products\/(\d+)/);
          if (!productIdMatch) continue;

          const productId = productIdMatch[1];
          const rowText = await row.innerText();
          const lines = rowText.split('\t').map(l => l.trim());

          const productName = lines[0]?.split('\n')[0]?.trim() || '';
          if (!productName || productName.includes('상품명')) continue;

          if (productsMap.has(productId)) continue;

          const storeName = lines[1]?.trim() || '';
          const priceText = lines[2] || '';
          const prices = priceText.match(/[\d,]+원/g) || [];
          const discountPrice = prices[0] || '';
          const originalPrice = prices[1] || '';
          const commission = lines[3]?.match(/\d+%/)?.[0] || '';
          const status = rowText.includes('ON') ? 'ON' : 'OFF';

          // 복사 버튼 클릭
          let affiliateLink = '';
          const copyBtn = await row.$('button:has-text("복사")');
          if (copyBtn) {
            await copyBtn.click();
            await page.waitForTimeout(300);
            try {
              affiliateLink = await page.evaluate(() => navigator.clipboard.readText());
            } catch (e) {}
          }

          productsMap.set(productId, {
            productId,
            name: productName,
            store: storeName,
            price: discountPrice,
            originalPrice,
            commission,
            status,
            productUrl: href.startsWith('http') ? href : `https://brandconnect.naver.com${href}`,
            affiliateLink,
            crawledAt: new Date().toISOString()
          });

          newCount++;
          totalNew++;

        } catch (e) {}
      }

      console.log(`    신규 ${newCount}개`);
      saveResults(productsMap);

      // 다음 페이지
      const nextBtn = await page.$('button[aria-label="다음 페이지"], button:has-text("다음")');
      let hasNext = false;

      if (nextBtn) {
        const isDisabled = await nextBtn.evaluate(el =>
          el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true'
        );
        if (!isDisabled) {
          hasNext = true;
          await nextBtn.click();
          await page.waitForTimeout(2000);
          pageNum++;
        }
      }

      if (!hasNext) {
        const nextPageBtn = await page.$(`button:has-text("${pageNum + 1}")`);
        if (nextPageBtn) {
          await nextPageBtn.click();
          await page.waitForTimeout(2000);
          pageNum++;
        } else {
          break;
        }
      }
    }

    // 최종 저장
    const total = saveResults(productsMap);
    syncLog.crawled = totalNew;
    syncLog.total = total;
    syncLog.endTime = new Date().toISOString();
    saveSyncLog(syncLog);

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   Full Sync 완료!                              ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║   링크 발급: ${syncLog.issued}개`);
    console.log(`║   신규 수집: ${syncLog.crawled}개`);
    console.log(`║   전체 상품: ${syncLog.total}개`);
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log(`📁 저장 위치: ${OUTPUT_FILE}`);
    console.log(`📁 CSV 파일: ${OUTPUT_CSV}\n`);

  } catch (error) {
    console.error('\n❌ 오류:', error.message);
    syncLog.error = error.message;
    syncLog.endTime = new Date().toISOString();
    saveSyncLog(syncLog);
  } finally {
    await browser.close();
  }
}

main();
