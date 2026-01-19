/**
 * 상품 정보 통합 보강 스크립트 (Product Enricher)
 *
 * affiliateLink를 통해 실제 스토어 페이지에 접속하여:
 * 1. naver_shopping_url 추출 (리다이렉트 URL)
 * 2. rating (평점) 추출
 * 3. review_count (리뷰 수) 추출
 * 4. brand (브랜드) 추출
 *
 * 사용법: node src/crawlers/product_enricher.js [--limit 100] [--headless]
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import {
  supabase,
  testConnection,
  getProductsForEnrichment,
  getEnrichmentStats,
  updateProductDetailInfo,
  deleteProduct
} from '../supabase/db.js';

dotenv.config();

// 계정 정보는 DB에서 가져옴
let NAVER_ID = null;
let NAVER_PW = null;

// 설정
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');
const HEADLESS = process.argv.includes('--headless');
const DELAY_BETWEEN_PRODUCTS = 2000;  // 상품 간 딜레이 (ms)
const MAX_RETRIES = 2;

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

/**
 * 네이버 로그인
 */
async function naverLogin(page) {
  log('네이버 로그인 시작...');

  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // ID 입력
  await page.click('#id');
  await page.keyboard.type(NAVER_ID, { delay: 50 });

  // PW 입력
  await page.click('#pw');
  await page.keyboard.type(NAVER_PW, { delay: 50 });

  // 로그인 버튼 클릭
  await page.click('#log\\.login');
  await page.waitForTimeout(3000);

  // 로그인 확인 (CAPTCHA 대기)
  const currentUrl = page.url();
  if (currentUrl.includes('nidlogin') || currentUrl.includes('captcha')) {
    log('⚠️ 로그인 CAPTCHA 감지 - 30초 대기 (수동 해결 필요)');
    await page.waitForTimeout(30000);
  }

  // 2차 인증 체크
  if (page.url().includes('nidlogin')) {
    log('⚠️ 추가 인증 필요 - 30초 대기');
    await page.waitForTimeout(30000);
  }

  log('✅ 로그인 완료');
}

/**
 * Stealth 설정이 적용된 브라우저 컨텍스트 생성
 */
async function createStealthContext(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    }
  });

  // WebDriver 탐지 우회
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
  });

  return context;
}

/**
 * affiliateLink에서 상품 정보 추출
 * @returns {Object} { naverShoppingUrl, rating, reviewCount, brand, category, deleted }
 */
async function extractProductInfo(page, affiliateLink) {
  try {
    // 1. affiliateLink 접속 (리다이렉트 대기)
    await page.goto(affiliateLink, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // 리다이렉트 완료 대기
    await page.waitForTimeout(3000);

    let currentUrl = page.url();

    // CAPTCHA 체크 (개선된 로직)
    const pageTitle = await page.title();
    const hasCaptcha = await page.$('text=보안 확인을 완료해 주세요') ||
                       await page.$('img[alt="캡차이미지"]') ||
                       await page.$('input[placeholder="정답을 입력해주세요"]') ||
                       pageTitle === '' ||
                       currentUrl.includes('captcha');

    if (hasCaptcha) {
      log('  ⚠️ CAPTCHA 감지됨 - 30초 대기 (수동 해결 필요)');
      log('  📍 현재 URL: ' + currentUrl);
      await page.waitForTimeout(30000);
      currentUrl = page.url();

      // CAPTCHA 해결 확인
      const stillCaptcha = await page.$('text=보안 확인을 완료해 주세요') ||
                           await page.$('img[alt="캡차이미지"]');
      if (stillCaptcha) {
        log('  ❌ CAPTCHA 미해결 - 스킵');
        return { error: 'CAPTCHA_TIMEOUT' };
      }
      log('  ✅ CAPTCHA 해결됨');
    }

    // 페이지 상태 로그
    const finalTitle = await page.title();
    log('  📄 페이지 타이틀: ' + (finalTitle || '(없음)'));
    log('  📍 최종 URL: ' + currentUrl);

    // 삭제된 페이지 확인 (구체적인 문구로 체크)
    const pageContent = await page.content();
    const deletedPatterns = [
      '삭제되었거나 존재하지 않는',
      '존재하지 않는 페이지',
      '존재하지 않는 상품',
      '판매종료된 상품',
      '판매가 종료된',
      '상품이 없습니다',
      '찾을 수 없습니다'
    ];

    const isDeleted = deletedPatterns.some(pattern => pageContent.includes(pattern));
    if (isDeleted) {
      log('  ⚠️ 삭제/종료 감지됨');
      return { deleted: true };
    }

    // 페이지 완전 로딩 대기
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // 최종 URL (이게 naver_shopping_url)
    const naverShoppingUrl = page.url();

    // 2. 페이지에서 상세 정보 추출
    const productInfo = await page.evaluate(() => {
      const result = {
        rating: null,
        reviewCount: null,
        brand: null
      };

      const bodyText = document.body.innerText;

      // === 평점 추출 ===
      // 패턴: "평점 4.8", "4.8점", "★ 4.8"
      const ratingPatterns = [
        /평점\s*\n?\s*([\d.]+)/,
        /([\d.]+)\s*점/,
        /★\s*([\d.]+)/,
        /별점\s*[:：]?\s*([\d.]+)/
      ];

      for (const pattern of ratingPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          const rating = parseFloat(match[1]);
          if (rating > 0 && rating <= 5) {
            result.rating = rating;
            break;
          }
        }
      }

      // === 리뷰 수 추출 ===
      // 패턴: "리뷰 1,234", "리뷰(1234)", "1,234개 리뷰"
      const reviewPatterns = [
        /리뷰\s*\(?\s*([\d,]+)\s*\)?/,
        /([\d,]+)\s*개?\s*리뷰/,
        /후기\s*\(?\s*([\d,]+)\s*\)?/,
        /([\d,]+)\s*개?\s*후기/
      ];

      for (const pattern of reviewPatterns) {
        const match = bodyText.match(pattern);
        if (match) {
          result.reviewCount = parseInt(match[1].replace(/,/g, ''));
          break;
        }
      }

      // === 브랜드 추출 ===
      // 패턴: "브랜드: 삼성", "브랜드 삼성"
      const brandPatterns = [
        /브랜드\s*[:：\t]?\s*([가-힣a-zA-Z0-9\s]+?)(?:\n|$|,|\/)/,
        /제조사\s*[:：\t]?\s*([가-힣a-zA-Z0-9\s]+?)(?:\n|$|,|\/)/,
        /판매자\s*[:：\t]?\s*([가-힣a-zA-Z0-9\s]+?)(?:\n|$|,|\/)/
      ];

      for (const pattern of brandPatterns) {
        const match = bodyText.match(pattern);
        if (match && match[1].trim().length > 0 && match[1].trim().length < 50) {
          result.brand = match[1].trim();
          break;
        }
      }

      // JSON-LD에서 브랜드 추출 시도
      if (!result.brand) {
        const jsonLd = document.querySelector('script[type="application/ld+json"]');
        if (jsonLd) {
          try {
            const data = JSON.parse(jsonLd.textContent);
            if (data.brand?.name) result.brand = data.brand.name;
            else if (data.brand) result.brand = data.brand;
          } catch(e) {}
        }
      }

      // 카테고리는 수집하지 않음 (페이지에서 구조화된 정보 없음)

      return result;
    });

    // 유효한 naver_shopping_url인지 확인
    const isValidUrl = naverShoppingUrl.includes('smartstore.naver.com') ||
                       naverShoppingUrl.includes('brand.naver.com') ||
                       naverShoppingUrl.includes('shopping.naver.com');

    return {
      naverShoppingUrl: isValidUrl ? naverShoppingUrl : null,
      rating: productInfo.rating,
      reviewCount: productInfo.reviewCount,
      brand: productInfo.brand,
      category: productInfo.category
    };

  } catch (error) {
    log(`  추출 오류: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   상품 정보 통합 보강 스크립트 (Product Enricher) ║');
  console.log('║   naver_shopping_url + rating + brand 수집      ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // DB 연결 테스트
  log('DB 연결 테스트...');
  const connTest = await testConnection();
  if (!connTest.success) {
    log(`❌ DB 연결 실패: ${connTest.error}`);
    process.exit(1);
  }
  log(`✅ DB 연결 성공 (총 상품: ${connTest.productCount}개)\n`);

  // 계정 정보 로드 (1번 계정 사용)
  log('계정 정보 로드...');
  const { data: accounts } = await supabase
    .from('naver_accounts')
    .select('*')
    .eq('id', 1)
    .limit(1);

  if (!accounts || accounts.length === 0) {
    log('❌ 1번 계정을 찾을 수 없습니다.');
    process.exit(1);
  }
  const account = accounts[0];
  NAVER_ID = account.naver_id;
  NAVER_PW = account.naver_pw;
  log(`✅ 계정 로드: ${NAVER_ID} (ID: ${account.id})\n`);

  // 현재 통계
  const stats = await getEnrichmentStats();
  log(`📊 현재 상태:`);
  log(`   - 전체 상품: ${stats.total}개`);
  log(`   - naver_shopping_url: ${stats.withNaverUrl}개 (${Math.round(stats.withNaverUrl/stats.total*100)}%)`);
  log(`   - rating: ${stats.withRating}개 (${Math.round(stats.withRating/stats.total*100)}%)`);
  log(`   - brand: ${stats.withBrand}개 (${Math.round(stats.withBrand/stats.total*100)}%)\n`);

  // 보강 대상 상품 조회
  const products = await getProductsForEnrichment(BATCH_SIZE);

  if (products.length === 0) {
    log('✅ 모든 상품이 이미 보강되었습니다!');
    return;
  }

  log(`📦 보강 대상: ${products.length}개 상품\n`);

  // 브라우저 시작
  log(`브라우저 시작 (headless: ${HEADLESS})...`);
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 50
  });

  const context = await createStealthContext(browser);
  const page = await context.newPage();

  // 네이버 로그인
  await naverLogin(page);

  // 통계
  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalDeleted = 0;
  let totalSkipped = 0;

  // 추출된 정보 통계
  let extractedNaverUrl = 0;
  let extractedRating = 0;
  let extractedBrand = 0;

  try {
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      totalProcessed++;

      const shortName = product.name.length > 30 ? product.name.substring(0, 30) + '...' : product.name;
      log(`\n[${totalProcessed}/${products.length}] ${shortName}`);

      // affiliateLink 확인
      if (!product.affiliate_link) {
        log(`  ⚠️ affiliate_link 없음 - 스킵`);
        totalSkipped++;
        continue;
      }

      log(`  affiliate: ${product.affiliate_link}`);

      let info = null;
      let retries = 0;

      // 재시도 로직
      while (retries <= MAX_RETRIES && !info) {
        info = await extractProductInfo(page, product.affiliate_link);

        if (info.error && info.error !== 'CAPTCHA' && retries < MAX_RETRIES) {
          retries++;
          log(`  재시도 ${retries}/${MAX_RETRIES}...`);
          await page.waitForTimeout(3000);
          info = null;
        } else {
          break;
        }
      }

      // 결과 처리
      if (info.deleted) {
        await deleteProduct(product.product_id);
        log(`  🗑️ 삭제된 상품 - DB에서 제거됨`);
        totalDeleted++;
        continue;
      }

      if (info.error) {
        log(`  ❌ 실패: ${info.error}`);
        totalFailed++;
        continue;
      }

      // DB 업데이트
      await updateProductDetailInfo(product.product_id, info);

      // 성공 로그
      const results = [];
      if (info.naverShoppingUrl) {
        results.push(`URL✅`);
        extractedNaverUrl++;
      }
      if (info.rating) {
        results.push(`평점:${info.rating}`);
        extractedRating++;
      }
      if (info.brand) {
        results.push(`브랜드:${info.brand.substring(0, 15)}`);
        extractedBrand++;
      }

      if (results.length > 0) {
        log(`  ✅ ${results.join(' | ')}`);
        totalSuccess++;
      } else {
        log(`  ⚠️ 추출된 정보 없음`);
        totalFailed++;
      }

      // 딜레이
      if (i < products.length - 1) {
        await page.waitForTimeout(DELAY_BETWEEN_PRODUCTS);
      }

      // 중간 진행률 (50개마다)
      if (totalProcessed % 50 === 0) {
        log(`\n━━━ 진행률: ${totalProcessed}/${products.length} (${Math.round(totalProcessed/products.length*100)}%) ━━━\n`);
      }
    }

  } catch (error) {
    log(`\n❌ 오류 발생: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }

  // 최종 통계
  const finalStats = await getEnrichmentStats();

  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   보강 완료!                                    ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║   처리: ${totalProcessed}개`);
  console.log(`║   성공: ${totalSuccess}개`);
  console.log(`║   실패: ${totalFailed}개`);
  console.log(`║   삭제: ${totalDeleted}개`);
  console.log(`║   스킵: ${totalSkipped}개`);
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║   이번 실행에서 추출:`);
  console.log(`║   - naver_shopping_url: ${extractedNaverUrl}개`);
  console.log(`║   - rating: ${extractedRating}개`);
  console.log(`║   - brand: ${extractedBrand}개`);
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║   최종 보유율 (전체 ${finalStats.total}개 기준):`);
  console.log(`║   - naver_shopping_url: ${Math.round(finalStats.withNaverUrl/finalStats.total*100)}%`);
  console.log(`║   - rating: ${Math.round(finalStats.withRating/finalStats.total*100)}%`);
  console.log(`║   - brand: ${Math.round(finalStats.withBrand/finalStats.total*100)}%`);
  console.log('╚════════════════════════════════════════════════╝\n');
}


// 실행
main().catch(console.error);
