import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';
import readline from 'readline';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID?.trim();
const NAVER_PW = process.env.NAVER_PW?.trim();
const BLOG_WRITE_URL = 'https://blog.naver.com/ingredient7303126?Redirect=Write&categoryNo=6';
const PRODUCT_IMAGES_DIR = 'output/images';

// ============================================
// 사용자 입력 함수
// ============================================
function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ============================================
// 이미지 다운로드 함수
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
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

// ============================================
// 이미지 처리 (리사이징 + 해시 변경)
// ============================================
async function processImage(inputPath, outputPath) {
  try {
    let image = sharp(inputPath);
    const metadata = await image.metadata();

    if (metadata.width > 800) {
      image = image.resize(800, null, { fit: 'inside' });
    }

    // 해시값 변경을 위한 미세 조정
    image = image.modulate({
      brightness: 1.01 + Math.random() * 0.02,
      saturation: 1.0 + Math.random() * 0.02
    });
    image = image.blur(0.3);

    await image.jpeg({ quality: 80 + Math.floor(Math.random() * 5), mozjpeg: true }).toFile(outputPath);
    return outputPath;
  } catch (error) {
    console.error(`이미지 처리 실패: ${error.message}`);
    return null;
  }
}

// ============================================
// 제품 정보 스크래핑 (Brand Connect 페이지용)
// ============================================
async function scrapeProductInfo(page, productUrl) {
  console.log('\n[1/4] 제품 정보 수집 중...');

  await page.goto(productUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  let productName = '';
  let brandName = '';
  let price = '';
  let originalPrice = '';
  let discountRate = '';
  let productDetails = [];
  let category = '';

  // Brand Connect 페이지 구조에서 정보 추출
  try {
    const infoWrap = await page.$('[class*="ProductDetail_info_wrap"], [class*="ProductDetail_section"]');
    if (infoWrap) {
      const fullText = await infoWrap.innerText();
      const lines = fullText.split('\n').filter(line => line.trim());

      if (lines.length >= 2) {
        brandName = lines[0].trim();
        productName = lines[1].trim();
      }

      // 가격 정보 추출
      const discountMatch = fullText.match(/할인율\s*(\d+)%/);
      if (discountMatch) discountRate = discountMatch[1] + '%';

      const originalMatch = fullText.match(/판매가[\s\S]*?([\d,]+)\s*원/);
      if (originalMatch) originalPrice = originalMatch[1] + '원';

      const priceMatch = fullText.match(/할인가[\s\S]*?(\d+)%[\s\S]*?([\d,]+)\s*원/);
      if (priceMatch) {
        price = priceMatch[2] + '원';
      } else if (originalMatch) {
        price = originalPrice;
      }
    }
  } catch (e) {
    console.log('  기본 정보 추출 오류:', e.message);
  }

  // 실제 상품 페이지 링크 찾기 및 상세 정보 스크래핑
  try {
    // "링크 복사" 버튼 또는 상품 링크 찾기
    const linkBtn = await page.$('button:has-text("링크 복사"), a[href*="smartstore"], a[href*="brand.naver"]');
    let productPageUrl = null;

    // 페이지에서 스마트스토어 링크 추출 시도
    const allLinks = await page.$$eval('a[href]', links => links.map(l => l.href));
    for (const link of allLinks) {
      if (link.includes('smartstore.naver.com') || link.includes('brand.naver.com')) {
        productPageUrl = link;
        break;
      }
    }

    // 상품 페이지로 이동해서 상세 정보 가져오기
    if (productPageUrl) {
      console.log('  상품 페이지에서 상세 정보 수집...');
      const detailPage = await page.context().newPage();
      await detailPage.goto(productPageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await detailPage.waitForTimeout(3000);

      // 상품 상세 텍스트 추출
      const detailTexts = await detailPage.$$eval(
        '.product-option, .product_option, [class*="option"], [class*="detail"], [class*="info"], .se-text-paragraph',
        els => els.map(el => el.innerText).filter(t => t && t.length > 5 && t.length < 500)
      );
      productDetails = detailTexts.slice(0, 10);

      await detailPage.close();
    }
  } catch (e) {
    console.log('  상세 페이지 접근 생략:', e.message);
  }

  // 이미지 URL 추출
  const imageUrls = [];
  try {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(2000);

    const images = await page.$$('img[class*="Thumbnail"], img[src*="phinf"], img[src*="shop-phinf"]');
    for (const img of images) {
      let src = await img.getAttribute('src');
      if (src && src.length > 10 && !imageUrls.includes(src)) {
        if (src.includes('dthumb-phinf.pstatic.net')) {
          const match = src.match(/src=%22([^%]+)/);
          if (match) {
            src = decodeURIComponent(match[1].replace(/%2F/g, '/').replace(/%3A/g, ':'));
          }
        }
        if (!src.startsWith('http')) src = 'https:' + src;
        imageUrls.push(src);
        if (imageUrls.length >= 5) break;
      }
    }
  } catch (e) {
    console.log('  이미지 추출 오류:', e.message);
  }

  // 제품명에서 카테고리 및 특징 키워드 추출
  const keywords = extractProductKeywords(productName);
  category = keywords.category;

  const fullProductName = brandName ? `${brandName} ${productName}` : productName;

  console.log(`  브랜드: ${brandName}`);
  console.log(`  제품명: ${productName.substring(0, 40)}...`);
  console.log(`  가격: ${price} (${discountRate} 할인)`);
  console.log(`  카테고리: ${category}`);
  console.log(`  이미지: ${imageUrls.length}개 발견`);

  return {
    productName: fullProductName,
    shortName: productName,
    brandName,
    price,
    originalPrice,
    discountRate,
    category,
    keywords,
    productDetails,
    imageUrls
  };
}

// ============================================
// 제품명에서 키워드 및 카테고리 추출
// ============================================
function extractProductKeywords(productName) {
  const name = productName.toLowerCase();

  // 카테고리 판별
  let category = '일반';
  const categoryPatterns = {
    '의류-상의': ['티셔츠', '니트', '블라우스', '셔츠', '맨투맨', '후드', '가디건', '조끼', '탑', '크롭'],
    '의류-하의': ['팬츠', '바지', '청바지', '슬랙스', '레깅스', '스커트', '치마', '반바지', '쇼츠'],
    '의류-원피스': ['원피스', '드레스', '점프수트'],
    '의류-아우터': ['자켓', '코트', '점퍼', '패딩', '야상', '트렌치', '블레이저'],
    '신발': ['운동화', '스니커즈', '구두', '로퍼', '샌들', '슬리퍼', '부츠', '힐'],
    '가방': ['가방', '백팩', '숄더백', '크로스백', '토트백', '클러치', '파우치'],
    '악세서리': ['목걸이', '귀걸이', '반지', '팔찌', '시계', '벨트', '스카프', '모자'],
    'IT-전자기기': ['이어폰', '헤드폰', '스피커', '충전기', '케이블', '마우스', '키보드'],
    'IT-스마트폰': ['케이스', '필름', '거치대', '스마트폰', '휴대폰'],
    '뷰티': ['립스틱', '파운데이션', '쿠션', '마스카라', '아이섀도우', '스킨케어', '세럼', '크림'],
    '생활용품': ['수납', '정리', '청소', '주방', '욕실', '인테리어']
  };

  for (const [cat, patterns] of Object.entries(categoryPatterns)) {
    if (patterns.some(p => name.includes(p))) {
      category = cat;
      break;
    }
  }

  // 특징 키워드 추출
  const features = [];
  const featurePatterns = {
    // 디자인
    '하프넥': '하프넥 디자인으로 목선이 깔끔하게 정리되는',
    '라운드넥': '라운드넥으로 부드러운 느낌을 주는',
    '브이넥': '브이넥으로 얼굴이 갸름해 보이는',
    '셔링': '셔링 디테일로 체형 보정 효과가 있는',
    '플레어': '플레어 라인으로 여성스러운 실루엣의',
    'A라인': 'A라인 핏으로 하체 커버가 되는',
    '오버핏': '오버핏으로 편안하게 입을 수 있는',
    '슬림핏': '슬림핏으로 깔끔한 라인이 살아나는',
    '크롭': '크롭 기장으로 다리가 길어 보이는',
    '롱': '롱 기장으로 고급스러운 느낌의',
    '미니': '미니 기장으로 발랄한 느낌의',
    '미디': '미디 기장으로 단정한 느낌의',
    // 소재
    '니트': '부드러운 니트 소재로 착용감이 좋은',
    '면': '면 소재로 통기성이 좋고 편안한',
    '린넨': '린넨 소재로 시원하고 가벼운',
    '쉬폰': '쉬폰 소재로 여성스럽고 가벼운',
    '데님': '데님 소재로 캐주얼하면서도 세련된',
    '가죽': '가죽 소재로 고급스러운',
    '울': '울 소재로 보온성이 뛰어난',
    '폴리': '폴리 소재로 구김이 적고 관리가 쉬운',
    // 스타일
    '캐주얼': '캐주얼하게 데일리로 입기 좋은',
    '포멀': '포멀한 자리에도 잘 어울리는',
    '베이직': '베이직한 디자인으로 활용도가 높은',
    '유니크': '유니크한 디자인으로 눈에 띄는',
    '빈티지': '빈티지한 감성이 있는',
    '모던': '모던하고 세련된 느낌의',
    // 시즌
    '반팔': '반팔로 시원하게 입을 수 있는',
    '긴팔': '긴팔로 활용도가 높은',
    '민소매': '민소매로 여름에 시원하게 입는',
    '여름': '여름에 시원하게 입기 좋은',
    '겨울': '겨울에 따뜻하게 입을 수 있는',
    '사계절': '사계절 내내 활용 가능한'
  };

  for (const [keyword, description] of Object.entries(featurePatterns)) {
    if (name.includes(keyword.toLowerCase())) {
      features.push({ keyword, description });
    }
  }

  // 색상 추출
  const colors = [];
  const colorPatterns = ['블랙', '화이트', '아이보리', '베이지', '네이비', '그레이', '브라운', '카키', '핑크', '레드', '블루', '그린', '옐로우', '퍼플', '오렌지'];
  for (const color of colorPatterns) {
    if (name.includes(color.toLowerCase()) || name.includes(color)) {
      colors.push(color);
    }
  }

  return { category, features, colors };
}

// ============================================
// 이미지 다운로드 및 처리
// ============================================
async function downloadAndProcessImages(imageUrls) {
  console.log('\n[2/4] 이미지 다운로드 및 처리 중...');

  if (!fs.existsSync(PRODUCT_IMAGES_DIR)) {
    fs.mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });
  }

  // 기존 이미지 삭제
  const existingFiles = fs.readdirSync(PRODUCT_IMAGES_DIR);
  for (const file of existingFiles) {
    fs.unlinkSync(path.join(PRODUCT_IMAGES_DIR, file));
  }

  const processedImages = [];
  const urlsToProcess = imageUrls.slice(0, 3);

  for (let i = 0; i < urlsToProcess.length; i++) {
    const url = urlsToProcess[i];
    const tempFile = path.join(PRODUCT_IMAGES_DIR, `temp_${i}.jpg`);
    const outputFile = path.join(PRODUCT_IMAGES_DIR, `product_${i + 1}.jpg`);

    try {
      await downloadImage(url, tempFile);
      const processed = await processImage(tempFile, outputFile);
      if (processed) {
        processedImages.push(outputFile);
        console.log(`  이미지 ${i + 1} 처리 완료`);
      }
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch (error) {
      console.error(`  이미지 ${i + 1} 실패: ${error.message}`);
    }
  }

  return processedImages;
}

// ============================================
// 블로그 콘텐츠 생성 (실제 상품 정보 기반)
// ============================================
function generateBlogContent(productInfo) {
  const {
    productName,
    shortName,
    brandName,
    price,
    originalPrice,
    discountRate,
    category,
    keywords
  } = productInfo;

  const displayName = shortName || productName.substring(0, 30);
  const titleName = displayName.substring(0, 20);

  // 제품 특징 문구 생성
  const features = keywords?.features || [];
  const featureTexts = features.map(f => f.description).slice(0, 3);

  // 카테고리별 맞춤 문구 생성
  const categoryContent = getCategorySpecificContent(category, displayName, brandName, features);

  // 가격 관련 문구
  const priceText = discountRate
    ? `${originalPrice} → ${price} (${discountRate} 할인중!)`
    : price;

  // 해시태그 생성 (제품 관련)
  const hashtags = generateHashtags(productInfo);

  const sections = [
    // 광고 대가성 문구 (첫부분, 다른 색상)
    { type: 'disclosure', content: '본 포스팅은 쇼핑 커넥트 활동의 일환으로 수수료를 제공받습니다.' },
    { type: 'blank' },

    // 인트로
    { type: 'image_marker' },
    { type: 'sticker' },
    { type: 'text', content: '안녕하세요 여러분! 💕' },
    { type: 'text', content: `오늘은 ${categoryContent.intro}` },
    { type: 'text', content: '소개해드리려고 해요!' },
    { type: 'blank' },
    ...categoryContent.introDetail.map(t => ({ type: 'text', content: t })),
    { type: 'divider' },

    // 제품 정보
    { type: 'sticker' },
    { type: 'quote', content: '제품 정보', style: 1 },
    { type: 'blank' },
    { type: 'text', content: `브랜드: ${brandName}` },
    { type: 'text', content: `제품명: ${displayName}` },
    { type: 'text', content: `가격: ${priceText}` },
    { type: 'blank' },
    ...categoryContent.productInfo.map(t => ({ type: 'text', content: t })),
    { type: 'divider' },

    // 제품 특징 (추출된 키워드 기반)
    { type: 'image_marker' },
    { type: 'sticker' },
    { type: 'quote', content: '제품 특징', style: 2 },
    { type: 'blank' },
  ];

  // 추출된 특징 추가
  if (featureTexts.length > 0) {
    featureTexts.forEach(ft => {
      sections.push({ type: 'text', content: `✔️ ${ft}` });
    });
    sections.push({ type: 'blank' });
  }

  // 카테고리별 특징 문구 추가
  categoryContent.features.forEach(t => {
    sections.push({ type: 'text', content: t });
  });
  sections.push({ type: 'divider' });

  // 실제 사용 후기
  sections.push(
    { type: 'image_marker' },
    { type: 'sticker' },
    { type: 'quote', content: '실제 사용 후기', style: 0 },
    { type: 'blank' },
    ...categoryContent.review.map(t => ({ type: 'text', content: t })),
    { type: 'divider' }
  );

  // 장단점
  sections.push(
    { type: 'sticker' },
    { type: 'quote', content: '장단점 정리', style: 1 },
    { type: 'blank' },
    { type: 'text', content: '✅ 장점' },
    ...categoryContent.pros.map(t => ({ type: 'text', content: `✔️ ${t}` })),
    { type: 'blank' },
    { type: 'text', content: '⚠️ 아쉬운 점' },
    ...categoryContent.cons.map(t => ({ type: 'text', content: `• ${t}` })),
    { type: 'divider' }
  );

  // 총평
  sections.push(
    { type: 'sticker' },
    { type: 'quote', content: '총평', style: 2 },
    { type: 'blank' },
    ...categoryContent.conclusion.map(t => ({ type: 'text', content: t })),
    { type: 'divider' }
  );

  return {
    title: `${brandName} ${titleName} 솔직 후기`,
    sections,
    hashtags
  };
}

// ============================================
// 카테고리별 맞춤 콘텐츠 생성
// ============================================
function getCategorySpecificContent(category, productName, brandName, features) {
  const templates = {
    '의류-원피스': {
      intro: '예쁜 원피스 하나',
      introDetail: [
        '요즘 데일리로 입기 좋은 원피스 찾다가',
        '드디어 찾았어요!',
        '한눈에 반해서 바로 주문했답니다 🥰'
      ],
      productInfo: [
        '착용감이 편하면서도 예뻐서',
        '여러 상황에 두루두루 입기 좋아요!'
      ],
      features: [
        '실제로 입어보니 핏이 정말 예뻐요',
        '몸매가 날씬해 보이는 느낌!',
        '원단도 부드럽고 착용감이 좋아요',
        '세탁해도 형태가 잘 유지돼요'
      ],
      review: [
        '배송 받고 바로 입어봤는데요',
        '사진보다 실물이 훨씬 예뻐요!',
        '편하게 입을 수 있어서 자주 손이 가요',
        '데이트룩으로도 출근룩으로도 굿! 👍'
      ],
      pros: ['예쁜 핏과 디자인', '편안한 착용감', '다양한 코디 가능', '가성비 좋음'],
      cons: ['인기 많아서 품절 주의'],
      conclusion: [
        '전반적으로 정말 만족스러워요!',
        '이 가격에 이 퀄리티면 진짜 괜찮은 것 같아요',
        '원피스 찾으시는 분들께 강추합니다 💕'
      ]
    },
    '의류-상의': {
      intro: '요즘 자주 입는 상의',
      introDetail: [
        '활용도 높은 상의 찾다가 발견했어요!',
        '코디하기 쉬운 디자인이라',
        '바로 장바구니에 담았답니다 ㅎㅎ'
      ],
      productInfo: [
        '베이직하면서도 포인트가 있어서',
        '다양하게 매치하기 좋아요!'
      ],
      features: [
        '원단 퀄리티가 좋아서 오래 입을 수 있을 것 같아요',
        '핏도 예쁘고 몸에 잘 맞아요',
        '세탁해도 늘어나지 않아요',
        '레이어드하기도 좋은 두께예요'
      ],
      review: [
        '받자마자 입어봤는데 핏이 딱!',
        '생각보다 더 예쁘게 나왔어요',
        '편하게 입을 수 있어서 좋아요',
        '색상도 사진이랑 똑같아요 👍'
      ],
      pros: ['활용도 높은 디자인', '좋은 원단 퀄리티', '예쁜 핏', '가성비 좋음'],
      cons: ['사이즈 꼼꼼히 체크 필요'],
      conclusion: [
        '데일리로 입기 딱 좋은 상의예요!',
        '이 가격에 이 정도면 대만족입니다',
        '고민되시면 추천드려요 💕'
      ]
    },
    '의류-하의': {
      intro: '편하면서 예쁜 하의',
      introDetail: [
        '핏 좋은 하의 찾다가 찾았어요!',
        '후기 보고 바로 결정했답니다',
        '역시 후기는 거짓말 안 하네요 ㅎㅎ'
      ],
      productInfo: [
        '다리 라인이 예쁘게 나오면서도',
        '편하게 입을 수 있어서 좋아요!'
      ],
      features: [
        '신축성이 좋아서 움직이기 편해요',
        '다리가 길어 보이는 효과가 있어요',
        '허리 밴드가 편안해요',
        '구김도 잘 안 가요'
      ],
      review: [
        '핏이 정말 예뻐요!',
        '다리가 날씬해 보이는 느낌',
        '오래 입어도 불편하지 않아요',
        '세탁 후에도 형태 유지 잘 돼요 👍'
      ],
      pros: ['날씬해 보이는 핏', '편안한 착용감', '좋은 신축성', '관리 용이'],
      cons: ['인기 색상 품절 주의'],
      conclusion: [
        '진짜 핏 좋은 하의 찾으시면 이거예요!',
        '가성비도 좋고 만족스러워요',
        '추천합니다! 💕'
      ]
    },
    'IT-전자기기': {
      intro: '요즘 핫한 전자기기',
      introDetail: [
        '리뷰 보고 바로 주문했어요!',
        '가성비 좋다고 해서 기대됐는데',
        '실제로 써보니 진짜 좋더라고요 ㅎㅎ'
      ],
      productInfo: [
        '기능도 다양하고 사용하기 편해서',
        '만족스럽게 쓰고 있어요!'
      ],
      features: [
        '연결이 빠르고 안정적이에요',
        '배터리 지속시간이 길어요',
        '휴대하기 편한 사이즈예요',
        '마감 품질도 좋아요'
      ],
      review: [
        '설정도 간단하고 바로 쓸 수 있어요',
        '기대 이상으로 성능이 좋아요',
        '매일 사용하고 있는데 만족!',
        '이 가격에 이 성능이면 굿 👍'
      ],
      pros: ['좋은 성능', '편리한 사용', '가성비 좋음', '안정적인 연결'],
      cons: ['인기 많아서 배송 지연 가능'],
      conclusion: [
        '가성비 전자기기 찾으시면 추천해요!',
        '성능도 좋고 만족스러워요',
        '고민 말고 득템하세요! 💕'
      ]
    },
    'IT-스마트폰': {
      intro: '스마트폰 필수템',
      introDetail: [
        '폰 악세서리 찾다가 발견!',
        '후기 좋아서 바로 주문했어요',
        '역시 후기대로 좋네요 ㅎㅎ'
      ],
      productInfo: [
        '기능성도 좋고 디자인도 예뻐서',
        '매일 잘 쓰고 있어요!'
      ],
      features: [
        '핏이 딱 맞아요',
        '보호 기능도 확실해요',
        '그립감이 좋아요',
        '디자인도 세련됐어요'
      ],
      review: [
        '생각보다 퀄리티가 좋아서 놀랐어요',
        '매일 쓰는데 만족스러워요',
        '친구들도 예쁘다고 하더라고요',
        '실용적이면서 예뻐요 👍'
      ],
      pros: ['예쁜 디자인', '좋은 퀄리티', '실용적', '가성비 좋음'],
      cons: ['색상 선택 고민됨'],
      conclusion: [
        '폰 악세서리 찾으시면 이거 추천!',
        '실용적이면서 예뻐서 만족해요',
        '고민 말고 득템하세요! 💕'
      ]
    }
  };

  // 기본 템플릿
  const defaultTemplate = {
    intro: '좋은 제품 하나',
    introDetail: [
      '여러 제품 비교해보다가 발견했어요!',
      '후기 좋아서 바로 결정했답니다',
      '결과적으로 잘 산 것 같아요 ㅎㅎ'
    ],
    productInfo: [
      '퀄리티가 좋아서 만족스럽고',
      '가격대비 정말 괜찮아요!'
    ],
    features: [
      '전체적인 완성도가 높아요',
      '디테일도 꼼꼼하게 잘 되어있어요',
      '실물이 사진보다 더 좋아요',
      '오래 쓸 수 있을 것 같아요'
    ],
    review: [
      '배송 받고 바로 확인해봤는데요',
      '기대 이상으로 좋아서 놀랐어요!',
      '매일 사용하고 있는데 만족스러워요',
      '주변에도 추천했어요 👍'
    ],
    pros: ['좋은 퀄리티', '가성비 좋음', '빠른 배송', '실물이 예쁨'],
    cons: ['인기 많아서 품절 주의'],
    conclusion: [
      '전반적으로 정말 만족스러워요!',
      '이 가격에 이 퀄리티면 강추입니다',
      '고민되시는 분들 추천해요 💕'
    ]
  };

  // 카테고리에 맞는 템플릿 선택
  let template = defaultTemplate;

  if (category.includes('원피스')) {
    template = templates['의류-원피스'];
  } else if (category.includes('상의')) {
    template = templates['의류-상의'];
  } else if (category.includes('하의')) {
    template = templates['의류-하의'];
  } else if (category.includes('IT-전자')) {
    template = templates['IT-전자기기'];
  } else if (category.includes('IT-스마트')) {
    template = templates['IT-스마트폰'];
  } else if (category.includes('의류')) {
    template = templates['의류-상의']; // 의류 기본값
  }

  return template;
}

// ============================================
// 해시태그 생성
// ============================================
function generateHashtags(productInfo) {
  const { brandName, shortName, category, keywords } = productInfo;
  const hashtags = [];

  // 브랜드명
  if (brandName) hashtags.push(brandName.replace(/\s/g, ''));

  // 카테고리별 해시태그
  const categoryTags = {
    '의류-상의': ['상의추천', '데일리룩', '코디추천', '패션', '옷추천'],
    '의류-하의': ['하의추천', '바지추천', '데일리룩', '패션', '옷추천'],
    '의류-원피스': ['원피스추천', '원피스코디', '데일리룩', '여성패션', '데이트룩'],
    '의류-아우터': ['아우터추천', '자켓추천', '코디추천', '패션', '아우터'],
    'IT-전자기기': ['전자기기', '가젯', 'IT기기', '테크', '추천템'],
    'IT-스마트폰': ['스마트폰', '폰케이스', '휴대폰악세서리', '폰악세', '추천템'],
    '뷰티': ['뷰티', '화장품추천', '뷰티템', '메이크업', '스킨케어'],
    '가방': ['가방추천', '백추천', '데일리백', '패션가방', '가방코디'],
    '신발': ['신발추천', '슈즈', '데일리슈즈', '패션신발', '신발코디']
  };

  // 카테고리 태그 추가
  const catTags = categoryTags[category] || ['추천템', '득템', '쇼핑', '리뷰', '후기'];
  hashtags.push(...catTags);

  // 특징 키워드에서 태그 추출
  if (keywords?.features) {
    keywords.features.slice(0, 3).forEach(f => {
      hashtags.push(f.keyword);
    });
  }

  // 공통 태그
  hashtags.push('솔직후기', '가성비', '쇼핑추천', '추천', '리뷰');

  // 중복 제거 및 최대 15개
  return [...new Set(hashtags)].slice(0, 15);
}

// ============================================
// 블로그 글쓰기 함수들
// ============================================
let stickerCategoryIndex = 0;

async function insertSticker(page, mainFrame) {
  try {
    const stickerBtn = await mainFrame.$('button[data-name="sticker"]');
    if (stickerBtn) {
      await stickerBtn.click();
      await page.waitForTimeout(1500);

      const stickerItems = await mainFrame.$$('button.se-sidebar-element-sticker');
      if (stickerItems.length > 0) {
        const randomIndex = Math.floor(Math.random() * Math.min(12, stickerItems.length));
        await stickerItems[randomIndex].click();
        await page.waitForTimeout(600);
        stickerCategoryIndex++;
      } else {
        await page.keyboard.press('Escape');
      }
    }
  } catch (e) {
    await page.keyboard.press('Escape');
  }
}

async function insertQuote(page, mainFrame, text, styleIndex = 0) {
  try {
    const quoteBtn = await mainFrame.$('button[data-name="quotation"]');
    if (quoteBtn) {
      await quoteBtn.click();
      await page.waitForTimeout(600);

      const quoteOptions = await mainFrame.$$('.se-popup-panel button, .se-drop-down-panel button');
      if (quoteOptions.length > 0) {
        const safeIndex = Math.min(styleIndex, quoteOptions.length - 1);
        await quoteOptions[safeIndex].click();
        await page.waitForTimeout(400);
      }

      await page.keyboard.type(text, { delay: 20 });
      await page.waitForTimeout(300);
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
    }
  } catch (e) {
    await page.keyboard.type(`「 ${text} 」`, { delay: 15 });
    await page.keyboard.press('Enter');
  }
}

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
    }
  } catch (e) {}
}

async function uploadImage(page, mainFrame, imagePath) {
  try {
    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) return false;

    const imageBtn = await mainFrame.$('button[data-name="image"]');
    if (imageBtn) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
        imageBtn.click()
      ]);

      if (fileChooser) {
        await fileChooser.setFiles(absolutePath);
        await page.waitForTimeout(3000);
        return true;
      }
    }
    return false;
  } catch (error) {
    await page.keyboard.press('Escape');
    return false;
  }
}

// 글자색 변경하여 텍스트 입력 (광고 대가성 문구용)
async function insertDisclosure(page, mainFrame, text) {
  try {
    // 글자색 버튼 클릭
    const fontColorBtn = await mainFrame.$('button[data-name="fontColor"]');
    if (fontColorBtn) {
      await fontColorBtn.click();
      await page.waitForTimeout(800);

      // 회색 계열 색상 선택 (보통 팔레트에서 회색 선택)
      const colorOptions = await mainFrame.$$('.se-palette-item, .se-color-item, button[data-color]');
      if (colorOptions.length > 0) {
        // 회색 계열 찾기 (보통 8-15번째 정도가 회색 계열)
        const grayIndex = Math.min(10, colorOptions.length - 1);
        await colorOptions[grayIndex].click();
        await page.waitForTimeout(300);
      } else {
        await page.keyboard.press('Escape');
      }
    }

    // 대가성 문구 입력
    await page.keyboard.type(text, { delay: 20 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // 글자색 다시 기본(검정)으로 변경
    const fontColorBtnReset = await mainFrame.$('button[data-name="fontColor"]');
    if (fontColorBtnReset) {
      await fontColorBtnReset.click();
      await page.waitForTimeout(500);

      // 검정색 선택 (보통 첫번째)
      const colorOptionsReset = await mainFrame.$$('.se-palette-item, .se-color-item, button[data-color]');
      if (colorOptionsReset.length > 0) {
        await colorOptionsReset[0].click();
        await page.waitForTimeout(300);
      } else {
        await page.keyboard.press('Escape');
      }
    }

    return true;
  } catch (e) {
    // 실패 시 그냥 일반 텍스트로 입력
    await page.keyboard.type(text, { delay: 20 });
    await page.keyboard.press('Enter');
    return false;
  }
}

// ============================================
// 메인 함수
// ============================================
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║    네이버 블로그 자동 작성 프로그램    ║');
  console.log('║         Shopping Connect Edition       ║');
  console.log('╚════════════════════════════════════════╝\n');

  // 환경 변수 체크
  if (!NAVER_ID || !NAVER_PW) {
    console.error('❌ 오류: .env 파일에 NAVER_ID와 NAVER_PW를 설정해주세요.');
    await askQuestion('\n엔터를 누르면 종료됩니다...');
    return;
  }

  // 상품 링크 입력
  const productUrl = await askQuestion('상품 링크를 입력하세요: ');

  if (!productUrl || !productUrl.includes('naver.com')) {
    console.error('❌ 올바른 네이버 상품 링크를 입력해주세요.');
    await askQuestion('\n엔터를 누르면 종료됩니다...');
    return;
  }

  console.log('\n프로그램을 시작합니다...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 20
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    // 네이버 로그인
    console.log('네이버 로그인 중...');
    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('#id');
    await page.keyboard.type(NAVER_ID, { delay: 50 });
    await page.click('#pw');
    await page.keyboard.type(NAVER_PW, { delay: 50 });
    await page.click('#log\\.login');
    await page.waitForTimeout(3000);
    console.log('로그인 완료!\n');

    // 제품 정보 스크래핑
    const productInfo = await scrapeProductInfo(page, productUrl);

    // 이미지 다운로드 및 처리
    const processedImages = await downloadAndProcessImages(productInfo.imageUrls);

    // 블로그 콘텐츠 생성
    console.log('\n[3/4] 블로그 콘텐츠 생성 중...');
    const blogContent = generateBlogContent(productInfo);
    console.log(`  제목: ${blogContent.title}`);

    // 블로그 글쓰기 페이지로 이동
    console.log('\n[4/4] 블로그 글 작성 중...');
    await page.goto(BLOG_WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const mainFrame = page.frame('mainFrame');
    if (!mainFrame) {
      throw new Error('블로그 에디터를 찾을 수 없습니다.');
    }

    // 팝업 닫기 - "작성중인 글" 팝업에서 취소 클릭
    await page.waitForTimeout(2000);
    try {
      // "작성중인 글이 있습니다" 팝업 - 취소 버튼 클릭 (새 글 작성)
      const cancelBtn = await mainFrame.$('.se-popup-button-cancel, button.se-popup-cancel, .se-popup-alert button:first-child');
      if (cancelBtn) {
        await cancelBtn.click();
        console.log('  이전 글 취소됨 (새 글 작성)');
        await page.waitForTimeout(1000);
      }

      // 다른 팝업들 닫기
      const helpCloseBtn = await mainFrame.$('button.se-help-panel-close-button');
      if (helpCloseBtn) await helpCloseBtn.click();
      await page.keyboard.press('Escape');
    } catch (e) {}

    // 제목 입력
    const titleArea = await mainFrame.$('.se-documentTitle .se-text-paragraph');
    if (titleArea) {
      await titleArea.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(blogContent.title, { delay: 30 });
    }

    await page.waitForTimeout(500);

    // 본문 영역으로 이동
    const contentArea = await mainFrame.$('.se-component.se-text .se-text-paragraph');
    if (contentArea) await contentArea.click();
    await page.waitForTimeout(500);

    // 본문 작성
    let imageIndex = 0;
    for (const section of blogContent.sections) {
      switch (section.type) {
        case 'disclosure':
          // 광고 대가성 문구 - 다른 색상으로 입력
          await insertDisclosure(page, mainFrame, section.content);
          break;
        case 'image_marker':
          if (imageIndex < processedImages.length) {
            await uploadImage(page, mainFrame, processedImages[imageIndex]);
            imageIndex++;
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
        case 'text':
        default:
          await page.keyboard.type(section.content, { delay: 15 });
          await page.keyboard.press('Enter');
          break;
      }
      await page.waitForTimeout(100);
    }

    // 패널 닫기
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 발행 버튼 클릭
    console.log('\n발행 설정 화면으로 이동...');
    const publishBtn = await mainFrame.$('button.publish_btn__Y5YlZ, button[class*="publish"]');
    if (publishBtn) {
      await publishBtn.click();
      await page.waitForTimeout(2000);
    }

    // 해시태그 입력
    console.log('해시태그 입력 중...');
    const hashtagInput = await mainFrame.$('input[placeholder*="태그"], input[placeholder*="해시태그"], .tag_input input');
    if (hashtagInput) {
      for (const tag of blogContent.hashtags) {
        await hashtagInput.click();
        await page.waitForTimeout(200);
        await page.keyboard.type(tag, { delay: 30 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
      }
    }

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         ✅ 글 작성이 완료되었습니다!      ║');
    console.log('╠════════════════════════════════════════╣');
    console.log('║  브라우저에서 내용을 확인하고           ║');
    console.log('║  [발행] 버튼을 클릭해주세요.            ║');
    console.log('╚════════════════════════════════════════╝\n');

    // 사용자가 완료할 때까지 대기
    await askQuestion('발행 완료 후 엔터를 누르면 프로그램이 종료됩니다...');

    await browser.close();
    console.log('\n프로그램을 종료합니다. 감사합니다! 👋');

  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    await browser.close();
    await askQuestion('\n엔터를 누르면 종료됩니다...');
  }
}

main();
