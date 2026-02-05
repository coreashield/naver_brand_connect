/**
 * 티스토리 자동 글쓰기
 * 카카오 로그인 → 모바일 인증 대기 → 글 작성
 *
 * 티스토리 API는 2024년 2월 종료됨 - Playwright로만 가능
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
// readline 제거 - 자동 감지 방식으로 변경
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateContent } from '../utils/content_generator.js';

dotenv.config();

// 환경변수
const KAKAO_ID = process.env.KAKAO_ID?.trim();
const KAKAO_PW = process.env.KAKAO_PW?.trim();
const TISTORY_BLOG_NAME = process.env.TISTORY_BLOG_NAME?.trim(); // 블로그명 (예: myblog)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();

const LOG_FILE = 'output/tistory_writer.log';
const IMAGE_DIR = 'output/images';
const POSTED_FILE = 'output/tistory_posted.json';
const PRODUCT_FILE = 'output/product_links.json';
const PLAYWRIGHT_DATA_DIR = './playwright-data-tistory';

const MAX_IMAGES = 5;
const MIN_IMAGES = 3;
const SKIP_COUNT = 2;

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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 인증 완료 자동 감지 (URL 변경 또는 페이지 상태 변화 감지)
 */
async function waitForAuthCompletion(page, maxWaitTime = 180000) {
  log('');
  log('╔════════════════════════════════════════════════════════════╗');
  log('║  📱 카카오 모바일 인증이 필요합니다!                        ║');
  log('║                                                            ║');
  log('║  1. 카카오톡 앱에서 알림을 확인하세요                       ║');
  log('║  2. [확인] 버튼을 눌러 인증을 완료하세요                    ║');
  log('║  3. 인증 완료 시 자동으로 진행됩니다                        ║');
  log('╚════════════════════════════════════════════════════════════╝');
  log('');
  log('⏳ 인증 대기 중... (최대 3분)');

  const startTime = Date.now();
  const initialUrl = page.url();
  let dotCount = 0;

  while (Date.now() - startTime < maxWaitTime) {
    // 1. URL 변경 감지 (로그인 성공 시 리다이렉트)
    const currentUrl = page.url();
    if (currentUrl !== initialUrl) {
      log('\n✅ 인증 완료 감지! (URL 변경)');
      return true;
    }

    // 2. 계속하기 버튼 감지
    try {
      const continueBtn = page.getByRole('button', { name: '계속하기' });
      if (await continueBtn.count() > 0) {
        log('\n✅ 인증 완료 감지! (계속하기 버튼)');
        return true;
      }
    } catch (e) {}

    // 3. 티스토리 페이지 감지 (바로 리다이렉트 된 경우)
    if (currentUrl.includes('tistory.com') && !currentUrl.includes('login') && !currentUrl.includes('auth')) {
      log('\n✅ 인증 완료! (티스토리 접속됨)');
      return true;
    }

    // 진행 표시
    dotCount++;
    if (dotCount % 10 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`\r⏳ 대기 중... ${elapsed}초 경과`);
    }

    await page.waitForTimeout(1000);
  }

  log('\n⚠️ 인증 대기 시간 초과 (3분)');
  return false;
}

/**
 * 포스팅 기록 로드
 */
function loadPostedProducts() {
  try {
    if (fs.existsSync(POSTED_FILE)) {
      return JSON.parse(fs.readFileSync(POSTED_FILE, 'utf-8'));
    }
  } catch (e) {
    log(`포스팅 기록 로드 실패: ${e.message}`);
  }
  return { posted: [], lastUpdate: null };
}

/**
 * 포스팅 기록 저장
 */
function savePostedProduct(productId, productName, success = true) {
  const data = loadPostedProducts();
  data.posted.push({
    productId,
    productName,
    success,
    timestamp: new Date().toISOString()
  });
  data.lastUpdate = new Date().toISOString();
  fs.writeFileSync(POSTED_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 상품 목록 로드 (네이버 포스팅과 다른 상품 선택)
 */
function loadProducts() {
  try {
    if (!fs.existsSync(PRODUCT_FILE)) {
      log(`상품 파일 없음: ${PRODUCT_FILE}`);
      return [];
    }
    const data = JSON.parse(fs.readFileSync(PRODUCT_FILE, 'utf-8'));

    // 다양한 형식 지원
    if (Array.isArray(data)) {
      return data;
    }
    if (data.products && Array.isArray(data.products)) {
      return data.products;
    }
    // {0: {...}, 1: {...}, ...} 형식인 경우 배열로 변환
    if (typeof data === 'object') {
      const products = Object.values(data).filter(item =>
        item && typeof item === 'object' && (item.productId || item.product_id || item.name)
      );
      log(`상품 ${products.length}개 로드됨`);
      return products;
    }
    return [];
  } catch (e) {
    log(`상품 로드 실패: ${e.message}`);
    return [];
  }
}

/**
 * 티스토리에 포스팅되지 않은 상품 중 하나 선택
 */
function selectProduct() {
  const products = loadProducts();
  const posted = loadPostedProducts();
  const postedIds = new Set(posted.posted.map(p => p.productId));

  // 포스팅되지 않은 상품 필터링 (productId 또는 product_id 둘 다 지원)
  const available = products.filter(p => {
    const pid = p.productId || p.product_id || p.id;
    return !postedIds.has(pid);
  });

  if (available.length === 0) {
    log('포스팅 가능한 상품이 없습니다.');
    return null;
  }

  log(`포스팅 가능한 상품: ${available.length}개`);

  // 랜덤 선택 (다양성을 위해)
  const randomIndex = Math.floor(Math.random() * Math.min(10, available.length));
  return available[randomIndex];
}

/**
 * 이미지 다운로드
 */
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

/**
 * 스마트스토어에서 상품 이미지 가져오기
 */
async function getSmartStoreImages(page, storeUrl) {
  const imageUrls = [];

  try {
    const productPage = await page.context().newPage();
    await productPage.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await productPage.waitForTimeout(3000);

    const mainImages = await productPage.$$eval('img', imgs => {
      return imgs
        .map(img => ({
          src: img.src || img.getAttribute('data-src') || '',
          className: img.className || ''
        }))
        .filter(img => img.src && img.src.includes('http'))
        .filter(img =>
          img.src.includes('shop-phinf') ||
          img.src.includes('shopping-phinf')
        )
        .filter(img =>
          !img.src.includes('logo') &&
          !img.src.includes('icon') &&
          !img.src.includes('error') &&
          !img.src.includes('noimage')
        )
        .map(img => img.src.replace(/\?type=.*$/, ''))
        .filter((src, idx, arr) => arr.indexOf(src) === idx)
        .slice(0, 10);
    });

    imageUrls.push(...mainImages);
    await productPage.close();
  } catch (e) {
    log(`  이미지 수집 오류: ${e.message}`);
  }

  return imageUrls;
}

/**
 * 단축 URL에서 실제 URL 추출
 */
async function getRedirectUrl(page, shortUrl) {
  try {
    const tempPage = await page.context().newPage();
    await tempPage.goto(shortUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await tempPage.waitForTimeout(2000);
    const finalUrl = tempPage.url();
    await tempPage.close();
    return finalUrl;
  } catch (e) {
    return null;
  }
}

/**
 * 상품 이미지 수집 및 다운로드
 */
async function getProductImages(page, product) {
  const images = [];
  let imageUrls = [];

  try {
    const naverShoppingUrl = product.naver_shopping_url || product.naverShoppingUrl || '';
    const affiliateLink = product.affiliateLink || product.affiliate_link || '';

    // 1순위: naver_shopping_url
    if (naverShoppingUrl) {
      log(`  naver_shopping_url 사용...`);
      imageUrls = await getSmartStoreImages(page, naverShoppingUrl);
    }

    // 2순위: affiliate_link
    if (imageUrls.length === 0 && affiliateLink) {
      log(`  affiliate_link 사용...`);
      const realUrl = await getRedirectUrl(page, affiliateLink);
      if (realUrl) {
        imageUrls = await getSmartStoreImages(page, realUrl);
      }
    }

    // 이미지 다운로드
    const startIndex = imageUrls.length >= (MIN_IMAGES + SKIP_COUNT) ? SKIP_COUNT : 0;
    const targetCount = Math.min(MAX_IMAGES, imageUrls.length - startIndex);
    let downloadedCount = 0;

    log(`  총 ${imageUrls.length}개 이미지 중 ${targetCount}장 다운로드 시도`);

    for (let i = startIndex; i < imageUrls.length && downloadedCount < targetCount; i++) {
      try {
        const filename = `tistory_${Date.now()}_${downloadedCount}.jpg`;
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

/**
 * Gemini로 티스토리용 콘텐츠 생성
 */
async function generateContentWithGemini(product) {
  log(`  Gemini API로 콘텐츠 생성 중...`);

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  const productInfo = {
    name: product.name || product.product_name,
    price: product.price ? parseInt(product.price.toString().replace(/[^0-9]/g, '')) : null,
    originalPrice: product.original_price ? parseInt(product.original_price.toString().replace(/[^0-9]/g, '')) : null,
    category: product.category || null,
    brand: product.brand || null
  };

  try {
    // 티스토리용 (블로그와 유사하게 더 긴 글)
    const result = await generateContent(productInfo, {
      platform: 'blog',
      style: null,
      apiKey: GEMINI_API_KEY
    });

    let title = result.title || `${product.name} 추천합니다`;
    let content = result.body || '';

    // 제목 정리
    title = title.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣!?,.\[\]\(\)]/g, '').trim();

    // 본문 정리 - [QUOTE] 태그를 HTML blockquote로 변환
    content = content
      .replace(/\[QUOTE\]/gi, '<blockquote>')
      .replace(/\[\/QUOTE\]/gi, '</blockquote>')
      .replace(/(?<!\*)\*(?!\*)/g, '')
      .replace(/^#+\s*/gm, '')
      .trim();

    log(`  ✨ 스타일: ${result.styleName}`);
    log(`  생성 완료 (제목: ${title.substring(0, 30)}...)`);

    return { title, content, style: result.styleName };
  } catch (error) {
    log(`  Gemini API 오류: ${error.message}`);
    return {
      title: `${productInfo.name} 강력 추천`,
      content: `요즘 핫한 상품 발견했어요!\n\n${productInfo.name}\n\n가성비 좋고 품질도 좋다고 소문난 제품이에요.\n관심 있으신 분들은 확인해보세요!`,
      style: 'fallback'
    };
  }
}

/**
 * 해시태그 생성 (티스토리용)
 */
function generateHashtags(productName) {
  const keywords = productName
    .replace(/[\[\]\(\)\/\+\-\d]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 10)
    .filter(w => !['세트', '개입', '무료', '배송', '할인', '특가', '증정', '박스'].includes(w));

  return [...new Set(keywords)].slice(0, 10);
}

/**
 * 카카오 로그인 (모바일 인증 대기 포함)
 */
async function loginToKakao(page) {
  log('카카오 로그인 시작...');

  // 티스토리 로그인 페이지로 이동
  await page.goto('https://www.tistory.com/auth/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 이미 로그인 되어있는지 확인
  const currentUrl = page.url();
  if (currentUrl.includes('tistory.com') && !currentUrl.includes('login') && !currentUrl.includes('auth')) {
    log('✅ 이미 로그인 상태');
    return true;
  }

  // 카카오 로그인 버튼 클릭 (정확한 셀렉터)
  try {
    const kakaoLoginBtn = page.getByRole('link', { name: '카카오계정으로 로그인' });
    if (await kakaoLoginBtn.count() > 0) {
      log('  카카오 로그인 버튼 클릭...');
      await kakaoLoginBtn.click();
      await page.waitForTimeout(3000);
    } else {
      log('  카카오 로그인 버튼 없음 - 직접 이동');
      await page.goto('https://accounts.kakao.com/login', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    log(`  카카오 버튼 클릭 오류: ${e.message}`);
  }

  // 카카오 로그인 페이지 확인
  const loginUrl = page.url();
  if (!loginUrl.includes('kakao')) {
    log('❌ 카카오 로그인 페이지로 이동 실패');
    return false;
  }

  // 아이디/비밀번호 입력 (정확한 셀렉터)
  log('  카카오 계정 정보 입력...');

  try {
    // 이메일/아이디 입력
    const emailInput = page.getByRole('textbox', { name: '계정정보 입력' });
    if (await emailInput.count() > 0) {
      await emailInput.fill(KAKAO_ID);
      log('  이메일 입력 완료');
    }

    // 비밀번호 입력
    const pwInput = page.getByRole('textbox', { name: '비밀번호 입력' });
    if (await pwInput.count() > 0) {
      await pwInput.fill(KAKAO_PW);
      log('  비밀번호 입력 완료');
    }

    await page.waitForTimeout(500);

    // 로그인 버튼 클릭
    const loginBtn = page.getByRole('button', { name: '로그인', exact: true });
    if (await loginBtn.count() > 0) {
      await loginBtn.click();
      log('  로그인 버튼 클릭 완료');
    }

    await page.waitForTimeout(5000);

  } catch (e) {
    log(`  로그인 입력 오류: ${e.message}`);
  }

  // 모바일 인증 또는 계정 선택 화면 대기
  const afterLoginUrl = page.url();

  // 2단계 인증 필요한 경우 - 자동 감지
  if (afterLoginUrl.includes('kakao') && afterLoginUrl.includes('login')) {
    const authSuccess = await waitForAuthCompletion(page);
    if (!authSuccess) {
      log('❌ 모바일 인증 실패 또는 시간 초과');
      return false;
    }
    await page.waitForTimeout(3000);
  }

  // 계정 선택 화면 (계속하기 버튼)
  try {
    const continueBtn = page.getByRole('button', { name: '계속하기' });
    if (await continueBtn.count() > 0) {
      log('  계속하기 버튼 클릭...');
      await continueBtn.click();
      await page.waitForTimeout(3000);
    }
  } catch (e) {
    // 계속하기 버튼이 없으면 무시
  }

  // 로그인 성공 확인
  const finalUrl = page.url();
  if (finalUrl.includes('tistory.com') && !finalUrl.includes('login') && !finalUrl.includes('auth')) {
    log('✅ 카카오 로그인 성공!');
    return true;
  }

  // 티스토리로 리다이렉트가 안 됐으면 직접 이동
  log('  티스토리로 이동...');
  await page.goto('https://www.tistory.com/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const tistoryUrl = page.url();
  if (!tistoryUrl.includes('login') && !tistoryUrl.includes('auth')) {
    log('✅ 로그인 완료');
    return true;
  }

  log('❌ 로그인 실패');
  return false;
}

/**
 * 티스토리 글 작성
 */
async function writePost(page, product, images, geminiResult) {
  try {
    log(`글 작성 시작: ${product.name?.substring(0, 30) || product.product_name?.substring(0, 30)}...`);

    if (!TISTORY_BLOG_NAME) {
      throw new Error('TISTORY_BLOG_NAME이 설정되지 않았습니다.');
    }

    // 글쓰기 페이지로 이동
    const writeUrl = `https://${TISTORY_BLOG_NAME}.tistory.com/manage/newpost`;
    log(`  글쓰기 페이지: ${writeUrl}`);

    await page.goto(writeUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 로그인 필요 체크
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('auth')) {
      log('  세션 만료 - 재로그인 필요');
      const loginSuccess = await loginToKakao(page);
      if (!loginSuccess) {
        return false;
      }
      await page.goto(writeUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
    }

    // 제목 입력
    log('  제목 입력...');
    const titleInput = page.getByRole('textbox', { name: '제목을 입력하세요' });
    if (await titleInput.count() > 0) {
      await titleInput.fill(geminiResult.title);
      log(`  ✅ 제목: ${geminiResult.title.substring(0, 40)}...`);
    } else {
      log('  ⚠️ 제목 입력란을 찾을 수 없음');
    }

    await page.waitForTimeout(1000);

    // 본문 에디터 클릭하여 포커스
    const editorIframe = page.locator('iframe').first();
    await editorIframe.click();
    await page.waitForTimeout(500);

    const affiliateLink = product.affiliateLink || product.affiliate_link || '';

    // 1. 대가성 문구 입력
    log('  본문 입력...');
    await page.keyboard.type(DISCLOSURE, { delay: 10 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // 2. 이미지 업로드 (본문 중간에)
    if (images.length > 0) {
      log(`  이미지 ${images.length}장 업로드...`);

      for (let i = 0; i < images.length; i++) {
        try {
          // 첨부 버튼 클릭
          const attachBtn = page.getByRole('button', { name: '첨부' });
          if (await attachBtn.count() > 0) {
            await attachBtn.click();
            await page.waitForTimeout(500);

            // 사진 메뉴 클릭
            const photoMenu = page.getByRole('menuitem', { name: '사진' });
            if (await photoMenu.count() > 0) {
              const [fileChooser] = await Promise.all([
                page.waitForEvent('filechooser', { timeout: 15000 }),
                photoMenu.click()
              ]);
              await fileChooser.setFiles([images[i]]);
              await page.waitForTimeout(3000); // 업로드 대기
              log(`  ✅ 이미지 ${i + 1}/${images.length} 업로드 완료`);
            }
          }
        } catch (e) {
          log(`  이미지 ${i + 1} 업로드 실패: ${e.message}`);
          // 메뉴가 열린 상태면 ESC로 닫기
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
      }

      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
    }

    // 3. 본문 내용 입력
    const bodyContent = geminiResult.content
      .replace(/<blockquote>/gi, '\n「 ')
      .replace(/<\/blockquote>/gi, ' 」\n');

    await page.keyboard.type(bodyContent, { delay: 5 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // 4. 상품 링크 삽입 (클릭 가능한 링크로)
    if (affiliateLink) {
      log('  상품 링크 삽입...');

      // 링크 삽입 버튼 클릭
      const linkBtn = page.getByRole('button', { name: '링크 삽입/수정' });
      if (await linkBtn.count() > 0) {
        await linkBtn.click();
        await page.waitForTimeout(500);

        // URL 입력
        const urlInput = page.getByPlaceholder('URL');
        if (await urlInput.count() > 0) {
          await urlInput.fill(affiliateLink);
        }

        // 대체텍스트 입력 (링크 표시 텍스트는 아님)
        const altInput = page.getByPlaceholder('대체텍스트');
        if (await altInput.count() > 0) {
          await altInput.fill('상품 바로가기');
        }

        await page.waitForTimeout(300);

        // 확인 버튼 클릭
        const confirmBtn = page.locator('dialog button:has-text("확인")');
        if (await confirmBtn.count() > 0) {
          await confirmBtn.click();
          await page.waitForTimeout(500);
          log('  ✅ 상품 링크 삽입 완료');
        }
      }

      await page.keyboard.press('Enter');
    }

    // 태그 입력
    log('  태그 입력...');
    const tags = generateHashtags(product.name || product.product_name);
    const tagInput = page.getByPlaceholder('태그입력');

    if (await tagInput.count() > 0) {
      for (const tag of tags) {
        await tagInput.fill(tag);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
      }
      log(`  ✅ 태그 ${tags.length}개 입력`);
    }

    await page.waitForTimeout(1000);

    // 완료 버튼 클릭 → 발행 설정 팝업
    log('  완료 버튼 클릭...');
    const completeBtn = page.getByRole('button', { name: '완료' });

    if (await completeBtn.count() > 0) {
      await completeBtn.click();
      await page.waitForTimeout(2000);

      // 공개 설정
      const publicRadio = page.getByRole('radio', { name: '공개', exact: true });
      if (await publicRadio.count() > 0) {
        await publicRadio.click();
        await page.waitForTimeout(500);
      }

      // 공개 발행 버튼 클릭
      const publishBtn = page.getByRole('button', { name: '공개 발행' });
      if (await publishBtn.count() > 0) {
        await publishBtn.click();
        await page.waitForTimeout(5000);

        // 성공 확인 (글 관리 페이지로 이동)
        const afterUrl = page.url();
        if (afterUrl.includes('/manage/posts') || !afterUrl.includes('newpost')) {
          log('  ✅ 글 발행 완료!');
          return true;
        }
      }
    }

    log('  ⚠️ 발행 버튼 확인 필요 - 30초 대기 후 계속...');
    await page.waitForTimeout(30000);

    // 발행 성공 여부 재확인
    const retryUrl = page.url();
    if (retryUrl.includes('/manage/posts') || !retryUrl.includes('newpost')) {
      log('  ✅ 글 발행 완료! (지연 확인)');
      return true;
    }

    return false;

  } catch (e) {
    log(`❌ 글 작성 오류: ${e.message}`);
    return false;
  }
}

/**
 * 메인 실행
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   티스토리 자동 글쓰기                                     ║');
  console.log('║   카카오 로그인 → 모바일 인증 → 자동 포스팅                ║');
  console.log('║   Ctrl+C로 종료                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // 환경변수 체크
  if (!KAKAO_ID || !KAKAO_PW) {
    console.error('❌ .env 파일에 KAKAO_ID와 KAKAO_PW를 설정해주세요.');
    console.log('\n예시:');
    console.log('KAKAO_ID=your_kakao_email');
    console.log('KAKAO_PW=your_kakao_password');
    console.log('TISTORY_BLOG_NAME=your_blog_name');
    return;
  }

  if (!TISTORY_BLOG_NAME) {
    console.error('❌ .env 파일에 TISTORY_BLOG_NAME을 설정해주세요.');
    console.log('\n예시: TISTORY_BLOG_NAME=myblog');
    console.log('(https://myblog.tistory.com 에서 myblog 부분)');
    return;
  }

  if (!GEMINI_API_KEY) {
    console.error('❌ .env 파일에 GEMINI_API_KEY를 설정해주세요.');
    return;
  }

  ensureDir('output');

  log(`블로그: ${TISTORY_BLOG_NAME}.tistory.com`);
  log(`계정: ${KAKAO_ID}`);
  log('');

  // Playwright 시작 (persistent context로 로그인 유지)
  const browser = await chromium.launchPersistentContext(PLAYWRIGHT_DATA_DIR, {
    headless: false,
    slowMo: 30,
    viewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();

  try {
    // 로그인
    const loginSuccess = await loginToKakao(page);
    if (!loginSuccess) {
      log('로그인 실패 - 프로그램 종료');
      await browser.close();
      return;
    }

    // 메인 루프
    while (true) {
      log('\n────────────────────────────────────────');

      // 상품 선택
      const product = selectProduct();
      if (!product) {
        log('포스팅 가능한 상품이 없습니다.');
        log('10분 후 다시 확인...');
        await page.waitForTimeout(10 * 60 * 1000);
        continue;
      }

      const productName = product.name || product.product_name;
      const productId = product.productId || product.product_id || product.id;

      log(`상품 선택: ${productName?.substring(0, 40)}...`);
      log(`가격: ${product.price || 'N/A'}`);

      // 이미지 수집
      const images = await getProductImages(page, product);

      if (images.length === 0) {
        log('이미지를 찾을 수 없습니다. 다음 상품으로...');
        savePostedProduct(productId, productName, false);
        await page.waitForTimeout(3000);
        continue;
      }

      // 콘텐츠 생성
      const geminiResult = await generateContentWithGemini(product);

      // 글 작성
      const success = await writePost(page, product, images, geminiResult);

      // 기록 저장
      savePostedProduct(productId, productName, success);

      // 이미지 정리
      for (const img of images) {
        try { fs.unlinkSync(img); } catch (e) {}
      }

      if (success) {
        log('✅ 포스팅 완료!');
      } else {
        log('❌ 포스팅 실패');
      }

      // 다음 글까지 대기 (3~5분)
      const waitTime = 3 * 60 * 1000 + Math.random() * 2 * 60 * 1000;
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
