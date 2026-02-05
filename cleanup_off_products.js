/**
 * OFF 상품 자동 정리 스크립트
 *
 * Brand Connect에서 진행상태 OFF인 상품을 수집하여 DB에서 삭제
 *
 * 사용법: node cleanup_off_products.js [--dry-run]
 *   --dry-run: 실제 삭제하지 않고 매칭 결과만 출력
 */

import { chromium } from 'playwright';
import {
  supabase,
  testConnection,
  getAccountById
} from './src/supabase/db.js';
import dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_ID = 1; // Brand Connect 계정
const CAMPAIGN_ID = '904249244338784';
const LINKS_URL = `https://brandconnect.naver.com/${CAMPAIGN_ID}/affiliate/products-link?persist=true`;

const DRY_RUN = process.argv.includes('--dry-run');

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

  // CAPTCHA 체크
  if (page.url().includes('nidlogin') || page.url().includes('captcha')) {
    log('⚠️  CAPTCHA 감지! 수동으로 해결 후 엔터키를 누르세요...');
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }

  log('✅ 로그인 완료');
}

/**
 * OFF 상품 목록 수집
 */
async function collectOffProducts(page) {
  log('발급 링크 관리 페이지로 이동...');
  await page.goto(LINKS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 진행 상태 필터를 OFF로 변경
  log('진행 상태 필터를 OFF로 변경...');

  // 방법 1: 진행 상태 텍스트가 포함된 영역 클릭
  try {
    // "진행 상태" + "ON" 텍스트가 있는 버튼 찾기
    const filterBtn = await page.locator('button:has-text("진행 상태")').first();
    await filterBtn.click();
    await page.waitForTimeout(1000);

    // OFF 옵션 선택 (role=option)
    const offOption = await page.locator('role=option[name="OFF"]');
    if (await offOption.isVisible()) {
      await offOption.click();
      log('  ✅ OFF 필터 적용됨');
    } else {
      // 대체 방법: 텍스트로 찾기
      const offText = await page.locator('text="OFF"').first();
      await offText.click();
      log('  ✅ OFF 필터 적용됨 (대체 방법)');
    }
    await page.waitForTimeout(2000);
  } catch (e) {
    log(`  ⚠️ 필터 적용 실패: ${e.message}`);
    // 수동 필터 변경 요청
    log('  수동으로 진행 상태를 OFF로 변경 후 엔터키를 누르세요...');
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
  }

  // 총 개수 확인 (여러 방법 시도)
  let totalCount = 0;
  try {
    // 방법 1: "총 N개" 텍스트에서 추출
    const countText = await page.locator('strong:has(em), strong:has(emphasis)').first().textContent();
    const match = countText.match(/(\d[\d,]*)/);
    if (match) {
      totalCount = parseInt(match[1].replace(/,/g, ''));
    }
  } catch (e) {
    // 방법 2: 테이블 행 수로 대체
    const rows = await page.locator('table tbody tr').count();
    totalCount = rows;
  }

  log(`📊 OFF 상품 총 ${totalCount}개 발견`);

  if (totalCount === 0) {
    return [];
  }

  const offProducts = [];
  const collectedNames = new Set(); // 중복 방지용
  let pageNum = 1;
  let hasMore = true;

  while (hasMore) {
    log(`  [페이지 ${pageNum}] 수집 중...`);

    // 테이블에서 상품 정보 추출
    const products = await page.$$eval('table tbody tr', rows => {
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return null;

        // 상품명 (첫번째 셀)
        const nameCell = cells[0];
        const name = nameCell?.textContent?.trim() || '';

        // 스토어명 (두번째 셀)
        const storeCell = cells[1];
        const store = storeCell?.textContent?.trim() || '';

        // 진행 상태 (여섯번째 셀)
        const statusCell = cells[5];
        const status = statusCell?.textContent?.trim() || '';

        if (status === 'OFF' && name) {
          return { name, store };
        }
        return null;
      }).filter(p => p !== null);
    });

    // 중복 제거하며 추가
    let newCount = 0;
    for (const product of products) {
      if (!collectedNames.has(product.name)) {
        collectedNames.add(product.name);
        offProducts.push(product);
        newCount++;
      }
    }
    log(`    수집: ${newCount}개 (중복 제외)`);

    // 페이지 번호 버튼 방식으로 다음 페이지 이동
    const nextPageNum = pageNum + 1;

    // 다음 페이지 번호 버튼이 있는지 확인 (목록에서 숫자 버튼)
    const pageButtons = await page.$$('nav[aria-label="페이지 탐색"] button');
    let foundNextPage = false;

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

    if (!foundNextPage) {
      hasMore = false;
    }
  }

  return offProducts;
}

/**
 * DB에서 상품명으로 매칭하여 삭제
 */
async function deleteMatchedProducts(offProducts) {
  log(`\n📦 DB 매칭 시작 (${offProducts.length}개 OFF 상품)...`);

  let matched = 0;
  let deleted = 0;
  let notFound = 0;
  let skippedMultiple = 0;

  const matchedProducts = [];
  const notFoundProducts = [];
  const multipleMatchProducts = [];

  for (const product of offProducts) {
    // 1단계: 정확한 상품명으로 검색
    let { data, error } = await supabase
      .from('products')
      .select('product_id, name, store')
      .eq('name', product.name);

    if (error) {
      log(`  ❌ 검색 오류: ${error.message}`);
      continue;
    }

    // 2단계: 정확한 매칭이 없으면 LIKE 검색 (앞 40글자)
    if (!data || data.length === 0) {
      const searchTerm = product.name.substring(0, 40);
      const likeResult = await supabase
        .from('products')
        .select('product_id, name, store')
        .ilike('name', `${searchTerm}%`);

      data = likeResult.data;
      error = likeResult.error;
    }

    if (error) {
      log(`  ❌ 검색 오류: ${error.message}`);
      continue;
    }

    // 결과 처리
    if (!data || data.length === 0) {
      notFound++;
      notFoundProducts.push(product);
      log(`  ⚠️  미발견: ${product.name.substring(0, 40)}...`);
    } else if (data.length > 1) {
      // 여러 개 매칭 - 안전을 위해 스킵
      skippedMultiple++;
      multipleMatchProducts.push({ ...product, matches: data });
      log(`  ⚠️  다중매칭(${data.length}개) - 스킵: ${product.name.substring(0, 35)}...`);
      data.forEach(d => log(`      → ${d.product_id}: ${d.name.substring(0, 40)}...`));
    } else {
      // 정확히 1개 매칭 - 삭제 진행
      const match = data[0];
      matched++;
      matchedProducts.push({
        ...product,
        dbProductId: match.product_id,
        dbName: match.name
      });

      if (!DRY_RUN) {
        // 실제 삭제
        const { error: deleteError } = await supabase
          .from('products')
          .delete()
          .eq('product_id', match.product_id);

        if (deleteError) {
          log(`  ❌ 삭제 오류 [${match.product_id}]: ${deleteError.message}`);
        } else {
          deleted++;
          log(`  🗑️  삭제: ${match.name.substring(0, 40)}...`);
        }
      } else {
        log(`  🔍 매칭(1개): ${product.name.substring(0, 30)}... → ${match.product_id}`);
      }
    }
  }

  return { matched, deleted, notFound, skippedMultiple, matchedProducts, notFoundProducts, multipleMatchProducts };
}

/**
 * 메인 실행
 */
async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   OFF 상품 자동 정리 스크립트                    ║');
  console.log('║   Brand Connect OFF 상품 → DB 삭제              ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  if (DRY_RUN) {
    log('🔍 DRY-RUN 모드: 실제 삭제하지 않고 매칭만 확인합니다.\n');
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    // 로그인
    await naverLogin(page, account);

    // OFF 상품 수집
    const offProducts = await collectOffProducts(page);

    if (offProducts.length === 0) {
      log('\n✅ OFF 상품이 없습니다!');
      return;
    }

    log(`\n📋 수집된 OFF 상품: ${offProducts.length}개`);

    // DB 매칭 및 삭제
    const result = await deleteMatchedProducts(offProducts);

    // 결과 출력
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   처리 완료                                      ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║   OFF 상품 수집: ${offProducts.length}개`);
    console.log(`║   DB 매칭 (1개): ${result.matched}개`);
    if (!DRY_RUN) {
      console.log(`║   삭제 완료: ${result.deleted}개`);
    }
    console.log(`║   다중매칭 스킵: ${result.skippedMultiple}개`);
    console.log(`║   미발견: ${result.notFound}개`);
    console.log('╚════════════════════════════════════════════════╝\n');

    if (result.multipleMatchProducts.length > 0) {
      log('⚠️  다중매칭으로 스킵된 상품 (수동 확인 필요):');
      result.multipleMatchProducts.forEach(p => {
        log(`   - ${p.name.substring(0, 45)}...`);
        p.matches.forEach(m => {
          log(`     → [${m.product_id}] ${m.name.substring(0, 40)}...`);
        });
      });
    }

    if (result.notFoundProducts.length > 0) {
      log('\n⚠️  DB에서 찾지 못한 상품:');
      result.notFoundProducts.forEach(p => {
        log(`   - ${p.name.substring(0, 50)}... (${p.store})`);
      });
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
