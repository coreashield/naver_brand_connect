/**
 * Daily Link Issuer - 일일 1000개 링크 발급 스크립트 (v2)
 *
 * Phase 1: 라운드 로빈 방식으로 모든 카테고리에서 균등하게 링크 발급
 * Phase 2: 발급된 상품들의 naver_shopping_url 일괄 추출
 *
 * 사용법: node daily_link_issuer.js
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import {
  testConnection,
  getExistingProductIds,
  checkDailyLimit,
  upsertProduct,
  incrementDailyIssuance,
  completeDailyIssuance,
  getProductCount,
  getProductsWithoutNaverUrl,
  updateNaverShoppingUrl,
  getAccountById
} from './src/supabase/db.js';

dotenv.config();

// 계정 정보 (DB에서 로드)
const ACCOUNT_ID = parseInt(process.env.ACCOUNT_ID) || 1;
let account = null;

// URLs
const CATEGORY_URL = 'https://brandconnect.naver.com/904249244338784/affiliate/products/category';

// 카테고리 목록
const CATEGORIES = [
  '가전', '디지털/컴퓨터', '여성패션', '남성패션', '패션잡화',
  '화장품/미용', '생활/건강', '식품', '가구/인테리어', '출산/육아',
  '여가/여행', '스포츠/레저', '취미/펫', '도서'
];

// 설정
const DAILY_LIMIT = 1000;
const ITEMS_PER_CATEGORY_PER_ROUND = 10; // 카테고리당 라운드별 처리량
const DELAY_BETWEEN_ITEMS = 500; // 상품 간 딜레이 (ms)
const DELAY_BETWEEN_CATEGORIES = 1000; // 카테고리 전환 딜레이 (ms)

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
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
 * Brand Connect 상품 페이지에서 네이버 쇼핑 URL 추출
 */
async function extractNaverShoppingUrl(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const pageContent = await page.content();
    if (pageContent.includes('삭제되었거나') || pageContent.includes('존재하지 않는 페이지')) {
      return null;
    }

    const selectors = [
      'a:has-text("네이버 쇼핑에서 보기")',
      'a[href*="smartstore.naver.com"]',
      'a[href*="brand.naver.com"]',
      'a[href*="shopping.naver.com/product"]'
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
      } catch (e) {}
    }

    const allLinks = await page.$$eval('a[href]', links =>
      links.map(a => a.href).filter(href =>
        href.includes('smartstore.naver.com') ||
        href.includes('brand.naver.com') ||
        href.includes('shopping.naver.com/product')
      )
    );

    if (allLinks.length > 0) {
      const nonAffiliateLink = allLinks.find(url => !url.includes('naver.me'));
      return nonAffiliateLink || allLinks[0];
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Phase 1: 링크 발급 (라운드 로빈)
 */
async function phase1_issueLinks(page, existingIds, remainingQuota) {
  log('═══════════════════════════════════════════════');
  log('Phase 1: 링크 발급 (라운드 로빈)');
  log('═══════════════════════════════════════════════\n');

  await page.goto(CATEGORY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const issuedProducts = []; // 발급된 상품 정보 저장
  let totalIssued = 0;
  let round = 0;
  const categoryStats = {};
  CATEGORIES.forEach(cat => categoryStats[cat] = { issued: 0, skipped: 0, empty: false });

  // 라운드 로빈 루프
  while (totalIssued < remainingQuota) {
    round++;
    log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`📍 라운드 ${round} 시작 (현재 ${totalIssued}/${remainingQuota})`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let issuedThisRound = 0;
    let allCategoriesEmpty = true;

    for (const category of CATEGORIES) {
      if (totalIssued >= remainingQuota) break;
      if (categoryStats[category].empty) continue; // 이미 빈 카테고리는 스킵

      // 카테고리 탭 클릭
      try {
        const categoryTab = await page.$(`[role="tab"]:has-text("${category}")`);
        if (!categoryTab) {
          log(`  ⚠️ ${category}: 탭 없음`);
          continue;
        }
        await categoryTab.click();
        await page.waitForTimeout(DELAY_BETWEEN_CATEGORIES);
      } catch (e) {
        log(`  ⚠️ ${category}: 전환 오류`);
        continue;
      }

      // 초기 스크롤해서 모든 상품 로드 (무한 스크롤 대응)
      log(`  📜 ${category}: 상품 로딩 중...`);
      let prevProductCount = 0;
      let sameCountTimes = 0;

      // 끝까지 스크롤 (상품 개수가 늘어나지 않을 때까지)
      for (let i = 0; i < 100; i++) {
        // Page Down 효과 - 여러 번 스크롤
        for (let j = 0; j < 3; j++) {
          await page.keyboard.press('End');
          await page.waitForTimeout(300);
        }
        await page.waitForTimeout(700); // 로딩 대기

        // 현재 상품 개수 확인
        const currentProductCount = await page.evaluate(() =>
          document.querySelectorAll('[class*="ProductItem_root"]').length
        );

        if (currentProductCount === prevProductCount) {
          sameCountTimes++;
          if (sameCountTimes >= 5) {
            log(`  📜 ${category}: 스크롤 완료 (${i + 1}회, ${currentProductCount}개 로드)`);
            break;
          }
        } else {
          sameCountTimes = 0;
          if (i % 10 === 0) {
            log(`  📜 ${category}: ${currentProductCount}개 로드됨...`);
          }
        }
        prevProductCount = currentProductCount;
      }

      // 상품 개수 확인
      const productCount = await page.evaluate(() =>
        document.querySelectorAll('[class*="ProductItem_root"]').length
      );
      const issueCount = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '링크 발급').length
      );
      log(`  📦 ${category}: 총 ${productCount}개 상품, ${issueCount}개 발급 가능`);

      // 맨 위로 스크롤
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // 카테고리 내 처리
      let issuedInCategory = 0;
      let scrollPosition = 0;
      let noNewButtonCount = 0;

      while (issuedInCategory < ITEMS_PER_CATEGORY_PER_ROUND && totalIssued < remainingQuota) {
        // 현재 화면에서 링크 발급 버튼 찾기
        let issueButtons = await page.$$('button:has-text("링크 발급")');

        // 버튼이 없으면 스크롤해서 더 찾기
        if (issueButtons.length === 0) {
          noNewButtonCount++;
          if (noNewButtonCount < 10) {
            // 아래로 스크롤하며 버튼 찾기
            scrollPosition += 600;
            await page.evaluate((pos) => window.scrollTo(0, pos), scrollPosition);
            await page.waitForTimeout(400);

            // 다시 버튼 찾기
            issueButtons = await page.$$('button:has-text("링크 발급")');
            if (issueButtons.length > 0) {
              noNewButtonCount = 0;
            }
          }

          if (issueButtons.length === 0 && noNewButtonCount >= 10) {
            if (issuedInCategory === 0) {
              categoryStats[category].empty = true;
              log(`  📂 ${category}: 발급할 상품 없음 (모두 발급됨)`);
            } else {
              log(`  ✅ ${category}: ${issuedInCategory}개 발급 완료 (더 이상 없음)`);
            }
            break;
          }

          if (issueButtons.length === 0) continue;
        }

        allCategoriesEmpty = false;
        const btn = issueButtons[0];

        try {
          await btn.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);

          // productId 및 상품 정보 추출
          let productId = null;
          let productName = '';
          let productUrl = '';
          let store = '';
          let price = '';
          let originalPrice = '';
          let commission = '';

          try {
            const listItem = await btn.evaluateHandle(el =>
              el.closest('li') || el.closest('[class*="item"]') || el.closest('tr')
            );
            const productLink = await listItem.$('a[href*="/products/"]');

            if (productLink) {
              const href = await productLink.getAttribute('href');
              const match = href.match(/products\/(\d+)/);
              if (match) {
                productId = match[1];
                productUrl = href.startsWith('http') ? href : `https://brandconnect.naver.com${href}`;
              }

              // 상품명 추출 (ProductItem_title 클래스 내의 텍스트)
              const titleEl = await listItem.$('[class*="ProductItem_title"] [class*="ProductItem_ell"]');
              if (titleEl) {
                productName = await titleEl.evaluate(el => el.textContent?.trim() || '');
              }

              // 수수료 추출
              const commissionEl = await listItem.$('[class*="ProductItem_commission__"]');
              if (commissionEl) {
                commission = await commissionEl.evaluate(el => el.textContent?.trim().replace('수수료 ', '') || '');
              }

              // 할인가 추출 (ProductItem_price__ 내의 strong 중 할인율이 아닌 것)
              const priceEl = await listItem.$('ins[class*="ProductItem_price__"] strong:not([class*="discount"])');
              if (priceEl) {
                price = await priceEl.evaluate(el => {
                  const text = el.textContent?.trim() || '';
                  return text.includes('원') ? text : text + '원';
                });
              }

              // 원가 추출
              const originalPriceEl = await listItem.$('del[class*="ProductItem_price_original"]');
              if (originalPriceEl) {
                originalPrice = await originalPriceEl.evaluate(el => {
                  const text = el.textContent || '';
                  const match = text.match(/[\d,]+원/);
                  return match ? match[0] : '';
                });
              }

              // 스토어명 추출
              const storeEl = await listItem.$('[class*="ProductItem_brand_name"] [class*="ProductItem_ell"]');
              if (storeEl) {
                store = await storeEl.evaluate(el => el.textContent?.trim() || '');
              }
            }
          } catch (e) {}

          // 발급 버튼 클릭
          await btn.click();
          await page.waitForTimeout(500);

          const confirmBtn = await page.$('button:has-text("확인")');
          if (confirmBtn) {
            await confirmBtn.click();
            await page.waitForTimeout(300);
          }

          if (!productId) {
            issuedInCategory++;
            continue;
          }

          // 이미 DB에 있는지 확인
          if (existingIds.has(productId)) {
            categoryStats[category].skipped++;
            issuedInCategory++;
            continue;
          }

          // DB 저장 (naver_shopping_url은 나중에)
          const product = {
            productId,
            name: productName,
            store,
            price,
            originalPrice,
            commission,
            status: 'ON',
            productUrl,
            affiliateLink: '',
            naverShoppingUrl: null
          };

          await upsertProduct(product);
          await incrementDailyIssuance(1);
          existingIds.add(productId);

          issuedProducts.push({ productId, productUrl, name: productName });
          totalIssued++;
          issuedInCategory++;
          issuedThisRound++;
          categoryStats[category].issued++;

          log(`  ✅ [${totalIssued}/${remainingQuota}] ${category}: ${productName.substring(0, 25)}...`);

          await page.waitForTimeout(DELAY_BETWEEN_ITEMS);

        } catch (e) {
          log(`  ⚠️ ${category}: 처리 오류 - ${e.message}`);
          break;
        }
      }
    }

    // 모든 카테고리가 비었으면 종료
    if (allCategoriesEmpty) {
      log(`\n⚠️ 모든 카테고리에서 발급할 상품이 없습니다.`);
      break;
    }

    log(`\n📊 라운드 ${round} 완료: ${issuedThisRound}개 발급`);
  }

  return { issuedProducts, totalIssued, categoryStats };
}

/**
 * Phase 2: naver_shopping_url 일괄 추출
 */
async function phase2_extractNaverUrls(page, issuedProducts) {
  log('\n═══════════════════════════════════════════════');
  log('Phase 2: naver_shopping_url 일괄 추출');
  log('═══════════════════════════════════════════════\n');

  if (issuedProducts.length === 0) {
    log('추출할 상품이 없습니다.');
    return { success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < issuedProducts.length; i++) {
    const product = issuedProducts[i];

    if (!product.productUrl) {
      failed++;
      continue;
    }

    log(`  [${i + 1}/${issuedProducts.length}] ${product.name?.substring(0, 30) || product.productId}...`);

    const naverUrl = await extractNaverShoppingUrl(page, product.productUrl);

    if (naverUrl) {
      await updateNaverShoppingUrl(product.productId, naverUrl);
      log(`    ✅ ${naverUrl.substring(0, 50)}...`);
      success++;
    } else {
      await updateNaverShoppingUrl(product.productId, '');
      log(`    ⚠️ URL 찾지 못함`);
      failed++;
    }

    // 10개마다 진행률 표시
    if ((i + 1) % 50 === 0) {
      log(`  📊 진행률: ${i + 1}/${issuedProducts.length} (${Math.round((i + 1) / issuedProducts.length * 100)}%)`);
    }
  }

  return { success, failed };
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Daily Link Issuer v2 - 라운드 로빈 + 일괄 추출   ║');
  console.log('║   Phase 1: 카테고리 균등 링크 발급                 ║');
  console.log('║   Phase 2: naver_shopping_url 일괄 추출            ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // 1. DB 연결 테스트
  log('DB 연결 테스트...');
  const connTest = await testConnection();
  if (!connTest.success) {
    log(`❌ DB 연결 실패: ${connTest.error}`);
    process.exit(1);
  }
  log(`✅ DB 연결 성공 (현재 상품: ${connTest.productCount}개)\n`);

  // 2. 일일 한도 확인
  const limitStatus = await checkDailyLimit(DAILY_LIMIT);
  log(`📊 오늘 발급 현황: ${limitStatus.current}/${limitStatus.limit}`);

  if (limitStatus.reached) {
    log('✅ 오늘 할당량이 이미 완료되었습니다!');
    return;
  }

  const remainingQuota = limitStatus.limit - limitStatus.current;
  log(`📋 남은 할당량: ${remainingQuota}개\n`);

  // 3. 계정 로드
  log('계정 정보 로드 중...');
  account = await getAccountById(ACCOUNT_ID);
  if (!account) {
    log(`❌ 계정 ID ${ACCOUNT_ID}를 찾을 수 없습니다.`);
    return;
  }
  log(`✅ 계정: ${account.naver_id}\n`);

  // 4. 기존 product_id 로드
  log('기존 상품 ID 로드 중...');
  const existingIds = await getExistingProductIds();
  log(`✅ 기존 상품: ${existingIds.size}개 로드됨\n`);

  // 5. 브라우저 시작
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
    // 5. 네이버 로그인
    log('═══════════════════════════════════════════════');
    log('네이버 로그인');
    log('═══════════════════════════════════════════════\n');

    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // CAPTCHA 체크
    const captchaExists = await page.$('#captcha');
    if (captchaExists) {
      log('⚠️ CAPTCHA 감지! 수동으로 해결해주세요...');
      await page.waitForSelector('#captcha', { state: 'hidden', timeout: 120000 });
      log('✅ CAPTCHA 해결됨');
    }

    await page.click('#id');
    await page.keyboard.type(account.naver_id, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(account.naver_pw, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(3000);
    log('✅ 로그인 완료\n');

    // 6. Phase 1: 링크 발급
    const phase1Result = await phase1_issueLinks(page, existingIds, remainingQuota);

    // 7. Phase 2: naver_shopping_url 추출
    const phase2Result = await phase2_extractNaverUrls(page, phase1Result.issuedProducts);

    // 8. 일일 발급 완료 처리
    if (phase1Result.totalIssued > 0) {
      await completeDailyIssuance();
    }

    // 9. 최종 통계
    const finalCount = await getProductCount();

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   일일 발급 완료!                                  ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║   Phase 1 - 링크 발급: ${phase1Result.totalIssued}개`);
    console.log(`║   Phase 2 - URL 추출: 성공 ${phase2Result.success}, 실패 ${phase2Result.failed}`);
    console.log(`║   DB 총 상품: ${finalCount}개`);
    console.log('╠════════════════════════════════════════════════════╣');
    console.log('║   카테고리별 현황:');
    for (const [cat, stats] of Object.entries(phase1Result.categoryStats)) {
      if (stats.issued > 0 || stats.skipped > 0) {
        console.log(`║     ${cat}: 발급 ${stats.issued}, 스킵 ${stats.skipped}`);
      }
    }
    console.log('╚════════════════════════════════════════════════════╝\n');

  } catch (error) {
    log(`❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

// 실행
main().catch(console.error);
