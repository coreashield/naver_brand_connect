/**
 * 카페 자동 글쓰기 - Supabase 버전
 * 분산 환경에서 중복 없이 작업 가능
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import readline from 'readline';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateContent, getRandomStyle, WRITING_STYLES } from '../utils/content_generator.js';
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

// 환경변수에서 계정 ID 가져오기 (기본값 1)
const ACCOUNT_ID = parseInt(process.env.ACCOUNT_ID) || 1;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const WORKER_NAME = process.env.WORKER_NAME || `cafe-${Date.now().toString(36)}`;

// DB에서 로드할 계정 정보
let account = null;

const LOG_FILE = 'output/cafe_writer.log';
const IMAGE_DIR = 'output/images';
const MAX_IMAGES = 5;  // 3~5장 다운로드
const MIN_IMAGES = 3;
const SKIP_COUNT = 2;  // 처음 2개 이미지 스킵 (로고/배너)

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 대가성 문구
const DISCLOSURE = '본 포스팅은 네이버 브랜드커넥트를 통해 소정의 수수료를 제공받습니다.';

function log(message) {
  const timestamp = new Date().toLocaleString('ko-KR');
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  try {
    fs.appendFileSync(LOG_FILE, logMessage + '\n', 'utf-8');
  } catch (e) {}
}

/**
 * CAPTCHA 해결 대기 (엔터키 입력 대기)
 */
async function waitForEnter(message = 'CAPTCHA를 해결한 후 엔터키를 누르세요...') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`\n⚠️  ${message}\n>> `, () => {
      rl.close();
      resolve();
    });
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 이미지 다운로드 (크기 검증 포함)
async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    ensureDir(IMAGE_DIR);
    const filepath = path.join(IMAGE_DIR, filename);

    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filename)
          .then(resolve)
          .catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();

        // 파일 크기 검증 (5KB 미만은 에러 이미지로 간주)
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

// 단축 URL에서 실제 URL 추출
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

// 스마트스토어에서 상품 이미지 가져오기
async function getSmartStoreImages(page, storeUrl) {
  const imageUrls = [];

  try {
    const productPage = await page.context().newPage();
    await productPage.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await productPage.waitForTimeout(3000);

    // CAPTCHA 감지 및 대기
    const hasCaptcha = await productPage.evaluate(() =>
      document.body.innerText.includes('보안 확인') ||
      document.body.innerText.includes('캡차')
    );

    if (hasCaptcha) {
      log(`  ⚠️ CAPTCHA 감지됨`);
      await waitForEnter('CAPTCHA를 해결한 후 엔터키를 누르세요...');
      log(`  ✅ CAPTCHA 해결됨!`);
      await productPage.waitForTimeout(2000);
    }

    const mainImages = await productPage.$$eval('img', imgs => {
      return imgs
        .map(img => ({
          src: img.src || img.getAttribute('data-src') || '',
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
          className: img.className || '',
          parentClass: img.parentElement?.className || ''
        }))
        .filter(img => img.src && img.src.includes('http'))
        .filter(img =>
          img.src.includes('shop-phinf') ||
          img.src.includes('shopping-phinf')
        )
        .filter(img =>
          !img.src.includes('logo') &&
          !img.src.includes('icon') &&
          !img.src.includes('sprite') &&
          !img.src.includes('blank') &&
          !img.src.includes('avatar') &&
          !img.src.includes('profile') &&
          !img.src.includes('seller') &&
          !img.src.includes('member') &&
          !img.src.includes('user') &&
          !img.src.includes('error') &&
          !img.src.includes('noimage') &&
          !img.src.includes('no_image') &&
          !img.src.includes('placeholder') &&
          !img.src.includes('type=f40') &&
          !img.src.includes('type=f50') &&
          !img.src.includes('type=f60') &&
          !img.src.includes('type=s40') &&
          !img.src.includes('type=s50')
        )
        .filter(img =>
          !img.className.includes('profile') &&
          !img.className.includes('seller') &&
          !img.className.includes('avatar') &&
          !img.parentClass.includes('profile') &&
          !img.parentClass.includes('seller')
        )
        .map(img => {
          return img.src.replace(/\?type=.*$/, '').replace(/_\d+x\d+/, '');
        })
        .filter((src, idx, arr) => arr.indexOf(src) === idx)
        .slice(0, 10);  // 더 많이 수집
    });

    imageUrls.push(...mainImages);
    await productPage.close();
  } catch (e) {
    log(`  스마트스토어 이미지 수집 오류: ${e.message}`);
  }

  return imageUrls;
}

// Brand Connect 또는 스마트스토어에서 상품 이미지 가져오기
async function getProductImages(page, productUrl, affiliateLink = '', naverShoppingUrl = '') {
  const images = [];
  let imageUrls = [];

  try {
    // 1순위: naver_shopping_url 사용 (방문 카운트 증가 없음)
    if (naverShoppingUrl && naverShoppingUrl.length > 0) {
      log(`  naver_shopping_url 사용 (방문카운트 X): ${naverShoppingUrl.substring(0, 50)}...`);
      imageUrls = await getSmartStoreImages(page, naverShoppingUrl);
      log(`  스토어에서 이미지 ${imageUrls.length}개 발견`);
    }

    // 2순위: affiliateLink 사용 (방문 카운트 +1)
    if (imageUrls.length === 0 && affiliateLink && affiliateLink.includes('naver.me')) {
      log(`  affiliateLink 폴백 사용 (방문카운트 +1)...`);
      const realUrl = await getRedirectUrl(page, affiliateLink);

      if (realUrl && (realUrl.includes('smartstore') || realUrl.includes('shopping.naver') || realUrl.includes('brand.naver.com'))) {
        log(`  스토어 URL: ${realUrl.substring(0, 50)}...`);
        imageUrls = await getSmartStoreImages(page, realUrl);
        log(`  스토어에서 이미지 ${imageUrls.length}개 발견`);
      }
    }

    // affiliate_link에서 이미지를 못 찾은 경우, 리다이렉트된 URL로 재시도
    if (imageUrls.length === 0 && affiliateLink) {
      log(`  리다이렉트 URL에서 이미지 검색...`);
      const realUrl = await getRedirectUrl(page, affiliateLink);
      if (realUrl) {
        const productPage = await page.context().newPage();
        await productPage.goto(realUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await productPage.waitForTimeout(3000);
        await productPage.evaluate(() => window.scrollBy(0, 500));
        await productPage.waitForTimeout(2000);

        imageUrls = await productPage.evaluate(() => {
          const urls = [];
          const selectors = [
            '.Thumbnail_img__midGQ',
            '[class*="Thumbnail"] img',
            'img[class*="ImageLazyLoader"]',
            'img[src*="phinf"]',
            'img[src*="shop"]',
            'img[src*="product"]'
          ];

          for (const selector of selectors) {
            const images = document.querySelectorAll(selector);
            images.forEach(img => {
              let src = img.src || img.getAttribute('data-src');
              if (src && (src.includes('shop') || src.includes('product') || src.includes('phinf') || src.includes('pstatic'))) {
                if (src.includes('error') || src.includes('noimage') || src.includes('no_image') ||
                    src.includes('placeholder') || src.includes('exclamation') || src.includes('logo') ||
                    src.includes('icon') || src.includes('blank') || src.includes('avatar') ||
                    src.includes('Badge') || src.includes('badge') || src.includes('_next/static/media')) {
                  return;
                }

                if (src.includes('dthumb-phinf.pstatic.net') && src.includes('src=')) {
                  try {
                    const urlParams = new URL(src).searchParams;
                    let originalSrc = urlParams.get('src');
                    if (originalSrc) {
                      originalSrc = decodeURIComponent(originalSrc).replace(/^"|"$/g, '');
                      src = originalSrc;
                    }
                  } catch (e) {}
                }

                if (src.startsWith('//')) src = 'https:' + src;
                src = src.replace(/\?type=.*$/, '').replace(/_\d+x\d+/, '');
                if (!urls.includes(src)) urls.push(src);
              }
            });
          }
          return urls.slice(0, 5);
        });

        log(`  리다이렉트 페이지에서 이미지 발견: ${imageUrls.length}개`);
        await productPage.close();
      }
    }

    // 처음 2개 이미지는 로고/배너일 가능성 높아서 스킵 (이미지가 충분하면)
    // 이미지가 (MIN_IMAGES + SKIP_COUNT)개 이상이면 처음 2개 스킵
    const startIndex = imageUrls.length >= (MIN_IMAGES + SKIP_COUNT) ? SKIP_COUNT : 0;
    const availableImages = imageUrls.length - startIndex;
    const targetCount = Math.min(MAX_IMAGES, Math.max(MIN_IMAGES, availableImages));
    let downloadedCount = 0;

    log(`  총 ${imageUrls.length}개 이미지 중 처음 ${startIndex}개 스킵, 목표: ${targetCount}장 다운로드`);

    for (let i = startIndex; i < imageUrls.length && downloadedCount < targetCount; i++) {
      try {
        const filename = `product_${Date.now()}_${downloadedCount}.jpg`;
        const filepath = await downloadImage(imageUrls[i], filename);
        images.push(path.resolve(filepath));
        downloadedCount++;
        log(`  이미지 다운로드 성공: ${filename} (${downloadedCount}/${targetCount})`);
      } catch (e) {
        log(`  이미지 다운로드 스킵: ${e.message}`);
      }
    }

    if (images.length < MIN_IMAGES) {
      log(`  ⚠️ 최소 이미지 수(${MIN_IMAGES}장) 미달: ${images.length}장만 확보`);
    } else {
      log(`  ✅ ${images.length}장 이미지 확보 완료`);
    }

  } catch (e) {
    log(`이미지 수집 오류: ${e.message}`);
  }

  return images;
}

// 인용구 스타일 인덱스 (순환)
let quoteStyleIndex = 0;

// 인용구 입력 (Ctrl+Alt+Q)
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
        await page.waitForTimeout(100);
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

// 볼드 처리하며 텍스트 입력 (Ctrl+B 토글) - 여러 줄 지원
async function typeWithBold(page, text, isBoldActive = false) {
  let boldState = isBoldActive;

  // ** 마커를 기준으로 분리 (마커 자체도 배열에 포함)
  const parts = text.split(/(\*\*)/g);

  for (const part of parts) {
    if (part === '**') {
      // 볼드 토글
      await page.keyboard.press('Control+b');
      await page.waitForTimeout(100);
      boldState = !boldState;
    } else if (part) {
      await page.keyboard.type(part, { delay: boldState ? 15 : 10 });
    }
  }

  return boldState;  // 다음 줄에서 사용할 볼드 상태 반환
}

// 해시태그 생성 (카페용 - 10개, 상품 관련만)
function generateHashtags(productName) {
  // 상품명에서 키워드 추출
  const keywords = productName
    .replace(/[\[\]\(\)\/\+\-\d]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 10)
    .filter(w => !['세트', '개입', '무료', '배송', '할인', '특가', '증정', '박스', '단품', '국내', '해외'].includes(w));

  // 중복 제거 후 10개로
  const allTags = [...new Set(keywords)].slice(0, 10);
  return allTags.map(tag => `#${tag}`).join(' ');
}

// Gemini로 제목 + 본문 동시 생성 (새로운 다양한 스타일 시스템)
async function generateContentWithGemini(product) {
  log(`  Gemini API로 콘텐츠 생성 중...`);

  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  // 상품 정보를 확장된 형태로 변환
  const productInfo = {
    name: product.name,
    price: product.price ? parseInt(product.price.toString().replace(/[^0-9]/g, '')) : null,
    originalPrice: product.original_price ? parseInt(product.original_price.toString().replace(/[^0-9]/g, '')) : null,
    category: product.category || null,
    brand: product.brand || null,
    manufacturer: product.manufacturer || null,
    rating: product.rating || null,
    reviewCount: product.review_count || null,
    keywords: product.keywords || [],
    targetAudience: product.target_audience || {
      ageGroup: '20-40대',
      gender: '공용',
      persona: '일반 소비자'
    }
  };

  try {
    // 랜덤 스타일로 콘텐츠 생성 (카페용)
    const result = await generateContent(productInfo, {
      platform: 'cafe',  // 카페용 (더 짧은 글)
      style: null,  // 랜덤 선택
      apiKey: GEMINI_API_KEY
    });

    let title = result.title || `${product.name} 추천합니다`;
    let content = result.body || '';

    // 제목에서 특수문자 제거
    title = title.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣!?,.\[\]\(\)]/g, '').trim();

    // 본문 정리
    content = content
      .replace(/(?<!\*)\*(?!\*)/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/^-\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/`/g, '')
      .trim();

    log(`  ✨ 스타일: ${result.styleName}`);
    log(`  Gemini 생성 완료 (제목: ${title.substring(0, 30)}...)`);
    log(`  생성된 본문 길이: ${content.length}자`);

    return { title, content, style: result.styleName };
  } catch (error) {
    log(`  Gemini API 오류: ${error.message}`);

    // 폴백: 기본 콘텐츠 생성
    return {
      title: `${product.name} 강력 추천`,
      content: `요즘 SNS에서 핫한 상품 발견했어요~\n\n${product.name}\n\n가성비 좋고 품질도 좋다고 소문난 제품이에요.\n지금 할인 중이라 이 가격에 구매하기 힘들 수도 있어요.\n\n관심 있으신 분들은 빨리 확인해보세요~`,
      style: 'fallback'
    };
  }
}

// 카페 글 작성
async function writePost(page, product, images, doLoginFn, geminiResult) {
  try {
    log(`글 작성 시작: ${product.name.substring(0, 30)}...`);

    // 계정에서 카페 URL 가져오기
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

    // 게시판 선택 (첫 번째 게시판 자동 선택)
    try {
      const boardDropdown = page.locator('text=게시판을 선택해 주세요.').first();
      if (await boardDropdown.count() > 0) {
        log(`  게시판 드롭다운 클릭...`);
        await boardDropdown.click();
        await page.waitForTimeout(1500);

        // 첫 번째 게시판 옵션 선택 (리스트에서 첫 번째 항목)
        const boardOptions = page.locator('ul[role="listbox"] li, [class*="select_list"] li, [class*="dropdown"] li').first();
        if (await boardOptions.count() > 0) {
          const boardName = await boardOptions.innerText().catch(() => '알 수 없음');
          await boardOptions.click();
          await page.waitForTimeout(500);
          log(`  ✅ 게시판 선택 완료 (${boardName.trim()})`);
        } else {
          // 폴백: 아무 li 요소나 첫 번째 선택
          const fallbackOption = page.locator('li').first();
          if (await fallbackOption.count() > 0) {
            const boardName = await fallbackOption.innerText().catch(() => '알 수 없음');
            await fallbackOption.click();
            await page.waitForTimeout(500);
            log(`  ✅ 게시판 선택 완료 - 폴백 (${boardName.trim()})`);
          }
        }
      }
    } catch (e) {
      log(`  게시판 선택 오류: ${e.message}`);
    }

    // 제목 입력
    const title = geminiResult.title;
    const titleInput = page.locator('textarea.textarea_input, textarea[placeholder*="제목"]');
    await titleInput.fill(title);
    log(`  제목: ${title}`);
    await page.waitForTimeout(500);

    // 에디터 본문 클릭
    const editorBody = page.locator('.se-component-content, [contenteditable="true"]').first();
    await editorBody.click();
    await page.waitForTimeout(500);

    // 이미지 업로드 헬퍼 함수
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
        // 커서를 항상 문서 맨 끝으로 이동 (editorBody.click() 제거)
        await page.keyboard.press('Control+End');
        await page.waitForTimeout(500);
        return true;
      } catch (e) {
        log(`    이미지 업로드 실패: ${e.message}`);
        return false;
      }
    }

    // === 새로운 구조: 대가성문구 → 링크 → 사진1 → 내용(이미지 분산) ===

    // 1. 대가성 문구 입력
    log(`  [1/5] 대가성 문구 입력...`);
    await page.keyboard.type(DISCLOSURE, { delay: 15 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 2. 링크 먼저 입력 (미리보기 생성)
    const affiliateLink = product.affiliate_link || product.affiliateLink || '';
    if (affiliateLink) {
      log(`  [2/5] 상품 링크 입력...`);
      await page.keyboard.type(affiliateLink, { delay: 15 });
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);  // 미리보기 생성 대기
      log(`  ✅ 링크 미리보기 생성 완료`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    // 3. 첫 번째 이미지 업로드 (Ctrl+End로 문서 끝으로 이동 후)
    await page.keyboard.press('Control+End');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    if (images.length > 0) {
      log(`  [3/5] 첫 번째 이미지 업로드...`);
      await uploadSingleImage(images[0]);
      await page.waitForTimeout(1000);
      log(`  ✅ 첫 번째 이미지 업로드 완료`);
    }

    // 이미지 업로드 후 Ctrl+End로 문서 맨 끝으로 이동
    await page.keyboard.press('Control+End');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 4. 본문 입력 (이미지 분산 삽입)
    log(`  [4/5] 본문 + 이미지 분산 입력 중...`);

    let content = geminiResult.content;

    // 다양한 QUOTE 태그 변형을 표준화
    content = content.replace(/\[QOU?TE\]/gi, '[QUOTE]');
    content = content.replace(/\[?\/QOU?TE\]/gi, '[/QUOTE]');
    content = content.replace(/<\/QOU?TE\]/gi, '[/QUOTE]');

    const quoteCount = (content.match(/\[QUOTE\]/gi) || []).length;
    log(`    → QUOTE 태그 발견: ${quoteCount}개`);

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

    // 중간 이미지 준비 (첫 번째 제외)
    const middleImages = images.length > 1 ? images.slice(1) : [];
    let middleImageIndex = 0;
    let quoteIndex = 0;

    // 인용구가 없을 경우: 줄 간격으로 이미지 분산
    let totalLines = 0;
    if (quoteCount === 0) {
      for (const part of parts) {
        if (part.type === 'text') {
          totalLines += part.content.split('\n').filter(l => l.trim()).length;
        }
      }
    }
    const linesPerImage = quoteCount === 0 && middleImages.length > 0
      ? Math.floor(totalLines / (middleImages.length + 1))
      : 0;
    let lineCounter = 0;

    if (quoteCount > 0) {
      log(`    → 중간 이미지 ${middleImages.length}장을 인용구 ${quoteCount}개 사이에 분산 삽입`);
    } else {
      log(`    → 인용구 없음: 중간 이미지 ${middleImages.length}장을 ${linesPerImage}줄 간격으로 분산 삽입`);
    }

    for (const part of parts) {
      if (part.type === 'quote') {
        await insertQuote(page, part.content);
        quoteIndex++;
        log(`    → 인용구 ${quoteIndex}/${quoteCount} 삽입 완료`);
        await page.waitForTimeout(300);

        // 인용구 다음에 이미지 1장 삽입 (중간 이미지가 남아있으면)
        if (middleImageIndex < middleImages.length) {
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
          await uploadSingleImage(middleImages[middleImageIndex]);
          log(`    → 이미지 ${middleImageIndex + 2}/${images.length} 삽입 (인용구 ${quoteIndex} 다음)`);
          middleImageIndex++;
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
        }
      } else {
        const lines = part.content.split('\n');
        let boldState = false;
        for (const line of lines) {
          if (line.trim()) {
            boldState = await typeWithBold(page, line, boldState);
            lineCounter++;
            await page.waitForTimeout(100);

            // 인용구 없을 때: 일정 줄 간격마다 이미지 삽입
            if (quoteCount === 0 && linesPerImage > 0 &&
                lineCounter % linesPerImage === 0 &&
                middleImageIndex < middleImages.length) {
              await page.keyboard.press('Enter');
              await page.waitForTimeout(300);
              await uploadSingleImage(middleImages[middleImageIndex]);
              log(`    → 이미지 ${middleImageIndex + 2}/${images.length} 삽입 (${lineCounter}줄 후)`);
              middleImageIndex++;
              await page.keyboard.press('Enter');
              await page.waitForTimeout(500);
            }
          }
          await page.keyboard.press('Enter');
          await page.waitForTimeout(100);
        }
      }
    }

    // 남은 이미지 처리
    while (middleImageIndex < middleImages.length) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      await uploadSingleImage(middleImages[middleImageIndex]);
      log(`    → 남은 이미지 ${middleImageIndex + 2}/${images.length} 업로드 완료`);
      middleImageIndex++;
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    log(`  ✅ 본문 + 이미지 분산 입력 완료`);

    // 5. 마무리 멘트
    log(`  [5/5] 마무리 멘트 입력...`);

    // Ctrl+End로 확실히 문서 맨 끝으로 이동
    await page.keyboard.press('Control+End');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    await page.keyboard.type('지금 바로 확인해보세요!', { delay: 20 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 해시태그 입력
    try {
      const hashtags = generateHashtags(product.name);
      const tagList = hashtags.split(' ').map(tag => tag.replace('#', ''));

      const tagInput = page.locator('input.tag_input').first();
      if (await tagInput.count() > 0) {
        await tagInput.click({ force: true });
        await page.waitForTimeout(500);

        for (const tag of tagList) {
          await page.keyboard.type(tag, { delay: 30 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(400);
        }
        log(`  ✅ 해시태그 입력: ${hashtags}`);
      }
    } catch (e) {
      log(`  해시태그 입력 실패: ${e.message}`);
    }

    // 등록 버튼 클릭
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await titleInput.click();
    await page.waitForTimeout(500);

    let registered = false;

    // 한도 도달 감지를 위한 다이얼로그 리스너
    let limitReachedByDialog = false;
    const dialogHandler = async (dialog) => {
      const message = dialog.message();
      if (message.includes('게시글 등록 제한을 초과') ||
          message.includes('ID/IP당 게시글 등록 제한')) {
        limitReachedByDialog = true;
        log(`  🛑 한도 초과 다이얼로그 감지: ${message.substring(0, 60)}...`);
      }
      await dialog.accept();
    };
    page.on('dialog', dialogHandler);

    // 한도 도달 감지를 위한 네트워크 응답 리스너 (백업)
    let limitReachedByNetwork = false;
    const responseHandler = (response) => {
      // 글 등록 API가 HTTP 500을 반환하면 한도 도달로 판단
      if (response.url().includes('/articles') &&
          response.request().method() === 'POST' &&
          response.status() === 500) {
        limitReachedByNetwork = true;
        log(`  🛑 한도 초과 네트워크 응답 감지: HTTP 500`);
      }
    };
    page.on('response', responseHandler);

    // 리스너 정리 헬퍼
    const cleanupListeners = () => {
      page.off('dialog', dialogHandler);
      page.off('response', responseHandler);
    };

    // 한도 도달 체크 헬퍼
    const isLimitReached = () => limitReachedByDialog || limitReachedByNetwork;

    try {
      const skinGreenBtn = page.locator('button.BaseButton--skinGreen');
      if (await skinGreenBtn.count() > 0) {
        log(`  등록 버튼 발견 (skinGreen), 클릭 시도...`);
        await skinGreenBtn.first().click();
        await page.waitForTimeout(5000);

        // 다이얼로그 또는 네트워크로 한도 감지
        if (isLimitReached()) {
          const method = limitReachedByDialog ? '다이얼로그' : '네트워크';
          log(`  🛑 일일 한도 도달 (${method} 감지)`);
          cleanupListeners();
          return 'limit_reached';
        }

        const postUrl = page.url();
        if (!postUrl.includes('/write')) {
          log(`  ✅ 글 등록 완료! URL: ${postUrl}`);
          registered = true;
        }
      }

      if (!registered) {
        const baseBtns = await page.locator('.BaseButton').all();
        for (const btn of baseBtns) {
          try {
            const text = await btn.innerText();
            const cls = await btn.getAttribute('class') || '';
            if (text.trim() === '등록' && !cls.includes('temp')) {
              log(`  등록 버튼 발견 (BaseButton)`);
              await btn.click();
              await page.waitForTimeout(5000);

              // 다이얼로그 또는 네트워크로 한도 감지
              if (isLimitReached()) {
                const method = limitReachedByDialog ? '다이얼로그' : '네트워크';
                log(`  🛑 일일 한도 도달 (${method} 감지)`);
                cleanupListeners();
                return 'limit_reached';
              }

              const postUrl = page.url();
              if (!postUrl.includes('/write')) {
                log(`  ✅ 글 등록 완료! URL: ${postUrl}`);
                registered = true;
              }
              break;
            }
          } catch (e) {}
        }
      }

      if (!registered) {
        log(`  ⚠️ 등록 버튼 못찾음 또는 등록 실패`);
        cleanupListeners();
        return false;  // 일반 실패로 처리 (한도 도달이 아님)
      }

      cleanupListeners();
      return registered;
    } catch (e) {
      cleanupListeners();
      throw e;
    }

  } catch (e) {
    log(`  ❌ 글 작성 오류: ${e.message}`);
    return false;
  }
}

// 메인 실행
async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   카페 자동 글쓰기 - Supabase 버전             ║');
  console.log('║   분산 환경 지원 + 24시간 자동 실행            ║');
  console.log('║   Ctrl+C로 종료                                ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  ensureDir('output');

  log('Supabase 연결 테스트...');
  const connTest = await testConnection();

  if (!connTest.success) {
    log(`❌ DB 연결 실패: ${connTest.error}`);
    log('📌 .env 파일에 SUPABASE_URL과 SUPABASE_SERVICE_KEY를 확인하세요.');
    process.exit(1);
  }

  log(`✅ DB 연결 성공 (등록된 상품: ${connTest.productCount}개)\n`);

  let worker;
  try {
    worker = await registerWorker(WORKER_NAME, 'cafe');
    log(`Worker 등록: ${worker.name} (${worker.id})\n`);
  } catch (e) {
    log(`⚠️ Worker 등록 실패: ${e.message}`);
  }

  const isHeadless = process.env.HEADLESS === 'true';
  const browser = await chromium.launch({
    headless: isHeadless,
    slowMo: 30
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  // 계정 로드 함수
  async function loadAccount() {
    log(`\n📌 계정 ID ${ACCOUNT_ID} 로드 중...`);
    account = await getAccountById(ACCOUNT_ID);

    if (!account) {
      log(`❌ 계정 ID ${ACCOUNT_ID}를 찾을 수 없습니다.`);
      log('📌 naver_accounts 테이블에 계정을 추가하거나 ACCOUNT_ID 환경변수를 확인하세요.');
      throw new Error(`Account ID ${ACCOUNT_ID} not found`);
    }

    log(`✅ 계정 로드 완료: ${account.naver_id}`);
    log(`   카페: ${account.today_cafe_count}/${account.daily_cafe_limit} (남은 횟수: ${account.cafe_remaining})`);
    log(`   블로그: ${account.today_blog_count}/${account.daily_blog_limit} (남은 횟수: ${account.blog_remaining})`);
    return account;
  }

  async function doLogin() {
    if (!account) {
      await loadAccount();
    }
    log('네이버 로그인 중...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(account.naver_id, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(account.naver_pw, { delay: 50 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000);

    // CAPTCHA 감지
    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin') || currentUrl.includes('captcha')) {
      log('⚠️ 로그인 CAPTCHA 감지됨');
      await waitForEnter('CAPTCHA를 해결한 후 엔터키를 누르세요...');
      await page.waitForTimeout(2000);
    }

    log('로그인 완료\n');
  }

  async function checkAndLogin() {
    // 먼저 계정 로드
    if (!account) {
      await loadAccount();
    }

    const cafeWriteUrl = account.cafe_url || 'https://cafe.naver.com/ca-fe/cafes/31634939/articles/write?boardType=L';
    log('로그인 상태 확인 중...');
    await page.goto(cafeWriteUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();

    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      log('로그인 필요 - 로그인 진행...');
      await doLogin();
      return false;
    }

    if (!currentUrl.includes('/write') && !currentUrl.includes('articles/write')) {
      log('글쓰기 페이지 접근 불가 - 로그인 시도...');
      await doLogin();
      return false;
    }

    log('✅ 이미 로그인 상태 - 바로 글쓰기 가능\n');
    return true;
  }

  try {
    await checkAndLogin();

    while (true) {
      // 계정 정보 새로고침 (날짜 변경 시 자동 리셋됨)
      await loadAccount();

      // 일일 한도 체크 (DB 기반)
      if (account.cafe_remaining <= 0) {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const waitMs = tomorrow - now;
        log(`\n⏸️ 일일 한도 도달 (${account.today_cafe_count}/${account.daily_cafe_limit}개)`);
        log(`   내일 00:00까지 ${Math.round(waitMs / 3600000)}시간 대기...`);
        await page.waitForTimeout(waitMs);
        continue;
      }

      if (worker) {
        try {
          await updateWorkerHeartbeat(worker.id);
        } catch (e) {}
      }

      log(`\n📊 상품 클레임 중... (오늘: ${account.today_cafe_count}/${account.daily_cafe_limit}개, 남음: ${account.cafe_remaining}개)`);
      const product = await claimProductForPosting('cafe', WORKER_NAME, 10);

      if (!product) {
        log('게시 가능한 상품이 없습니다. 10분 후 다시 확인...');
        await page.waitForTimeout(10 * 60 * 1000);
        continue;
      }

      log(`\n✅ 상품 클레임 성공 (락 10분)`);
      log(`  상품: ${product.name.substring(0, 30)}...`);
      log(`  가격: ${product.price_numeric?.toLocaleString() || product.price}원`);
      log(`  카페 게시: ${product.cafe_count}회 | 총: ${product.total_count}회`);

      const productUrl = product.product_url || '';
      const affiliateLink = product.affiliate_link || '';
      const naverShoppingUrl = product.naver_shopping_url || '';

      const images = await getProductImages(page, productUrl, affiliateLink, naverShoppingUrl);

      // 이미지가 하나도 없으면 (삭제된 페이지/IP밴) 다음 상품으로
      if (!images || images.length === 0) {
        log(`  [SKIP] No images - page deleted or blocked. Moving to next product...`);
        try {
          await recordPost(
            product.product_id,
            worker?.id || null,
            'cafe',
            false,
            'No images - page unavailable'
          );
        } catch (e) {}
        // 락 해제
        try {
          await releaseProductLock(product.product_id);
        } catch (e) {}
        await page.waitForTimeout(3000);
        continue;
      }

      // Gemini로 콘텐츠 생성 (1회만 - 재시도 시 재사용)
      log(`  📝 Gemini 콘텐츠 생성 중...`);
      const geminiResult = await generateContentWithGemini(product);

      // 재시도 루프 (최대 3회)
      const MAX_RETRIES = 3;
      let result = false;
      let retryCount = 0;

      while (retryCount < MAX_RETRIES) {
        if (retryCount > 0) {
          log(`  🔄 재시도 ${retryCount}/${MAX_RETRIES - 1} (같은 콘텐츠 사용)...`);
          await page.waitForTimeout(5000);  // 재시도 전 5초 대기
        }

        result = await writePost(page, product, images, doLogin, geminiResult);

        // 한도 도달이면 재시도 없이 즉시 종료
        if (result === 'limit_reached') {
          break;
        }

        // 성공이면 루프 종료
        if (result === true) {
          break;
        }

        // 실패(false)면 재시도
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          log(`  ⚠️ 등록 실패 - 재시도 예정...`);
        }
      }

      // 다이얼로그 또는 HTTP 500으로 일일 한도 도달 감지
      if (result === 'limit_reached') {
        log(`\n🛑 일일 한도 도달 감지 - 작업을 중단합니다.`);
        try {
          const limitCount = await setAccountCountToLimit(ACCOUNT_ID, 'cafe');
          log(`   카페 카운트를 ${limitCount}/${limitCount}로 설정 완료`);
          log(`   블로그 작업으로 전환하려면 blog_writer_supabase.js를 실행하세요.`);
        } catch (e) {
          log(`   ⚠️ 카운트 업데이트 실패: ${e.message}`);
        }
        // 락 해제
        try {
          await releaseProductLock(product.product_id);
        } catch (e) {}
        // 이미지 정리 후 종료
        for (const img of images) {
          try { fs.unlinkSync(img); } catch (e) {}
        }
        break;  // while 루프 종료
      }

      const success = result === true;

      if (success) {
        // DB에 카운트 증가
        const newCount = await incrementAccountCount(ACCOUNT_ID, 'cafe');
        log(`  ✅ 오늘 게시 완료: ${newCount}/${account.daily_cafe_limit}개`);
      } else {
        log(`  ❌ ${MAX_RETRIES}회 재시도 후에도 실패`);
      }

      try {
        await recordPost(
          product.product_id,
          worker?.id || null,
          'cafe',
          success,
          success ? null : `Post failed after ${retryCount} retries`
        );
        log(`  Post record saved`);
      } catch (e) {
        log(`  Warning: Failed to save record: ${e.message}`);
      }

      // 락 해제
      try {
        await releaseProductLock(product.product_id);
        log(`  🔓 락 해제 완료`);
      } catch (e) {
        log(`  Warning: Failed to release lock: ${e.message}`);
      }

      for (const img of images) {
        try { fs.unlinkSync(img); } catch (e) {}
      }

      // 빠르게 작성 (2~3분 간격)
      const waitTime = 2 * 60 * 1000 + Math.random() * 1 * 60 * 1000;
      log(`다음 글까지 ${Math.round(waitTime / 60000)}분 대기...`);
      await page.waitForTimeout(waitTime);
    }

  } catch (error) {
    log(`오류 발생: ${error.message}`);
  } finally {
    await browser.close();
  }
}

main();
