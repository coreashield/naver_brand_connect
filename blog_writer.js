import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// 이미지 파일 경로 (image_handler.js에서 생성된 이미지)
const PRODUCT_IMAGES_DIR = 'output/images';

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const BLOG_WRITE_URL = 'https://blog.naver.com/ingredient7303126?Redirect=Write&categoryNo=6';

// 블로그 원고 - 1500~1800자 이상 + 구체적 이미지 설명
const blogContent = {
  title: '2만원대 니트원피스 이게 진짜 됨?',

  sections: [
    { type: 'image_marker', content: '📷 [제품 메인 이미지]' },
    { type: 'sticker' },
    { type: 'text', content: '안녕하세요 여러분! 💕' },
    { type: 'text', content: '오늘은 제가 최근에 득템한' },
    { type: 'text', content: '겨울 필수템을 소개해드릴게요!' },
    { type: 'blank' },
    { type: 'text', content: '요즘 날씨가 정말' },
    { type: 'text', content: '많이 추워지면서' },
    { type: 'text', content: '따뜻하면서도 예쁜 원피스를' },
    { type: 'text', content: '찾고 있었어요 🥺' },
    { type: 'blank' },
    { type: 'text', content: '니트 원피스는 겨울에' },
    { type: 'text', content: '정말 활용도가 높잖아요?' },
    { type: 'text', content: '출근할 때도, 데이트할 때도' },
    { type: 'text', content: '모임 갈 때도 딱 좋은 아이템이죠!' },
    { type: 'blank' },
    { type: 'text', content: '근데 막상 찾아보면' },
    { type: 'text', content: '너무 두꺼워서 뚱뚱해 보이거나' },
    { type: 'text', content: '얇아서 추운 것들이 대부분이더라고요 ㅠㅠ' },
    { type: 'blank' },
    { type: 'text', content: '가격도 천차만별이라' },
    { type: 'text', content: '뭘 사야 할지 정말 고민이 많았어요' },
    { type: 'text', content: '비싼 게 무조건 좋은 것도 아니고요 ㅎㅎ' },
    { type: 'divider' },

    { type: 'sticker' },
    { type: 'quote', content: '셔링 디테일로 날씬해 보이는 원피스 발견!', style: 1 },
    { type: 'blank' },
    { type: 'text', content: '그러다 아뜨랑스에서' },
    { type: 'text', content: '하프넥 셔링 원피스를 발견했어요 ✨' },
    { type: 'blank' },
    { type: 'text', content: '처음 상품 페이지를 봤을 때' },
    { type: 'text', content: '사이드 셔링 디테일이' },
    { type: 'text', content: '눈에 확 들어왔거든요!' },
    { type: 'blank' },
    { type: 'text', content: '셔링이 있으면 체형 보정이' },
    { type: 'text', content: '자연스럽게 되니까' },
    { type: 'text', content: '겨울에 딱이겠다 싶었어요!' },
    { type: 'blank' },
    { type: 'text', content: '무엇보다 가격이...' },
    { type: 'text', content: '💰 할인가 27,000원!' },
    { type: 'text', content: '2만원대에 이 디자인이라니?' },
    { type: 'text', content: '가성비 너무 좋아서 바로 주문했습니다!' },
    { type: 'blank' },
    { type: 'text', content: '솔직히 이 가격이면' },
    { type: 'text', content: '실패해도 괜찮겠다 싶었는데' },
    { type: 'text', content: '결과는 대만족이었어요!' },
    { type: 'divider' },

    { type: 'image_marker', content: '📷 [제품 상세 이미지]' },
    { type: 'sticker' },
    { type: 'quote', content: '📦 실제 착용 후기', style: 2 },
    { type: 'blank' },
    { type: 'text', content: '배송은 주문 후 이틀 만에 왔고요!' },
    { type: 'text', content: '택배 받자마자' },
    { type: 'text', content: '바로 입어봤는데요!' },
    { type: 'blank' },
    { type: 'text', content: '▸ 핏감과 사이즈' },
    { type: 'blank' },
    { type: 'text', content: '저는 163cm / 54kg이고' },
    { type: 'text', content: '프리사이즈로 주문했어요' },
    { type: 'blank' },
    { type: 'text', content: '전체적으로 여유 있는 핏이라' },
    { type: 'text', content: '편하게 입기 정말 좋았어요 👍' },
    { type: 'text', content: '레이어드 하기에도 괜찮은 핏이에요!' },
    { type: 'blank' },
    { type: 'text', content: '길이는 무릎 바로 아래까지 오는데' },
    { type: 'text', content: '너무 길지 않아서 답답하지 않고' },
    { type: 'text', content: '활동하기에도 편해요!' },
    { type: 'blank' },
    { type: 'text', content: '하프넥 디자인이라서' },
    { type: 'text', content: '목이 답답하지 않으면서도 따뜻해요!' },
    { type: 'text', content: '터틀넥 싫어하시는 분들께 딱이에요 ㅎㅎ' },
    { type: 'text', content: '저도 터틀넥이 답답해서 잘 안 입거든요!' },
    { type: 'divider' },

    { type: 'image_marker', content: '📷 [제품 디테일 컷 - 소재감/셔링 클로즈업]' },
    { type: 'sticker' },
    { type: 'text', content: '▸ 소재감' },
    { type: 'blank' },
    { type: 'text', content: '니트 소재가 적당히 두께감 있어서' },
    { type: 'text', content: '보온성이 정말 좋아요!' },
    { type: 'text', content: '겨울에 이너만 입어도 충분할 것 같아요!' },
    { type: 'blank' },
    { type: 'text', content: '무엇보다 까슬거리지 않고' },
    { type: 'text', content: '부드러워서' },
    { type: 'text', content: '맨살에 닿아도 불편함 없어요!' },
    { type: 'blank' },
    { type: 'text', content: '니트 특유의 가려움이 없어서' },
    { type: 'text', content: '이너 없이 입어도 전혀 문제없더라고요 ㅎㅎ' },
    { type: 'text', content: '민감한 피부 가지신 분들도' },
    { type: 'text', content: '편하게 입으실 수 있을 것 같아요!' },
    { type: 'divider' },

    { type: 'sticker' },
    { type: 'text', content: '▸ 셔링 디테일' },
    { type: 'blank' },
    { type: 'quote', content: '사이드 셔링이 진짜 예뻐요!', style: 0 },
    { type: 'blank' },
    { type: 'text', content: '이 원피스의 핵심 포인트는' },
    { type: 'text', content: '바로 사이드 셔링이에요!' },
    { type: 'blank' },
    { type: 'text', content: '옆에서 봤을 때' },
    { type: 'text', content: '허리라인이 자연스럽게 잡혀서' },
    { type: 'text', content: '날씬해 보이는 효과 있어요 🙈' },
    { type: 'blank' },
    { type: 'text', content: '뱃살이나 옆구리살' },
    { type: 'text', content: '걱정되시는 분들!' },
    { type: 'text', content: '셔링이 자연스럽게 커버해줘요 ㅋㅋ' },
    { type: 'text', content: '저도 배 나온 게 고민인데' },
    { type: 'text', content: '이 원피스 입으면 신경 안 써요!' },
    { type: 'blank' },
    { type: 'text', content: '플레어 스커트 부분도' },
    { type: 'text', content: '움직일 때마다 자연스럽게 흔들려서' },
    { type: 'text', content: '여성스러운 느낌이 나요!' },
    { type: 'blank' },
    { type: 'text', content: '하체가 고민이신 분들도' },
    { type: 'text', content: 'A라인 실루엣 덕분에' },
    { type: 'text', content: '걱정 없이 입으실 수 있어요!' },
    { type: 'text', content: '허벅지나 엉덩이가 커버되거든요!' },
    { type: 'divider' },

    { type: 'sticker' },
    { type: 'quote', content: '👗 다양한 코디 추천', style: 1 },
    { type: 'blank' },
    { type: 'text', content: '이 원피스로 다양하게' },
    { type: 'text', content: '스타일링 해봤는데요!' },
    { type: 'text', content: '어떤 스타일이든 잘 어울려요!' },
    { type: 'blank' },
    { type: 'text', content: '🏠 데일리룩' },
    { type: 'text', content: '원피스 + 롱부츠 조합이면 끝!' },
    { type: 'text', content: '간단하면서도 완성도 있어요!' },
    { type: 'text', content: '장보기, 카페 가기 딱이에요!' },
    { type: 'blank' },
    { type: 'text', content: '💼 오피스룩' },
    { type: 'text', content: '흰 블라우스 레이어드 + 펌프스' },
    { type: 'text', content: '깔끔하고 단정한 느낌!' },
    { type: 'text', content: '직장인 분들께 강추해요!' },
    { type: 'blank' },
    { type: 'text', content: '💝 데이트룩' },
    { type: 'text', content: '롱코트 + 앵클부츠 + 미니백' },
    { type: 'text', content: '고급스러운 분위기 연출 가능!' },
    { type: 'text', content: '남자친구한테 칭찬 많이 받았어요 ㅎㅎ' },
    { type: 'blank' },
    { type: 'text', content: '요즘 같은 추운 겨울엔' },
    { type: 'text', content: '무스탕이나 패딩이랑도 잘 어울려요!' },
    { type: 'text', content: '숏패딩이랑 매치하면' },
    { type: 'text', content: '캐주얼한 느낌도 연출 가능!' },
    { type: 'divider' },

    { type: 'sticker' },
    { type: 'quote', content: '✅ 장단점 솔직 정리', style: 2 },
    { type: 'blank' },
    { type: 'text', content: '2주 정도 입어보고 나서' },
    { type: 'text', content: '솔직하게 정리해볼게요!' },
    { type: 'blank' },
    { type: 'text', content: '✅ 장점' },
    { type: 'text', content: '✔️ 사이드 셔링으로 날씬해 보임' },
    { type: 'text', content: '✔️ 27,000원 말도 안 되는 가성비' },
    { type: 'text', content: '✔️ 데일리/오피스/데이트 다양한 코디 가능' },
    { type: 'text', content: '✔️ 까슬거리지 않는 부드러운 소재감' },
    { type: 'text', content: '✔️ 적당한 두께감으로 보온성 굿' },
    { type: 'text', content: '✔️ 하프넥이라 답답하지 않음' },
    { type: 'blank' },
    { type: 'text', content: '⚠️ 아쉬운 점' },
    { type: 'text', content: '• 단독 세탁 권장 (니트라서요!)' },
    { type: 'text', content: '• 여유핏이라 슬림핏 원하시면 비추' },
    { type: 'text', content: '• 인기 많아서 품절 자주 됨' },
    { type: 'blank' },
    { type: 'text', content: '전반적으로 장점이 훨씬 많아서' },
    { type: 'text', content: '정말 만족스러운 구매였어요!' },
    { type: 'text', content: '가성비로는 이만한 게 없는 것 같아요!' },
    { type: 'divider' },

    { type: 'sticker' },
    { type: 'quote', content: '🙋‍♀️ 이런 분께 추천해요!', style: 0 },
    { type: 'blank' },
    { type: 'text', content: '겨울에 따뜻하면서도' },
    { type: 'text', content: '예쁜 원피스 찾으시는 분' },
    { type: 'blank' },
    { type: 'text', content: '3만원 이하 가성비 좋은' },
    { type: 'text', content: '겨울템 원하시는 분' },
    { type: 'blank' },
    { type: 'text', content: '출퇴근룩, 데이트룩 등' },
    { type: 'text', content: '다양하게 활용하고 싶으신 분' },
    { type: 'blank' },
    { type: 'text', content: '체형이 커버되는 원피스' },
    { type: 'text', content: '찾으시는 분 (배, 허벅지, 엉덩이)' },
    { type: 'blank' },
    { type: 'text', content: '터틀넥은 답답해서' },
    { type: 'text', content: '싫으신 분' },
    { type: 'divider' },

    { type: 'sticker' },
    { type: 'quote', content: '💯 이 가격에 이 퀄리티면 가성비 갑!', style: 1 },
    { type: 'blank' },
    { type: 'text', content: '솔직히 2만원대 니트 원피스라서' },
    { type: 'text', content: '처음엔 기대 안 했거든요?' },
    { type: 'blank' },
    { type: 'text', content: '근데 리뷰도 많고 평점도 좋아서' },
    { type: 'text', content: '믿고 구매했는데' },
    { type: 'text', content: '기대 이상이었어요!' },
    { type: 'blank' },
    { type: 'text', content: '올겨울 많이 입을 것 같아서' },
    { type: 'text', content: '다른 컬러도 추가 구매 고민 중이에요 ㅎㅎ' },
    { type: 'text', content: '블랙이랑 아이보리가 있는데' },
    { type: 'text', content: '둘 다 예쁘더라고요!' },
    { type: 'blank' },
    { type: 'text', content: '겨울 원피스 고민되시는 분들!' },
    { type: 'text', content: '이 가격에 이 퀄리티면' },
    { type: 'text', content: '진짜 가성비 좋은 것 같아요!' },
    { type: 'text', content: '한 번 고려해보세요 💕' },
    { type: 'blank' },
    { type: 'text', content: '그럼 오늘도 예쁘게 입어요! 🥰' },
    { type: 'divider' },
    { type: 'notice', content: '이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.' }
  ]
};

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

// 인용구 삽입 (안전한 방식)
async function insertQuote(page, mainFrame, text, styleIndex = 0) {
  try {
    const quoteBtn = await mainFrame.$('button[data-name="quotation"]');
    if (quoteBtn) {
      await quoteBtn.click();
      await page.waitForTimeout(600);

      // 인용구 스타일 선택
      const quoteOptions = await mainFrame.$$('.se-popup-panel button, .se-drop-down-panel button');
      const safeIndex = Math.min(styleIndex, Math.max(0, quoteOptions.length - 1));
      if (quoteOptions.length > 0) {
        await quoteOptions[safeIndex].click();
        await page.waitForTimeout(400);
      }

      // 텍스트 입력
      await page.keyboard.type(text, { delay: 20 });
      await page.waitForTimeout(300);

      // 인용구 밖으로 나가기 - 여러 방법 시도
      // 1. 맨 끝으로 이동 후 아래로
      await page.keyboard.press('End');
      await page.waitForTimeout(100);

      // 2. 인용구 컴포넌트 밖으로 나가기 (Ctrl+Enter 또는 ArrowDown)
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);

      // 3. 본문 영역 클릭으로 확실히 빠져나오기
      const newTextArea = await mainFrame.$('.se-component.se-text:last-child .se-text-paragraph');
      if (newTextArea) {
        await newTextArea.click();
        await page.waitForTimeout(200);
      }

      console.log(`  → 인용구 삽입됨 (스타일 ${safeIndex})`);
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

// 스티커 카테고리 인덱스 (다양하게 선택하기 위해)
let stickerCategoryIndex = 0;

// 스티커 삽입 (다양한 카테고리에서)
async function insertSticker(page, mainFrame) {
  try {
    const stickerBtn = await mainFrame.$('button[data-name="sticker"]');
    if (stickerBtn) {
      await stickerBtn.click();
      await page.waitForTimeout(1500);

      // 스티커 카테고리 탭들 찾기 (다양하게 선택)
      const categoryTabs = await mainFrame.$$('.se-sticker-category-item, [class*="sticker-category"] button, [class*="sticker"] [role="tab"]');

      if (categoryTabs.length > 1) {
        // 카테고리를 순환하며 선택
        const tabIndex = stickerCategoryIndex % categoryTabs.length;
        await categoryTabs[tabIndex].click();
        await page.waitForTimeout(800);
        stickerCategoryIndex++;
      }

      // 스티커 버튼들 찾기
      const stickerItems = await mainFrame.$$('button.se-sidebar-element-sticker');

      if (stickerItems.length > 0) {
        // 랜덤하게 스티커 선택
        const randomIndex = Math.floor(Math.random() * Math.min(12, stickerItems.length));
        await stickerItems[randomIndex].click();
        await page.waitForTimeout(600);
        console.log(`  → 스티커 삽입됨 (카테고리 ${stickerCategoryIndex}, ${randomIndex + 1}번째)`);
      } else {
        await page.keyboard.press('Escape');
        console.log('  → 스티커 없음');
      }
    }
  } catch (e) {
    console.log('  스티커 실패:', e.message);
    await page.keyboard.press('Escape');
  }
}

// 이미지 업로드 함수
async function uploadImage(page, mainFrame, imagePath) {
  try {
    // 절대 경로로 변환
    const absolutePath = path.resolve(imagePath);

    if (!fs.existsSync(absolutePath)) {
      console.log(`  → 이미지 파일 없음: ${imagePath}`);
      return false;
    }

    // 파일 입력 요소 먼저 찾기 (버튼 클릭 전에)
    let fileInput = await mainFrame.$('input[type="file"][accept*="image"]');
    if (!fileInput) {
      fileInput = await mainFrame.$('input[type="file"]');
    }

    // 이미지 버튼 클릭과 동시에 파일 선택 대기
    const imageBtn = await mainFrame.$('button[data-name="image"]');
    if (imageBtn) {
      // filechooser 이벤트 대기 설정
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
        imageBtn.click()
      ]);

      if (fileChooser) {
        // 네이티브 파일 다이얼로그가 열린 경우
        await fileChooser.setFiles(absolutePath);
        await page.waitForTimeout(3000); // 업로드 대기
        console.log(`  → 이미지 업로드 완료: ${path.basename(imagePath)}`);
        return true;
      } else {
        // 파일 다이얼로그가 안 열린 경우, input 요소로 직접 설정
        await page.waitForTimeout(1000);

        fileInput = await mainFrame.$('input[type="file"][accept*="image"]');
        if (!fileInput) {
          fileInput = await mainFrame.$('input[type="file"]');
        }

        if (fileInput) {
          await fileInput.setInputFiles(absolutePath);
          await page.waitForTimeout(3000);
          console.log(`  → 이미지 업로드 완료: ${path.basename(imagePath)}`);
          return true;
        }

        console.log('  → 파일 입력 요소 찾기 실패');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } else {
      console.log('  → 이미지 버튼 찾기 실패');
    }
    return false;
  } catch (error) {
    console.log(`  → 이미지 업로드 실패: ${error.message}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return false;
  }
}

// 사용 가능한 제품 이미지 목록 가져오기
function getAvailableProductImages() {
  const images = [];
  if (fs.existsSync(PRODUCT_IMAGES_DIR)) {
    const files = fs.readdirSync(PRODUCT_IMAGES_DIR);
    for (const file of files) {
      if (file.match(/product_\d+\.jpg$/)) {
        images.push(path.join(PRODUCT_IMAGES_DIR, file));
      }
    }
  }
  return images.sort();
}

async function writeBlogPost() {
  console.log('=== 블로그 자동 작성 시작 ===\n');

  // 이미지 준비 상태 확인
  const productImages = getAvailableProductImages();
  if (productImages.length > 0) {
    console.log(`✅ 제품 이미지 ${productImages.length}개 준비됨`);
    productImages.forEach((img, i) => console.log(`   ${i + 1}. ${path.basename(img)}`));
  } else {
    console.log('⚠️  제품 이미지 없음 - 먼저 image_handler.js를 실행하세요!');
    console.log('   node image_handler.js\n');
    console.log('이미지 없이 진행합니다...\n');
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 20
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    await naverLogin(page);

    console.log('블로그 글쓰기 페이지 이동...');
    await page.goto(BLOG_WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const mainFrame = page.frame('mainFrame');
    if (!mainFrame) {
      console.log('mainFrame을 찾을 수 없습니다.');
      return;
    }
    console.log('mainFrame 발견!');

    // 팝업 닫기
    await page.waitForTimeout(2000);
    try {
      const confirmPopup = await mainFrame.$('.se-popup-alert-confirm .se-popup-button-confirm, .se-popup-alert .se-popup-button');
      if (confirmPopup) {
        await confirmPopup.click();
        console.log('확인 팝업 닫기');
        await page.waitForTimeout(500);
      }
      const helpCloseBtn = await mainFrame.$('button.se-help-panel-close-button, .se-popup-close-button');
      if (helpCloseBtn) {
        await helpCloseBtn.click();
        console.log('도움말 창 닫기');
        await page.waitForTimeout(500);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch (e) {}

    // === 제목 입력 ===
    console.log('\n=== 제목 입력 ===');
    const titleArea = await mainFrame.$('.se-documentTitle .se-text-paragraph, .se-title-text');
    if (titleArea) {
      await titleArea.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(blogContent.title, { delay: 30 });
      console.log('제목 입력 완료:', blogContent.title);
    }

    await page.waitForTimeout(700);

    // === 본문 영역으로 이동 ===
    console.log('\n=== 본문 영역으로 이동 ===');

    // 본문 클릭
    const contentArea = await mainFrame.$('.se-component.se-text .se-text-paragraph');
    if (contentArea) {
      await contentArea.click();
      console.log('본문 영역 클릭');
    } else {
      await page.keyboard.press('Tab');
      console.log('Tab으로 본문 이동');
    }
    await page.waitForTimeout(500);

    // 정렬은 사용자 기본 설정으로 사용
    await page.waitForTimeout(300);

    // === 본문 작성 ===
    console.log('\n=== 본문 입력 시작 ===');

    // 제품 이미지 목록 가져오기
    const productImages = getAvailableProductImages();
    let imageIndex = 0;
    console.log(`사용 가능한 제품 이미지: ${productImages.length}개`);

    for (let i = 0; i < blogContent.sections.length; i++) {
      const section = blogContent.sections[i];
      console.log(`섹션 ${i + 1}/${blogContent.sections.length}: ${section.type}`);

      switch (section.type) {
        case 'image_marker':
          // 제품 이미지가 있으면 업로드, 없으면 텍스트 마커 표시
          if (productImages.length > 0 && imageIndex < productImages.length) {
            const imagePath = productImages[imageIndex];
            const uploaded = await uploadImage(page, mainFrame, imagePath);
            if (uploaded) {
              imageIndex++;
              await page.keyboard.press('Enter'); // 이미지 후 줄바꿈
            } else {
              // 업로드 실패 시 텍스트 마커 표시
              await page.keyboard.type(section.content, { delay: 15 });
              await page.keyboard.press('Enter');
            }
          } else {
            // 이미지 없으면 사용자 안내 메시지
            await page.keyboard.type('📷 [사용자 이미지 삽입 필요]', { delay: 15 });
            await page.keyboard.press('Enter');
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
          await page.keyboard.type(section.content, { delay: 15 });
          await page.keyboard.press('Enter');
          break;
      }

      await page.waitForTimeout(100);
    }

    console.log('\n=== 본문 입력 완료 ===');

    // 모든 팝업/패널 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 스티커 패널 닫기
    try {
      const stickerCloseBtn = await mainFrame.$('.se-sidebar-close-button, button[aria-label="닫기"]');
      if (stickerCloseBtn) {
        await stickerCloseBtn.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {}

    // 스크린샷
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'output/blog_written.png', fullPage: true });
    console.log('스크린샷: output/blog_written.png');

    // === 발행 버튼 클릭 ===
    console.log('\n=== 발행 프로세스 시작 ===');

    // 발행 버튼 클릭
    const publishBtn = await mainFrame.$('button.publish_btn__Y5YlZ, button[class*="publish"], .se-publish-button');
    if (publishBtn) {
      await publishBtn.click();
      console.log('발행 버튼 클릭');
      await page.waitForTimeout(2000);
    } else {
      // 상단 발행 버튼 찾기 (mainFrame 밖에 있을 수 있음)
      const topPublishBtn = await page.$('button.publish_btn__Y5YlZ, button[class*="publish"]');
      if (topPublishBtn) {
        await topPublishBtn.click();
        console.log('상단 발행 버튼 클릭');
        await page.waitForTimeout(2000);
      }
    }

    // === 해시태그 입력 ===
    console.log('\n=== 해시태그 입력 ===');

    // 상품 관련 해시태그 (10~20개)
    const hashtags = [
      '니트원피스',
      '겨울원피스',
      '데일리룩',
      '여성패션',
      '가성비원피스',
      '셔링원피스',
      '하프넥원피스',
      '아뜨랑스',
      '겨울코디',
      '출근룩',
      '데이트룩',
      '플레어원피스',
      '니트코디',
      '여자겨울옷',
      '원피스추천'
    ];

    // 해시태그 입력 영역 찾기
    const hashtagInput = await mainFrame.$('input[placeholder*="태그"], input[placeholder*="해시태그"], .tag_input input, input[class*="tag"]');
    if (hashtagInput) {
      for (const tag of hashtags) {
        await hashtagInput.click();
        await page.waitForTimeout(200);
        await page.keyboard.type(tag, { delay: 30 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        console.log(`  → 해시태그 추가: #${tag}`);
      }
    } else {
      // 다른 방식으로 해시태그 입력 시도
      const tagArea = await mainFrame.$('[class*="tag"] input, .se-tag-input');
      if (tagArea) {
        await tagArea.click();
        for (const tag of hashtags) {
          await page.keyboard.type(tag, { delay: 30 });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
          console.log(`  → 해시태그 추가: #${tag}`);
        }
      } else {
        console.log('해시태그 입력 영역을 찾을 수 없습니다.');
      }
    }

    console.log(`\n총 ${hashtags.length}개 해시태그 입력 완료`);

    // 발행 설정 스크린샷
    await page.waitForTimeout(1000);
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

writeBlogPost();
