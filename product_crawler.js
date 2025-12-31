import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const BASE_URL = 'https://brandconnect.naver.com/904249244338784/affiliate/products';

const OUTPUT_DIR = 'output';
const OUTPUT_FILE = `${OUTPUT_DIR}/product_links.json`;
const OUTPUT_CSV = `${OUTPUT_DIR}/product_links.csv`;

// 이미 수집된 상품 ID 로드
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
  const csvHeader = '상품ID,상품명,가격,할인율,카테고리,상품URL,어필리에이트링크,수집일시\n';
  const csvRows = products.map(p =>
    `"${p.productId}","${p.name.replace(/"/g, '""')}","${p.price}","${p.discountRate}","${p.category}","${p.productUrl}","${p.affiliateLink}","${p.crawledAt}"`
  ).join('\n');
  fs.writeFileSync(OUTPUT_CSV, '\uFEFF' + csvHeader + csvRows, 'utf-8');

  return products.length;
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Brand Connect 상품 크롤러 v2         ║');
  console.log('╚════════════════════════════════════════╝\n');

  // 기존 데이터 로드
  const existingProducts = loadExistingProducts();
  console.log(`기존 수집 데이터: ${existingProducts.size}개\n`);

  const browser = await chromium.launch({
    headless: false,
    slowMo: 20
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

    // 2. 상품 목록 페이지
    console.log('[2/3] 상품 목록 수집...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 스크롤하며 상품 로드 (최대한 많이)
    console.log('  스크롤하며 상품 로드 중...');
    let prevHeight = 0;
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(500);

      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === prevHeight) break;
      prevHeight = currentHeight;
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // 상품 링크 수집
    const productLinks = await page.$$eval('a[href]', links => {
      return links
        .filter(a => /\/affiliate\/products\/\d+$/.test(a.href))
        .map(a => {
          const href = a.href;
          const text = a.innerText;
          const idMatch = href.match(/products\/(\d+)$/);
          return {
            productId: idMatch ? idMatch[1] : null,
            productUrl: href,
            rawText: text
          };
        })
        .filter(p => p.productId);
    });

    // 중복 제거
    const uniqueProducts = [];
    const seenIds = new Set();
    for (const p of productLinks) {
      if (!seenIds.has(p.productId)) {
        seenIds.add(p.productId);
        uniqueProducts.push(p);
      }
    }

    console.log(`  📦 ${uniqueProducts.length}개 상품 발견\n`);

    // 3. 각 상품 링크 발급
    console.log('[3/3] 링크 발급 진행...\n');

    let newCount = 0;
    let skipCount = 0;
    const targetCount = 100;

    for (let i = 0; i < uniqueProducts.length && newCount < targetCount; i++) {
      const product = uniqueProducts[i];

      // 이미 수집된 상품이면 스킵
      if (existingProducts.has(product.productId)) {
        skipCount++;
        continue;
      }

      console.log(`[${newCount + 1}/${targetCount}] 상품 ID: ${product.productId}`);

      try {
        // 상품 상세 페이지로 이동
        await page.goto(product.productUrl, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);

        // 상품 정보 추출
        let productName = '';
        let price = '';
        let discountRate = '';
        let category = '';

        try {
          const infoEl = await page.$('[class*="ProductDetail_info_wrap"], [class*="ProductDetail_section"]');
          if (infoEl) {
            const text = await infoEl.innerText();
            const lines = text.split('\n').filter(l => l.trim());

            if (lines.length >= 2) {
              productName = `${lines[0]} ${lines[1]}`.trim();
            }

            const priceMatch = text.match(/([\d,]+)\s*원/g);
            if (priceMatch && priceMatch.length > 0) {
              price = priceMatch[priceMatch.length - 1];
            }

            const discountMatch = text.match(/(\d+)%/);
            if (discountMatch) {
              discountRate = discountMatch[1] + '%';
            }
          }
        } catch (e) {}

        // 링크 발급 또는 복사
        let affiliateLink = '';

        // "링크 복사" 버튼 확인 (이미 발급됨)
        const copyBtn = await page.$('button:has-text("링크 복사")');
        if (copyBtn) {
          // 이미 발급된 경우 - 복사 버튼 클릭
          await copyBtn.click();
          await page.waitForTimeout(1000);

          // 클립보드에서 읽기 시도
          try {
            affiliateLink = await page.evaluate(() => navigator.clipboard.readText());
          } catch (e) {}

          console.log(`  ✅ 기존 링크 복사 완료`);
        } else {
          // "링크 발급" 버튼 클릭
          const issueBtn = await page.$('button:has-text("링크 발급")');
          if (issueBtn) {
            await issueBtn.click();
            await page.waitForTimeout(2000);

            // 발급 후 "링크 복사" 버튼 나타남
            const newCopyBtn = await page.$('button:has-text("링크 복사")');
            if (newCopyBtn) {
              await newCopyBtn.click();
              await page.waitForTimeout(1000);

              try {
                affiliateLink = await page.evaluate(() => navigator.clipboard.readText());
              } catch (e) {}
            }

            console.log(`  ✅ 새 링크 발급 완료`);
          }
        }

        // 링크를 못 가져왔으면 페이지에서 직접 추출 시도
        if (!affiliateLink) {
          try {
            affiliateLink = await page.$eval('input[readonly], [class*="link"] input', el => el.value);
          } catch (e) {}
        }

        // 데이터 저장
        const productData = {
          productId: product.productId,
          name: productName || `상품_${product.productId}`,
          price,
          discountRate,
          category,
          productUrl: product.productUrl,
          affiliateLink: affiliateLink || '',
          crawledAt: new Date().toISOString()
        };

        existingProducts.set(product.productId, productData);
        newCount++;

        // 10개마다 중간 저장
        if (newCount % 10 === 0) {
          const total = saveResults(existingProducts);
          console.log(`  💾 중간 저장 (총 ${total}개)\n`);
        }

      } catch (error) {
        console.log(`  ⚠️ 오류: ${error.message}`);
      }

      await page.waitForTimeout(300);
    }

    // 최종 저장
    const totalSaved = saveResults(existingProducts);

    console.log('\n╔════════════════════════════════════════╗');
    console.log(`║  ✅ 완료! 신규 ${newCount}개 / 스킵 ${skipCount}개`);
    console.log(`║  📁 총 저장: ${totalSaved}개`);
    console.log('╚════════════════════════════════════════╝');
    console.log(`\n파일 위치: ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('\n❌ 오류:', error.message);
    saveResults(existingProducts);
  } finally {
    await browser.close();
  }
}

main();
