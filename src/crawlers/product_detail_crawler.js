/**
 * 상품 상세 정보 크롤러
 * 네이버 스마트스토어/브랜드스토어에서 상품 정보를 수집
 * Stealth 모드 적용으로 봇 탐지 회피
 */

import { chromium } from 'playwright';

/**
 * Stealth 설정이 적용된 브라우저 컨텍스트 생성
 */
async function createStealthContext(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    permissions: ['geolocation'],
    geolocation: { latitude: 37.5665, longitude: 126.9780 },  // 서울
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
    }
  });

  // WebDriver 탐지 우회
  await context.addInitScript(() => {
    // navigator.webdriver 숨기기
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Chrome 속성 추가
    window.chrome = { runtime: {} };

    // Permissions API 수정
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );

    // Plugin 배열 수정
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });

    // Languages 수정
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko', 'en-US', 'en']
    });
  });

  return context;
}

/**
 * 상품 상세 정보 수집
 * @param {Object} browser - Playwright 브라우저 인스턴스 (재사용)
 * @param {string} affiliateLink - 어필리에이트 링크 또는 상품 URL
 * @returns {Object} 상품 상세 정보
 */
export async function crawlProductDetail(browser, affiliateLink) {
  const context = await createStealthContext(browser);

  const page = await context.newPage();

  try {
    // 1. 페이지 접속 (리다이렉트 대기)
    console.log(`  접속 중: ${affiliateLink}`);
    await page.goto(affiliateLink, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // 리다이렉트 완료 대기 (최대 10초)
    await page.waitForTimeout(5000);

    let currentUrl = page.url();
    console.log(`  현재 URL: ${currentUrl}`);

    // CAPTCHA 체크 및 대기
    const hasCaptcha = await page.$('text=보안 확인') ||
                       await page.$('text=캡차') ||
                       currentUrl.includes('captcha');

    if (hasCaptcha) {
      console.log('⚠️ CAPTCHA 감지됨 - 30초 대기 (수동 해결 필요)');
      await page.waitForTimeout(30000);  // 수동 해결 대기
      currentUrl = page.url();

      // 여전히 CAPTCHA면 실패
      if (currentUrl.includes('captcha') || await page.$('text=보안 확인')) {
        return { success: false, error: 'CAPTCHA', url: affiliateLink };
      }
    }

    // 페이지 완전 로딩 대기
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // URL 다시 확인
    currentUrl = page.url();
    console.log(`  최종 URL: ${currentUrl}`);

    // 상품 페이지 요소 대기 (meta 태그 또는 상품 정보)
    try {
      await page.waitForSelector('meta[property="og:title"], script[type="application/ld+json"]', { timeout: 10000 });
      console.log('  ✓ 상품 페이지 요소 감지');
    } catch (e) {
      console.log('  ⚠️ 상품 페이지 요소 없음 - 현재 페이지에서 추출 시도');
    }

    // 2. 데이터 추출
    const productInfo = await page.evaluate(() => {
      const result = {
        // 기본 정보
        url: window.location.href,
        name: null,
        price: null,
        originalPrice: null,
        category: null,
        brand: null,
        manufacturer: null,
        description: null,

        // 평가 정보
        rating: null,
        reviewCount: null,

        // 이미지
        mainImage: null,

        // 키워드
        keywords: [],

        // 원본 데이터
        rawData: {}
      };

      // 헬퍼 함수
      const getMeta = (name) => {
        const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        return el ? el.content : null;
      };

      // === Meta 태그 정보 ===
      result.mainImage = getMeta('og:image');
      const ogTitle = getMeta('og:title');
      const ogDesc = getMeta('og:description');
      const keywordsMeta = getMeta('keywords');

      if (keywordsMeta) {
        result.keywords = keywordsMeta.split(',').map(k => k.trim()).filter(k => k);
      }

      // === JSON-LD 구조화 데이터 (가장 신뢰도 높음) ===
      const jsonLd = document.querySelector('script[type="application/ld+json"]');
      if (jsonLd) {
        try {
          const data = JSON.parse(jsonLd.textContent);
          result.rawData.jsonLd = data;

          if (data.name) result.name = data.name;
          if (data.category) result.category = data.category;
          if (data.offers?.price) result.price = parseInt(data.offers.price);
          if (data.image) result.mainImage = result.mainImage || data.image;
        } catch(e) {}
      }

      // === 텍스트 패턴 매칭 ===
      const bodyText = document.body.innerText;

      // 가격 추출
      if (!result.price) {
        const priceMatches = bodyText.match(/[\d,]+원/g) || [];
        if (priceMatches.length > 0) {
          // 가장 큰 가격 = 원가, 두 번째 = 할인가
          const prices = priceMatches.map(p => parseInt(p.replace(/[,원]/g, ''))).sort((a,b) => b-a);
          if (prices.length >= 2) {
            result.originalPrice = prices[0];
            result.price = prices[1];
          } else if (prices.length === 1) {
            result.price = prices[0];
          }
        }
      }

      // 평점 추출
      const ratingMatch = bodyText.match(/평점\s*\n?\s*([\d.]+)/);
      if (ratingMatch) {
        result.rating = parseFloat(ratingMatch[1]);
      }

      // 리뷰 수 추출
      const reviewMatch = bodyText.match(/리뷰\s*([\d,]+)/);
      if (reviewMatch) {
        result.reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
      }

      // 브랜드/제조사 추출
      const brandMatch = bodyText.match(/브랜드\s*[:：\t]?\s*([가-힣a-zA-Z0-9]+)/);
      if (brandMatch) result.brand = brandMatch[1];

      const manufacturerMatch = bodyText.match(/제조사\s*[:：\t]?\s*([가-힣a-zA-Z0-9]+)/);
      if (manufacturerMatch) result.manufacturer = manufacturerMatch[1];

      // 상품명이 없으면 og:title 사용
      if (!result.name && ogTitle) {
        // 스토어명 제거 (: 왕타, : 스토어명 등)
        result.name = ogTitle.replace(/\s*:\s*[가-힣a-zA-Z]+$/, '').trim();
      }

      // 설명이 없으면 og:description 사용
      if (!result.description && ogDesc) {
        result.description = ogDesc;
      }

      return result;
    });

    // 3. 타겟 오디언스 추론
    productInfo.targetAudience = inferTargetAudience(productInfo);

    productInfo.success = true;
    productInfo.crawledAt = new Date().toISOString();

    return productInfo;

  } catch (error) {
    console.error('크롤링 에러:', error.message);
    return { success: false, error: error.message, url: affiliateLink };
  } finally {
    await context.close();
  }
}

/**
 * 상품 정보로부터 타겟 오디언스 추론
 * @param {Object} productInfo - 상품 정보
 * @returns {Object} 타겟 오디언스 정보
 */
function inferTargetAudience(productInfo) {
  const target = {
    ageGroup: null,
    gender: null,
    keywords: [],
    persona: null
  };

  const name = (productInfo.name || '').toLowerCase();
  const category = (productInfo.category || '').toLowerCase();
  const keywords = productInfo.keywords.map(k => k.toLowerCase());
  const allText = `${name} ${category} ${keywords.join(' ')}`;

  // === 성별 추론 ===
  const femaleKeywords = ['여성', '여자', '우먼', 'women', 'lady', '레이디', '걸', 'girl',
                          '엄마', '맘', '임산부', '화장', '스킨케어', '립', '아이섀도'];
  const maleKeywords = ['남성', '남자', '맨', 'men', 'man', '아빠', '면도', '쉐이빙'];
  const unisexKeywords = ['공용', '유니섹스', '가족', '온가족'];

  if (femaleKeywords.some(k => allText.includes(k))) {
    target.gender = '여성';
  } else if (maleKeywords.some(k => allText.includes(k))) {
    target.gender = '남성';
  } else if (unisexKeywords.some(k => allText.includes(k))) {
    target.gender = '공용';
  }

  // === 연령대 추론 ===
  const kidKeywords = ['아기', '유아', '키즈', 'kids', '어린이', '아동', '베이비', 'baby'];
  const teenKeywords = ['10대', '청소년', '학생', '틴'];
  const youngAdultKeywords = ['20대', '30대', '직장인', '사회초년생', '대학생'];
  const middleAgeKeywords = ['40대', '50대', '중년'];
  const seniorKeywords = ['60대', '70대', '시니어', '노인', '어르신'];

  if (kidKeywords.some(k => allText.includes(k))) {
    target.ageGroup = '영유아/어린이';
  } else if (teenKeywords.some(k => allText.includes(k))) {
    target.ageGroup = '10대';
  } else if (youngAdultKeywords.some(k => allText.includes(k))) {
    target.ageGroup = '20-30대';
  } else if (middleAgeKeywords.some(k => allText.includes(k))) {
    target.ageGroup = '40-50대';
  } else if (seniorKeywords.some(k => allText.includes(k))) {
    target.ageGroup = '60대 이상';
  }

  // === 카테고리 기반 추가 추론 ===
  const categoryInference = {
    '뷰티': { gender: '여성', ageGroup: '20-40대' },
    '화장품': { gender: '여성', ageGroup: '20-40대' },
    '패션': { ageGroup: '20-40대' },
    '육아': { gender: '여성', ageGroup: '30-40대' },
    '스포츠': { ageGroup: '20-40대' },
    '건강': { ageGroup: '40-60대' },
    '주방': { gender: '여성', ageGroup: '30-50대' },
    '생활': { ageGroup: '전연령' },
    '식품': { ageGroup: '전연령' }
  };

  for (const [cat, inference] of Object.entries(categoryInference)) {
    if (category.includes(cat)) {
      if (!target.gender && inference.gender) target.gender = inference.gender;
      if (!target.ageGroup && inference.ageGroup) target.ageGroup = inference.ageGroup;
      break;
    }
  }

  // === 기본값 설정 ===
  if (!target.gender) target.gender = '공용';
  if (!target.ageGroup) target.ageGroup = '20-40대';

  // === 페르소나 생성 ===
  target.keywords = keywords.slice(0, 5);
  target.persona = `${target.ageGroup} ${target.gender}`;

  if (target.keywords.length > 0) {
    target.persona += `, ${target.keywords.slice(0, 3).join(', ')}에 관심있는 분`;
  }

  return target;
}

/**
 * 독립 실행용 - 단일 브라우저로 여러 상품 크롤링
 */
export async function crawlMultipleProducts(affiliateLinks, options = {}) {
  const { headless = false, slowMo = 100 } = options;

  // 시스템 Chrome 사용 (탐지 회피)
  const browser = await chromium.launch({
    headless,
    slowMo,
    channel: 'chrome',  // 시스템에 설치된 Chrome 사용
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--start-maximized'
    ]
  });
  const results = [];

  try {
    for (const link of affiliateLinks) {
      console.log(`크롤링 중: ${link}`);
      const result = await crawlProductDetail(browser, link);
      results.push(result);

      // 요청 간 딜레이
      await new Promise(r => setTimeout(r, 2000));
    }
  } finally {
    await browser.close();
  }

  return results;
}

// CLI 실행
if (process.argv[1].includes('product_detail_crawler')) {
  const testUrl = process.argv[2] || 'https://naver.me/50JMUA9o';

  console.log('='.repeat(50));
  console.log('상품 상세 크롤러 테스트');
  console.log('='.repeat(50));

  crawlMultipleProducts([testUrl], { headless: false })
    .then(results => {
      console.log('\n결과:');
      console.log(JSON.stringify(results[0], null, 2));
    })
    .catch(console.error);
}
