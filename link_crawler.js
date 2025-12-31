import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const LINKS_URL = 'https://brandconnect.naver.com/904249244338784/affiliate/products-link?persist=true';

const OUTPUT_DIR = 'output';
const OUTPUT_FILE = `${OUTPUT_DIR}/product_links.json`;
const OUTPUT_CSV = `${OUTPUT_DIR}/product_links.csv`;

// 기존 데이터 로드 (productId 기준 Map - URL 중복 체크용)
function loadExistingProducts() {
  try {
    if (fs.existsSync(OUTPUT_FILE)) {
      const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
      // productId를 키로 사용 (URL 기준 중복 체크)
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

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   발급 링크 수집기 (자동 갱신)         ║');
  console.log('║   Ctrl+C로 종료                        ║');
  console.log('╚════════════════════════════════════════╝\n');

  // 기존 데이터 로드
  const productsMap = loadExistingProducts();
  console.log(`기존 데이터: ${productsMap.size}개\n`);

  const browser = await chromium.launch({
    headless: false,
    slowMo: 10
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    permissions: ['clipboard-read', 'clipboard-write']
  });

  const page = await context.newPage();

  try {
    // 1. 로그인
    console.log('[1/2] 네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(3000);
    console.log('  ✅ 로그인 완료\n');

    // 2. 반복 수집 (전체 페이지 순회)
    let cycle = 0;
    while (true) {
      cycle++;
      console.log(`\n════════════════════════════════════════`);
      console.log(`[사이클 ${cycle}] 전체 페이지 수집 시작 (현재 총 ${productsMap.size}개)`);
      console.log(`════════════════════════════════════════`);

      // 페이지 로드 (항상 1페이지부터 시작)
      await page.goto(LINKS_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      let pageNum = 1;
      let totalNewCount = 0;
      let totalSkipCount = 0;

      // 모든 페이지 순회
      while (true) {
        console.log(`\n  [페이지 ${pageNum}] 수집 중...`);

        // 스크롤하며 현재 페이지 데이터 로드
        let prevHeight = 0;
        for (let i = 0; i < 30; i++) {
          await page.evaluate(() => window.scrollBy(0, 500));
          await page.waitForTimeout(150);

          const currentHeight = await page.evaluate(() => document.body.scrollHeight);
          if (currentHeight === prevHeight) {
            await page.waitForTimeout(300);
            const newHeight = await page.evaluate(() => document.body.scrollHeight);
            if (newHeight === currentHeight) break;
          }
          prevHeight = currentHeight;
        }

        // 테이블에서 데이터 추출
        const rows = await page.$$('tr');
        let newCount = 0;
        let skipCount = 0;

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

            // 상품명
            const productName = lines[0]?.split('\n')[0]?.trim() || '';
            if (!productName || productName.includes('상품명')) continue;

            // productId(URL) 기준 중복 체크
            if (productsMap.has(productId)) {
              skipCount++;
              continue;
            }

            // 스토어명
            const storeName = lines[1]?.trim() || '';

            // 가격 정보
            const priceText = lines[2] || '';
            const prices = priceText.match(/[\d,]+원/g) || [];
            const discountPrice = prices[0] || '';
            const originalPrice = prices[1] || '';

            // 수수료
            const commission = lines[3]?.match(/\d+%/)?.[0] || '';

            // 진행 상태
            const status = rowText.includes('ON') ? 'ON' : 'OFF';

            // 복사 버튼 클릭해서 어필리에이트 링크 가져오기
            let affiliateLink = '';
            const copyBtn = await row.$('button:has-text("복사")');
            if (copyBtn) {
              await copyBtn.click();
              await page.waitForTimeout(300);

              try {
                affiliateLink = await page.evaluate(() => navigator.clipboard.readText());
              } catch (e) {}
            }

            const product = {
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
            };

            console.log(`    ✅ 신규: ${productName.substring(0, 35)}...`);
            newCount++;

            // productId를 키로 저장
            productsMap.set(productId, product);

          } catch (e) {}
        }

        totalNewCount += newCount;
        totalSkipCount += skipCount;
        console.log(`  📊 페이지 ${pageNum}: 신규 ${newCount}, 스킵 ${skipCount}`);

        // 결과 중간 저장
        saveResults(productsMap);

        // 다음 페이지 버튼 찾기
        const nextBtn = await page.$('button[aria-label="다음 페이지"], button:has-text("다음"), a:has-text("다음"), .pagination-next, [class*="next"]:not([disabled])');

        // 페이지 번호로도 시도
        let hasNextPage = false;
        if (nextBtn) {
          const isDisabled = await nextBtn.evaluate(el => el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true');
          if (!isDisabled) {
            hasNextPage = true;
            await nextBtn.click();
            await page.waitForTimeout(2000);
            pageNum++;
          }
        }

        // 다음 페이지 없으면 종료
        if (!hasNextPage) {
          // 페이지 번호 버튼으로 다음 페이지 시도
          const nextPageNumBtn = await page.$(`button:has-text("${pageNum + 1}"), a:has-text("${pageNum + 1}")`);
          if (nextPageNumBtn) {
            await nextPageNumBtn.click();
            await page.waitForTimeout(2000);
            pageNum++;
          } else {
            console.log(`\n  ✅ 마지막 페이지 도달 (총 ${pageNum}페이지)`);
            break;
          }
        }
      }

      // 사이클 결과 요약
      const total = saveResults(productsMap);
      console.log(`\n════════════════════════════════════════`);
      console.log(`[사이클 ${cycle} 완료]`);
      console.log(`  📊 이번 사이클: 신규 ${totalNewCount}, 스킵 ${totalSkipCount}`);
      console.log(`  📦 전체 데이터: ${total}개`);
      console.log(`════════════════════════════════════════`);

      // 30초 대기 후 새로고침 (1페이지부터 다시)
      console.log(`\n⏳ 30초 후 1페이지부터 다시 수집...`);
      await page.waitForTimeout(30000);
    }

  } catch (error) {
    console.error('\n❌ 오류:', error.message);
    saveResults(productsMap);
  } finally {
    await browser.close();
  }
}

main();
