import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { getUniqueSuffix } from './title_suffixes.js';
import { getRandomContent } from './content_templates.js';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const CAFE_WRITE_URL = process.env.CAFE_ADR?.trim() || 'https://cafe.naver.com/ca-fe/cafes/31634939/articles/write?boardType=L';

const PRODUCT_FILE = 'output/product_links.json';
const POSTED_FILE = 'output/posted_products.json';
const LOG_FILE = 'output/cafe_writer.log';
const IMAGE_DIR = 'output/images';
const TEMP_HTML = 'output/temp_content.html';

// 대가성 문구
const DISCLOSURE = '본 포스팅은 네이버 브랜드커넥트를 통해 소정의 수수료를 제공받습니다.';

const usedSuffixes = new Set();

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

// 게시 카운트 로드 (productId -> count)
function loadPostedProducts() {
  try {
    if (fs.existsSync(POSTED_FILE)) {
      const data = JSON.parse(fs.readFileSync(POSTED_FILE, 'utf-8'));
      // 기존 Set 형식이면 Map으로 변환
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
  ensureDir('output');
  const obj = Object.fromEntries(posted);
  fs.writeFileSync(POSTED_FILE, JSON.stringify(obj, null, 2), 'utf-8');
}

// 상품 정렬 (카운트 낮은 것 우선, 같으면 랜덤)
function sortProductsByCount(products, postedCounts) {
  return [...products].sort((a, b) => {
    const countA = postedCounts.get(a.productId) || 0;
    const countB = postedCounts.get(b.productId) || 0;
    if (countA !== countB) return countA - countB; // 카운트 낮은 것 우선
    return Math.random() - 0.5; // 같으면 랜덤
  });
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
        downloadImage(response.headers.location, filename)
          .then(resolve)
          .catch(reject);
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

// Brand Connect에서 상품 이미지 가져오기
async function getProductImages(page, productUrl) {
  const images = [];

  try {
    const productPage = await page.context().newPage();
    await productPage.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await productPage.waitForTimeout(3000);

    // 스크롤해서 이미지 로드 유도
    await productPage.evaluate(() => window.scrollBy(0, 500));
    await productPage.waitForTimeout(2000);

    // Brand Connect 페이지에서 이미지 수집 (여러 방법 시도)
    const imageUrls = await productPage.$$eval('img', imgs => {
      return imgs
        .map(img => img.src || img.getAttribute('data-src') || '')
        .filter(src => src && src.includes('http'))
        .filter(src => src.includes('phinf') || src.includes('shop') || src.includes('product') || src.includes('goods'))
        .filter(src => !src.includes('logo') && !src.includes('icon') && !src.includes('sprite') && !src.includes('blank') && !src.includes('avatar'))
        .filter((src, idx, arr) => arr.indexOf(src) === idx)
        .slice(0, 5);
    });

    log(`  상품 페이지 이미지 발견: ${imageUrls.length}개`);

    // 이미지 못 찾으면 다른 방법 시도
    if (imageUrls.length === 0) {
      log(`  대체 방법으로 이미지 검색...`);
      const altImageUrls = await productPage.$$eval('img', imgs => {
        return imgs
          .map(img => img.src || '')
          .filter(src => src && src.startsWith('http'))
          .filter(src => !src.includes('logo') && !src.includes('icon') && !src.includes('svg') && !src.includes('blank'))
          .filter((src, idx, arr) => arr.indexOf(src) === idx)
          .slice(0, 5);
      });
      log(`  대체 검색 이미지: ${altImageUrls.length}개`);
      imageUrls.push(...altImageUrls);
    }

    await productPage.close();

    for (let i = 0; i < Math.min(imageUrls.length, 3); i++) {
      try {
        const filename = `product_${Date.now()}_${i}.jpg`;
        const filepath = await downloadImage(imageUrls[i], filename);
        images.push(path.resolve(filepath));
        log(`  이미지 다운로드: ${filename}`);
      } catch (e) {
        log(`  이미지 다운로드 실패: ${e.message}`);
      }
    }
  } catch (e) {
    log(`이미지 수집 오류: ${e.message}`);
  }

  return images;
}

// 해시태그 생성 (상품명에서 키워드 추출)
function generateHashtags(productName) {
  // 상품명에서 키워드 추출
  const keywords = productName
    .replace(/[\[\]\(\)\/\+\-\d]+/g, ' ') // 특수문자, 숫자 제거
    .split(/\s+/)
    .filter(w => w.length >= 2 && w.length <= 10) // 2-10자 키워드만
    .filter(w => !['세트', '개입', '무료', '배송', '할인', '특가', '증정', '박스'].includes(w))
    .slice(0, 5); // 최대 5개

  // 일반적인 쇼핑 관련 태그 추가
  const commonTags = ['추천', '리뷰', '득템', '쇼핑', '구매'];
  const randomCommon = commonTags.sort(() => Math.random() - 0.5).slice(0, 2);

  const allTags = [...new Set([...keywords, ...randomCommon])].slice(0, 7);
  return allTags.map(tag => `#${tag}`).join(' ');
}

// 제목 생성
function generateTitle(productName) {
  const suffix = getUniqueSuffix(usedSuffixes);
  let name = productName;
  if (name.length > 30) {
    const keywords = name.split(/[\s\[\]\/]+/).filter(w => w.length > 1).slice(0, 3);
    name = keywords.join(' ');
  }
  const title = `${name} ${suffix}`;
  return title.length > 100 ? title.substring(0, 97) + '...' : title;
}

// HTML 콘텐츠 생성 (텍스트 + 링크만, 이미지 제외)
function generateHtmlContent(product) {
  const content = getRandomContent(product.name, product.price);
  const contentLines = content.split('\n').map(line =>
    line.trim() ? `<p style="margin:12px 0; line-height:2; font-size:16px; color:#333;">${line}</p>` : '<p><br></p>'
  ).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: '맑은 고딕', sans-serif; font-size: 16px; line-height: 1.8;">
  <p style="color:#e74c3c; font-size:14px; font-weight:bold; margin-bottom:20px; padding:10px; background:#fff5f5; border-left:3px solid #e74c3c;">${DISCLOSURE}</p>

  <div style="margin: 25px 0;">
    ${contentLines}
  </div>

  <div style="margin-top:30px; padding:20px; background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius:12px; text-align:center;">
    <p style="margin:0 0 10px 0; color:#fff; font-size:18px; font-weight:bold;">🛒 지금 바로 확인해보세요!</p>
    <a href="${product.affiliateLink}" style="display:inline-block; padding:15px 40px; background:#fff; color:#667eea; font-size:20px; font-weight:bold; text-decoration:none; border-radius:30px; box-shadow:0 4px 15px rgba(0,0,0,0.2);">👉 상품 보러가기</a>
  </div>

  <p style="margin-top:20px; color:#888; font-size:13px; text-align:center;">좋은 정보가 되셨다면 좋아요와 댓글 부탁드려요 💕</p>
</body>
</html>`;

  return html;
}

// 카페 글 작성
async function writePost(page, product, images, doLoginFn) {
  try {
    log(`글 작성 시작: ${product.name.substring(0, 30)}...`);

    // 카페 글쓰기 페이지로 이동
    await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 로그인 상태 체크 (세션 만료 대응)
    const currentUrl = page.url();
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      log('  세션 만료 - 재로그인...');
      await doLoginFn();
      await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
    }

    await page.waitForTimeout(1000);

    // 게시판 선택 (드롭다운 클릭 후 첫 번째 게시판 선택)
    try {
      // "게시판을 선택해 주세요." 정확한 텍스트로 찾기
      const boardDropdown = page.locator('text=게시판을 선택해 주세요.').first();
      if (await boardDropdown.count() > 0) {
        log(`  게시판 드롭다운 클릭...`);
        await boardDropdown.click();
        await page.waitForTimeout(1500);

        // "자유게시판" 텍스트 클릭
        const boardOption = page.locator('text=자유게시판').first();
        if (await boardOption.count() > 0) {
          await boardOption.click();
          await page.waitForTimeout(500);
          log(`  ✅ 게시판 선택 완료 (자유게시판)`);
        } else {
          log(`  ⚠️ 자유게시판 옵션 못찾음`);
        }
      } else {
        log(`  ⚠️ 게시판 드롭다운 못찾음`);
      }
    } catch (e) {
      log(`  게시판 선택 오류: ${e.message}`);
    }

    // 제목 입력
    const title = generateTitle(product.name);
    const titleInput = page.locator('textarea.textarea_input, textarea[placeholder*="제목"]');
    await titleInput.fill(title);
    log(`  제목: ${title}`);
    await page.waitForTimeout(500);

    // 에디터 본문 클릭
    const editorBody = page.locator('.se-component-content, [contenteditable="true"]').first();
    await editorBody.click();
    await page.waitForTimeout(500);

    // 1. 이미지 먼저 업로드 (filechooser 이벤트 사용)
    if (images.length > 0) {
      log(`  이미지 업로드 중...`);
      try {
        // filechooser 이벤트 대기 + 사진 버튼 클릭
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          page.locator('button[data-name="image"]').click()
        ]);

        // 파일 선택
        await fileChooser.setFiles(images);
        log(`  파일 선택 완료: ${images.length}개`);

        // 이미지 2장 이상이면 "개별사진/콜라주" 선택 창 나옴
        if (images.length >= 2) {
          await page.waitForTimeout(2000);

          // "개별사진" 버튼 클릭
          const individualBtn = page.locator('text=개별사진').first();
          if (await individualBtn.count() > 0) {
            await individualBtn.click();
            log(`  개별사진 선택`);
            await page.waitForTimeout(1000);
          }
        }

        // 이미지가 에디터에 삽입될 때까지 대기
        await page.waitForTimeout(3000);

        // ESC 여러 번 눌러서 팝업 확실히 닫기
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        // 에디터 본문 클릭해서 포커스 이동
        await editorBody.click();
        await page.waitForTimeout(500);

        log(`  ✅ 이미지 업로드 완료`);
      } catch (e) {
        log(`  이미지 업로드 실패: ${e.message}`);
      }
    }

    // 2. 에디터 클릭하고 엔터
    await editorBody.click();
    await page.waitForTimeout(300);
    await page.keyboard.press('End'); // 끝으로 이동
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // 3. HTML 콘텐츠 복사-붙여넣기
    const htmlContent = generateHtmlContent(product);
    ensureDir('output');
    fs.writeFileSync(TEMP_HTML, htmlContent, 'utf-8');

    const tempPage = await page.context().newPage();
    await tempPage.goto(`file:///${path.resolve(TEMP_HTML).replace(/\\/g, '/')}`);
    await tempPage.waitForTimeout(1000);

    await tempPage.keyboard.press('Control+a');
    await tempPage.waitForTimeout(200);
    await tempPage.keyboard.press('Control+c');
    await tempPage.waitForTimeout(300);
    await tempPage.close();
    log(`  ✅ 텍스트 복사 완료`);

    // 에디터에 붙여넣기
    await editorBody.click();
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(2000);
    log(`  ✅ 콘텐츠 붙여넣기 완료`);

    // 임시 파일 삭제
    try { fs.unlinkSync(TEMP_HTML); } catch (e) {}

    // 4. 해시태그 입력 (force: true로 덮여있는 요소 무시)
    try {
      const hashtags = generateHashtags(product.name);
      // # 제거하고 태그만 추출
      const tagList = hashtags.split(' ').map(tag => tag.replace('#', ''));

      // .tag_input 클래스에 직접 포커스 (force: true 필수)
      const tagInput = page.locator('input.tag_input').first();
      if (await tagInput.count() > 0) {
        await tagInput.click({ force: true });
        await page.waitForTimeout(500);

        // 태그 하나씩 입력하고 엔터
        for (const tag of tagList) {
          await page.keyboard.type(tag, { delay: 30 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(400);
        }
        log(`  ✅ 해시태그 입력: ${hashtags}`);
      } else {
        log(`  ⚠️ 태그 입력 영역 못찾음`);
      }
    } catch (e) {
      log(`  해시태그 입력 실패: ${e.message}`);
    }

    // 5. 등록 버튼 클릭
    await page.waitForTimeout(1000);

    // 혹시 남아있는 팝업 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 제목 영역 클릭해서 포커스 확실히 이동
    await titleInput.click();
    await page.waitForTimeout(500);

    let registered = false;

    // 방법 1: skinGreen 등록 버튼 (정확한 셀렉터)
    const skinGreenBtn = page.locator('button.BaseButton--skinGreen');
    if (await skinGreenBtn.count() > 0) {
      log(`  등록 버튼 발견 (skinGreen), 클릭 시도...`);
      await skinGreenBtn.first().click();
      await page.waitForTimeout(5000);

      // 등록 후 URL 변화 확인
      const currentUrl = page.url();
      if (!currentUrl.includes('/write')) {
        log(`  ✅ 글 등록 완료! URL: ${currentUrl}`);
        registered = true;
      } else {
        log(`  ⚠️ 등록 버튼 클릭했으나 페이지 이동 없음`);
      }
    }

    // 방법 2: 모든 BaseButton에서 "등록" 텍스트 찾기
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

            const currentUrl = page.url();
            if (!currentUrl.includes('/write')) {
              log(`  ✅ 글 등록 완료! URL: ${currentUrl}`);
              registered = true;
            }
            break;
          }
        } catch (e) {}
      }
    }

    if (!registered) {
      log(`  ⚠️ 등록 버튼 못찾음 - 수동 등록 필요`);
    }

    return registered;

  } catch (e) {
    log(`  ❌ 글 작성 오류: ${e.message}`);
    return false;
  }
}

// 메인 실행
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   오늘의 득템 카페 자동 글쓰기         ║');
  console.log('║   24시간 자동 실행                     ║');
  console.log('║   Ctrl+C로 종료                        ║');
  console.log('╚════════════════════════════════════════╝\n');

  ensureDir('output');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 30
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  // 로그인 함수 (필요할 때만 호출)
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

  // 로그인 상태 체크 함수
  async function checkAndLogin() {
    log('로그인 상태 확인 중...');
    await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();

    // 로그인 페이지로 리다이렉트되었는지 확인
    if (currentUrl.includes('nidlogin') || currentUrl.includes('login')) {
      log('로그인 필요 - 로그인 진행...');
      await doLogin();
      return false; // 로그인 후 글쓰기 페이지 재이동 필요
    }

    // 글쓰기 페이지가 아닌 다른 곳으로 갔는지 확인
    if (!currentUrl.includes('/write') && !currentUrl.includes('articles/write')) {
      log('글쓰기 페이지 접근 불가 - 로그인 시도...');
      await doLogin();
      return false;
    }

    log('✅ 이미 로그인 상태 - 바로 글쓰기 가능\n');
    return true; // 이미 글쓰기 페이지에 있음
  }

  try {
    // 첫 로그인 상태 체크
    await checkAndLogin();

    // 24시간 루프
    while (true) {
      const products = loadProducts();
      const posted = loadPostedProducts();

      log(`\n총 상품: ${products.length}개, 게시됨: ${posted.size}개`);

      // affiliateLink가 있는 상품만 필터링
      const available = products.filter(p => p.affiliateLink);

      if (available.length === 0) {
        log('게시 가능한 상품이 없습니다. 10분 후 다시 확인...');
        await page.waitForTimeout(10 * 60 * 1000);
        continue;
      }

      // 카운트 낮은 것 우선 정렬 (안 쓴 것 우선)
      const sorted = sortProductsByCount(available, posted);
      const minCount = posted.get(sorted[0].productId) || 0;
      log(`상품 정렬 완료 (최소 게시횟수: ${minCount})`);

      for (const product of sorted) {
        const currentCount = posted.get(product.productId) || 0;
        log(`\n[게시횟수: ${currentCount}] ${product.name.substring(0, 20)}... 처리 중...`);

        const images = await getProductImages(page, product.productUrl);
        const success = await writePost(page, product, images, doLogin);

        if (success) {
          // 카운트 증가
          posted.set(product.productId, currentCount + 1);
          savePostedProducts(posted);
          log(`  게시 카운트 업데이트: ${currentCount} -> ${currentCount + 1}`);
        }

        // 이미지 파일 삭제
        for (const img of images) {
          try { fs.unlinkSync(img); } catch (e) {}
        }

        // 글 작성 간격 (5~10분 랜덤)
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
