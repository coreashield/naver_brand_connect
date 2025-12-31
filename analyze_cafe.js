import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const CAFE_WRITE_URL = 'https://cafe.naver.com/ca-fe/cafes/31634939/articles/write?boardType=L';

async function analyzeCafe() {
  console.log('카페 에디터 구조 분석 시작...\n');

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
    console.log('[1/2] 네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(5000);
    console.log('  ✅ 로그인 완료\n');

    // 글쓰기 페이지 직접 이동
    console.log('[2/2] 글쓰기 페이지 이동...');
    await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log('  현재 URL:', page.url());
    console.log('');

    // 에디터 분석
    console.log('=== 제목 입력 필드 ===');
    const titleSelectors = [
      'input[placeholder*="제목"]',
      'textarea[placeholder*="제목"]',
      '.ArticleWriteTitle input',
      '.article_write_title input',
      '[class*="Subject"] input',
      '[class*="subject"] input',
      'input[name*="subject"]',
      '.BaseTextfieldInput',
      '[class*="title"] input',
      'input'
    ];

    for (const sel of titleSelectors) {
      try {
        const els = await page.locator(sel).all();
        if (els.length > 0) {
          for (const el of els.slice(0, 2)) {
            const ph = await el.getAttribute('placeholder') || '';
            const cls = await el.getAttribute('class') || '';
            if (ph.includes('제목') || cls.includes('title') || cls.includes('subject') || cls.includes('Title') || cls.includes('Subject')) {
              console.log(`  ✅ ${sel}`);
              console.log(`     placeholder="${ph}", class="${cls.substring(0, 50)}"`);
            }
          }
        }
      } catch (e) {}
    }

    // 에디터 본문
    console.log('\n=== 에디터 본문 영역 ===');
    const editorSelectors = [
      '.se-content',
      '.se-component-content',
      '[contenteditable="true"]',
      '.ProseMirror',
      '.se-module-text',
      '[class*="editor"]',
      '[class*="Editor"]'
    ];

    for (const sel of editorSelectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          console.log(`  ✅ ${sel}: ${count}개`);
        }
      } catch (e) {}
    }

    // 툴바 버튼 (data-name)
    console.log('\n=== 툴바 버튼 [data-name] ===');
    try {
      const dataNameBtns = await page.locator('button[data-name]').all();
      console.log(`  총 ${dataNameBtns.length}개`);
      for (const btn of dataNameBtns) {
        const name = await btn.getAttribute('data-name');
        console.log(`    - "${name}"`);
      }
    } catch (e) {}

    // 이미지/링크/동영상 버튼
    console.log('\n=== 기능 버튼 ===');
    const funcBtnSelectors = [
      'button:has-text("사진")',
      'button:has-text("이미지")',
      'button:has-text("링크")',
      'button:has-text("동영상")',
      'button:has-text("파일")',
      'button:has-text("지도")',
      'button:has-text("일정")'
    ];

    for (const sel of funcBtnSelectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          console.log(`  ✅ ${sel}: ${count}개`);
        }
      } catch (e) {}
    }

    // 등록 버튼
    console.log('\n=== 등록/저장 버튼 ===');
    const submitSelectors = [
      'button:has-text("등록")',
      'button:has-text("저장")',
      'button:has-text("완료")',
      'button:has-text("발행")',
      '[class*="submit"]',
      '[class*="register"]',
      '[class*="publish"]'
    ];

    for (const sel of submitSelectors) {
      try {
        const els = await page.locator(sel).all();
        if (els.length > 0) {
          for (const el of els.slice(0, 3)) {
            const cls = await el.getAttribute('class') || '';
            const text = await el.innerText().catch(() => '');
            console.log(`  ✅ ${sel}: "${text.trim().substring(0, 15)}" (class="${cls.substring(0, 40)}")`);
          }
        }
      } catch (e) {}
    }

    // 스크린샷 저장
    await page.screenshot({ path: 'output/cafe_editor.png', fullPage: true });
    console.log('\n스크린샷 저장: output/cafe_editor.png');

    console.log('\n분석 완료! 1분 후 종료...');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await browser.close();
  }
}

analyzeCafe();
