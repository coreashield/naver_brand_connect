/**
 * Batch update product details
 * Crawl existing products and add detailed info
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { crawlProductDetail } from './product_detail_crawler.js';
import { getAccountById } from '../supabase/db.js';

dotenv.config();

const ACCOUNT_ID = 1; // 하드코딩: 계정 1번 사용

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL, SUPABASE_SERVICE_KEY required in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function log(message) {
  const timestamp = new Date().toLocaleString('ko-KR');
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Get products that need detail update
 */
async function getProductsNeedingUpdate(limit = 50) {
  // First try with detail_crawled_at column (if migration applied)
  let { data, error } = await supabase
    .from('products')
    .select('product_id, name, affiliate_link, product_url')
    .is('detail_crawled_at', null)
    .eq('status', 'ON')
    .limit(limit);

  // If column doesn't exist, get all active products
  if (error && error.message.includes('does not exist')) {
    log('[INFO] Migration not applied, getting all active products...');
    const result = await supabase
      .from('products')
      .select('product_id, name, affiliate_link, product_url')
      .eq('status', 'ON')
      .limit(limit);
    data = result.data;
    error = result.error;
  }

  if (error) {
    log(`[ERROR] DB query failed: ${error.message}`);
    return [];
  }

  return data || [];
}

/**
 * Update product info in DB
 */
async function updateProduct(productId, info) {
  const updateData = {
    detail_crawled_at: new Date().toISOString()
  };

  if (info.category) updateData.category = info.category;
  if (info.brand) updateData.brand = info.brand;
  // manufacturer 컬럼이 DB에 없으므로 제외
  if (info.description) updateData.description = info.description;
  if (info.rating) updateData.rating = info.rating;
  if (info.reviewCount) updateData.review_count = info.reviewCount;
  if (info.mainImage) updateData.images = [info.mainImage];
  if (info.keywords && info.keywords.length > 0) updateData.features = info.keywords;
  if (info.targetAudience) updateData.target_audience = info.targetAudience;

  const { error } = await supabase
    .from('products')
    .update(updateData)
    .eq('product_id', productId);

  if (error) {
    log(`  [FAIL] Update failed (${productId}): ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Product Detail Batch Update');
  console.log('='.repeat(60));

  log('Querying products needing update...');
  const products = await getProductsNeedingUpdate(500);

  if (products.length === 0) {
    log('[OK] All products already updated.');
    return;
  }

  log(`[INFO] ${products.length} products to update`);

  // 계정 정보 로드
  log('Loading account info...');
  const account = await getAccountById(ACCOUNT_ID);
  if (!account) {
    log(`[ERROR] Account ID ${ACCOUNT_ID} not found`);
    return;
  }
  log(`[OK] Account: ${account.naver_id}`);

  log('Starting browser...');
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  // 네이버 로그인
  log('Logging in to Naver...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.click('#id');
  await page.keyboard.type(account.naver_id, { delay: 50 });
  await page.click('#pw');
  await page.keyboard.type(account.naver_pw, { delay: 50 });
  await page.click('#log\\.login');
  await page.waitForTimeout(3000);

  // 로그인 확인
  const currentUrl = page.url();
  if (currentUrl.includes('nidlogin') || currentUrl.includes('captcha')) {
    log('[WARN] CAPTCHA detected - please solve manually...');
    await page.waitForURL(url => { const s = String(url); return !s.includes('nidlogin') && !s.includes('captcha'); }, { timeout: 120000 });
  }
  log('[OK] Login successful');

  await page.close();

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  try {
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const url = product.affiliate_link || product.product_url;

      log(`\n[${i + 1}/${products.length}] ${product.name.substring(0, 40)}...`);

      if (!url) {
        log('  [SKIP] No URL');
        skipCount++;
        continue;
      }

      try {
        // 로그인된 context를 사용하여 크롤링
        const info = await crawlProductDetail(context, url, { useExistingContext: true });

        if (info.success) {
          const updated = await updateProduct(product.product_id, info);
          if (updated) {
            log(`  [OK] Updated`);
            if (info.category) log(`     Category: ${info.category}`);
            if (info.brand) log(`     Brand: ${info.brand}`);
            if (info.rating) log(`     Rating: ${info.rating}`);
            if (info.reviewCount) log(`     Reviews: ${info.reviewCount.toLocaleString()}`);
            successCount++;
          } else {
            failCount++;
          }
        } else {
          log(`  [WARN] Crawl failed: ${info.error}`);
          // 실패 시 detail_crawled_at 업데이트 안 함 → 다음에 다시 시도
          failCount++;
        }

        const delay = 3000 + Math.random() * 2000;
        log(`  Waiting ${Math.round(delay/1000)}s...`);
        await new Promise(r => setTimeout(r, delay));

      } catch (error) {
        log(`  [ERROR] ${error.message}`);
        failCount++;
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  console.log('\n' + '='.repeat(60));
  log('Update Complete!');
  log(`   Success: ${successCount}`);
  log(`   Failed: ${failCount}`);
  log(`   Skipped: ${skipCount}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
