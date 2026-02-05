import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkStatus() {
  // 전체 상품 수
  const { count: total } = await supabase.from('products').select('*', { count: 'exact', head: true });
  console.log('총 상품 수:', total);

  // naver_shopping_url이 없는 상품
  const { count: noUrl } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('naver_shopping_url', null);
  console.log('naver_shopping_url 없음:', noUrl);

  // detail_crawled_at이 없는 상품 (상세정보 미파싱)
  const { count: noDetail } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('detail_crawled_at', null).eq('status', 'ON');
  console.log('상세정보 미파싱 (ON 상품):', noDetail);

  // affiliate_link 없는 ON 상품
  const { count: noAffiliate } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('affiliate_link', null).eq('status', 'ON');
  console.log('affiliate_link 없음 (ON):', noAffiliate);

  // 상세정보 파싱 완료된 상품
  const { count: detailed } = await supabase.from('products').select('*', { count: 'exact', head: true }).not('detail_crawled_at', 'is', null);
  console.log('상세정보 파싱 완료:', detailed);
}

checkStatus();
