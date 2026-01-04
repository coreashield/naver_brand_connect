import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

// 환경 변수
const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const BLOG_WRITE_URL = 'https://blog.naver.com/ingredient7303126?Redirect=Write&categoryNo=6';

// 파일 경로
const PRODUCT_IMAGES_DIR = 'output/images';
const PRODUCT_FILE = 'output/product_links.json';
const POSTED_FILE = 'output/blog_posted.json';  // 블로그용 별도 관리
const LOG_FILE = 'output/blog_writer.log';
const MAX_IMAGES = 3;

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

// 상품 로드
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

// 게시 카운트 로드
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

// 게시 카운트 저장
function savePostedProducts(posted) {
  if (!fs.existsSync('output')) fs.mkdirSync('output', { recursive: true });
  const obj = Object.fromEntries(posted);
  fs.writeFileSync(POSTED_FILE, JSON.stringify(obj, null, 2), 'utf-8');
}

// 상품 정렬 (카운트 낮은 것 우선)
function sortProductsByCount(products, postedCounts) {
  return [...products].sort((a, b) => {
    const countA = postedCounts.get(a.productId) || 0;
    const countB = postedCounts.get(b.productId) || 0;
    if (countA !== countB) return countA - countB;
    return Math.random() - 0.5;
  });
}

// ============================================
// 이미지 다운로드 및 처리 함수들
// ============================================
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();

        // 파일 크기 검증 (5KB 미만은 에러 이미지로 간주)
        try {
          const stats = fs.statSync(filepath);
          if (stats.size < 5000) {
            fs.unlinkSync(filepath);
            reject(new Error(`이미지 크기 너무 작음: ${stats.size} bytes`));
            return;
          }
        } catch (e) {
          reject(e);
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

async function processImage(inputPath, outputPath, options = {}) {
  const { width = 800, quality = 85, addNoise = true } = options;

  try {
    let image = sharp(inputPath);
    const metadata = await image.metadata();

    if (metadata.width > width) {
      image = image.resize(width, null, { fit: 'inside' });
    }

    if (addNoise) {
      image = image.modulate({
        brightness: 1.01 + Math.random() * 0.02,
        saturation: 1.0 + Math.random() * 0.02
      });
      image = image.blur(0.3);
    }

    await image.jpeg({ quality: quality, mozjpeg: true }).toFile(outputPath);
    console.log(`  → 이미지 처리 완료: ${path.basename(outputPath)}`);
    return outputPath;
  } catch (error) {
    console.error(`  → 이미지 처리 실패: ${error.message}`);
    return null;
  }
}

// 제품 페이지에서 이미지 URL 추출 및 다운로드
async function scrapeAndDownloadImages(page, productUrl) {
  console.log('\n=== 제품 이미지 다운로드 ===');

  // 이미지 폴더 초기화
  if (!fs.existsSync(PRODUCT_IMAGES_DIR)) {
    fs.mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });
  } else {
    // 기존 이미지 삭제
    const oldFiles = fs.readdirSync(PRODUCT_IMAGES_DIR);
    for (const file of oldFiles) {
      fs.unlinkSync(path.join(PRODUCT_IMAGES_DIR, file));
    }
  }

  await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 이미지 URL 추출 (에러/플레이스홀더 이미지 필터링)
  const imageUrls = await page.evaluate(() => {
    const urls = [];
    const selectors = [
      '.product-image img', '.thumb_area img', '.product_thumb img',
      '[class*="product"] img', '[class*="thumb"] img', '.swiper-slide img',
      'img[src*="shop"]', 'img[src*="product"]', 'img[src*="phinf"]'
    ];

    for (const selector of selectors) {
      const images = document.querySelectorAll(selector);
      images.forEach(img => {
        let src = img.src || img.getAttribute('data-src');
        if (src && (src.includes('shop') || src.includes('product') || src.includes('phinf') || src.includes('pstatic'))) {
          // 에러/플레이스홀더 이미지 제외
          if (src.includes('error') || src.includes('noimage') || src.includes('no_image') ||
              src.includes('placeholder') || src.includes('exclamation') || src.includes('logo') ||
              src.includes('icon') || src.includes('blank') || src.includes('avatar')) {
            return;
          }
          if (src.startsWith('//')) src = 'https:' + src;
          src = src.replace(/\?type=.*$/, '').replace(/_\d+x\d+/, ''); // 고화질로 변환
          if (!urls.includes(src)) urls.push(src);
        }
      });
    }
    return urls;
  });

  console.log(`발견된 이미지: ${imageUrls.length}개`);

  // 최대 3개만 다운로드
  const urlsToDownload = imageUrls.slice(0, MAX_IMAGES);
  const downloadedImages = [];

  for (let i = 0; i < urlsToDownload.length; i++) {
    const url = urlsToDownload[i];
    const tempFile = path.join(PRODUCT_IMAGES_DIR, `temp_${i}.jpg`);
    const outputFile = path.join(PRODUCT_IMAGES_DIR, `product_${i + 1}.jpg`);

    console.log(`이미지 ${i + 1}/${urlsToDownload.length} 다운로드 중...`);

    try {
      await downloadImage(url, tempFile);
      const processed = await processImage(tempFile, outputFile, {
        width: 800,
        quality: 85 - Math.floor(Math.random() * 5),
        addNoise: true
      });

      if (processed) downloadedImages.push(outputFile);
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (error) {
      console.error(`  → 이미지 ${i + 1} 실패:`, error.message);
    }
  }

  console.log(`✅ 총 ${downloadedImages.length}개 이미지 준비 완료\n`);
  return downloadedImages;
}

// ============================================
// 1. 제품 정보 크롤링 (Playwright)
// ============================================
async function crawlProductInfo(productUrl) {
  console.log('=== 제품 정보 크롤링 시작 ===');
  console.log(`URL: ${productUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 네이버 쇼핑/스마트스토어 기준 셀렉터
    const productInfo = await page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.textContent.trim() : '';
      };

      const getTexts = (selector) => {
        const els = document.querySelectorAll(selector);
        return Array.from(els).map(el => el.textContent.trim()).filter(t => t);
      };

      // 제품명
      const productName = getText('._3oDjSvLwwi, .product-title, h2._22kNQuEXmb, [class*="ProductName"]') ||
                          getText('h1, h2') ||
                          '제품명 없음';

      // 가격
      const price = getText('._1LY7DqCnwR, .product-price, ._1lyw6G67B3, [class*="Price"]') ||
                    getText('[class*="price"]') ||
                    '가격 정보 없음';

      // 할인가
      const salePrice = getText('._2pgHN-ntx6, .sale-price, [class*="SalePrice"]') || price;

      // 브랜드/쇼핑몰명
      const brand = getText('._1vVKjJByMy, .brand-name, [class*="Brand"]') ||
                    getText('[class*="mall"], [class*="store"]') ||
                    '';

      // 제품 설명/상세
      const description = getText('._1RnNDNAvWS, .product-description, [class*="Description"]') ||
                          getText('[class*="detail"], [class*="info"]') ||
                          '';

      // 리뷰 요약
      const reviewCount = getText('._2PQrR3RDAE, [class*="review-count"], [class*="ReviewCount"]') || '0';
      const rating = getText('._1ApVZR0iHM, [class*="rating"], [class*="Rating"]') || '';

      // 제품 특징/옵션
      const features = getTexts('[class*="option"], [class*="feature"], [class*="spec"] li');

      // 카테고리
      const category = getText('[class*="category"], [class*="breadcrumb"]') || '';

      // 배송 정보
      const delivery = getText('[class*="delivery"], [class*="shipping"]') || '';

      return {
        productName,
        price,
        salePrice,
        brand,
        description,
        reviewCount,
        rating,
        features: features.slice(0, 10),
        category,
        delivery,
        url: window.location.href
      };
    });

    console.log('\n📦 크롤링된 제품 정보:');
    console.log(`  제품명: ${productInfo.productName}`);
    console.log(`  가격: ${productInfo.price}`);
    console.log(`  할인가: ${productInfo.salePrice}`);
    console.log(`  브랜드: ${productInfo.brand}`);
    console.log(`  리뷰: ${productInfo.reviewCount}개`);

    await browser.close();
    return productInfo;

  } catch (error) {
    console.error('크롤링 오류:', error.message);
    await browser.close();
    throw error;
  }
}

// ============================================
// 2. Gemini API로 원고 생성
// ============================================
async function generateBlogContent(productInfo) {
  console.log('\n=== Gemini API로 원고 생성 중 ===');

  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `당신은 20~30대 여성 블로거입니다. 아래 제품 정보를 바탕으로 네이버 블로그에 올릴 자연스럽고 상세한 후기 글을 작성해주세요.

## 제품 정보
- 제품명: ${productInfo.productName}
- 가격: ${productInfo.price}
- 할인가: ${productInfo.salePrice}
- 브랜드: ${productInfo.brand}
- 설명: ${productInfo.description}
- 리뷰 수: ${productInfo.reviewCount}
- 평점: ${productInfo.rating}
- 특징: ${productInfo.features?.join(', ') || '없음'}
- 카테고리: ${productInfo.category}

## 작성 규칙
1. 글자 수: 최소 2500자 이상, 가능하면 3000~3500자
2. 말투: 친근한 반말체 (~요, ~거든요, ㅎㅎ, ㅋㅋ 사용)
3. 이모지: 적당히 자연스럽게 사용 (문단마다 1~2개)
4. 구성 (각 섹션을 충분히 길게 작성):
   - 도입 (300~400자): 왜 이 제품을 사게 됐는지 (고민, 계기, 검색 과정)
   - 첫인상 (300~400자): 배송, 포장, 언박싱 경험
   - 상세 리뷰 (800~1000자): 실제 사용 후기 (장점, 착용감, 소재, 디테일, 색상, 사이즈 등 구체적으로)
   - 활용법 (300~400자): 어떤 상황에서 사용하면 좋은지, 코디 제안 등
   - 장단점 (400~500자): 솔직한 장단점 상세 정리 (장점 4~5개, 단점 1~2개)
   - 가격 분석 (200~300자): 가성비, 할인 정보, 비슷한 제품과 비교
   - 마무리 (300~400자): 추천 대상, 총평, 재구매 의사

## 중요한 포맷 규칙
- 문단 구분은 빈 줄로 해주세요
- 각 섹션 시작 전에 [DIVIDER] 를 넣어주세요
- 인용구가 필요한 부분은 [QUOTE]내용[/QUOTE] 형식으로 (3~4개 정도)
- 스티커 삽입 위치는 [STICKER] 로 표시 (4~5개 정도, 각 섹션 사이에)
- 절대로 이미지 관련 표시([IMAGE] 등)는 넣지 마세요 - 이미지는 별도 처리합니다

## 주의사항
- 광고티 나지 않게 자연스럽게
- 너무 과장하지 말고 솔직하게
- 실제로 구매한 것처럼 생생하게
- 한 문장이 너무 길지 않게 끊어서
- 각 문단을 충분히 길게 작성 (한 문단에 3~5문장)
- 제품의 세부 사항을 구체적으로 묘사
- 독자가 구매 결정에 도움이 되도록 상세하게

제목과 본문을 작성해주세요. 반드시 2500자 이상으로 길게 작성해주세요!
형식:
[TITLE]
제목 내용

[CONTENT]
본문 내용...`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    console.log('✅ 원고 생성 완료!');
    console.log(`생성된 글자 수: 약 ${responseText.length}자`);

    return parseGeminiResponse(responseText);
  } catch (error) {
    console.error('Gemini API 오류:', error.message);
    throw error;
  }
}

// ============================================
// 3. Gemini 응답 파싱 → sections 배열로 변환
// ============================================
function parseGeminiResponse(responseText) {
  // 제목 추출
  const titleMatch = responseText.match(/\[TITLE\]\s*([\s\S]*?)(?=\[CONTENT\]|\n\n)/i);
  const title = titleMatch ? titleMatch[1].trim() : '제품 후기';

  // 본문 추출
  const contentMatch = responseText.match(/\[CONTENT\]\s*([\s\S]*)/i);
  const content = contentMatch ? contentMatch[1].trim() : responseText;

  // sections 배열 생성
  const sections = [];

  // 본문을 줄 단위로 분리
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      sections.push({ type: 'blank' });
      continue;
    }

    // [QUOTE]...[/QUOTE] 처리
    if (trimmedLine.includes('[QUOTE]')) {
      const quoteMatch = trimmedLine.match(/\[QUOTE\](.*?)\[\/QUOTE\]/);
      if (quoteMatch) {
        sections.push({
          type: 'quote',
          content: quoteMatch[1].trim(),
          style: Math.floor(Math.random() * 3) // 랜덤 스타일
        });
        continue;
      }
    }

    // [DIVIDER] 처리
    if (trimmedLine === '[DIVIDER]') {
      sections.push({ type: 'divider' });
      continue;
    }

    // [STICKER] 처리
    if (trimmedLine === '[STICKER]') {
      sections.push({ type: 'sticker' });
      continue;
    }

    // 일반 텍스트
    sections.push({ type: 'text', content: trimmedLine });
  }

  // 마지막에 고지문 추가
  sections.push({ type: 'divider' });
  sections.push({
    type: 'notice',
    content: '이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.'
  });

  console.log(`파싱 완료: ${sections.length}개 섹션`);

  return { title, sections };
}

// ============================================
// 4. 이미지 배치 (첫 번째 고정 + 나머지 랜덤)
// ============================================
function insertImagesIntoSections(sections, imageCount) {
  if (imageCount === 0) return sections;

  const result = [];

  // 첫 번째 이미지는 맨 처음에 고정
  result.push({ type: 'image', index: 0 });
  result.push({ type: 'sticker' }); // 이미지 후 스티커

  // 나머지 이미지 랜덤 배치 위치 결정
  const remainingImages = imageCount - 1;

  if (remainingImages > 0) {
    // 텍스트 섹션 인덱스 수집 (이미지 삽입 가능한 위치)
    const textIndices = [];
    sections.forEach((section, idx) => {
      if (section.type === 'divider' || section.type === 'blank') {
        textIndices.push(idx);
      }
    });

    // 균등하게 분배할 위치 계산
    const insertPositions = [];
    if (textIndices.length >= remainingImages) {
      const step = Math.floor(textIndices.length / (remainingImages + 1));
      for (let i = 0; i < remainingImages; i++) {
        const pos = textIndices[step * (i + 1)] || textIndices[textIndices.length - 1 - i];
        if (pos !== undefined) {
          insertPositions.push(pos);
        }
      }
    }

    // 섹션 복사하면서 이미지 삽입
    let imageIdx = 1;
    sections.forEach((section, idx) => {
      result.push(section);

      // 이 위치에 이미지 삽입
      if (insertPositions.includes(idx) && imageIdx < imageCount) {
        result.push({ type: 'image', index: imageIdx });
        imageIdx++;
      }
    });
  } else {
    // 나머지 이미지 없으면 섹션만 추가
    result.push(...sections);
  }

  return result;
}

// ============================================
// 5. 사용 가능한 제품 이미지 가져오기
// ============================================
function getAvailableProductImages() {
  const images = [];
  if (fs.existsSync(PRODUCT_IMAGES_DIR)) {
    const files = fs.readdirSync(PRODUCT_IMAGES_DIR);
    for (const file of files) {
      if (file.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        images.push(path.join(PRODUCT_IMAGES_DIR, file));
      }
    }
  }
  // 최대 이미지 수 제한
  const shuffled = images.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, MAX_IMAGES);
}

// ============================================
// 6. 네이버 로그인
// ============================================
async function naverLogin(page) {
  console.log('네이버 로그인 시도...');
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('#id');
  await page.keyboard.type(NAVER_ID, { delay: 50 });
  await page.click('#pw');
  await page.keyboard.type(NAVER_PW, { delay: 50 });
  await page.click('#log\\.login');
  await page.waitForTimeout(3000);
  console.log('로그인 완료!');
}

// ============================================
// 7. 에디터 도구 함수들
// ============================================

// 인용구 삽입
async function insertQuote(page, mainFrame, text, styleIndex = 0) {
  try {
    const quoteBtn = await mainFrame.$('button[data-name="quotation"]');
    if (quoteBtn) {
      await quoteBtn.click();
      await page.waitForTimeout(600);

      const quoteOptions = await mainFrame.$$('.se-popup-panel button, .se-drop-down-panel button');
      const safeIndex = Math.min(styleIndex, Math.max(0, quoteOptions.length - 1));
      if (quoteOptions.length > 0) {
        await quoteOptions[safeIndex].click();
        await page.waitForTimeout(400);
      }

      await page.keyboard.type(text, { delay: 20 });
      await page.waitForTimeout(300);
      await page.keyboard.press('End');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      console.log(`  → 인용구 삽입됨`);
    }
  } catch (e) {
    console.log('  인용구 실패:', e.message);
    await page.keyboard.type(`「 ${text} 」`, { delay: 15 });
    await page.keyboard.press('Enter');
  }
}

// 구분선 삽입
async function insertDivider(page, mainFrame) {
  try {
    const lineBtn = await mainFrame.$('button[data-name="horizontal-line"]');
    if (lineBtn) {
      await lineBtn.click();
      await page.waitForTimeout(600);

      const lineOptions = await mainFrame.$$('.se-popup-panel button, .se-drop-down-panel button');
      if (lineOptions.length > 0) {
        const randomStyle = Math.floor(Math.random() * Math.min(4, lineOptions.length));
        await lineOptions[randomStyle].click();
        await page.waitForTimeout(400);
      }
      console.log('  → 구분선 삽입됨');
    }
  } catch (e) {
    console.log('  구분선 실패');
  }
}

// 스티커 삽입
let stickerCategoryIndex = 0;
async function insertSticker(page, mainFrame) {
  try {
    const stickerBtn = await mainFrame.$('button[data-name="sticker"]');
    if (stickerBtn) {
      await stickerBtn.click();
      await page.waitForTimeout(1500);

      const categoryTabs = await mainFrame.$$('.se-sticker-category-item, [class*="sticker-category"] button');
      if (categoryTabs.length > 1) {
        const tabIndex = stickerCategoryIndex % categoryTabs.length;
        await categoryTabs[tabIndex].click();
        await page.waitForTimeout(800);
        stickerCategoryIndex++;
      }

      const stickerItems = await mainFrame.$$('button.se-sidebar-element-sticker');
      if (stickerItems.length > 0) {
        const randomIndex = Math.floor(Math.random() * Math.min(12, stickerItems.length));
        await stickerItems[randomIndex].click();
        await page.waitForTimeout(600);
        console.log(`  → 스티커 삽입됨`);
      } else {
        await page.keyboard.press('Escape');
      }
    }
  } catch (e) {
    console.log('  스티커 실패:', e.message);
    await page.keyboard.press('Escape');
  }
}

// 이미지 업로드
async function uploadImage(page, mainFrame, imagePath) {
  try {
    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
      console.log(`  → 이미지 파일 없음: ${imagePath}`);
      return false;
    }

    const imageBtn = await mainFrame.$('button[data-name="image"]');
    if (imageBtn) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
        imageBtn.click()
      ]);

      if (fileChooser) {
        await fileChooser.setFiles(absolutePath);
        await page.waitForTimeout(3000);
        console.log(`  → 이미지 업로드 완료: ${path.basename(imagePath)}`);
        return true;
      } else {
        await page.waitForTimeout(1000);
        const fileInput = await mainFrame.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(absolutePath);
          await page.waitForTimeout(3000);
          console.log(`  → 이미지 업로드 완료: ${path.basename(imagePath)}`);
          return true;
        }
        await page.keyboard.press('Escape');
      }
    }
    return false;
  } catch (error) {
    console.log(`  → 이미지 업로드 실패: ${error.message}`);
    await page.keyboard.press('Escape');
    return false;
  }
}

// ============================================
// 8. 메인 블로그 작성 함수
// ============================================
async function writeBlogPost(productUrl) {
  console.log('=== 블로그 자동 작성 시작 ===\n');

  // 브라우저 실행 (로그인 후 이미지 다운로드 + 제품정보 크롤링)
  const browser = await chromium.launch({
    headless: false,
    slowMo: 20
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    // 1. 네이버 로그인
    await naverLogin(page);

    // 2. 이미지 다운로드 (로그인 상태에서)
    const productImages = await scrapeAndDownloadImages(page, productUrl);
    console.log(`🖼️  다운로드된 이미지: ${productImages.length}장`);

    // 3. 제품 정보 크롤링 (같은 세션에서)
    console.log('\n=== 제품 정보 수집 ===');
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const productInfo = await page.evaluate(() => {
      const getText = (selector) => {
        const el = document.querySelector(selector);
        return el ? el.textContent.trim() : '';
      };

      const getTexts = (selector) => {
        const els = document.querySelectorAll(selector);
        return Array.from(els).map(el => el.textContent.trim()).filter(t => t);
      };

      const productName = getText('._3oDjSvLwwi, .product-title, h2._22kNQuEXmb, [class*="ProductName"]') ||
                          getText('h1, h2') || '제품명 없음';
      const price = getText('._1LY7DqCnwR, .product-price, ._1lyw6G67B3, [class*="Price"]') ||
                    getText('[class*="price"]') || '가격 정보 없음';
      const salePrice = getText('._2pgHN-ntx6, .sale-price, [class*="SalePrice"]') || price;
      const brand = getText('._1vVKjJByMy, .brand-name, [class*="Brand"]') ||
                    getText('[class*="mall"], [class*="store"]') || '';
      const description = getText('._1RnNDNAvWS, .product-description, [class*="Description"]') ||
                          getText('[class*="detail"], [class*="info"]') || '';
      const reviewCount = getText('._2PQrR3RDAE, [class*="review-count"], [class*="ReviewCount"]') || '0';
      const rating = getText('._1ApVZR0iHM, [class*="rating"], [class*="Rating"]') || '';
      const features = getTexts('[class*="option"], [class*="feature"], [class*="spec"] li');
      const category = getText('[class*="category"], [class*="breadcrumb"]') || '';

      return { productName, price, salePrice, brand, description, reviewCount, rating, features: features.slice(0, 10), category, url: window.location.href };
    });

    console.log(`📦 제품명: ${productInfo.productName}`);
    console.log(`💰 가격: ${productInfo.salePrice}`);

    // 4. Gemini로 원고 생성
    const blogContent = await generateBlogContent(productInfo);
    console.log(`\n📝 생성된 제목: ${blogContent.title}`);

    // 5. 이미지를 섹션에 배치 (첫 번째 고정 + 나머지 랜덤)
    const sectionsWithImages = insertImagesIntoSections(blogContent.sections, productImages.length);

    console.log('\n블로그 글쓰기 페이지 이동...');
    await page.goto(BLOG_WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const mainFrame = page.frame('mainFrame');
    if (!mainFrame) {
      console.log('mainFrame을 찾을 수 없습니다.');
      return;
    }

    // 팝업 닫기
    await page.waitForTimeout(2000);
    try {
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
    console.log('\n=== 제목 입력 ===');
    const titleArea = await mainFrame.$('.se-documentTitle .se-text-paragraph');
    if (titleArea) {
      await titleArea.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(blogContent.title, { delay: 30 });
      console.log('제목 입력 완료:', blogContent.title);
    }

    await page.waitForTimeout(700);

    // 본문 영역 이동
    console.log('\n=== 본문 영역으로 이동 ===');
    const contentArea = await mainFrame.$('.se-component.se-text .se-text-paragraph');
    if (contentArea) {
      await contentArea.click();
    } else {
      await page.keyboard.press('Tab');
    }
    await page.waitForTimeout(500);

    // 본문 작성
    console.log('\n=== 본문 입력 시작 ===');

    for (let i = 0; i < sectionsWithImages.length; i++) {
      const section = sectionsWithImages[i];
      console.log(`섹션 ${i + 1}/${sectionsWithImages.length}: ${section.type}`);

      switch (section.type) {
        case 'image':
          if (productImages[section.index]) {
            const uploaded = await uploadImage(page, mainFrame, productImages[section.index]);
            if (uploaded) {
              await page.keyboard.press('Enter');
            }
          }
          break;

        case 'sticker':
          await insertSticker(page, mainFrame);
          break;

        case 'quote':
          await insertQuote(page, mainFrame, section.content, section.style || 0);
          break;

        case 'divider':
          await insertDivider(page, mainFrame);
          break;

        case 'blank':
          await page.keyboard.press('Enter');
          break;

        case 'notice':
        case 'text':
        default:
          if (section.content) {
            await page.keyboard.type(section.content, { delay: 15 });
            await page.keyboard.press('Enter');
          }
          break;
      }

      await page.waitForTimeout(100);
    }

    console.log('\n=== 본문 입력 완료 ===');

    // 팝업 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 스크린샷
    await page.screenshot({ path: 'output/blog_written.png', fullPage: true });
    console.log('스크린샷: output/blog_written.png');

    // 발행 버튼
    console.log('\n=== 발행 프로세스 시작 ===');
    const publishBtn = await mainFrame.$('button.publish_btn__Y5YlZ, button[class*="publish"]');
    if (publishBtn) {
      await publishBtn.click();
      console.log('발행 버튼 클릭');
      await page.waitForTimeout(2000);
    }

    // 해시태그 입력
    console.log('\n=== 해시태그 입력 ===');
    const hashtags = extractHashtags(productInfo);

    const hashtagInput = await mainFrame.$('input[placeholder*="태그"], input[placeholder*="해시태그"]');
    if (hashtagInput) {
      for (const tag of hashtags) {
        await hashtagInput.click();
        await page.waitForTimeout(200);
        await page.keyboard.type(tag, { delay: 30 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        console.log(`  → 해시태그: #${tag}`);
      }
    }

    console.log(`\n총 ${hashtags.length}개 해시태그 입력 완료`);

    await page.screenshot({ path: 'output/blog_publish_ready.png', fullPage: true });
    console.log('발행 준비 스크린샷: output/blog_publish_ready.png');

    console.log('\n✅ 글 작성 완료! (발행 전 상태)');
    console.log('브라우저에서 직접 확인 후 발행하세요.');
    console.log('60초 후 브라우저가 닫힙니다...');

    await page.waitForTimeout(60000);
    await browser.close();

  } catch (error) {
    console.error('오류:', error.message);
    await page.screenshot({ path: 'output/blog_error.png' });
    await page.waitForTimeout(30000);
    await browser.close();
  }
}

// 제품 정보에서 해시태그 추출
function extractHashtags(productInfo) {
  const baseTags = ['데일리룩', '여성패션', '추천템', '솔직후기'];

  // 제품명에서 키워드 추출
  const productName = productInfo.productName || '';
  const keywords = productName.split(/[\s,\/]+/).filter(w => w.length >= 2 && w.length <= 10);

  // 카테고리에서 추출
  const category = productInfo.category || '';
  const categoryWords = category.split(/[\s,>\/]+/).filter(w => w.length >= 2);

  // 브랜드
  const brand = productInfo.brand ? [productInfo.brand] : [];

  const allTags = [...new Set([...baseTags, ...keywords.slice(0, 5), ...categoryWords.slice(0, 3), ...brand])];

  return allTags.slice(0, 15); // 최대 15개
}

// ============================================
// 메인 실행 (자동 상품 선택)
// ============================================
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   네이버 블로그 자동 글쓰기            ║');
  console.log('║   Gemini AI + 자동 상품 선택           ║');
  console.log('╚════════════════════════════════════════╝\n');

  // 상품 로드
  const products = loadProducts();
  const posted = loadPostedProducts();

  log(`총 상품: ${products.length}개, 블로그 게시됨: ${posted.size}개`);

  // affiliateLink가 있는 상품만 필터링
  const available = products.filter(p => p.affiliateLink);

  if (available.length === 0) {
    log('게시 가능한 상품이 없습니다. product_links.json을 확인하세요.');
    process.exit(1);
  }

  // 카운트 낮은 것 우선 정렬
  const sorted = sortProductsByCount(available, posted);
  const selected = sorted[0];
  const currentCount = posted.get(selected.productId) || 0;

  log(`\n선택된 상품: ${selected.name.substring(0, 40)}...`);
  log(`게시 횟수: ${currentCount}회`);
  log(`URL: ${selected.productUrl}`);

  // 블로그 글 작성
  await writeBlogPost(selected.productUrl);

  // 게시 카운트 업데이트
  posted.set(selected.productId, currentCount + 1);
  savePostedProducts(posted);
  log(`게시 카운트 업데이트: ${currentCount} -> ${currentCount + 1}`);

  log('\n블로그 글 작성 완료!');
}

main().catch(err => {
  log(`오류: ${err.message}`);
  process.exit(1);
});
