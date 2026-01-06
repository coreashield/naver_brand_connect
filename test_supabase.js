/**
 * Supabase 연동 테스트
 * DB 연결, 테이블 확인, 기본 CRUD 테스트
 */

import dotenv from 'dotenv';
import {
  supabase,
  testConnection,
  getProductCount,
  getAllProducts,
  getProductsForPosting,
  registerWorker,
  updateWorkerStatus
} from './src/supabase/db.js';

dotenv.config();

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Supabase 연동 테스트                         ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // 1. 연결 테스트
  console.log('[1/6] DB 연결 테스트...');
  try {
    const result = await testConnection();
    if (result.success) {
      console.log(`  ✅ 연결 성공 (상품 수: ${result.productCount}개)\n`);
      passed++;
    } else {
      throw new Error(result.error);
    }
  } catch (e) {
    console.log(`  ❌ 연결 실패: ${e.message}`);
    console.log('\n📌 해결 방법:');
    console.log('   1. .env 파일에 SUPABASE_URL과 SUPABASE_SERVICE_KEY 확인');
    console.log('   2. Supabase 대시보드에서 테이블이 생성되었는지 확인');
    console.log('   3. src/supabase/schema.sql을 SQL Editor에서 실행\n');
    failed++;
    process.exit(1);
  }

  // 2. 테이블 존재 확인
  console.log('[2/6] 테이블 존재 확인...');
  try {
    const tables = ['products', 'workers', 'posts', 'task_queue'];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        throw new Error(`테이블 '${table}' 접근 오류: ${error.message}`);
      }
    }

    console.log(`  ✅ 모든 테이블 확인 완료 (${tables.join(', ')})\n`);
    passed++;
  } catch (e) {
    console.log(`  ❌ 테이블 확인 실패: ${e.message}`);
    console.log('   → src/supabase/schema.sql을 Supabase SQL Editor에서 실행하세요.\n');
    failed++;
  }

  // 3. 뷰 확인
  console.log('[3/6] product_post_counts 뷰 확인...');
  try {
    const { data, error } = await supabase
      .from('product_post_counts')
      .select('*')
      .limit(1);

    if (error) throw error;

    console.log(`  ✅ 뷰 정상 동작\n`);
    passed++;
  } catch (e) {
    console.log(`  ❌ 뷰 확인 실패: ${e.message}`);
    console.log('   → schema.sql에서 VIEW 생성 부분을 다시 실행하세요.\n');
    failed++;
  }

  // 4. Worker 등록 테스트
  console.log('[4/6] Worker 등록 테스트...');
  try {
    const testWorker = await registerWorker(`test-${Date.now()}`, 'test');
    console.log(`  ✅ Worker 등록 성공: ${testWorker.name} (${testWorker.id})`);

    // 상태 변경 테스트
    await updateWorkerStatus(testWorker.id, 'testing');
    console.log(`  ✅ Worker 상태 변경 성공\n`);
    passed++;
  } catch (e) {
    console.log(`  ❌ Worker 테스트 실패: ${e.message}\n`);
    failed++;
  }

  // 5. 상품 조회 테스트
  console.log('[5/6] 상품 조회 테스트...');
  try {
    const count = await getProductCount();
    console.log(`  📊 등록된 상품 수: ${count}개`);

    if (count > 0) {
      const products = await getProductsForPosting('cafe', 3);
      console.log(`  📋 카페용 상품 조회: ${products.length}개`);

      if (products.length > 0) {
        console.log(`     첫 번째: ${products[0].name.substring(0, 30)}...`);
        console.log(`     카페 게시 횟수: ${products[0].cafe_count}회`);
      }
    }

    console.log(`  ✅ 상품 조회 성공\n`);
    passed++;
  } catch (e) {
    console.log(`  ❌ 상품 조회 실패: ${e.message}\n`);
    failed++;
  }

  // 6. 게시 기록 테스트
  console.log('[6/6] Posts 테이블 테스트...');
  try {
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    console.log(`  📊 게시 기록 수: ${count}개`);
    console.log(`  ✅ 게시 기록 테이블 정상\n`);
    passed++;
  } catch (e) {
    console.log(`  ❌ 게시 기록 테스트 실패: ${e.message}\n`);
    failed++;
  }

  // 결과 요약
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   테스트 결과                                  ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║   통과: ${passed}개`);
  console.log(`║   실패: ${failed}개`);
  console.log('╚════════════════════════════════════════════════╝\n');

  if (failed === 0) {
    console.log('🎉 모든 테스트 통과! Supabase 연동이 준비되었습니다.\n');
    console.log('📌 다음 단계:');
    console.log('   1. node src/supabase/migrate.js - 기존 JSON 데이터 마이그레이션');
    console.log('   2. node cafe_writer_supabase.js - 카페 자동 글쓰기');
    console.log('   3. node blog_writer_supabase.js - 블로그 자동 글쓰기');
    console.log('   4. node full_sync_supabase.js - 링크 발급 + 크롤링\n');
  } else {
    console.log('⚠️ 일부 테스트 실패. 위의 오류 메시지를 확인하세요.\n');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('테스트 오류:', e.message);
  process.exit(1);
});
