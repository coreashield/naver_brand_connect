import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const CAFE_WRITE_URL = 'https://cafe.naver.com/ca-fe/cafes/31634939/articles/write?boardType=L';

async function analyzeEditor() {
  console.log('카페 에디터 상세 분석 시작...\n');

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
    console.log('[1/4] 네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(5000);
    console.log('  ✅ 로그인 완료\n');

    // 글쓰기 페이지 이동
    console.log('[2/4] 글쓰기 페이지 이동...');
    await page.goto(CAFE_WRITE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log('  현재 URL:', page.url());

    // 게시판 선택 드롭다운 찾기
    console.log('\n=== 게시판 선택 드롭다운 ===');
    const boardSelectors = [
      '[class*="select"]',
      '[class*="board"]',
      '[class*="Board"]',
      '[class*="category"]',
      '[class*="Category"]',
      'select',
      '[role="listbox"]',
      '[role="combobox"]'
    ];

    for (const sel of boardSelectors) {
      try {
        const els = await page.locator(sel).all();
        if (els.length > 0 && els.length < 10) {
          console.log(`  ${sel}: ${els.length}개`);
          for (const el of els.slice(0, 3)) {
            const cls = await el.getAttribute('class') || '';
            const text = await el.innerText().catch(() => '');
            const tag = await el.evaluate(e => e.tagName);
            if (text.trim().length < 50) {
              console.log(`    [${tag}] "${text.trim().substring(0, 30)}" class="${cls.substring(0, 50)}"`);
            }
          }
        }
      } catch (e) {}
    }

    // 모든 file input 찾기
    console.log('\n=== 모든 file input ===');
    const fileInputs = await page.locator('input[type="file"]').all();
    console.log(`  총 ${fileInputs.length}개`);
    for (let i = 0; i < fileInputs.length; i++) {
      const inp = fileInputs[i];
      const accept = await inp.getAttribute('accept') || '';
      const cls = await inp.getAttribute('class') || '';
      const id = await inp.getAttribute('id') || '';
      const name = await inp.getAttribute('name') || '';
      const visible = await inp.isVisible();
      console.log(`  [${i}] accept="${accept}" class="${cls}" id="${id}" name="${name}" visible=${visible}`);
    }

    // 사진 버튼 클릭해서 file input 나타나는지 확인
    console.log('\n[3/4] 사진 버튼 클릭 테스트...');
    const imageBtn = page.locator('button[data-name="image"]');
    if (await imageBtn.count() > 0) {
      console.log('  사진 버튼 발견, 클릭...');
      await imageBtn.click();
      await page.waitForTimeout(2000);

      // 클릭 후 file input 다시 확인
      const fileInputsAfter = await page.locator('input[type="file"]').all();
      console.log(`  클릭 후 file input: ${fileInputsAfter.length}개`);
      for (let i = 0; i < fileInputsAfter.length; i++) {
        const inp = fileInputsAfter[i];
        const accept = await inp.getAttribute('accept') || '';
        const visible = await inp.isVisible();
        console.log(`    [${i}] accept="${accept}" visible=${visible}`);
      }

      // 팝업이나 모달 확인
      const modals = await page.locator('[class*="modal"], [class*="popup"], [class*="layer"], [class*="dialog"]').all();
      console.log(`  모달/팝업: ${modals.length}개`);
      for (const modal of modals.slice(0, 5)) {
        const cls = await modal.getAttribute('class') || '';
        const visible = await modal.isVisible();
        if (visible) {
          console.log(`    visible modal: ${cls.substring(0, 60)}`);
        }
      }

      // ESC로 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // 모든 버튼 상세 분석 (특히 등록 관련)
    console.log('\n[4/4] 등록 버튼 상세 분석...');
    const allButtons = await page.locator('button').all();
    console.log(`  총 버튼: ${allButtons.length}개`);

    const registerCandidates = [];
    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      try {
        const text = await btn.innerText().catch(() => '');
        const cls = await btn.getAttribute('class') || '';
        const type = await btn.getAttribute('type') || '';
        const dataName = await btn.getAttribute('data-name') || '';
        const visible = await btn.isVisible();

        // 등록 관련 버튼 필터링
        if (text.includes('등록') || text.includes('발행') || text.includes('저장') ||
            cls.includes('submit') || cls.includes('register') || cls.includes('publish') ||
            cls.includes('green') || cls.includes('primary')) {
          registerCandidates.push({
            index: i,
            text: text.trim().substring(0, 20),
            class: cls.substring(0, 80),
            type,
            dataName,
            visible
          });
        }
      } catch (e) {}
    }

    console.log(`\n  등록 관련 버튼 후보: ${registerCandidates.length}개`);
    for (const btn of registerCandidates) {
      console.log(`    [${btn.index}] "${btn.text}" class="${btn.class}" visible=${btn.visible}`);
    }

    // 상단 버튼 영역 분석
    console.log('\n=== 상단 헤더 영역 버튼 ===');
    const headerBtns = await page.locator('header button, .header button, [class*="Header"] button, [class*="header"] button').all();
    console.log(`  헤더 버튼: ${headerBtns.length}개`);
    for (const btn of headerBtns) {
      const text = await btn.innerText().catch(() => '');
      const cls = await btn.getAttribute('class') || '';
      if (text.trim()) {
        console.log(`    "${text.trim().substring(0, 15)}" class="${cls.substring(0, 50)}"`);
      }
    }

    // 글쓰기 폼 영역 버튼 분석
    console.log('\n=== 폼 영역 버튼 ===');
    const formBtns = await page.locator('form button, [class*="write"] button, [class*="Write"] button').all();
    console.log(`  폼 버튼: ${formBtns.length}개`);
    for (const btn of formBtns.slice(0, 10)) {
      const text = await btn.innerText().catch(() => '');
      const cls = await btn.getAttribute('class') || '';
      if (text.trim()) {
        console.log(`    "${text.trim().substring(0, 15)}" class="${cls.substring(0, 50)}"`);
      }
    }

    // BaseButton 클래스 분석
    console.log('\n=== BaseButton 클래스 버튼 ===');
    const baseBtns = await page.locator('[class*="BaseButton"]').all();
    console.log(`  BaseButton 버튼: ${baseBtns.length}개`);
    for (const btn of baseBtns) {
      const text = await btn.innerText().catch(() => '');
      const cls = await btn.getAttribute('class') || '';
      console.log(`    "${text.trim().substring(0, 15)}" class="${cls}"`);
    }

    // 스크린샷
    await page.screenshot({ path: 'output/editor_analysis.png', fullPage: true });
    console.log('\n스크린샷 저장: output/editor_analysis.png');

    // HTML 저장
    const html = await page.content();
    fs.writeFileSync('output/editor_page.html', html, 'utf-8');
    console.log('HTML 저장: output/editor_page.html');

    console.log('\n분석 완료! 30초 후 종료...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('오류:', error.message);
  } finally {
    await browser.close();
  }
}

analyzeEditor();
