/**
 * 잘린 상품명 수정 스크립트
 * 이름이 짧은 상품들의 affiliate_link에서 정확한 이름 가져와서 업데이트
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { crawlProductDetail } from './product_detail_crawler.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 설정: 이름이 이 길이 미만이면 수정 대상
const MIN_NAME_LENGTH = 15;

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${msg}`);
}

async function getShortNameProducts(limit = 50) {
  const { data, error } = await supabase
    .from('products')
    .select('product_id, name, naver_shopping_url')
    .eq('status', 'ON')
    .not('naver_shopping_url', 'is', null)  // naver_shopping_url 있는 것만
    .order('name')
    .limit(500);

  if (error) {
    log(`DB 에러: ${error.message}`);
    return [];
  }

  // 이름 길이로 필터링
  const shortNames = data.filter(p => p.name && p.name.length < MIN_NAME_LENGTH);
  log(`총 ${data.length}개 중 이름 ${MIN_NAME_LENGTH}자 미만: ${shortNames.length}개`);

  return shortNames.slice(0, limit);
}

async function updateProductName(productId, newName) {
  const { error } = await supabase
    .from('products')
    .update({ name: newName, updated_at: new Date().toISOString() })
    .eq('product_id', productId);

  if (error) {
    log(`  ❌ 업데이트 실패: ${error.message}`);
    return false;
  }
  return true;
}

async function main() {
  log('=== 잘린 상품명 수정 시작 ===\n');

  // 1. 대상 상품 조회
  const products = await getShortNameProducts(30);

  if (products.length === 0) {
    log('수정할 상품이 없습니다.');
    return;
  }

  log(`\n수정 대상 ${products.length}개:\n`);
  products.forEach((p, i) => {
    console.log(`${i + 1}. [${p.name.length}자] ${p.name}`);
  });

  // 2. 브라우저 시작
  log('\n브라우저 시작...');
  const browser = await chromium.launch({
    headless: false,  // CAPTCHA 대응
    slowMo: 100
  });

  let updated = 0;
  let failed = 0;

  try {
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      log(`\n[${i + 1}/${products.length}] ${product.name}`);
      log(`  현재 길이: ${product.name.length}자`);

      try {
        // 3. 상세 정보 크롤링 (naver_shopping_url 사용)
        const detail = await crawlProductDetail(browser, product.naver_shopping_url);

        if (detail.name && detail.name.length > product.name.length) {
          log(`  새 이름: ${detail.name} (${detail.name.length}자)`);

          // 4. 업데이트
          const success = await updateProductName(product.product_id, detail.name);
          if (success) {
            log(`  ✅ 업데이트 완료`);
            updated++;
          } else {
            failed++;
          }
        } else if (detail.name) {
          log(`  ℹ️ 새 이름이 더 짧거나 같음 - 스킵`);
        } else {
          log(`  ⚠️ 이름 추출 실패`);
          failed++;
        }

        // 딜레이 (봇 탐지 방지)
        await new Promise(r => setTimeout(r, 3000));

      } catch (err) {
        log(`  ❌ 에러: ${err.message}`);
        failed++;
      }
    }
  } finally {
    await browser.close();
  }

  log('\n=== 완료 ===');
  log(`✅ 업데이트: ${updated}개`);
  log(`❌ 실패: ${failed}개`);
}

main().catch(console.error);
