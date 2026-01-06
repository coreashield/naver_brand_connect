import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();

async function analyzeProductList() {
  const productsUrl = 'https://brandconnect.naver.com/904249244338784/affiliate/products';

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 로그인
  console.log('네이버 로그인 중...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('#id');
  await page.keyboard.type(NAVER_ID, { delay: 50 });
  await page.click('#pw');
  await page.keyboard.type(NAVER_PW, { delay: 50 });
  await page.click('#log\\.login');
  await page.waitForTimeout(3000);

  // 상품 목록 페이지 이동
  console.log('상품 목록 페이지로 이동...');
  await page.goto(productsUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  console.log('\n=== 페이지 구조 분석 ===\n');

  // 카테고리/필터 요소 찾기
  const filters = await page.$$eval('[class*="filter"], [class*="Filter"], [class*="category"], [class*="Category"], select, [class*="tab"], [class*="Tab"]', els =>
    els.slice(0, 10).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.innerText?.substring(0, 100)
    }))
  );
  console.log('필터/카테고리 요소:', JSON.stringify(filters, null, 2));

  // 상품 카드/리스트 요소 찾기
  const productCards = await page.$$eval('[class*="product"], [class*="Product"], [class*="item"], [class*="Item"], [class*="card"], [class*="Card"]', els =>
    els.slice(0, 5).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.innerText?.substring(0, 200)
    }))
  );
  console.log('\n상품 카드 요소:', JSON.stringify(productCards, null, 2));

  // 링크 발급 버튼 찾기
  const buttons = await page.$$eval('button', els =>
    els.map(el => ({
      class: el.className,
      text: el.innerText?.substring(0, 50),
      dataName: el.getAttribute('data-name')
    })).filter(b => b.text && b.text.length > 0)
  );
  console.log('\n버튼들:', JSON.stringify(buttons.slice(0, 15), null, 2));

  // 상품 링크들
  const links = await page.$$eval('a[href*="product"]', els =>
    els.slice(0, 10).map(el => ({
      href: el.href,
      text: el.innerText?.substring(0, 50)
    }))
  );
  console.log('\n상품 링크들:', JSON.stringify(links, null, 2));

  // 페이지 전체 텍스트에서 상품 정보 패턴 찾기
  const pageText = await page.innerText('body');
  console.log('\n페이지 일부 텍스트:', pageText.substring(0, 1000));

  // 스크린샷 저장
  await page.screenshot({ path: 'output/products_page.png', fullPage: true });
  console.log('\n스크린샷 저장: output/products_page.png');

  console.log('\n분석 완료. 60초 후 브라우저 종료...');
  await page.waitForTimeout(60000);
  await browser.close();
}

analyzeProductList().catch(console.error);
