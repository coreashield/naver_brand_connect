/**
 * 블로그 자동 글쓰기 - Supabase 버전
 * 카페 스타일 통일 (Gemini AI + 링크 + 인용구)
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getProductsForPosting,
  recordPost,
  registerWorker,
  updateWorkerHeartbeat,
  testConnection
} from '../supabase/db.js';

dotenv.config();

// 환경 변수
const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const BLOG_ID = process.env.BLOG_ID?.trim() || NAVER_ID;  // BLOG_ID 없으면 NAVER_ID 사용
const BLOG_WRITE_URL = `https://blog.naver.com/${BLOG_ID}?Redirect=Write&categoryNo=1`;
const WORKER_NAME = process.env.WORKER_NAME || `blog-${Date.now().toString(36)}`;

// 파일 경로
const IMAGE_DIR = 'output/images';
const LOG_FILE = 'output/blog_writer.log';
const MAX_IMAGES = 8;  // 5~8장 다운로드
const MIN_IMAGES = 5;

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 대가성 문구
const DISCLOSURE = '본 포스팅은 네이버 브랜드커넥트를 통해 소정의 수수료를 제공받습니다.';

// 로그 함수
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
    await productPage.goto(storeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await productPage.waitForTimeout(3000);

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

    if (imageUrls.length < MIN_IMAGES) {
      log(`  Brand Connect 페이지에서 추가 이미지 검색...`);
      const productPage = await page.context().newPage();
      await productPage.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await productPage.waitForTimeout(3000);
      await productPage.evaluate(() => window.scrollBy(0, 500));
      await productPage.waitForTimeout(2000);

      const bcImages = await productPage.evaluate(() => {
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
        return urls.slice(0, 10);
      });

      imageUrls.push(...bcImages);
      imageUrls = [...new Set(imageUrls)];  // 중복 제거
      log(`  Brand Connect 추가 이미지 발견: ${bcImages.length}개`);
      await productPage.close();
    }

    // 5~8장 다운로드
    const targetCount = Math.min(MAX_IMAGES, Math.max(MIN_IMAGES, imageUrls.length));
    let downloadedCount = 0;

    for (let i = 0; i < imageUrls.length && downloadedCount < targetCount; i++) {
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

// 인용구 입력 (Ctrl+Alt+Q) - 카페 스타일
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

// 볼드 처리하며 텍스트 입력 (Ctrl+B 토글)
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

  const commonTags = ['추천', '득템', '쇼핑', '핫딜', '가성비', '데일리', '솔직후기'];
  const randomCommon = commonTags.sort(() => Math.random() - 0.5).slice(0, 3);

  const allTags = [...new Set([...keywords, ...randomCommon])].slice(0, 10);
  return allTags.map(tag => `#${tag}`).join(' ');
}

// Gemini로 제목 + 본문 생성 (블로그용)
async function generateContentWithGemini(product) {
  log(`  Gemini API로 콘텐츠 생성 중...`);

  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `당신은 쇼핑 정보를 공유하는 블로그 게시글 작성자입니다.

상품 정보:
- 상품명: ${product.name}
- 가격: ${product.price || '가격 정보 없음'}

[제목 작성 규칙]
- 상품명 "${product.name}"을 절대 줄이거나 생략하지 말고 전체를 그대로 포함
- 상품명 뒤에 클릭을 유도하는 짧은 문구 추가 (예: 지금 핫딜, 놓치면 후회, 가성비 최고)
- 총 길이 80자 이내
- 제목에 이모지, 이모티콘, 특수문자 절대 사용 금지 (느낌표, 물음표만 허용)

[본문 작성 규칙]
- 2500~3500자 분량 (긴 글)
- 친근한 말투 (~요, ~해요, ㅎㅎ 사용 가능)
- 이모티콘은 전체 본문에서 5~8개 정도 사용 (적당히)
- 강조하고 싶은 부분은 **볼드**로 표시 (예: **가성비 최고**, **품절 임박**)
- 볼드는 핵심 키워드에만 사용 (전체 5~8개 정도)
- ##, -, * 리스트 등 다른 마크다운은 사용 금지
- 중요한 핵심 메시지 3~5개는 반드시 [QUOTE]내용[/QUOTE] 형식으로 감싸주세요 (인용구로 강조됨)
- [QUOTE] 태그는 한 줄에 하나씩만 사용하고, 태그 안에 줄바꿈 넣지 마세요

[모바일 최적화 - 중요!]
- 한 문장은 최대 40자 이내로 짧게 작성
- 2~3문장마다 빈 줄(줄바꿈) 넣어서 문단 구분
- 모바일에서 읽기 편하게 짧은 문장 위주로 작성
- 긴 설명은 여러 줄로 나눠서 작성

[구성]
1. 도입 (왜 이 상품을 발견했는지)
2. 상품 특징 및 장점 (5~6가지)
3. 어떤 분들에게 추천하는지
4. 가격 대비 가성비 분석
5. 활용 팁 및 코디 제안
6. 구매를 강력하게 유도하는 마무리

[절대 포함하면 안 되는 내용]
- "직접 구매했다", "직접 써봤다", "사용해봤다" 등 본인이 구매/사용했다는 표현
- "후기", "리뷰", "착용해봤다", "입어봤다" 등의 표현
- 개인적인 경험담

[반드시 포함해야 하는 내용]
- 이 상품이 왜 좋은지 장점 설명 (5~6가지)
- 어떤 분들에게 추천하는지
- 가격 대비 가성비가 좋다는 점
- 지금 구매해야 하는 이유 (할인, 품절 임박 등 긴급성)
- 구매를 강력하게 유도하는 마무리 멘트

[톤앤매너]
- 정보 공유하는 느낌으로 (내가 샀다 X, 이런 상품 발견했어요 O)
- "요즘 핫한", "입소문 난", "SNS에서 난리난" 같은 표현 활용
- 구매 욕구를 자극하는 문장

출력 형식 (정확히 지켜주세요):
[TITLE]
상품명 전체 + 클릭유도문구

[CONTENT]
본문 내용 (강조할 부분은 **볼드**로)`;

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

    log(`  Gemini 생성 완료 (제목: ${title.substring(0, 30)}...)`);
    log(`  생성된 본문 길이: ${content.length}자`);

    return { title, content };
  } catch (error) {
    log(`  Gemini API 오류: ${error.message}`);
    return {
      title: `${product.name} 강력 추천`,
      content: `요즘 SNS에서 핫한 상품 발견했어요~\n\n${product.name}\n\n가성비 좋고 품질도 좋다고 소문난 제품이에요.\n지금 할인 중이라 이 가격에 구매하기 힘들 수도 있어요.\n\n관심 있으신 분들은 빨리 확인해보세요~`
    };
  }
}

// 블로그 글 작성
async function writePost(page, product, images, doLoginFn) {
  try {
    log(`글 작성 시작: ${product.name.substring(0, 30)}...`);

    const geminiResult = await generateContentWithGemini(product);

    await page.goto(BLOG_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      log('  세션 만료 - 재로그인...');
      await doLoginFn();
      await page.goto(BLOG_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
    }

    // mainFrame 찾기
    const mainFrame = page.frame('mainFrame');
    if (!mainFrame) {
      log('  mainFrame을 찾을 수 없습니다.');
      return false;
    }

    // 팝업 닫기 ("작성중인 글이 있습니다" → 취소 클릭해서 새 글 작성)
    await page.waitForTimeout(2000);
    try {
      // "작성중인 글이 있습니다" 팝업 → 취소 버튼 클릭 (새 글 작성)
      const cancelBtn = await mainFrame.$('.se-popup-button-cancel');
      if (cancelBtn) {
        await cancelBtn.click();
        log(`  → "작성중인 글" 팝업: 취소 클릭 (새 글 작성)`);
        await page.waitForTimeout(500);
      }

      // 다른 확인 팝업이 있으면 닫기
      const confirmPopup = await mainFrame.$('.se-popup-alert-confirm .se-popup-button-confirm');
      if (confirmPopup) {
        await confirmPopup.click();
        await page.waitForTimeout(500);
      }

      const helpCloseBtn = await mainFrame.$('button.se-help-panel-close-button');
      if (helpCloseBtn) {
        await helpCloseBtn.click();
        await page.waitForTimeout(500);
      }
      await page.keyboard.press('Escape');
    } catch (e) {}

    // 제목 입력
    log(`  [1/7] 제목 입력...`);
    const titleArea = await mainFrame.$('.se-documentTitle .se-text-paragraph');
    if (titleArea) {
      await titleArea.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(geminiResult.title, { delay: 30 });
      log(`  제목: ${geminiResult.title}`);
    }
    await page.waitForTimeout(500);

    // 본문 영역으로 이동
    const contentArea = await mainFrame.$('.se-component.se-text .se-text-paragraph');
    if (contentArea) {
      await contentArea.click();
    } else {
      await page.keyboard.press('Tab');
    }
    await page.waitForTimeout(500);

    // 이미지 업로드 헬퍼 함수
    async function uploadSingleImage(imagePath) {
      try {
        const absolutePath = path.resolve(imagePath);
        if (!fs.existsSync(absolutePath)) {
          log(`    이미지 파일 없음: ${imagePath}`);
          return false;
        }

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
        log(`    이미지 업로드 실패: ${e.message}`);
        await page.keyboard.press('Escape');
        return false;
      }
    }

    // === 순서대로 작업 ===

    // 2. 대가성 문구 먼저 입력 (맨 상단)
    log(`  [2/7] 대가성 문구 입력...`);
    await page.keyboard.type(DISCLOSURE, { delay: 15 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 3. 첫 번째 이미지 업로드
    if (images.length > 0) {
      log(`  [3/7] 첫 번째 이미지 업로드...`);
      await uploadSingleImage(images[0]);
      await page.waitForTimeout(1000);
      log(`  ✅ 첫 번째 이미지 업로드 완료`);
    }

    // 에디터 끝으로 이동
    await page.keyboard.press('End');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 4. 본문 직접 입력 (볼드 + 인용구 + 이미지 분산 삽입)
    log(`  [4/7] 본문 입력 중...`);

    let content = geminiResult.content;

    // 다양한 QUOTE 태그 변형을 표준화 (오타 포함)
    content = content.replace(/\[QOU?T?E?\]/gi, '[QUOTE]');
    content = content.replace(/\[QOUTE\]/gi, '[QUOTE]');
    content = content.replace(/\[?\/QOU?T?E?\]/gi, '[/QUOTE]');
    content = content.replace(/\[\/QOUTE\]/gi, '[/QUOTE]');
    content = content.replace(/<\/?\/?\[?QOU?T?E?\]?>/gi, '[/QUOTE]');
    content = content.replace(/<\/\[qoute\]/gi, '[/QUOTE]');

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

    // 중간 이미지 준비 (첫번째, 마지막 제외)
    const middleImages = images.length > 2 ? images.slice(1, -1) : [];
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
        for (const line of lines) {
          if (line.trim()) {
            await typeWithBold(page, line);
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

    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 5. 남은 중간 이미지 처리 (인용구보다 이미지가 많을 경우)
    if (middleImageIndex < middleImages.length) {
      log(`  [5/7] 남은 이미지 ${middleImages.length - middleImageIndex}장 업로드...`);
      while (middleImageIndex < middleImages.length) {
        await uploadSingleImage(middleImages[middleImageIndex]);
        log(`    → 남은 이미지 ${middleImageIndex + 2}/${images.length} 업로드 완료`);
        middleImageIndex++;
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
      }
    }

    log(`  ✅ 본문 + 이미지 분산 삽입 완료`);

    // 6. 마지막 이미지 + 마무리 멘트 + 링크 입력
    log(`  [6/7] 마무리 멘트 + 링크 입력...`);

    // 아래 방향키로 확실히 문서 맨 끝으로 이동
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 마지막 이미지 업로드
    if (images.length > 1) {
      await uploadSingleImage(images[images.length - 1]);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    }

    await page.keyboard.type('지금 바로 확인해보세요!', { delay: 20 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // 링크 직접 타이핑
    const affiliateLink = product.affiliate_link || product.affiliateLink || '';
    if (affiliateLink) {
      await page.keyboard.type(affiliateLink, { delay: 15 });
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(5000);  // 미리보기 생성 대기
      log(`  ✅ 상품 링크 입력 + 미리보기 생성 완료`);
    }

    // 7. 발행 버튼 클릭
    log(`  [7/7] 발행 준비...`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 발행 버튼 찾기
    const publishBtn = await mainFrame.$('button.publish_btn__Y5YlZ, button[class*="publish"]');
    if (publishBtn) {
      await publishBtn.click();
      log('  발행 버튼 클릭');
      await page.waitForTimeout(2000);
    }

    // 해시태그 입력
    try {
      const hashtags = generateHashtags(product.name);
      const tagList = hashtags.split(' ').map(tag => tag.replace('#', ''));

      const hashtagInput = await mainFrame.$('input[placeholder*="태그"], input[placeholder*="해시태그"]');
      if (hashtagInput) {
        for (const tag of tagList) {
          await hashtagInput.click();
          await page.waitForTimeout(200);
          await page.keyboard.type(tag, { delay: 30 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
        }
        log(`  ✅ 해시태그 입력: ${hashtags}`);
      }
    } catch (e) {
      log(`  해시태그 입력 실패: ${e.message}`);
    }

    log(`\n  ✅ 글 작성 완료! 발행 확인 후 진행하세요.`);
    log(`  60초 후 다음 단계로 진행...`);

    await page.waitForTimeout(60000);

    return true;

  } catch (e) {
    log(`  ❌ 글 작성 오류: ${e.message}`);
    return false;
  }
}

// 메인 실행
async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   블로그 자동 글쓰기 - Supabase 버전           ║');
  console.log('║   카페 스타일 통일 + Gemini AI + 링크          ║');
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
    worker = await registerWorker(WORKER_NAME, 'blog');
    log(`Worker 등록: ${worker.name} (${worker.id})\n`);
  } catch (e) {
    log(`⚠️ Worker 등록 실패: ${e.message}`);
  }

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
    await page.goto(BLOG_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();

    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      log('로그인 필요 - 로그인 진행...');
      await doLogin();
      return false;
    }

    log('✅ 이미 로그인 상태 - 바로 글쓰기 가능\n');
    return true;
  }

  try {
    await checkAndLogin();

    while (true) {
      if (worker) {
        try {
          await updateWorkerHeartbeat(worker.id);
        } catch (e) {}
      }

      log('\n📊 Supabase에서 상품 조회 중...');
      const products = await getProductsForPosting('blog', 1);

      if (!products || products.length === 0) {
        log('게시 가능한 상품이 없습니다. 10분 후 다시 확인...');
        await page.waitForTimeout(10 * 60 * 1000);
        continue;
      }

      const product = products[0];
      log(`\n선택된 상품: ${product.name.substring(0, 30)}...`);
      log(`  블로그 게시 횟수: ${product.blog_count}회`);
      log(`  총 게시 횟수: ${product.total_count}회`);

      const productUrl = product.product_url || '';
      const affiliateLink = product.affiliate_link || '';

      const images = await getProductImages(page, productUrl, affiliateLink);
      const success = await writePost(page, product, images, doLogin);

      try {
        await recordPost(
          product.product_id,
          worker?.id || null,
          'blog',
          success,
          success ? null : '게시 실패'
        );
        log(`  📝 게시 기록 저장 완료`);
      } catch (e) {
        log(`  ⚠️ 게시 기록 저장 실패: ${e.message}`);
      }

      for (const img of images) {
        try { fs.unlinkSync(img); } catch (e) {}
      }

      const waitTime = 5 * 60 * 1000 + Math.random() * 5 * 60 * 1000;
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
