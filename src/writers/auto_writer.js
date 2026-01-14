/**
 * 자동 글쓰기 통합 스크립트
 * 카페 200개 → 블로그 5개 (1~1.3시간 간격) → 00시 대기 → 반복
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateContent } from '../utils/content_generator.js';
import {
  claimProductForPosting,
  releaseProductLock,
  recordPost,
  registerWorker,
  updateWorkerHeartbeat,
  testConnection,
  getAccountById,
  incrementAccountCount,
  setAccountCountToLimit
} from '../supabase/db.js';

dotenv.config();

// 환경변수
const ACCOUNT_ID = parseInt(process.env.ACCOUNT_ID) || 1;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const WORKER_NAME = process.env.WORKER_NAME || `auto-${Date.now().toString(36)}`;

// DB에서 로드할 계정 정보
let account = null;

// 파일 경로
const LOG_FILE = 'output/auto_writer.log';
const IMAGE_DIR = 'output/images';

// 이미지 설정
const CAFE_MAX_IMAGES = 5;
const CAFE_MIN_IMAGES = 3;
const CAFE_SKIP_COUNT = 2;
const BLOG_MAX_IMAGES = 8;
const BLOG_MIN_IMAGES = 5;

// Gemini API
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 대가성 문구
const DISCLOSURE = '본 포스팅은 네이버 브랜드커넥트를 통해 소정의 수수료를 제공받습니다.';

function log(message) {
  const timestamp = new Date().toLocaleString('ko-KR');
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  try {
    if (!fs.existsSync('output')) fs.mkdirSync('output', { recursive: true });
    fs.appendFileSync(LOG_FILE, logMessage + '\n', 'utf-8');
  } catch (e) {}
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 이미지 다운로드
async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    ensureDir(IMAGE_DIR);
    const filepath = path.join(IMAGE_DIR, filename);
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filename).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(filepath);
        if (stats.size < 5000) {
          fs.unlinkSync(filepath);
          reject(new Error(`이미지 크기 너무 작음: ${stats.size} bytes`));
          return;
        }
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

// URL 리다이렉트
async function getRedirectUrl(page, shortUrl) {
  try {
    const tempPage = await page.context().newPage();
    await tempPage.goto(shortUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await tempPage.waitForTimeout(2000);
    const finalUrl = tempPage.url();
    await tempPage.close();
    return finalUrl;
  } catch (e) {
    log(`  URL 리다이렉트 실패: ${e.message}`);
    return null;
  }
}

// 스마트스토어 이미지 수집
async function getSmartStoreImages(page, storeUrl) {
  const imageUrls = [];
  try {
    const productPage = await page.context().newPage();
    await productPage.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await productPage.waitForTimeout(3000);

    // CAPTCHA 감지
    const hasCaptcha = await productPage.evaluate(() =>
      document.body.innerText.includes('보안 확인') || document.body.innerText.includes('캡차')
    );

    if (hasCaptcha) {
      log(`  ⚠️ CAPTCHA 감지됨 - 수동으로 풀어주세요 (60초 대기)...`);
      for (let i = 0; i < 12; i++) {
        await productPage.waitForTimeout(5000);
        const stillCaptcha = await productPage.evaluate(() =>
          document.body.innerText.includes('보안 확인') || document.body.innerText.includes('캡차')
        );
        if (!stillCaptcha) {
          log(`  ✅ CAPTCHA 해결됨!`);
          await productPage.waitForTimeout(2000);
          break;
        }
        if (i === 11) {
          log(`  ❌ CAPTCHA 대기 시간 초과`);
          await productPage.close();
          return imageUrls;
        }
      }
    }

    const mainImages = await productPage.$$eval('img', imgs => {
      return imgs
        .map(img => ({ src: img.src || img.getAttribute('data-src') || '' }))
        .filter(img => img.src && img.src.includes('http'))
        .filter(img => img.src.includes('shop-phinf') || img.src.includes('shopping-phinf'))
        .filter(img => !img.src.includes('logo') && !img.src.includes('icon') && !img.src.includes('error') && !img.src.includes('noimage'))
        .map(img => img.src.replace(/\?type=.*$/, '').replace(/_\d+x\d+/, ''))
        .filter((src, idx, arr) => arr.indexOf(src) === idx)
        .slice(0, 10);
    });

    imageUrls.push(...mainImages);
    await productPage.close();
  } catch (e) {
    log(`  스마트스토어 이미지 수집 오류: ${e.message}`);
  }
  return imageUrls;
}

// 상품 이미지 가져오기
async function getProductImages(page, product, platform) {
  const images = [];
  let imageUrls = [];
  const maxImages = platform === 'cafe' ? CAFE_MAX_IMAGES : BLOG_MAX_IMAGES;
  const minImages = platform === 'cafe' ? CAFE_MIN_IMAGES : BLOG_MIN_IMAGES;
  const skipCount = platform === 'cafe' ? CAFE_SKIP_COUNT : 1;

  try {
    const naverShoppingUrl = product.naver_shopping_url || '';
    const affiliateLink = product.affiliate_link || '';

    if (naverShoppingUrl) {
      log(`  naver_shopping_url 사용...`);
      imageUrls = await getSmartStoreImages(page, naverShoppingUrl);
    }

    if (imageUrls.length === 0 && affiliateLink && affiliateLink.includes('naver.me')) {
      log(`  affiliateLink 폴백 사용...`);
      const realUrl = await getRedirectUrl(page, affiliateLink);
      if (realUrl && (realUrl.includes('smartstore') || realUrl.includes('shopping.naver') || realUrl.includes('brand.naver.com'))) {
        imageUrls = await getSmartStoreImages(page, realUrl);
      }
    }

    const startIndex = imageUrls.length >= (minImages + skipCount) ? skipCount : 0;
    const targetCount = Math.min(maxImages, Math.max(minImages, imageUrls.length - startIndex));
    let downloadedCount = 0;

    log(`  총 ${imageUrls.length}개 이미지 중 ${startIndex}개 스킵, 목표: ${targetCount}장`);

    for (let i = startIndex; i < imageUrls.length && downloadedCount < targetCount; i++) {
      try {
        const filename = `product_${Date.now()}_${downloadedCount}.jpg`;
        const filepath = await downloadImage(imageUrls[i], filename);
        images.push(path.resolve(filepath));
        downloadedCount++;
      } catch (e) {
        log(`  이미지 다운로드 스킵: ${e.message}`);
      }
    }

    log(`  ✅ ${images.length}장 이미지 확보`);
  } catch (e) {
    log(`이미지 수집 오류: ${e.message}`);
  }

  return images;
}

// 인용구 스타일 인덱스
let quoteStyleIndex = 0;

// 인용구 입력
async function insertQuote(page, text) {
  await page.keyboard.press('Control+Alt+q');
  await page.waitForTimeout(500);

  const styleCount = quoteStyleIndex % 3;
  for (let i = 0; i < styleCount; i++) {
    await page.keyboard.press('Control+Alt+q');
    await page.waitForTimeout(300);
  }
  quoteStyleIndex++;

  if (text.length > 40) {
    const words = text.split(' ');
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + ' ' + word).length > 40) {
        await page.keyboard.type(currentLine.trim(), { delay: 15 });
        await page.keyboard.press('Enter');
        currentLine = word;
      } else {
        currentLine += ' ' + word;
      }
    }
    if (currentLine.trim()) {
      await page.keyboard.type(currentLine.trim(), { delay: 15 });
    }
  } else {
    await page.keyboard.type(text, { delay: 15 });
  }

  await page.waitForTimeout(300);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

// 볼드 텍스트 입력
async function typeWithBold(page, text, isBoldActive = false) {
  let boldState = isBoldActive;
  const parts = text.split(/(\*\*)/g);

  for (const part of parts) {
    if (part === '**') {
      await page.keyboard.press('Control+b');
      await page.waitForTimeout(100);
      boldState = !boldState;
    } else if (part) {
      await page.keyboard.type(part, { delay: boldState ? 15 : 10 });
    }
  }
  return boldState;
}

// 해시태그 생성
function generateHashtags(productName, count = 10) {
  const keywords = productName
    .replace(/[\[\]\(\)\/\+\-\d]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 10)
    .filter(w => !['세트', '개입', '무료', '배송', '할인', '특가', '증정', '박스'].includes(w));

  const allTags = [...new Set(keywords)].slice(0, count);
  return allTags.map(tag => `#${tag}`).join(' ');
}

// Gemini 콘텐츠 생성
async function generateContentWithGemini(product, platform) {
  log(`  Gemini API로 콘텐츠 생성 중...`);

  const productInfo = {
    name: product.name,
    price: product.price ? parseInt(product.price.toString().replace(/[^0-9]/g, '')) : null,
    originalPrice: product.original_price ? parseInt(product.original_price.toString().replace(/[^0-9]/g, '')) : null,
    category: product.category || null,
    keywords: product.keywords || [],
    targetAudience: { ageGroup: '20-40대', gender: '공용', persona: '일반 소비자' }
  };

  try {
    const result = await generateContent(productInfo, {
      platform,
      style: null,
      apiKey: GEMINI_API_KEY
    });

    let title = result.title || `${product.name} 추천합니다`;
    let content = result.body || '';

    title = title.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣!?,.\[\]\(\)]/g, '').trim();
    content = content.replace(/(?<!\*)\*(?!\*)/g, '').replace(/^#+\s*/gm, '').replace(/`/g, '').trim();

    log(`  ✨ 스타일: ${result.styleName}`);
    return { title, content, style: result.styleName };
  } catch (error) {
    log(`  Gemini API 오류: ${error.message}`);
    return {
      title: `${product.name} 추천`,
      content: `요즘 핫한 상품 발견했어요~\n\n${product.name}\n\n가성비 좋고 품질도 좋다고 소문난 제품이에요.`,
      style: 'fallback'
    };
  }
}

// ==================== 카페 글쓰기 ====================
async function writeCafePost(page, product, images, doLoginFn) {
  try {
    log(`[카페] 글 작성 시작: ${product.name.substring(0, 30)}...`);

    const geminiResult = await generateContentWithGemini(product, 'cafe');
    const cafeWriteUrl = account?.cafe_url || 'https://cafe.naver.com/ca-fe/cafes/31634939/articles/write?boardType=L';

    await page.goto(cafeWriteUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      log('  세션 만료 - 재로그인...');
      await doLoginFn();
      await page.goto(cafeWriteUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    await page.waitForTimeout(1000);

    // 게시판 선택
    try {
      const boardDropdown = page.locator('text=게시판을 선택해 주세요.').first();
      if (await boardDropdown.count() > 0) {
        await boardDropdown.click();
        await page.waitForTimeout(1500);
        const boardOption = page.locator('text=자유게시판').first();
        if (await boardOption.count() > 0) {
          await boardOption.click();
          await page.waitForTimeout(500);
        }
      }
    } catch (e) {}

    // 제목 입력
    const titleInput = page.locator('textarea.textarea_input, textarea[placeholder*="제목"]');
    await titleInput.fill(geminiResult.title);
    log(`  제목: ${geminiResult.title}`);
    await page.waitForTimeout(500);

    // 에디터 클릭
    const editorBody = page.locator('.se-component-content, [contenteditable="true"]').first();
    await editorBody.click();
    await page.waitForTimeout(500);

    // 이미지 업로드 함수
    async function uploadSingleImage(imagePath) {
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          page.locator('button[data-name="image"]').click()
        ]);
        await fileChooser.setFiles([imagePath]);
        await page.waitForTimeout(3000);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await page.keyboard.press('Control+End');
        await page.waitForTimeout(500);
        return true;
      } catch (e) {
        return false;
      }
    }

    // 1. 대가성 문구
    await page.keyboard.type(DISCLOSURE, { delay: 15 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // 2. 링크
    const affiliateLink = product.affiliate_link || '';
    if (affiliateLink) {
      await page.keyboard.type(affiliateLink, { delay: 15 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);
      await page.keyboard.press('Enter');
    }

    // 3. 첫 번째 이미지
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    if (images.length > 0) {
      await uploadSingleImage(images[0]);
    }

    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // 4. 본문
    let content = geminiResult.content;
    content = content.replace(/\[QOU?TE\]/gi, '[QUOTE]').replace(/\[?\/QOU?TE\]/gi, '[/QUOTE]');

    const quoteRegex = /\[QUOTE\]([\s\S]*?)\[\/QUOTE\]/gi;
    let lastIndex = 0;
    let match;
    const parts = [];

    while ((match = quoteRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'quote', content: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.slice(lastIndex) });
    }

    const middleImages = images.length > 1 ? images.slice(1) : [];
    let middleImageIndex = 0;

    for (const part of parts) {
      if (part.type === 'quote') {
        await insertQuote(page, part.content);
        if (middleImageIndex < middleImages.length) {
          await page.keyboard.press('Enter');
          await uploadSingleImage(middleImages[middleImageIndex]);
          middleImageIndex++;
          await page.keyboard.press('Enter');
        }
      } else {
        const lines = part.content.split('\n');
        let boldState = false;
        for (const line of lines) {
          if (line.trim()) {
            boldState = await typeWithBold(page, line, boldState);
          }
          await page.keyboard.press('Enter');
          await page.waitForTimeout(100);
        }
      }
    }

    // 남은 이미지
    while (middleImageIndex < middleImages.length) {
      await page.keyboard.press('Enter');
      await uploadSingleImage(middleImages[middleImageIndex]);
      middleImageIndex++;
    }

    // 5. 마무리
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('지금 바로 확인해보세요!', { delay: 20 });
    await page.keyboard.press('Enter');

    // 해시태그
    try {
      const hashtags = generateHashtags(product.name, 10);
      const tagList = hashtags.split(' ').map(tag => tag.replace('#', ''));
      const tagInput = page.locator('input.tag_input').first();
      if (await tagInput.count() > 0) {
        await tagInput.click({ force: true });
        for (const tag of tagList) {
          await page.keyboard.type(tag, { delay: 30 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(400);
        }
      }
    } catch (e) {}

    // 등록
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await titleInput.click();
    await page.waitForTimeout(500);

    let registered = false;

    // 1차: .BaseButton--skinGreen (a 태그)
    const skinGreenBtn = page.locator('.BaseButton--skinGreen');
    if (await skinGreenBtn.count() > 0) {
      log(`  등록 버튼 발견 (skinGreen), 클릭 시도...`);
      await skinGreenBtn.first().click();
      await page.waitForTimeout(5000);
      if (!page.url().includes('/write')) {
        registered = true;
        log(`  ✅ 카페 글 등록 완료!`);
      }
    }

    // 2차: 텍스트가 '등록'인 버튼/링크
    if (!registered) {
      const allBtns = await page.locator('.BaseButton').all();
      for (const btn of allBtns) {
        try {
          const text = await btn.innerText();
          if (text.trim() === '등록') {
            log(`  등록 버튼 발견 (BaseButton 텍스트), 클릭 시도...`);
            await btn.click();
            await page.waitForTimeout(5000);
            if (!page.url().includes('/write')) {
              registered = true;
              log(`  ✅ 카페 글 등록 완료!`);
            }
            break;
          }
        } catch (e) {}
      }
    }

    if (!registered) {
      log(`  ⚠️ 등록 버튼 못찾음 - 일일 한도 도달로 처리`);
      return 'limit_reached';
    }

    return registered;
  } catch (e) {
    log(`  ❌ 카페 글 작성 오류: ${e.message}`);
    return false;
  }
}

// ==================== 블로그 글쓰기 ====================
async function writeBlogPost(page, product, images, doLoginFn) {
  try {
    log(`[블로그] 글 작성 시작: ${product.name.substring(0, 30)}...`);

    const geminiResult = await generateContentWithGemini(product, 'blog');
    const blogId = account?.blog_id || account?.naver_id || 'unknown';
    const blogWriteUrl = `https://blog.naver.com/${blogId}?Redirect=Write&categoryNo=1`;

    await page.goto(blogWriteUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      log('  세션 만료 - 재로그인...');
      await doLoginFn();
      await page.goto(blogWriteUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
    }

    const mainFrame = page.frame('mainFrame');
    if (!mainFrame) {
      log('  mainFrame을 찾을 수 없습니다.');
      return false;
    }

    // 팝업 닫기
    await page.waitForTimeout(2000);
    try {
      const cancelBtn = await mainFrame.$('.se-popup-button-cancel');
      if (cancelBtn) await cancelBtn.click();
      await page.keyboard.press('Escape');
    } catch (e) {}

    // 제목
    const titleArea = await mainFrame.$('.se-documentTitle .se-text-paragraph');
    if (titleArea) {
      await titleArea.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(geminiResult.title, { delay: 30 });
    }
    await page.waitForTimeout(500);

    // 본문 영역
    const contentArea = await mainFrame.$('.se-component.se-text .se-text-paragraph');
    if (contentArea) {
      await contentArea.click();
    } else {
      await page.keyboard.press('Tab');
    }
    await page.waitForTimeout(500);

    // 이미지 업로드
    async function uploadSingleImage(imagePath) {
      try {
        const absolutePath = path.resolve(imagePath);
        if (!fs.existsSync(absolutePath)) return false;

        const imageBtn = await mainFrame.$('button[data-name="image"]');
        if (imageBtn) {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            imageBtn.click()
          ]);
          await fileChooser.setFiles([absolutePath]);
          await page.waitForTimeout(3000);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    }

    // 대가성 문구
    await page.keyboard.type(DISCLOSURE, { delay: 15 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // 첫 번째 이미지
    if (images.length > 2) {
      await uploadSingleImage(images[2]);
    }

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // 본문
    let content = geminiResult.content;
    content = content.replace(/\[QOU?T?E?\]/gi, '[QUOTE]').replace(/\[?\/QOU?T?E?\]/gi, '[/QUOTE]');

    const quoteRegex = /\[QUOTE\]([\s\S]*?)\[\/QUOTE\]/gi;
    let lastIndex = 0;
    let match;
    const parts = [];

    while ((match = quoteRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'quote', content: match[1].trim() });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.slice(lastIndex) });
    }

    const middleImages = images.length > 4 ? images.slice(3, -1) : [];
    let middleImageIndex = 0;

    for (const part of parts) {
      if (part.type === 'quote') {
        await insertQuote(page, part.content);
        if (middleImageIndex < middleImages.length) {
          await page.keyboard.press('Enter');
          await uploadSingleImage(middleImages[middleImageIndex]);
          middleImageIndex++;
          await page.keyboard.press('Enter');
        }
      } else {
        const lines = part.content.split('\n');
        let boldState = false;
        for (const line of lines) {
          if (line.trim()) {
            boldState = await typeWithBold(page, line, boldState);
          }
          await page.keyboard.press('Enter');
          await page.waitForTimeout(100);
        }
      }
    }

    // 마지막 이미지 + 링크
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    if (images.length > 1) {
      await uploadSingleImage(images[images.length - 1]);
      await page.keyboard.press('Enter');
    }

    await page.keyboard.type('지금 바로 확인해보세요!', { delay: 20 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    const affiliateLink = product.affiliate_link || '';
    if (affiliateLink) {
      await page.keyboard.type(affiliateLink, { delay: 15 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);
    }

    // 도움말 패널 닫기 (발행 버튼을 가릴 수 있음)
    try {
      const helpCloseBtn = await mainFrame.$('button.se-help-panel-close-button');
      if (helpCloseBtn) {
        await helpCloseBtn.click();
        log(`  도움말 패널 닫기`);
        await page.waitForTimeout(500);
      }
    } catch (e) {}

    // 발행
    await page.keyboard.press('Escape');
    const publishBtn = await mainFrame.$('button.publish_btn__Y5YlZ, button[class*="publish"]');
    if (publishBtn) {
      await publishBtn.click();
      await page.waitForTimeout(2000);
    }

    // 해시태그
    try {
      const tagList = generateHashtags(product.name, 20).split(' ').map(t => t.replace('#', ''));
      const hashtagInput = await mainFrame.$('input[placeholder*="태그"], input[placeholder*="해시태그"]');
      if (hashtagInput) {
        for (const tag of tagList) {
          await hashtagInput.click();
          await page.keyboard.type(tag, { delay: 20 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(200);
        }
      }
    } catch (e) {}

    // 최종 발행
    await page.waitForTimeout(1000);
    try {
      const selectors = ['button[data-testid="seOnePublishBtn"]', 'button[class*="confirm_btn"]'];
      for (const selector of selectors) {
        const finalBtn = await mainFrame.$(selector);
        if (finalBtn) {
          await finalBtn.scrollIntoViewIfNeeded();
          await finalBtn.click({ force: true });
          log(`  ✅ 블로그 글 발행 완료!`);
          break;
        }
      }
    } catch (e) {}

    await page.waitForTimeout(5000);
    return true;
  } catch (e) {
    log(`  ❌ 블로그 글 작성 오류: ${e.message}`);
    return false;
  }
}

// ==================== 메인 ====================
async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   자동 글쓰기 통합 스크립트                    ║');
  console.log('║   카페 200개 → 블로그 5개 (1~1.3시간) → 반복    ║');
  console.log('║   Ctrl+C로 종료                                ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  ensureDir('output');

  log('Supabase 연결 테스트...');
  const connTest = await testConnection();

  if (!connTest.success) {
    log(`❌ DB 연결 실패: ${connTest.error}`);
    process.exit(1);
  }

  log(`✅ DB 연결 성공 (상품: ${connTest.productCount}개)\n`);

  let worker;
  try {
    worker = await registerWorker(WORKER_NAME, 'auto');
    log(`Worker 등록: ${worker.name}\n`);
  } catch (e) {}

  const browser = await chromium.launch({
    headless: process.env.HEADLESS === 'true',
    slowMo: 30
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  // 계정 로드
  async function loadAccount() {
    log(`\n📌 계정 ID ${ACCOUNT_ID} 로드...`);
    account = await getAccountById(ACCOUNT_ID);

    if (!account) {
      throw new Error(`Account ID ${ACCOUNT_ID} not found`);
    }

    log(`✅ 계정: ${account.naver_id}`);
    log(`   카페: ${account.today_cafe_count}/${account.daily_cafe_limit} (남음: ${account.cafe_remaining})`);
    log(`   블로그: ${account.today_blog_count}/${account.daily_blog_limit} (남음: ${account.blog_remaining})`);
    return account;
  }

  // 로그인
  async function doLogin() {
    if (!account) await loadAccount();
    log('네이버 로그인 중...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(account.naver_id, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(account.naver_pw, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(5000);
    log('로그인 완료\n');
  }

  try {
    await loadAccount();
    await doLogin();

    while (true) {
      // 계정 새로고침
      await loadAccount();

      if (worker) {
        try { await updateWorkerHeartbeat(worker.id); } catch (e) {}
      }

      // 1. 카페 먼저
      if (account.cafe_remaining > 0) {
        log(`\n========== 카페 모드 (${account.today_cafe_count}/${account.daily_cafe_limit}) ==========`);

        const product = await claimProductForPosting('cafe', WORKER_NAME, 10);
        if (!product) {
          log('게시 가능한 상품 없음 (또는 모두 락 상태). 10분 대기...');
          await page.waitForTimeout(10 * 60 * 1000);
          continue;
        }

        log(`선택 (락 획득): ${product.name.substring(0, 40)}...`);

        const images = await getProductImages(page, product, 'cafe');
        if (!images || images.length === 0) {
          log(`[SKIP] 이미지 없음`);
          await recordPost(product.product_id, worker?.id, 'cafe', false, 'No images');
          await releaseProductLock(product.product_id);
          continue;
        }

        const success = await writeCafePost(page, product, images, doLogin);

        // 등록 버튼 못찾음 = 일일 한도 도달로 처리 → 블로그 모드로 전환
        if (success === 'limit_reached') {
          log(`\n🛑 카페 일일 한도 도달 - 블로그 모드로 전환합니다.`);
          try {
            const limitCount = await setAccountCountToLimit(ACCOUNT_ID, 'cafe');
            log(`   카페 카운트를 ${limitCount}/${limitCount}로 설정 완료`);
          } catch (e) {
            log(`   ⚠️ 카운트 업데이트 실패: ${e.message}`);
          }
          // 이미지 정리 후 블로그 모드로 진입 (continue)
          for (const img of images) {
            try { fs.unlinkSync(img); } catch (e) {}
          }
          await releaseProductLock(product.product_id);
          continue;
        }

        if (success === true) {
          const newCount = await incrementAccountCount(ACCOUNT_ID, 'cafe');
          log(`✅ 카페 ${newCount}/${account.daily_cafe_limit}개 완료`);
        }

        await recordPost(product.product_id, worker?.id, 'cafe', success === true, success === true ? null : 'Failed');
        await releaseProductLock(product.product_id);

        // 이미지 정리
        for (const img of images) {
          try { fs.unlinkSync(img); } catch (e) {}
        }

        // DB 카운트 변경 확인 (외부에서 한도 설정했을 수 있음)
        await loadAccount();
        if (account.cafe_remaining <= 0) {
          log(`\n🔄 DB에서 카페 한도 도달 감지 - 블로그 모드로 전환합니다.`);
          continue;
        }

        // 2~3분 대기
        const waitTime = 2 * 60 * 1000 + Math.random() * 60 * 1000;
        log(`다음 글까지 ${Math.round(waitTime / 60000)}분 대기...`);
        await page.waitForTimeout(waitTime);
      }
      // 2. 카페 끝나면 블로그
      else if (account.blog_remaining > 0) {
        log(`\n========== 블로그 모드 (${account.today_blog_count}/${account.daily_blog_limit}) ==========`);

        const product = await claimProductForPosting('blog', WORKER_NAME, 15);
        if (!product) {
          log('게시 가능한 상품 없음 (또는 모두 락 상태). 10분 대기...');
          await page.waitForTimeout(10 * 60 * 1000);
          continue;
        }

        log(`선택 (락 획득): ${product.name.substring(0, 40)}...`);

        const images = await getProductImages(page, product, 'blog');
        if (!images || images.length === 0) {
          log(`[SKIP] 이미지 없음`);
          await recordPost(product.product_id, worker?.id, 'blog', false, 'No images');
          await releaseProductLock(product.product_id);
          continue;
        }

        const success = await writeBlogPost(page, product, images, doLogin);

        if (success) {
          const newCount = await incrementAccountCount(ACCOUNT_ID, 'blog');
          log(`✅ 블로그 ${newCount}/${account.daily_blog_limit}개 완료`);
        }

        await recordPost(product.product_id, worker?.id, 'blog', success, success ? null : 'Failed');
        await releaseProductLock(product.product_id);

        // 이미지 정리
        for (const img of images) {
          try { fs.unlinkSync(img); } catch (e) {}
        }

        // 1시간~1시간20분 대기 (마지막 블로그 제외)
        await loadAccount();
        if (account.blog_remaining > 0) {
          const blogWaitTime = 60 * 60 * 1000 + Math.random() * 20 * 60 * 1000;
          log(`다음 블로그까지 ${Math.round(blogWaitTime / 60000)}분 대기...`);
          await page.waitForTimeout(blogWaitTime);
        }
      }
      // 3. 둘 다 끝나면 00시까지 대기
      else {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const waitMs = tomorrow - now;

        log(`\n========== 일일 한도 완료 ==========`);
        log(`카페: ${account.today_cafe_count}/${account.daily_cafe_limit}`);
        log(`블로그: ${account.today_blog_count}/${account.daily_blog_limit}`);
        log(`내일 00:00까지 ${Math.round(waitMs / 3600000)}시간 대기...`);

        await page.waitForTimeout(waitMs + 60000); // 1분 여유
      }
    }
  } catch (error) {
    log(`오류: ${error.message}`);
  } finally {
    await browser.close();
  }
}

main();
