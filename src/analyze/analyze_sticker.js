import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const BLOG_WRITE_URL = 'https://blog.naver.com/ingredient7303126?Redirect=Write&categoryNo=6';

async function analyzeSticker() {
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
    console.log('로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(3000);

    // 에디터 이동
    await page.goto(BLOG_WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const mainFrame = page.frame('mainFrame');
    if (!mainFrame) return;

    // 팝업 닫기
    await page.waitForTimeout(2000);
    try {
      const confirmPopup = await mainFrame.$('.se-popup-alert-confirm .se-popup-button-confirm');
      if (confirmPopup) await confirmPopup.click();
      await page.waitForTimeout(500);
      const helpCloseBtn = await mainFrame.$('button.se-help-panel-close-button');
      if (helpCloseBtn) await helpCloseBtn.click();
      await page.keyboard.press('Escape');
    } catch (e) {}

    await page.waitForTimeout(1000);

    // 스티커 버튼 클릭
    console.log('\n=== 스티커 버튼 클릭 ===');
    const stickerBtn = await mainFrame.$('button[data-name="sticker"]');
    if (stickerBtn) {
      await stickerBtn.click();
      console.log('스티커 버튼 클릭됨');
      await page.waitForTimeout(2000);

      // 스티커 패널 구조 분석
      console.log('\n=== 스티커 패널 분석 ===');

      // 패널 찾기
      const panels = await mainFrame.$$('.se-panel, .se-popup, .se-layer, [class*="sticker-panel"], [class*="sticker-layer"]');
      console.log(`패널 수: ${panels.length}`);

      // 모든 클래스 확인
      const allElements = await mainFrame.$$('[class*="sticker"]');
      console.log(`\nsticker 클래스 포함 요소: ${allElements.length}`);
      for (let i = 0; i < Math.min(20, allElements.length); i++) {
        const el = allElements[i];
        const className = await el.getAttribute('class');
        const tagName = await el.evaluate(e => e.tagName);
        console.log(`  ${i}: <${tagName}> class="${className?.substring(0, 80)}"`);
      }

      // 이미지 요소 찾기
      console.log('\n=== 이미지 요소 ===');
      const images = await mainFrame.$$('img[class*="sticker"], .se-sticker img, [class*="sticker"] img');
      console.log(`이미지 수: ${images.length}`);
      for (let i = 0; i < Math.min(10, images.length); i++) {
        const img = images[i];
        const src = await img.getAttribute('src');
        const className = await img.getAttribute('class');
        console.log(`  ${i}: class="${className}", src="${src?.substring(0, 50)}..."`);
      }

      // 탭/카테고리 찾기
      console.log('\n=== 탭/카테고리 ===');
      const tabs = await mainFrame.$$('[class*="tab"], [class*="category"], [role="tab"]');
      console.log(`탭 수: ${tabs.length}`);
      for (let i = 0; i < Math.min(10, tabs.length); i++) {
        const tab = tabs[i];
        const className = await tab.getAttribute('class');
        const text = await tab.innerText().catch(() => '');
        if (className?.includes('sticker') || text) {
          console.log(`  ${i}: class="${className?.substring(0, 50)}", text="${text}"`);
        }
      }

      // 버튼 요소들
      console.log('\n=== 버튼 요소 ===');
      const buttons = await mainFrame.$$('button[class*="sticker"], [class*="sticker"] button');
      console.log(`버튼 수: ${buttons.length}`);
      for (let i = 0; i < Math.min(10, buttons.length); i++) {
        const btn = buttons[i];
        const className = await btn.getAttribute('class');
        const dataName = await btn.getAttribute('data-name');
        console.log(`  ${i}: class="${className?.substring(0, 50)}", data-name="${dataName}"`);
      }

      // li 요소들
      console.log('\n=== 리스트 아이템 ===');
      const listItems = await mainFrame.$$('[class*="sticker"] li, li[class*="sticker"]');
      console.log(`리스트 아이템 수: ${listItems.length}`);

      // 스크린샷
      await page.screenshot({ path: 'output/sticker_panel.png', fullPage: true });
      console.log('\n스크린샷: output/sticker_panel.png');

    } else {
      console.log('스티커 버튼 없음');
    }

    console.log('\n30초 후 종료...');
    await page.waitForTimeout(30000);
    await browser.close();

  } catch (error) {
    console.error('오류:', error.message);
    await browser.close();
  }
}

analyzeSticker();
