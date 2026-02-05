/**
 * 발급 링크 동기화 스크립트
 *
 * Brand Connect에서 발급된 ON 상태 링크를 DB와 동기화
 * - DB에 없는 상품: INSERT
 * - DB에 있는 상품: affiliate_link 업데이트 (옵션)
 *
 * 사용법: node sync_issued_links.js [--dry-run] [--force-update]
 *   --dry-run: 실제 저장하지 않고 결과만 출력
 *   --force-update: 기존 상품도 affiliate_link 업데이트
 */

import { chromium } from 'playwright';
import {
  supabase,
  testConnection,
  getAccountById,
  upsertProduct
} from './src/supabase/db.js';
import dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_ID = 1;
const CAMPAIGN_ID = '904249244338784';
const LINKS_URL = `https://brandconnect.naver.com/${CAMPAIGN_ID}/affiliate/products-link?persist=true`;

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_UPDATE = process.argv.includes('--force-update');

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

/**
 * 네이버 로그인
 */
async function naverLogin(page, account) {
  log('네이버 로그인 시작...');

  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.click('#id');
  await page.keyboard.type(account.naver_id, { delay: 50 });
  await page.click('#pw');
  await page.keyboard.type(account.naver_pw, { delay: 50 });
  await page.click('#log\\.login');
  await page.waitForTimeout(3000);

  if (page.url().includes('nidlogin') || page.url().includes('captcha')) {
    log('⚠️  CAPTCHA 감지! 수동으로 해결 후 엔터키를 누르세요...');
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }

  log('✅ 로그인 완료');
}

/**
 * ON 상품 목록 수집 (affiliate_link 포함)
 */
async function collectOnProducts(page) {
  log('발급 링크 관리 페이지로 이동...');
  await page.goto(LINKS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 진행 상태 필터를 ON으로 변경 (기본값이 ON일 수 있음)
  log('진행 상태 필터 확인...');
  try {
    const filterBtn = await page.locator('button:has-text("진행 상태")').first();
    await filterBtn.click();
    await page.waitForTimeout(1000);

    const onOption = await page.locator('role=option[name="ON"]');
    if (await onOption.isVisible()) {
      await onOption.click();
      log('  ✅ ON 필터 적용됨');
    }
    await page.waitForTimeout(2000);
  } catch (e) {
    log('  ℹ️ 필터 이미 ON 상태이거나 기본값 사용');
  }

  // 총 개수 확인
  let totalCount = 0;
  try {
    const countText = await page.locator('strong:has(em), strong:has(emphasis)').first().textContent();
    const match = countText.match(/(\d[\d,]*)/);
    if (match) {
      totalCount = parseInt(match[1].replace(/,/g, ''));
    }
  } catch (e) {
    const rows = await page.locator('table tbody tr').count();
    totalCount = rows;
  }

  log(`📊 ON 상품 총 ${totalCount}개 발견`);

  if (totalCount === 0) {
    return [];
  }

  const onProducts = [];
  const collectedIds = new Set();
  let pageNum = 1;
  let hasMore = true;

  while (hasMore) {
    log(`  [페이지 ${pageNum}] 수집 중...`);

    // 스크롤하며 데이터 로드
    let prevHeight = 0;
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(150);
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === prevHeight) break;
      prevHeight = currentHeight;
    }

    // 테이블 행에서 데이터 추출
    const rows = await page.$$('table tbody tr');
    let newCount = 0;

    for (const row of rows) {
      try {
        // productId 추출 (링크에서)
        const productLink = await row.$('a[href*="/products/"]');
        if (!productLink) continue;

        const href = await productLink.getAttribute('href');
        const productIdMatch = href.match(/products\/(\d+)/);
        if (!productIdMatch) continue;

        const productId = productIdMatch[1];

        // 중복 체크
        if (collectedIds.has(productId)) continue;

        // 행 텍스트 추출
        const rowText = await row.innerText();
        const lines = rowText.split('\t').map(l => l.trim());

        // 상품명
        const productName = lines[0]?.split('\n')[0]?.trim() || '';
        if (!productName || productName.includes('상품명')) continue;

        // 진행 상태 확인 (ON만)
        if (!rowText.includes('ON')) continue;

        // 스토어명
        const storeName = lines[1]?.trim() || '';

        // 가격 정보
        const priceText = lines[2] || '';
        const prices = priceText.match(/[\d,]+원/g) || [];
        const price = prices[0] || '';
        const originalPrice = prices[1] || '';

        // 수수료
        const commission = lines[3]?.match(/\d+%/)?.[0] || '';

        // affiliate_link 추출 (복사 버튼 클릭)
        let affiliateLink = '';
        const copyBtn = await row.$('button:has-text("복사")');
        if (copyBtn) {
          try {
            await copyBtn.click();
            await page.waitForTimeout(300);
            affiliateLink = await page.evaluate(() => navigator.clipboard.readText());
          } catch (e) {
            // 클립보드 접근 실패 시 스킵
          }
        }

        collectedIds.add(productId);
        onProducts.push({
          productId,
          name: productName,
          store: storeName,
          price,
          originalPrice,
          commission,
          status: 'ON',
          productUrl: href.startsWith('http') ? href : `https://brandconnect.naver.com${href}`,
          affiliateLink
        });
        newCount++;

      } catch (e) {
        // 개별 행 처리 오류는 무시
      }
    }

    log(`    수집: ${newCount}개 (중복 제외)`);

    // 다음 페이지 이동
    const nextPageNum = pageNum + 1;
    let foundNextPage = false;

    // 방법 1: 다음 페이지 번호 버튼 찾기
    const pageButtons = await page.$$('nav[aria-label="페이지 탐색"] button');
    for (const btn of pageButtons) {
      const text = await btn.textContent();
      if (text.trim() === String(nextPageNum)) {
        await btn.click();
        await page.waitForTimeout(2000);
        pageNum++;
        foundNextPage = true;
        break;
      }
    }

    // 방법 2: 다음 페이지 번호가 없으면 "다음 페이지" 버튼 사용
    if (!foundNextPage) {
      const nextBtn = await page.$('button[aria-label="다음 페이지"]:not([disabled])');
      if (nextBtn) {
        const isDisabled = await nextBtn.evaluate(el =>
          el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true'
        );
        if (!isDisabled) {
          await nextBtn.click();
          await page.waitForTimeout(2000);
          pageNum++;
          foundNextPage = true;
        }
      }
    }

    if (!foundNextPage) {
      hasMore = false;
    }
  }

  return onProducts;
}

/**
 * DB와 동기화
 */
async function syncWithDatabase(onProducts) {
  log(`\n📦 DB 동기화 시작 (${onProducts.length}개 ON 상품)...`);

  // 기존 DB 상품 ID 조회
  const { data: existingProducts, error } = await supabase
    .from('products')
    .select('product_id, affiliate_link');

  if (error) {
    log(`❌ DB 조회 오류: ${error.message}`);
    return { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  }

  const existingMap = new Map();
  for (const p of existingProducts || []) {
    existingMap.set(p.product_id, p.affiliate_link);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of onProducts) {
    const exists = existingMap.has(product.productId);
    const existingAffLink = existingMap.get(product.productId);

    if (!exists) {
      // DB에 없음 → INSERT
      if (!DRY_RUN) {
        const { error: insertError } = await supabase
          .from('products')
          .insert({
            product_id: product.productId,
            name: product.name,
            store: product.store,
            price: product.price,
            original_price: product.originalPrice,
            commission: product.commission,
            status: product.status,
            product_url: product.productUrl,
            affiliate_link: product.affiliateLink,
            naver_shopping_url: null
          });

        if (insertError) {
          log(`  ❌ INSERT 실패 [${product.productId}]: ${insertError.message}`);
          failed++;
          continue;
        }
      }
      log(`  ➕ INSERT: ${product.name.substring(0, 40)}...`);
      inserted++;

    } else if (FORCE_UPDATE && product.affiliateLink && product.affiliateLink !== existingAffLink) {
      // DB에 있고 force-update 모드 → affiliate_link 업데이트
      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ affiliate_link: product.affiliateLink })
          .eq('product_id', product.productId);

        if (updateError) {
          log(`  ❌ UPDATE 실패 [${product.productId}]: ${updateError.message}`);
          failed++;
          continue;
        }
      }
      log(`  🔄 UPDATE: ${product.name.substring(0, 40)}...`);
      updated++;

    } else {
      // 이미 존재하고 업데이트 불필요
      skipped++;
    }
  }

  return { inserted, updated, skipped, failed };
}

/**
 * 메인 실행
 */
async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   발급 링크 동기화 스크립트                      ║');
  console.log('║   Brand Connect ON 상품 → DB 동기화             ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  if (DRY_RUN) {
    log('🔍 DRY-RUN 모드: 실제 저장하지 않고 결과만 확인합니다.\n');
  }
  if (FORCE_UPDATE) {
    log('🔄 FORCE-UPDATE 모드: 기존 상품의 affiliate_link도 업데이트합니다.\n');
  }

  // DB 연결 테스트
  log('DB 연결 테스트...');
  const connTest = await testConnection();
  if (!connTest.success) {
    log(`❌ DB 연결 실패: ${connTest.error}`);
    process.exit(1);
  }
  log(`✅ DB 연결 성공 (현재 상품: ${connTest.productCount}개)\n`);

  // 계정 로드
  const account = await getAccountById(ACCOUNT_ID);
  if (!account) {
    log(`❌ 계정 ID ${ACCOUNT_ID}를 찾을 수 없습니다.`);
    process.exit(1);
  }
  log(`✅ 계정: ${account.naver_id}\n`);

  // 브라우저 시작
  const browser = await chromium.launch({
    headless: false,
    slowMo: 20
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    permissions: ['clipboard-read', 'clipboard-write']
  });

  const page = await context.newPage();

  try {
    // 로그인
    await naverLogin(page, account);

    // ON 상품 수집
    const onProducts = await collectOnProducts(page);

    if (onProducts.length === 0) {
      log('\n✅ 수집된 ON 상품이 없습니다!');
      return;
    }

    log(`\n📋 수집된 ON 상품: ${onProducts.length}개`);
    log(`   - affiliate_link 있음: ${onProducts.filter(p => p.affiliateLink).length}개`);

    // DB 동기화
    const result = await syncWithDatabase(onProducts);

    // 결과 출력
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   동기화 완료                                    ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║   ON 상품 수집: ${onProducts.length}개`);
    console.log(`║   신규 추가: ${result.inserted}개`);
    if (FORCE_UPDATE) {
      console.log(`║   업데이트: ${result.updated}개`);
    }
    console.log(`║   기존 스킵: ${result.skipped}개`);
    if (result.failed > 0) {
      console.log(`║   실패: ${result.failed}개`);
    }
    console.log('╚════════════════════════════════════════════════╝\n');

    if (result.inserted > 0 && !DRY_RUN) {
      log('💡 신규 추가된 상품은 naver_shopping_url이 없습니다.');
      log('   enrich.bat을 실행하여 URL을 수집하세요.\n');
    }

  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

// 실행
main().catch(console.error);
