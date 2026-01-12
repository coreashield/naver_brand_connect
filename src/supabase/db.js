/**
 * Supabase Database Client
 * 모든 스크립트에서 공통으로 사용
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.');
  console.error('   .env 파일에 SUPABASE_URL과 SUPABASE_SERVICE_KEY를 추가하세요.');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ==================== Products ====================

/**
 * 상품 추가 또는 업데이트 (upsert)
 */
export async function upsertProduct(product) {
  const { data, error } = await supabase
    .from('products')
    .upsert({
      product_id: product.productId || product.product_id,
      name: product.name,
      store: product.store,
      price: product.price,
      original_price: product.originalPrice || product.original_price,
      commission: product.commission,
      status: product.status || 'ON',
      product_url: product.productUrl || product.product_url,
      affiliate_link: product.affiliateLink || product.affiliate_link,
      naver_shopping_url: product.naverShoppingUrl || product.naver_shopping_url || null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'product_id'
    })
    .select();

  if (error) throw error;
  return data;
}

/**
 * 여러 상품 일괄 추가/업데이트
 */
export async function upsertProducts(products) {
  const formatted = products.map(p => ({
    product_id: p.productId || p.product_id,
    name: p.name,
    store: p.store,
    price: p.price,
    original_price: p.originalPrice || p.original_price,
    commission: p.commission,
    status: p.status || 'ON',
    product_url: p.productUrl || p.product_url,
    affiliate_link: p.affiliateLink || p.affiliate_link,
    naver_shopping_url: p.naverShoppingUrl || p.naver_shopping_url || null,
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('products')
    .upsert(formatted, { onConflict: 'product_id' })
    .select();

  if (error) throw error;
  return data;
}

/**
 * 모든 상품 조회
 */
export async function getAllProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'ON')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * 게시 횟수가 적은 상품 조회 (플랫폼별)
 * - 최근 24시간 이내 게시된 상품 제외 (중복 방지 강화)
 * - 상위 50개 중 랜덤 선택 (다양성 확보 + 중복 방지)
 */
export async function getProductsForPosting(platform, limit = 1) {
  // 최근 24시간 이내 게시된 상품 ID 조회 (중복 방지 강화)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentPosts } = await supabase
    .from('posts')
    .select('product_id')
    .eq('platform', platform)
    .gte('posted_at', oneDayAgo);

  const recentProductIds = recentPosts?.map(p => p.product_id) || [];

  // 상위 50개 후보 조회 (중복 방지를 위해 풀 확대)
  let query = supabase
    .from('product_post_counts')
    .select('*')
    .eq('status', 'ON')
    .not('affiliate_link', 'is', null)
    .order(platform === 'cafe' ? 'cafe_count' : 'blog_count', { ascending: true })
    .order('total_count', { ascending: true })
    .limit(50);

  const { data, error } = await query;

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // 최근 게시된 상품 제외
  let candidates = data.filter(p => !recentProductIds.includes(p.product_id));

  // 후보가 없으면 전체에서 선택
  if (candidates.length === 0) {
    candidates = data;
  }

  // 랜덤 셔플 후 limit만큼 반환
  const shuffled = candidates.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * 상품 수 조회
 */
export async function getProductCount() {
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  if (error) throw error;
  return count;
}

// ==================== Workers ====================

/**
 * Worker 등록/업데이트
 */
export async function registerWorker(name, platform) {
  const { data, error } = await supabase
    .from('workers')
    .upsert({
      name,
      platform,
      status: 'active',
      last_heartbeat: new Date().toISOString()
    }, {
      onConflict: 'name'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Worker heartbeat 업데이트
 */
export async function updateWorkerHeartbeat(workerId) {
  const { error } = await supabase
    .from('workers')
    .update({
      last_heartbeat: new Date().toISOString(),
      status: 'active'
    })
    .eq('id', workerId);

  if (error) throw error;
}

/**
 * Worker 상태 변경
 */
export async function updateWorkerStatus(workerId, status) {
  const { error } = await supabase
    .from('workers')
    .update({ status })
    .eq('id', workerId);

  if (error) throw error;
}

// ==================== Posts ====================

/**
 * 게시 기록 추가
 */
export async function recordPost(productId, workerId, platform, success = true, errorMessage = null) {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      product_id: productId,
      worker_id: workerId,
      platform,
      success,
      error_message: errorMessage,
      posted_at: new Date().toISOString()
    })
    .select();

  if (error) throw error;
  return data;
}

/**
 * 플랫폼별 게시 횟수 조회
 */
export async function getPostCount(productId, platform) {
  const { count, error } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('platform', platform)
    .eq('success', true);

  if (error) throw error;
  return count;
}

// ==================== Task Queue ====================

/**
 * 작업 추가
 */
export async function addTask(productId, taskType, priority = 0) {
  const { data, error } = await supabase
    .from('task_queue')
    .insert({
      product_id: productId,
      task_type: taskType,
      priority,
      status: 'pending'
    })
    .select();

  if (error) throw error;
  return data;
}

/**
 * 대기 중인 작업 가져오기 (원자적 할당)
 */
export async function claimTask(workerId, taskType) {
  // 먼저 pending 상태의 작업 조회
  const { data: tasks, error: selectError } = await supabase
    .from('task_queue')
    .select('*')
    .eq('status', 'pending')
    .eq('task_type', taskType)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (selectError) throw selectError;
  if (!tasks || tasks.length === 0) return null;

  const task = tasks[0];

  // 작업 할당 시도
  const { data, error } = await supabase
    .from('task_queue')
    .update({
      status: 'processing',
      assigned_worker: workerId,
      started_at: new Date().toISOString()
    })
    .eq('id', task.id)
    .eq('status', 'pending') // 동시성 제어
    .select()
    .single();

  if (error) {
    // 다른 worker가 먼저 가져갔을 수 있음
    return null;
  }

  return data;
}

/**
 * 작업 완료 처리
 */
export async function completeTask(taskId, success = true) {
  const { error } = await supabase
    .from('task_queue')
    .update({
      status: success ? 'completed' : 'failed',
      completed_at: new Date().toISOString()
    })
    .eq('id', taskId);

  if (error) throw error;
}

/**
 * 실패한 작업 재시도
 */
export async function retryTask(taskId) {
  const { error } = await supabase
    .from('task_queue')
    .update({
      status: 'pending',
      assigned_worker: null,
      retry_count: supabase.sql`retry_count + 1`
    })
    .eq('id', taskId);

  if (error) throw error;
}

// ==================== 유틸리티 ====================

/**
 * DB 연결 테스트
 */
export async function testConnection() {
  try {
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    return { success: true, productCount: count };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== Naver Shopping URL ====================

/**
 * naver_shopping_url 업데이트
 */
export async function updateNaverShoppingUrl(productId, naverShoppingUrl) {
  const { error } = await supabase
    .from('products')
    .update({
      naver_shopping_url: naverShoppingUrl,
      updated_at: new Date().toISOString()
    })
    .eq('product_id', productId);

  if (error) throw error;
}

/**
 * naver_shopping_url이 없는 상품 조회
 */
export async function getProductsWithoutNaverUrl(limit = 100) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'ON')
    .is('naver_shopping_url', null)
    .not('product_url', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * naver_shopping_url 통계
 */
export async function getNaverUrlStats() {
  const { count: total } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ON');

  const { count: withUrl } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ON')
    .not('naver_shopping_url', 'is', null);

  return {
    total: total || 0,
    withNaverUrl: withUrl || 0,
    withoutNaverUrl: (total || 0) - (withUrl || 0)
  };
}

/**
 * 상품 삭제 (삭제된 Brand Connect 상품)
 */
export async function deleteProduct(productId) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('product_id', productId);

  if (error) throw error;
}

// ==================== Daily Issuance (일일 발급 추적) ====================

/**
 * 기존 모든 product_id 조회 (중복 발급 방지용)
 * @returns {Set<string>} product_id Set
 */
export async function getExistingProductIds() {
  const { data, error } = await supabase
    .from('products')
    .select('product_id');

  if (error) throw error;
  return new Set(data?.map(p => p.product_id) || []);
}

/**
 * 오늘 발급 수 조회
 */
export async function getTodayIssuanceCount() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_issuance')
    .select('issued_count')
    .eq('issue_date', today)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data?.issued_count || 0;
}

/**
 * 일일 발급 카운트 증가 (PostgreSQL 함수 호출)
 * @returns {number} 증가 후 현재 카운트
 */
export async function incrementDailyIssuance(incrementBy = 1) {
  const { data, error } = await supabase
    .rpc('increment_daily_issuance', { increment_by: incrementBy });

  if (error) throw error;
  return data;
}

/**
 * 일일 한도 도달 여부 확인
 * @param {number} limit - 일일 한도 (기본 1000)
 * @returns {Object} { reached: boolean, current: number, limit: number }
 */
export async function checkDailyLimit(limit = 1000) {
  const current = await getTodayIssuanceCount();
  return {
    reached: current >= limit,
    current,
    limit
  };
}

/**
 * 일일 발급 완료 처리
 */
export async function completeDailyIssuance() {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('daily_issuance')
    .update({ completed_at: new Date().toISOString() })
    .eq('issue_date', today);

  if (error) throw error;
}

/**
 * 상품 추가 + 일일 발급 카운트 증가 (통합 함수)
 * @returns {Object} { product: data, dailyCount: number }
 */
export async function upsertProductWithTracking(product) {
  // 1. 상품 upsert
  const productData = await upsertProduct(product);

  // 2. 일일 카운트 증가
  const dailyCount = await incrementDailyIssuance(1);

  return { product: productData, dailyCount };
}

// ==================== Naver Accounts (계정 관리) ====================

/**
 * ID로 계정 조회 (날짜 변경 시 자동 리셋)
 * @param {number} accountId - 계정 ID (1, 2, 3...)
 * @returns {Object|null} 계정 정보
 */
export async function getAccountById(accountId) {
  const { data, error } = await supabase
    .rpc('get_account_by_id', { p_account_id: accountId });

  if (error) throw error;
  return data?.[0] || null;
}

/**
 * 계정 게시 카운트 증가
 * @param {number} accountId - 계정 ID
 * @param {string} platform - 'cafe' 또는 'blog'
 * @returns {number} 증가 후 카운트
 */
export async function incrementAccountCount(accountId, platform) {
  const { data, error } = await supabase
    .rpc('increment_account_count', {
      p_account_id: accountId,
      p_platform: platform
    });

  if (error) throw error;
  return data;
}

/**
 * 새 계정 추가
 * @param {Object} account - 계정 정보
 * @returns {Object} 생성된 계정
 */
export async function addAccount(account) {
  const { data, error } = await supabase
    .from('naver_accounts')
    .insert({
      naver_id: account.naverId,
      naver_pw: account.naverPw,
      blog_id: account.blogId || account.naverId,
      cafe_url: account.cafeUrl,
      daily_cafe_limit: account.dailyCafeLimit || 200,
      daily_blog_limit: account.dailyBlogLimit || 5,
      memo: account.memo
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * 모든 계정 통계 조회
 * @returns {Array} 계정 목록 with 통계
 */
export async function getAllAccountStats() {
  const { data, error } = await supabase
    .from('naver_accounts')
    .select('id, naver_id, status, today_cafe_count, today_blog_count, daily_cafe_limit, daily_blog_limit, memo, updated_at')
    .order('id');

  if (error) throw error;
  return data;
}

/**
 * 계정 상태 업데이트
 * @param {number} accountId - 계정 ID
 * @param {string} status - 'active' 또는 'suspended'
 */
export async function updateAccountStatus(accountId, status) {
  const { error } = await supabase
    .from('naver_accounts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) throw error;
}

/**
 * 계정의 오늘 카운트를 일일 한도로 설정 (한도 도달 처리)
 * @param {number} accountId - 계정 ID
 * @param {string} platform - 'cafe' 또는 'blog'
 */
export async function setAccountCountToLimit(accountId, platform) {
  const countField = platform === 'cafe' ? 'today_cafe_count' : 'today_blog_count';
  const limitField = platform === 'cafe' ? 'daily_cafe_limit' : 'daily_blog_limit';

  // 먼저 limit 값 조회
  const { data: account, error: fetchError } = await supabase
    .from('naver_accounts')
    .select(`${limitField}`)
    .eq('id', accountId)
    .single();

  if (fetchError) throw fetchError;

  // count를 limit으로 설정
  const { error: updateError } = await supabase
    .from('naver_accounts')
    .update({
      [countField]: account[limitField],
      updated_at: new Date().toISOString()
    })
    .eq('id', accountId);

  if (updateError) throw updateError;

  return account[limitField];
}

export default {
  supabase,
  upsertProduct,
  upsertProducts,
  getAllProducts,
  getProductsForPosting,
  getProductCount,
  registerWorker,
  updateWorkerHeartbeat,
  updateWorkerStatus,
  recordPost,
  getPostCount,
  addTask,
  claimTask,
  completeTask,
  retryTask,
  testConnection,
  updateNaverShoppingUrl,
  getProductsWithoutNaverUrl,
  getNaverUrlStats,
  deleteProduct,
  // Daily Issuance
  getExistingProductIds,
  getTodayIssuanceCount,
  incrementDailyIssuance,
  checkDailyLimit,
  completeDailyIssuance,
  upsertProductWithTracking,
  // Naver Accounts
  getAccountById,
  incrementAccountCount,
  setAccountCountToLimit,
  addAccount,
  getAllAccountStats,
  updateAccountStatus
};
