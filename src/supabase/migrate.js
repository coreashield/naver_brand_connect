/**
 * JSON → Supabase 데이터 마이그레이션
 * 기존 product_links.json, posted_products.json, blog_posted.json 데이터를 DB로 이전
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase, upsertProducts, testConnection } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..', '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');

const PRODUCT_FILE = path.join(OUTPUT_DIR, 'product_links.json');
const CAFE_POSTED_FILE = path.join(OUTPUT_DIR, 'posted_products.json');
const BLOG_POSTED_FILE = path.join(OUTPUT_DIR, 'blog_posted.json');

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   JSON → Supabase 데이터 마이그레이션          ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  // 1. DB 연결 테스트
  console.log('[1/4] DB 연결 테스트...');
  const connTest = await testConnection();

  if (!connTest.success) {
    console.error(`  ❌ 연결 실패: ${connTest.error}`);
    console.log('\n📌 해결 방법:');
    console.log('   1. .env 파일에 SUPABASE_URL과 SUPABASE_SERVICE_KEY 확인');
    console.log('   2. Supabase 대시보드에서 테이블이 생성되었는지 확인');
    console.log('   3. src/supabase/schema.sql을 SQL Editor에서 실행');
    process.exit(1);
  }

  console.log(`  ✅ 연결 성공 (기존 상품: ${connTest.productCount || 0}개)\n`);

  // 2. 상품 데이터 마이그레이션
  console.log('[2/4] 상품 데이터 마이그레이션...');

  if (fs.existsSync(PRODUCT_FILE)) {
    try {
      const products = JSON.parse(fs.readFileSync(PRODUCT_FILE, 'utf-8'));
      console.log(`  📁 ${PRODUCT_FILE}`);
      console.log(`  📊 상품 수: ${products.length}개`);

      // 배치 처리 (100개씩)
      const batchSize = 100;
      let migrated = 0;

      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        await upsertProducts(batch);
        migrated += batch.length;
        process.stdout.write(`  진행: ${migrated}/${products.length}\r`);
      }

      console.log(`  ✅ ${migrated}개 상품 마이그레이션 완료\n`);

    } catch (error) {
      console.error(`  ❌ 오류: ${error.message}\n`);
    }
  } else {
    console.log(`  ⚠️ ${PRODUCT_FILE} 파일이 없습니다.\n`);
  }

  // 3. 카페 게시 기록 마이그레이션
  console.log('[3/4] 카페 게시 기록 마이그레이션...');

  if (fs.existsSync(CAFE_POSTED_FILE)) {
    try {
      const postedData = JSON.parse(fs.readFileSync(CAFE_POSTED_FILE, 'utf-8'));
      console.log(`  📁 ${CAFE_POSTED_FILE}`);

      let migrated = 0;

      for (const [productId, postInfo] of Object.entries(postedData)) {
        const count = postInfo.count || 1;

        // 각 게시 횟수만큼 기록 생성
        for (let i = 0; i < count; i++) {
          const { error } = await supabase
            .from('posts')
            .insert({
              product_id: productId,
              platform: 'cafe',
              success: true,
              posted_at: postInfo.lastPosted || new Date().toISOString()
            });

          if (!error) migrated++;
        }
      }

      console.log(`  ✅ ${migrated}개 카페 게시 기록 마이그레이션 완료\n`);

    } catch (error) {
      console.error(`  ❌ 오류: ${error.message}\n`);
    }
  } else {
    console.log(`  ⚠️ ${CAFE_POSTED_FILE} 파일이 없습니다.\n`);
  }

  // 4. 블로그 게시 기록 마이그레이션
  console.log('[4/4] 블로그 게시 기록 마이그레이션...');

  if (fs.existsSync(BLOG_POSTED_FILE)) {
    try {
      const postedData = JSON.parse(fs.readFileSync(BLOG_POSTED_FILE, 'utf-8'));
      console.log(`  📁 ${BLOG_POSTED_FILE}`);

      let migrated = 0;

      for (const [productId, postInfo] of Object.entries(postedData)) {
        const count = postInfo.count || 1;

        for (let i = 0; i < count; i++) {
          const { error } = await supabase
            .from('posts')
            .insert({
              product_id: productId,
              platform: 'blog',
              success: true,
              posted_at: postInfo.lastPosted || new Date().toISOString()
            });

          if (!error) migrated++;
        }
      }

      console.log(`  ✅ ${migrated}개 블로그 게시 기록 마이그레이션 완료\n`);

    } catch (error) {
      console.error(`  ❌ 오류: ${error.message}\n`);
    }
  } else {
    console.log(`  ⚠️ ${BLOG_POSTED_FILE} 파일이 없습니다.\n`);
  }

  // 최종 통계
  const { count: productCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  const { count: postCount } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true });

  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   마이그레이션 완료!                           ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║   총 상품: ${productCount}개`);
  console.log(`║   총 게시 기록: ${postCount}개`);
  console.log('╚════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
