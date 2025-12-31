import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const CAFE_WRITE_URL = 'https://cafe.naver.com/ca-fe/cafes/31634939/articles/write?boardType=L';

function log(message) {
  const timestamp = new Date().toLocaleString('ko-KR');
  console.log(`[${timestamp}] ${message}`);
}

async function testHashtagInput() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   해시태그 입력 테스트                 ║');
  console.log('║   등록 전 확인 모드                    ║');
  console.log('╚════════════════════════════════════════╝\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 50
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    // 로그인
    log('네이버 로그인 중...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(5000);
    log('✅ 로그인 완료\n');

    // 글쓰기 페이지 이동
    log('글쓰기 페이지 이동...');
    await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 게시판 선택
    log('게시판 선택...');
    const boardDropdown = page.locator('text=게시판을 선택해 주세요.').first();
    if (await boardDropdown.count() > 0) {
      await boardDropdown.click();
      await page.waitForTimeout(1500);
      const boardOption = page.locator('text=나만의 상품').first();
      if (await boardOption.count() > 0) {
        await boardOption.click();
        await page.waitForTimeout(500);
        log('✅ 게시판 선택 완료 (나만의 상품)');
      }
    }

    // 제목 입력
    log('제목 입력...');
    const titleInput = page.locator('textarea.textarea_input, textarea[placeholder*="제목"]');
    await titleInput.fill('해시태그 테스트 - 등록하지 않음');
    log('✅ 제목 입력 완료');

    // 에디터 본문 클릭
    const editorBody = page.locator('.se-component-content, [contenteditable="true"]').first();
    await editorBody.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('해시태그 테스트입니다. 이 글은 등록되지 않습니다.');
    await page.waitForTimeout(500);

    // 태그 입력 영역 분석
    log('\n=== 태그 입력 영역 분석 ===');

    // 다양한 태그 관련 셀렉터 탐색
    const tagSelectors = [
      'text=/태그.*입력/',
      'input[placeholder*="태그"]',
      '[class*="tag"] input',
      '[class*="Tag"] input',
      '[class*="hashtag"]',
      'text=태그를 입력',
      'text=#태그를',
      '.tag_area',
      '.tag_input',
      '[data-name="tag"]'
    ];

    for (const sel of tagSelectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          const el = page.locator(sel).first();
          const visible = await el.isVisible();
          const text = await el.innerText().catch(() => '');
          const cls = await el.getAttribute('class') || '';
          log(`  ✅ ${sel}: ${count}개, visible=${visible}, text="${text.substring(0, 30)}", class="${cls.substring(0, 30)}"`);
        }
      } catch (e) {}
    }

    // 스크롤 내려서 태그 영역 보이게
    log('\n스크롤 내리기...');
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);

    // 페이지 하단의 input들 확인
    log('\n=== 페이지 하단 input 요소들 ===');
    const allInputs = await page.locator('input').all();
    for (let i = 0; i < allInputs.length; i++) {
      try {
        const inp = allInputs[i];
        const ph = await inp.getAttribute('placeholder') || '';
        const cls = await inp.getAttribute('class') || '';
        const visible = await inp.isVisible();
        if (ph.includes('태그') || cls.includes('tag') || cls.includes('Tag')) {
          log(`  input[${i}]: placeholder="${ph}", class="${cls.substring(0, 40)}", visible=${visible}`);
        }
      } catch (e) {}
    }

    // 실제 태그 입력 시도
    log('\n=== 태그 입력 시도 ===');
    const testTags = ['테스트', '리뷰', '추천'];
    let tagInputSuccess = false;

    // 핵심: .tag_input 클래스를 가진 input에 직접 포커스하고 입력
    try {
      log('  방법 1: .tag_input 클래스에 force click...');
      const tagInput = page.locator('input.tag_input').first();
      if (await tagInput.count() > 0) {
        // force: true로 덮여있는 요소 무시하고 클릭
        await tagInput.click({ force: true });
        await page.waitForTimeout(500);

        // 태그 입력 (# 없이 입력)
        for (const tag of testTags) {
          await page.keyboard.type(tag, { delay: 30 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
          log(`    태그 "${tag}" 입력 후 Enter`);
        }
        log(`  ✅ 태그 입력 시도 완료: ${testTags.join(', ')}`);
        tagInputSuccess = true;
      }
    } catch (e) {
      log(`  방법 1 오류: ${e.message}`);
    }

    // 시도 2: JavaScript로 직접 포커스
    if (!tagInputSuccess) {
      try {
        log('  방법 2: JavaScript로 직접 포커스...');
        await page.evaluate(() => {
          const input = document.querySelector('input.tag_input');
          if (input) {
            input.focus();
            input.click();
          }
        });
        await page.waitForTimeout(500);

        for (const tag of testTags) {
          await page.keyboard.type(tag, { delay: 30 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(500);
          log(`    태그 "${tag}" 입력 후 Enter`);
        }
        log(`  ✅ 태그 입력 시도 완료 (JS 방식)`);
        tagInputSuccess = true;
      } catch (e) {
        log(`  방법 2 오류: ${e.message}`);
      }
    }

    // 시도 3: tag_input_box 클릭 후 input 포커스
    if (!tagInputSuccess) {
      try {
        log('  방법 3: tag_input_box 클릭...');
        const tagBox = page.locator('.tag_input_box').first();
        if (await tagBox.count() > 0) {
          await tagBox.click({ force: true });
          await page.waitForTimeout(500);

          for (const tag of testTags) {
            await page.keyboard.type(tag, { delay: 30 });
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
          }
          log(`  ✅ 태그 입력 시도 완료 (box 클릭 방식)`);
          tagInputSuccess = true;
        }
      } catch (e) {
        log(`  방법 3 오류: ${e.message}`);
      }
    }

    // 스크린샷 저장
    if (!fs.existsSync('output')) {
      fs.mkdirSync('output', { recursive: true });
    }
    await page.screenshot({ path: 'output/hashtag_test.png', fullPage: true });
    log('\n📸 스크린샷 저장: output/hashtag_test.png');

    // HTML도 저장
    const html = await page.content();
    fs.writeFileSync('output/hashtag_test.html', html, 'utf-8');
    log('📄 HTML 저장: output/hashtag_test.html');

    // 결과 출력
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   테스트 결과                          ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`태그 입력 성공: ${tagInputSuccess ? '✅ 예' : '❌ 아니오'}`);
    console.log('\n⚠️  등록 버튼은 클릭하지 않았습니다.');
    console.log('    브라우저에서 직접 확인해주세요.');
    console.log('\n브라우저가 60초 후 종료됩니다...');
    console.log('직접 확인 후 Ctrl+C로 종료해도 됩니다.\n');

    await page.waitForTimeout(60000);

  } catch (error) {
    log(`오류: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

testHashtagInput();
