/**
 * 카페 자동 글쓰기 - Portable 버전
 * Node.js 없이 실행 가능한 exe 배포용
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';

// exe 실행 경로 기준으로 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;

// .env 파일 로드 (exe와 같은 폴더에서)
dotenv.config({ path: path.join(BASE_DIR, '.env') });

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const CAFE_WRITE_URL = process.env.CAFE_ADR?.trim() || 'https://cafe.naver.com/ca-fe/cafes/31634939/articles/write?boardType=L';

// 파일 경로 (exe 기준)
const PRODUCT_FILE = path.join(BASE_DIR, 'output', 'product_links.json');
const POSTED_FILE = path.join(BASE_DIR, 'output', 'posted_products.json');
const LOG_FILE = path.join(BASE_DIR, 'output', 'cafe_writer.log');
const IMAGE_DIR = path.join(BASE_DIR, 'output', 'images');

// Playwright 브라우저 경로 (portable용)
const BROWSERS_PATH = path.join(BASE_DIR, 'browsers');
if (fs.existsSync(BROWSERS_PATH)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = BROWSERS_PATH;
}

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 대가성 문구
const DISCLOSURE = '본 포스팅은 네이버 브랜드커넥트를 통해 소정의 수수료를 제공받습니다.';

function log(message) {
  const timestamp = new Date().toLocaleString('ko-KR');
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  try {
    ensureDir(path.join(BASE_DIR, 'output'));
    fs.appendFileSync(LOG_FILE, logMessage + '\n', 'utf-8');
  } catch (e) {}
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadProducts() {
  try {
    if (fs.existsSync(PRODUCT_FILE)) {
      return JSON.parse(fs.readFileSync(PRODUCT_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`상품 로드 오류: ${e.message}`);
  }
  return [];
}

function loadPostedProducts() {
  try {
    if (fs.existsSync(POSTED_FILE)) {
      const data = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        const map = new Map();
        data.forEach(id => map.set(id, 1));
        return map;
      }
      return new Map(Object.entries(data));
    }
  } catch (e) {}
  return new Map();
}

function savePostedProducts(posted) {
  ensureDir(path.join(BASE_DIR, 'output'));
  const obj = Object.fromEntries(posted);
  fs.writeFileSync(POSTED_FILE, JSON.stringify(obj, null, 2), 'utf-8');
}

function sortProductsByCount(products, postedCounts) {
  return [...products].sort((a, b) => {
    const countA = postedCounts.get(a.productId) || 0;
    const countB = postedCounts.get(b.productId) || 0;
    if (countA !== countB) return countA - countB;
    return Math.random() - 0.5;
  });
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
    await productPage.goto(storeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await productPage.waitForTimeout(3000);

    const mainImages = await productPage.$$eval('img', imgs => {
      return imgs
        .map(img => img.src || img.getAttribute('data-src') || '')
        .filter(src => src && src.includes('http'))
        .filter(src =>
          src.includes('pstatic.net') ||
          src.includes('shop-phinf') ||
          src.includes('shopping-phinf') ||
          src.includes('shop.pstatic')
        )
        .filter(src =>
          !src.includes('logo') && !src.includes('icon') &&
          !src.includes('sprite') && !src.includes('blank') &&
          !src.includes('avatar') && !src.includes('error') &&
          !src.includes('noimage') && !src.includes('placeholder')
        )
        .map(src => src.replace(/\?type=.*$/, '').replace(/_\d+x\d+/, ''))
        .filter((src, idx, arr) => arr.indexOf(src) === idx)
        .slice(0, 5);
    });

    imageUrls.push(...mainImages);
    await productPage.close();
  } catch (e) {
    log(`  스마트스토어 이미지 수집 오류: ${e.message}`);
  }
  return imageUrls;
}

// 상품 이미지 가져오기
async function getProductImages(page, productUrl, affiliateLink = '') {
  const images = [];
  let imageUrls = [];

  try {
    if (affiliateLink && affiliateLink.includes('naver.me')) {
      log(`  affiliateLink에서 실제 스토어 URL 추출 중...`);
      const realUrl = await getRedirectUrl(page, affiliateLink);
      if (realUrl && (realUrl.includes('smartstore') || realUrl.includes('shopping.naver'))) {
        log(`  스마트스토어 URL: ${realUrl.substring(0, 50)}...`);
        imageUrls = await getSmartStoreImages(page, realUrl);
        log(`  스마트스토어에서 이미지 ${imageUrls.length}개 발견`);
      }
    }

    if (imageUrls.length === 0) {
      log(`  Brand Connect 페이지에서 이미지 검색...`);
      const productPage = await page.context().newPage();
      await productPage.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await productPage.waitForTimeout(3000);
      await productPage.evaluate(() => window.scrollBy(0, 500));
      await productPage.waitForTimeout(2000);

      imageUrls = await productPage.$$eval('img', imgs => {
        return imgs
          .map(img => img.src || img.getAttribute('data-src') || '')
          .filter(src => src && src.includes('http'))
          .filter(src =>
            src.includes('phinf') || src.includes('shop') ||
            src.includes('product') || src.includes('goods') ||
            src.includes('pstatic')
          )
          .filter(src =>
            !src.includes('logo') && !src.includes('icon') &&
            !src.includes('sprite') && !src.includes('blank') &&
            !src.includes('avatar') && !src.includes('error') &&
            !src.includes('noimage') && !src.includes('placeholder') &&
            !src.includes('exclamation')
          )
          .filter((src, idx, arr) => arr.indexOf(src) === idx)
          .slice(0, 5);
      });

      log(`  Brand Connect 이미지 발견: ${imageUrls.length}개`);
      await productPage.close();
    }

    let downloadedCount = 0;
    for (let i = 0; i < imageUrls.length && downloadedCount < 3; i++) {
      try {
        const filename = `product_${Date.now()}_${i}.jpg`;
        const filepath = await downloadImage(imageUrls[i], filename);
        images.push(path.resolve(filepath));
        downloadedCount++;
        log(`  이미지 다운로드 성공: ${filename}`);
      } catch (e) {
        log(`  이미지 다운로드 스킵: ${e.message}`);
      }
    }

    if (images.length === 0) {
      log(`  ⚠️ 유효한 이미지를 찾지 못했습니다`);
    }
  } catch (e) {
    log(`이미지 수집 오류: ${e.message}`);
  }

  return images;
}

// 볼드 처리하며 텍스트 입력
async function typeWithBold(page, text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      const boldText = part.slice(2, -2);
      await page.keyboard.press('Control+b');
      await page.waitForTimeout(100);
      await page.keyboard.type(boldText, { delay: 15 });
      await page.keyboard.press('Control+b');
      await page.waitForTimeout(100);
    } else if (part) {
      await page.keyboard.type(part, { delay: 10 });
    }
  }
}

// 해시태그 생성
function generateHashtags(productName) {
  const keywords = productName
    .replace(/[\[\]\(\)\/\+\-\d]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 10)
    .filter(w => !['세트', '개입', '무료', '배송', '할인', '특가', '증정', '박스'].includes(w))
    .slice(0, 5);
  const commonTags = ['추천', '득템', '쇼핑', '핫딜', '가성비'];
  const randomCommon = commonTags.sort(() => Math.random() - 0.5).slice(0, 2);
  const allTags = [...new Set([...keywords, ...randomCommon])].slice(0, 7);
  return allTags.map(tag => `#${tag}`).join(' ');
}

// Gemini로 콘텐츠 생성
async function generateContentWithGemini(product) {
  log(`  Gemini API로 콘텐츠 생성 중...`);

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `당신은 쇼핑 정보를 공유하는 카페 게시글 작성자입니다.

상품 정보:
- 상품명: ${product.name}
- 가격: ${product.price || '가격 정보 없음'}

[제목 작성 규칙]
- 상품명 "${product.name}"을 절대 줄이거나 생략하지 말고 전체를 그대로 포함
- 상품명 뒤에 클릭을 유도하는 짧은 문구 추가
- 총 길이 80자 이내
- 제목에 이모지, 특수문자 절대 사용 금지 (느낌표, 물음표만 허용)

[본문 작성 규칙]
- 500~800자 분량
- 친근한 말투 (~요, ~해요 사용)
- 이모티콘은 2~3개만
- 강조하고 싶은 부분은 **볼드**로 표시 (3~5개)
- ##, -, * 리스트 등 다른 마크다운은 사용 금지

[절대 포함하면 안 되는 내용]
- "직접 구매했다", "사용해봤다" 등 본인 구매/사용 표현
- "후기", "리뷰" 표현

[반드시 포함해야 하는 내용]
- 장점 설명 (3~4가지)
- 추천 대상
- 가성비
- 구매 유도 마무리 멘트

출력 형식:
[TITLE]
제목

[CONTENT]
본문`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const titleMatch = responseText.match(/\[TITLE\]\s*([\s\S]*?)(?=\[CONTENT\])/i);
    const contentMatch = responseText.match(/\[CONTENT\]\s*([\s\S]*)/i);

    let title = titleMatch ? titleMatch[1].trim() : `${product.name} 추천합니다`;
    let content = contentMatch ? contentMatch[1].trim() : '';

    title = title.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣!?,.\[\]\(\)]/g, '').trim();
    content = content
      .replace(/(?<!\*)\*(?!\*)/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/^-\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/`/g, '')
      .trim();

    log(`  Gemini 생성 완료`);
    return { title, content };
  } catch (error) {
    log(`  Gemini API 오류: ${error.message}`);
    return {
      title: `${product.name} 강력 추천`,
      content: `요즘 SNS에서 핫한 상품 발견했어요~\n\n${product.name}\n\n가성비 좋고 품질도 좋다고 소문난 제품이에요.\n지금 할인 중이라 이 가격에 구매하기 힘들 수도 있어요.\n\n관심 있으신 분들은 빨리 확인해보세요~`
    };
  }
}

// 카페 글 작성
async function writePost(page, product, images, doLoginFn) {
  try {
    log(`글 작성 시작: ${product.name.substring(0, 30)}...`);

    const geminiResult = await generateContentWithGemini(product);

    await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      log('  세션 만료 - 재로그인...');
      await doLoginFn();
      await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
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
          log(`  게시판 선택 완료`);
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

    // 이미지 업로드
    if (images.length > 0) {
      log(`  이미지 업로드 중...`);
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          page.locator('button[data-name="image"]').click()
        ]);
        await fileChooser.setFiles(images);
        log(`  파일 선택 완료: ${images.length}개`);

        if (images.length >= 2) {
          await page.waitForTimeout(2000);
          const individualBtn = page.locator('text=개별사진').first();
          if (await individualBtn.count() > 0) {
            await individualBtn.click();
            await page.waitForTimeout(1000);
          }
        }

        await page.waitForTimeout(3000);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await editorBody.click();
        await page.waitForTimeout(500);
        log(`  이미지 업로드 완료`);
      } catch (e) {
        log(`  이미지 업로드 실패: ${e.message}`);
      }
    }

    // 본문 입력
    await editorBody.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await page.keyboard.type(DISCLOSURE, { delay: 10 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    log(`  본문 입력 중...`);
    const contentLines = geminiResult.content.split('\n');
    for (const line of contentLines) {
      if (line.trim()) {
        await typeWithBold(page, line);
      }
      await page.keyboard.press('Enter');
      await page.waitForTimeout(50);
    }

    await page.keyboard.press('Enter');
    log(`  본문 입력 완료`);

    await page.keyboard.type('지금 바로 확인해보세요!', { delay: 15 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // 상품 링크 입력
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const affiliateLink = product.affiliateLink || '';
    if (affiliateLink) {
      await page.keyboard.type(affiliateLink, { delay: 10 });
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);
      log(`  상품 링크 입력 완료`);
    }

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
        log(`  해시태그 입력 완료`);
      }
    } catch (e) {
      log(`  해시태그 입력 실패: ${e.message}`);
    }

    // 등록 버튼
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await titleInput.click();
    await page.waitForTimeout(500);

    let registered = false;
    const skinGreenBtn = page.locator('button.BaseButton--skinGreen');
    if (await skinGreenBtn.count() > 0) {
      log(`  등록 버튼 클릭...`);
      await skinGreenBtn.first().click();
      await page.waitForTimeout(5000);
      const newUrl = page.url();
      if (!newUrl.includes('/write')) {
        log(`  글 등록 완료!`);
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
            await btn.click();
            await page.waitForTimeout(5000);
            const newUrl = page.url();
            if (!newUrl.includes('/write')) {
              log(`  글 등록 완료!`);
              registered = true;
            }
            break;
          }
        } catch (e) {}
      }
    }

    if (!registered) {
      log(`  등록 버튼 못찾음 - 수동 등록 필요`);
    }

    return registered;

  } catch (e) {
    log(`  글 작성 오류: ${e.message}`);
    return false;
  }
}

// 메인 실행
async function main() {
  console.log('========================================');
  console.log('  카페 자동 글쓰기 (Portable)');
  console.log('  24시간 자동 실행');
  console.log('  Ctrl+C로 종료');
  console.log('========================================\n');

  ensureDir(path.join(BASE_DIR, 'output'));

  const browser = await chromium.launch({
    headless: false,
    slowMo: 30
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  async function doLogin() {
    log('네이버 로그인 중...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(5000);
    log('로그인 완료\n');
  }

  async function checkAndLogin() {
    log('로그인 상태 확인 중...');
    await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
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
    log('이미 로그인 상태\n');
    return true;
  }

  try {
    await checkAndLogin();

    while (true) {
      const products = loadProducts();
      const posted = loadPostedProducts();

      log(`\n총 상품: ${products.length}개, 게시됨: ${posted.size}개`);

      const available = products.filter(p => p.affiliateLink);

      if (available.length === 0) {
        log('게시 가능한 상품이 없습니다. 10분 후 다시 확인...');
        await page.waitForTimeout(10 * 60 * 1000);
        continue;
      }

      const sorted = sortProductsByCount(available, posted);
      const minCount = posted.get(sorted[0].productId) || 0;
      log(`상품 정렬 완료 (최소 게시횟수: ${minCount})`);

      for (const product of sorted) {
        const currentCount = posted.get(product.productId) || 0;
        log(`\n[게시횟수: ${currentCount}] ${product.name.substring(0, 20)}... 처리 중...`);

        const images = await getProductImages(page, product.productUrl, product.affiliateLink);
        const success = await writePost(page, product, images, doLogin);

        if (success) {
          posted.set(product.productId, currentCount + 1);
          savePostedProducts(posted);
          log(`  게시 카운트 업데이트: ${currentCount} -> ${currentCount + 1}`);
        }

        for (const img of images) {
          try { fs.unlinkSync(img); } catch (e) {}
        }

        const waitTime = 5 * 60 * 1000 + Math.random() * 5 * 60 * 1000;
        log(`다음 글까지 ${Math.round(waitTime / 60000)}분 대기...`);
        await page.waitForTimeout(waitTime);
      }
    }

  } catch (error) {
    log(`오류 발생: ${error.message}`);
  } finally {
    await browser.close();
  }
}

main();
