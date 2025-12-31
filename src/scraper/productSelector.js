/**
 * 자동 상품 선택 모듈
 * 이전에 작성하지 않은 제품 중 최적의 제품을 자동 선택
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../../config/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_PATH = join(__dirname, '../../data/writtenProducts.json');

/**
 * 작성된 제품 목록 로드
 * @returns {Object} 작성된 제품 데이터
 */
export function loadWrittenProducts() {
  try {
    if (existsSync(DATA_PATH)) {
      const data = readFileSync(DATA_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('작성된 제품 데이터 로드 실패:', error.message);
  }
  return { products: [], lastUpdated: null };
}

/**
 * 작성된 제품 목록 저장
 * @param {Object} data - 저장할 데이터
 */
export function saveWrittenProducts(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('작성된 제품 데이터 저장 실패:', error.message);
  }
}

/**
 * 제품이 이미 작성되었는지 확인
 * @param {string} productId - 제품 ID
 * @returns {boolean} 작성 여부
 */
export function isProductWritten(productId) {
  const data = loadWrittenProducts();
  return data.products.some(p => p.id === productId);
}

/**
 * 작성 완료된 제품 등록
 * @param {Object} productInfo - 제품 정보
 */
export function markProductAsWritten(productInfo) {
  const data = loadWrittenProducts();
  data.products.push({
    id: productInfo.id,
    name: productInfo.name,
    category: productInfo.category,
    writtenAt: new Date().toISOString(),
    outputFile: productInfo.outputFile || null
  });
  saveWrittenProducts(data);
}

/**
 * 오늘의 카테고리 결정 (패션/IT 교차)
 * @returns {string} 오늘 작성할 카테고리
 */
export function getTodayCategory() {
  const data = loadWrittenProducts();
  const recentProducts = data.products.slice(-7); // 최근 7개

  // 최근 카테고리 분포 확인
  const fashionCount = recentProducts.filter(p => p.category === 'fashion').length;
  const itCount = recentProducts.filter(p => p.category === 'it').length;

  // 적은 쪽 우선, 같으면 날짜 기준 교차
  if (fashionCount !== itCount) {
    return fashionCount < itCount ? 'fashion' : 'it';
  }

  // 날짜 기준 교차 (짝수일: 패션, 홀수일: IT)
  const day = new Date().getDate();
  return day % 2 === 0 ? 'fashion' : 'it';
}

/**
 * 제품 점수 계산 (선택 우선순위)
 * @param {Object} product - 제품 데이터
 * @returns {number} 점수
 */
export function calculateProductScore(product) {
  let score = 0;

  // 리뷰 수 점수 (최대 30점)
  const reviewScore = Math.min(product.reviews?.count || 0, 1000) / 1000 * 30;
  score += reviewScore;

  // 평점 점수 (최대 25점)
  const ratingScore = ((product.reviews?.rating || 0) / 5) * 25;
  score += ratingScore;

  // 할인율 점수 (최대 20점)
  const discountScore = Math.min(product.discountRate || 0, 50) / 50 * 20;
  score += discountScore;

  // 가격대 적절성 점수 (최대 15점)
  const priceRange = config.productSelection.priceRange[product.category] ||
                     { min: 10000, max: 300000 };
  const price = product.price || 0;
  if (price >= priceRange.min && price <= priceRange.max) {
    // 중간 가격대가 가장 높은 점수
    const mid = (priceRange.min + priceRange.max) / 2;
    const deviation = Math.abs(price - mid) / mid;
    score += (1 - Math.min(deviation, 1)) * 15;
  }

  // 이미지 수 점수 (최대 10점)
  const imageScore = Math.min((product.images?.length || 0), 10) / 10 * 10;
  score += imageScore;

  return Math.round(score * 100) / 100;
}

/**
 * 후보 제품 목록에서 최적 제품 선택
 * @param {Array} candidateProducts - 후보 제품 목록
 * @param {string} targetCategory - 목표 카테고리 (optional)
 * @returns {Object|null} 선택된 제품
 */
export function selectBestProduct(candidateProducts, targetCategory = null) {
  if (!candidateProducts || candidateProducts.length === 0) {
    return null;
  }

  // 이미 작성된 제품 필터링
  const writtenIds = new Set(loadWrittenProducts().products.map(p => p.id));
  let availableProducts = candidateProducts.filter(p => !writtenIds.has(p.id));

  if (availableProducts.length === 0) {
    console.log('모든 후보 제품이 이미 작성되었습니다.');
    return null;
  }

  // 카테고리 필터링 (지정된 경우)
  if (targetCategory) {
    const categoryFiltered = availableProducts.filter(p => p.category === targetCategory);
    if (categoryFiltered.length > 0) {
      availableProducts = categoryFiltered;
    }
  }

  // 최소 기준 충족 필터링
  const criteria = config.productSelection;
  const qualifiedProducts = availableProducts.filter(p => {
    const reviewCount = p.reviews?.count || 0;
    const rating = p.reviews?.rating || 0;
    return reviewCount >= criteria.minReviewCount && rating >= criteria.minRating;
  });

  // 기준 충족 제품이 있으면 그 중에서, 없으면 전체에서 선택
  const selectionPool = qualifiedProducts.length > 0 ? qualifiedProducts : availableProducts;

  // 점수 계산 및 정렬
  const scoredProducts = selectionPool.map(p => ({
    ...p,
    score: calculateProductScore(p)
  })).sort((a, b) => b.score - a.score);

  // 상위 제품 중 랜덤 선택 (다양성 확보)
  const topProducts = scoredProducts.slice(0, Math.min(3, scoredProducts.length));
  const randomIndex = Math.floor(Math.random() * topProducts.length);

  return topProducts[randomIndex];
}

/**
 * 서브카테고리 로테이션
 * @param {string} mainCategory - 메인 카테고리 ('fashion' | 'it')
 * @returns {string} 오늘의 서브카테고리
 */
export function getTodaySubcategory(mainCategory) {
  const subcategories = config.categories[mainCategory]?.subcategories || [];
  if (subcategories.length === 0) return null;

  const data = loadWrittenProducts();
  const recentInCategory = data.products
    .filter(p => p.category === mainCategory)
    .slice(-subcategories.length);

  // 최근 사용된 서브카테고리 확인
  const usedSubcategories = new Set();
  recentInCategory.forEach(p => {
    if (p.subcategory) usedSubcategories.add(p.subcategory);
  });

  // 사용되지 않은 서브카테고리 우선
  const unusedSubcategories = subcategories.filter(sc => !usedSubcategories.has(sc));
  if (unusedSubcategories.length > 0) {
    return unusedSubcategories[Math.floor(Math.random() * unusedSubcategories.length)];
  }

  // 모두 사용됐으면 랜덤
  return subcategories[Math.floor(Math.random() * subcategories.length)];
}

/**
 * 일일 제품 선택 요약 생성
 * @returns {Object} 오늘의 선택 가이드
 */
export function getDailySelectionGuide() {
  const category = getTodayCategory();
  const subcategory = getTodaySubcategory(category);
  const data = loadWrittenProducts();

  return {
    date: new Date().toISOString().split('T')[0],
    targetCategory: category,
    targetSubcategory: subcategory,
    categoryName: config.categories[category]?.name || category,
    totalWritten: data.products.length,
    recentWritten: data.products.slice(-5).map(p => ({
      name: p.name,
      category: p.category,
      writtenAt: p.writtenAt
    })),
    selectionCriteria: config.productSelection,
    recommendedKeywords: config.categories[category]?.keywords || []
  };
}

/**
 * 작성 통계 조회
 * @returns {Object} 통계 데이터
 */
export function getWritingStats() {
  const data = loadWrittenProducts();
  const products = data.products;

  const stats = {
    total: products.length,
    byCategory: {},
    byMonth: {},
    recentWeek: 0
  };

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  products.forEach(p => {
    // 카테고리별 통계
    stats.byCategory[p.category] = (stats.byCategory[p.category] || 0) + 1;

    // 월별 통계
    const month = p.writtenAt?.substring(0, 7) || 'unknown';
    stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;

    // 최근 1주일 통계
    if (p.writtenAt && new Date(p.writtenAt) > oneWeekAgo) {
      stats.recentWeek++;
    }
  });

  return stats;
}

export default {
  loadWrittenProducts,
  saveWrittenProducts,
  isProductWritten,
  markProductAsWritten,
  getTodayCategory,
  calculateProductScore,
  selectBestProduct,
  getTodaySubcategory,
  getDailySelectionGuide,
  getWritingStats
};
