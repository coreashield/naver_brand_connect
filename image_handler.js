import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();

// 이미지 다운로드 함수
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol.get(url, (response) => {
      // 리다이렉트 처리
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

// 이미지 리사이징 및 해시 변경 함수
async function processImage(inputPath, outputPath, options = {}) {
  const {
    width = 800,
    quality = 85,
    addNoise = true
  } = options;

  try {
    let image = sharp(inputPath);
    const metadata = await image.metadata();

    // 리사이즈 (비율 유지)
    if (metadata.width > width) {
      image = image.resize(width, null, { fit: 'inside' });
    }

    // 약간의 변형으로 해시값 변경
    if (addNoise) {
      // 밝기/대비 미세 조정 (해시값 변경용)
      image = image.modulate({
        brightness: 1.01 + Math.random() * 0.02,  // 1.01 ~ 1.03
        saturation: 1.0 + Math.random() * 0.02    // 1.0 ~ 1.02
      });

      // 아주 미세한 블러 (거의 인지 불가)
      image = image.blur(0.3);
    }

    // JPEG로 저장 (품질 조정)
    await image
      .jpeg({ quality: quality, mozjpeg: true })
      .toFile(outputPath);

    console.log(`  → 이미지 처리 완료: ${path.basename(outputPath)}`);
    return outputPath;
  } catch (error) {
    console.error(`  → 이미지 처리 실패: ${error.message}`);
    return null;
  }
}

// 제품 페이지에서 이미지 URL 추출
async function scrapeProductImages(productUrl) {
  console.log('제품 이미지 스크래핑 시작...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 30
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();
  const imageUrls = [];

  try {
    // 로그인
    console.log('네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(3000);

    // 제품 페이지 이동
    console.log('제품 페이지 이동...');
    await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 이미지 URL 추출 (여러 선택자 시도)
    const selectors = [
      '.product-image img',
      '.thumb_area img',
      '.product_thumb img',
      '[class*="product"] img',
      '[class*="thumb"] img',
      '.swiper-slide img',
      '.slider img',
      'img[src*="shop"]',
      'img[src*="product"]'
    ];

    for (const selector of selectors) {
      const images = await page.$$(selector);
      for (const img of images) {
        const src = await img.getAttribute('src');
        if (src && (src.includes('shop') || src.includes('product') || src.includes('phinf'))) {
          // URL 정리
          let cleanUrl = src;
          if (cleanUrl.startsWith('//')) {
            cleanUrl = 'https:' + cleanUrl;
          }
          // 고화질 버전으로 변경
          cleanUrl = cleanUrl.replace(/\?type=.*$/, '');

          if (!imageUrls.includes(cleanUrl)) {
            imageUrls.push(cleanUrl);
            console.log(`  발견: ${cleanUrl.substring(0, 80)}...`);
          }
        }
      }
    }

    // 상세 이미지도 추출
    const detailImages = await page.$$('img[src*="detail"], .detail_area img, .product_detail img');
    for (const img of detailImages) {
      const src = await img.getAttribute('src');
      if (src) {
        let cleanUrl = src.startsWith('//') ? 'https:' + src : src;
        cleanUrl = cleanUrl.replace(/\?type=.*$/, '');
        if (!imageUrls.includes(cleanUrl)) {
          imageUrls.push(cleanUrl);
        }
      }
    }

    console.log(`총 ${imageUrls.length}개 이미지 발견`);

    await browser.close();
    return imageUrls;

  } catch (error) {
    console.error('이미지 스크래핑 오류:', error.message);
    await browser.close();
    return imageUrls;
  }
}

// 이미지 다운로드 및 처리
async function downloadAndProcessImages(imageUrls, outputDir = 'output/images') {
  // 출력 디렉토리 생성
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const processedImages = [];

  // 최대 5개 이미지만 처리
  const urlsToProcess = imageUrls.slice(0, 5);

  for (let i = 0; i < urlsToProcess.length; i++) {
    const url = urlsToProcess[i];
    const tempFile = path.join(outputDir, `temp_${i}.jpg`);
    const outputFile = path.join(outputDir, `product_${i + 1}.jpg`);

    console.log(`이미지 ${i + 1}/${urlsToProcess.length} 처리 중...`);

    try {
      // 다운로드
      await downloadImage(url, tempFile);
      console.log(`  → 다운로드 완료`);

      // 리사이징 및 해시 변경
      const processed = await processImage(tempFile, outputFile, {
        width: 800,
        quality: 85 - Math.floor(Math.random() * 5), // 80-85
        addNoise: true
      });

      if (processed) {
        processedImages.push(outputFile);
      }

      // 임시 파일 삭제
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }

    } catch (error) {
      console.error(`  → 이미지 ${i + 1} 처리 실패:`, error.message);
    }
  }

  console.log(`\n총 ${processedImages.length}개 이미지 준비 완료`);
  return processedImages;
}

// 블로그에 이미지 업로드 (에디터에서)
async function uploadImageToBlog(page, mainFrame, imagePath) {
  try {
    // 이미지 버튼 클릭
    const imageBtn = await mainFrame.$('button[data-name="image"]');
    if (imageBtn) {
      await imageBtn.click();
      await page.waitForTimeout(1000);

      // 파일 입력 요소 찾기
      const fileInput = await mainFrame.$('input[type="file"]');
      if (fileInput) {
        await fileInput.setInputFiles(imagePath);
        await page.waitForTimeout(2000);
        console.log(`  → 이미지 업로드: ${path.basename(imagePath)}`);
        return true;
      } else {
        // 파일 선택 대화상자가 뜨는 경우
        console.log('  → 파일 입력 요소 찾기 실패');
        await page.keyboard.press('Escape');
      }
    }
    return false;
  } catch (error) {
    console.error('  → 이미지 업로드 실패:', error.message);
    await page.keyboard.press('Escape');
    return false;
  }
}

// 메인 실행 함수
async function main() {
  const productUrl = 'https://brandconnect.naver.com/904249244338784/affiliate/products/899248351112384';

  console.log('=== 제품 이미지 다운로드 및 처리 ===\n');

  // 1. 이미지 URL 스크래핑
  const imageUrls = await scrapeProductImages(productUrl);

  if (imageUrls.length === 0) {
    console.log('이미지를 찾을 수 없습니다.');
    return;
  }

  // 2. 이미지 다운로드 및 처리
  const processedImages = await downloadAndProcessImages(imageUrls);

  console.log('\n=== 처리된 이미지 목록 ===');
  processedImages.forEach((img, i) => {
    console.log(`${i + 1}. ${img}`);
  });

  console.log('\n이미지가 output/images 폴더에 저장되었습니다.');
  console.log('blog_writer.js 실행 시 자동으로 업로드됩니다.');
}

export { scrapeProductImages, downloadAndProcessImages, uploadImageToBlog, processImage };

// 직접 실행시
const isMainModule = process.argv[1]?.includes('image_handler');
if (isMainModule) {
  main();
}
