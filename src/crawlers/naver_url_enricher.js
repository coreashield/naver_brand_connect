/**
 * Naver Shopping URL 보강 스크립트
 * Brand Connect 상품 페이지에서 "네이버 쇼핑에서 보기" 링크를 추출하여 DB에 저장
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import {
  getProductsWithoutNaverUrl,
  updateNaverShoppingUrl,
  getNaverUrlStats,
  testConnection,
  deleteProduct
} from '../supabase/db.js';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();

// 설정
const BATCH_SIZE = 100;  // 한 번에 처리할 상품 수
const DELAY_BETWEEN_PRODUCTS = 1500;  // 상품 간 딜레이 (ms) - 빠른 처리
const MAX_RETRIES = 1;  // 최대 재시도 횟수

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

/**
 * Brand Connect 상품 페이지에서 네이버 쇼핑 URL 추출
 * @returns {string|null|'DELETED'} URL, null(못찾음), 'DELETED'(삭제된 상품)
 */
async function extractNaverShoppingUrl(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 삭제된 페이지 확인
    const pageContent = await page.content();
    if (pageContent.includes('삭제되었거나') || pageContent.includes('존재하지 않는 페이지')) {
      return 'DELETED';
    }

    // "네이버 쇼핑에서 보기" 버튼/링크 찾기
    const selectors = [
      'a:has-text("네이버 쇼핑에서 보기")',
      'button:has-text("네이버 쇼핑에서 보기")',
      'a[href*="smartstore.naver.com"]',
      'a[href*="brand.naver.com"]',
      'a[href*="shopping.naver.com/product"]',
      '[class*="shopping"] a',
      '[class*="store"] a[href*="naver"]'
    ];

    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const href = await element.getAttribute('href');
          if (href && isValidNaverShoppingUrl(href)) {
            return href;
          }
        }
      } catch (e) {
        // 셀렉터 실패 시 다음 시도
      }
    }

    // 페이지 내 모든 링크에서 네이버 쇼핑 URL 찾기
    const allLinks = await page.$$eval('a[href]', links =>
      links.map(a => a.href).filter(href =>
        href.includes('smartstore.naver.com') ||
        href.includes('brand.naver.com') ||
        href.includes('shopping.naver.com/product')
      )
    );

    if (allLinks.length > 0) {
      // affiliate 링크가 아닌 것 우선
      const nonAffiliateLink = allLinks.find(url => !url.includes('naver.me'));
      return nonAffiliateLink || allLinks[0];
    }

    return null;
  } catch (e) {
    log(`  추출 오류: ${e.message}`);
    return null;
  }
}

/**
 * 유효한 네이버 쇼핑 URL인지 확인
 */
function isValidNaverShoppingUrl(url) {
  if (!url) return false;
  return (
    url.includes('smartstore.naver.com') ||
    url.includes('brand.naver.com') ||
    url.includes('shopping.naver.com/product')
  ) && !url.includes('naver.me');
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Naver Shopping URL 보강 스크립트      ║');
  console.log('║   Brand Connect → 네이버 쇼핑 URL 추출  ║');
  console.log('╚════════════════════════════════════════╝\n');

  // DB 연결 테스트
  log('DB 연결 테스트...');
  const connTest = await testConnection();
  if (!connTest.success) {
    log(`❌ DB 연결 실패: ${connTest.error}`);
    process.exit(1);
  }
  log(`✅ DB 연결 성공 (총 상품: ${connTest.productCount}개)\n`);

  // 통계 확인
  const stats = await getNaverUrlStats();
  log(`📊 현재 상태:`);
  log(`   - 전체 상품: ${stats.total}개`);
  log(`   - URL 있음: ${stats.withNaverUrl}개`);
  log(`   - URL 없음: ${stats.withoutNaverUrl}개\n`);

  if (stats.withoutNaverUrl === 0) {
    log('✅ 모든 상품에 naver_shopping_url이 있습니다!');
    return;
  }

  // 브라우저 시작
  log('브라우저 시작...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 10
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    // 네이버 로그인
    log('네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(3000);
    log('✅ 로그인 완료\n');

    // 배치 처리
    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    let totalDeleted = 0;

    while (true) {
      // naver_shopping_url이 없는 상품 조회
      const products = await getProductsWithoutNaverUrl(BATCH_SIZE);

      if (products.length === 0) {
        log('\n✅ 모든 상품 처리 완료!');
        break;
      }

      log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      log(`📦 배치 처리: ${products.length}개 상품`);
      log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        totalProcessed++;

        log(`[${totalProcessed}] ${product.name.substring(0, 30)}...`);
        log(`   Brand Connect: ${product.product_url}`);

        let naverUrl = null;
        let retries = 0;

        while (retries <= MAX_RETRIES && !naverUrl) {
          naverUrl = await extractNaverShoppingUrl(page, product.product_url);

          // 삭제된 페이지면 재시도 안함
          if (naverUrl === 'DELETED') break;

          if (!naverUrl && retries < MAX_RETRIES) {
            retries++;
            log(`   재시도 ${retries}/${MAX_RETRIES}...`);
            await page.waitForTimeout(2000);
          }
        }

        if (naverUrl === 'DELETED') {
          // 삭제된 상품은 DB에서 제거
          await deleteProduct(product.product_id);
          log(`   🗑️ 삭제된 상품 - DB에서 제거됨`);
          totalDeleted++;
        } else if (naverUrl) {
          await updateNaverShoppingUrl(product.product_id, naverUrl);
          log(`   ✅ 추출 성공: ${naverUrl.substring(0, 50)}...`);
          totalSuccess++;
        } else {
          // NULL로 표시하여 다시 처리하지 않도록 빈 문자열 저장
          await updateNaverShoppingUrl(product.product_id, '');
          log(`   ⚠️ URL 찾지 못함`);
          totalFailed++;
        }

        // 딜레이
        if (i < products.length - 1) {
          await page.waitForTimeout(DELAY_BETWEEN_PRODUCTS);
        }
      }

      // 중간 통계
      log(`\n📊 진행 상황: ${totalProcessed}개 처리 (성공: ${totalSuccess}, 실패: ${totalFailed}, 삭제: ${totalDeleted})`);
    }

    // 최종 통계
    const finalStats = await getNaverUrlStats();
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   보강 완료!                            ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║   처리: ${totalProcessed}개`);
    console.log(`║   성공: ${totalSuccess}개`);
    console.log(`║   실패: ${totalFailed}개`);
    console.log(`║   삭제: ${totalDeleted}개`);
    console.log(`║   URL 보유율: ${finalStats.total > 0 ? Math.round(finalStats.withNaverUrl / finalStats.total * 100) : 0}%`);
    console.log('╚════════════════════════════════════════╝\n');

  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

// 실행
main().catch(console.error);
