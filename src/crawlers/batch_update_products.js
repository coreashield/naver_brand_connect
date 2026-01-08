/**
 * Batch update product details
 * Crawl existing products and add detailed info
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { crawlProductDetail } from './product_detail_crawler.js';

dotenv.config();

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
  if (info.manufacturer) updateData.manufacturer = info.manufacturer;
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
  const products = await getProductsNeedingUpdate(100);

  if (products.length === 0) {
    log('[OK] All products already updated.');
    return;
  }

  log(`[INFO] ${products.length} products to update`);

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
        const info = await crawlProductDetail(browser, url);

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
          await updateProduct(product.product_id, { crawledAt: new Date().toISOString() });
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
