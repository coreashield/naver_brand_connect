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
 * - 최근 30분 이내 게시된 상품 제외 (동시 실행 방지)
 * - 상위 5개 중 랜덤 선택 (다양성 확보)
 */
export async function getProductsForPosting(platform, limit = 1) {
  // 최근 30분 이내 게시된 상품 ID 조회
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: recentPosts } = await supabase
    .from('posts')
    .select('product_id')
    .eq('platform', platform)
    .gte('posted_at', thirtyMinAgo);

  const recentProductIds = recentPosts?.map(p => p.product_id) || [];

  // 상위 5개 후보 조회
  let query = supabase
    .from('product_post_counts')
    .select('*')
    .eq('status', 'ON')
    .not('affiliate_link', 'is', null)
    .order(platform === 'cafe' ? 'cafe_count' : 'blog_count', { ascending: true })
    .order('total_count', { ascending: true })
    .limit(5);

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
  testConnection
};
