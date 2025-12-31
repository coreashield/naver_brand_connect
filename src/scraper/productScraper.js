/**
 * 제품 정보 스크래퍼
 * Playwright MCP를 통해 네이버 쇼핑커넥트 페이지에서 제품 정보를 추출
 */

import { config } from '../../config/config.js';

/**
 * 제품 데이터 구조
 * @typedef {Object} ProductData
 * @property {string} id - 제품 고유 ID
 * @property {string} name - 제품명
 * @property {string} brand - 브랜드명
 * @property {number} price - 가격
 * @property {number} originalPrice - 원가 (할인 전)
 * @property {number} discountRate - 할인율
 * @property {string} category - 카테고리
 * @property {string} description - 제품 설명
 * @property {string[]} specs - 주요 스펙
 * @property {string[]} images - 이미지 URL 목록
 * @property {Object} reviews - 리뷰 정보
 * @property {string} affiliateLink - 제휴 링크
 * @property {string} url - 원본 URL
 */

/**
 * URL에서 제품 ID 추출
 * @param {string} url - 제품 페이지 URL
 * @returns {string} 제품 ID
 */
export function extractProductId(url) {
  // 네이버 쇼핑커넥트 URL 패턴: /products/{productId}
  const match = url.match(/products\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * 카테고리 자동 감지
 * @param {string} productName - 제품명
 * @param {string} description - 제품 설명
 * @returns {string} 감지된 카테고리 ('fashion' | 'it')
 */
export function detectCategory(productName, description = '') {
  const text = `${productName} ${description}`.toLowerCase();

  const fashionKeywords = [
    '원피스', '니트', '코트', '패딩', '자켓', '셔츠', '블라우스',
    '팬츠', '스커트', '청바지', '가방', '백', '신발', '구두',
    '스니커즈', '부츠', '악세서리', '목걸이', '귀걸이', '반지',
    '의류', '패션', '코디', '스타일', '여성복', '남성복'
  ];

  const itKeywords = [
    '이어폰', '헤드폰', '스피커', '블루투스', '무선', '충전',
    '스마트폰', '태블릿', '노트북', '키보드', '마우스', '모니터',
    '워치', '스마트워치', '밴드', '가전', '청소기', '공기청정기',
    '카메라', 'usb', '케이블', '충전기', '보조배터리'
  ];

  const fashionScore = fashionKeywords.filter(kw => text.includes(kw)).length;
  const itScore = itKeywords.filter(kw => text.includes(kw)).length;

  return fashionScore >= itScore ? 'fashion' : 'it';
}

/**
 * HTML에서 제품 정보 파싱 (Playwright MCP 결과 처리용)
 * @param {Object} pageData - Playwright에서 추출한 페이지 데이터
 * @param {string} url - 원본 URL
 * @returns {ProductData} 파싱된 제품 데이터
 */
export function parseProductData(pageData, url) {
  const productId = extractProductId(url);

  // 기본 구조 생성
  const productData = {
    id: productId,
    name: pageData.name || '',
    brand: pageData.brand || '',
    price: parsePrice(pageData.price),
    originalPrice: parsePrice(pageData.originalPrice) || null,
    discountRate: pageData.discountRate || 0,
    category: null, // 추후 detectCategory로 설정
    description: pageData.description || '',
    specs: pageData.specs || [],
    images: pageData.images || [],
    reviews: {
      count: pageData.reviewCount || 0,
      rating: pageData.rating || 0,
      summary: pageData.reviewSummary || []
    },
    affiliateLink: pageData.affiliateLink || url,
    url: url,
    scrapedAt: new Date().toISOString()
  };

  // 카테고리 자동 감지
  productData.category = detectCategory(productData.name, productData.description);

  return productData;
}

/**
 * 가격 문자열을 숫자로 변환
 * @param {string|number} priceStr - 가격 문자열
 * @returns {number} 숫자로 변환된 가격
 */
export function parsePrice(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 0;
  return parseInt(priceStr.toString().replace(/[^0-9]/g, ''), 10) || 0;
}

/**
 * 제품 정보 유효성 검증
 * @param {ProductData} productData - 제품 데이터
 * @returns {Object} 유효성 검증 결과
 */
export function validateProductData(productData) {
  const errors = [];
  const warnings = [];

  // 필수 필드 검증
  if (!productData.name) errors.push('제품명이 없습니다');
  if (!productData.price) errors.push('가격 정보가 없습니다');
  if (!productData.id) errors.push('제품 ID를 추출할 수 없습니다');

  // 선택 필드 경고
  if (!productData.description) warnings.push('제품 설명이 없습니다');
  if (productData.images.length === 0) warnings.push('이미지가 없습니다');
  if (productData.reviews.count === 0) warnings.push('리뷰가 없습니다');

  // 상품 선택 기준 검증
  const criteria = config.productSelection;
  if (productData.reviews.count < criteria.minReviewCount) {
    warnings.push(`리뷰 수가 기준(${criteria.minReviewCount}개) 미만입니다`);
  }
  if (productData.reviews.rating < criteria.minRating) {
    warnings.push(`평점이 기준(${criteria.minRating}점) 미만입니다`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Playwright MCP를 통해 스크래핑할 셀렉터 정보
 * (Claude Code에서 Playwright MCP 호출 시 참조용)
 */
export const scrapingSelectors = {
  // 네이버 쇼핑커넥트 페이지 셀렉터 (실제 페이지 구조에 따라 조정 필요)
  productName: '[class*="product_name"], [class*="ProductName"], h1, .product-title',
  brand: '[class*="brand"], [class*="Brand"], .brand-name',
  price: '[class*="price"], [class*="Price"], .sale-price, .current-price',
  originalPrice: '[class*="original"], [class*="Origin"], .original-price, .before-price',
  description: '[class*="description"], [class*="Description"], .product-description',
  specs: '[class*="spec"], [class*="Spec"], .product-spec li',
  images: '[class*="product"] img, .product-image img, .thumbnail img',
  reviewCount: '[class*="review"] [class*="count"], .review-count',
  rating: '[class*="rating"], [class*="Rating"], .star-rating',
  reviewSummary: '[class*="review"] [class*="text"], .review-text'
};

/**
 * Playwright MCP 호출을 위한 스크래핑 스크립트 생성
 * @param {string} url - 스크래핑할 URL
 * @returns {string} 실행할 스크립트
 */
export function generateScrapingScript(url) {
  return `
// Playwright MCP를 통해 실행할 스크래핑 로직
// URL: ${url}

const selectors = ${JSON.stringify(scrapingSelectors, null, 2)};

async function scrapeProduct(page) {
  const data = {};

  // 제품명
  const nameEl = await page.$(selectors.productName);
  data.name = nameEl ? await nameEl.textContent() : '';

  // 브랜드
  const brandEl = await page.$(selectors.brand);
  data.brand = brandEl ? await brandEl.textContent() : '';

  // 가격
  const priceEl = await page.$(selectors.price);
  data.price = priceEl ? await priceEl.textContent() : '';

  // 원가
  const originalPriceEl = await page.$(selectors.originalPrice);
  data.originalPrice = originalPriceEl ? await originalPriceEl.textContent() : '';

  // 설명
  const descEl = await page.$(selectors.description);
  data.description = descEl ? await descEl.textContent() : '';

  // 스펙
  const specEls = await page.$$(selectors.specs);
  data.specs = await Promise.all(specEls.map(el => el.textContent()));

  // 이미지
  const imgEls = await page.$$(selectors.images);
  data.images = await Promise.all(imgEls.map(el => el.getAttribute('src')));

  // 리뷰 수
  const reviewCountEl = await page.$(selectors.reviewCount);
  data.reviewCount = reviewCountEl ? await reviewCountEl.textContent() : '0';

  // 평점
  const ratingEl = await page.$(selectors.rating);
  data.rating = ratingEl ? await ratingEl.textContent() : '0';

  return data;
}

return scrapeProduct(page);
`;
}

export default {
  extractProductId,
  detectCategory,
  parseProductData,
  parsePrice,
  validateProductData,
  scrapingSelectors,
  generateScrapingScript
};
