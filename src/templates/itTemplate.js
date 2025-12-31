/**
 * IT/가젯 카테고리 블로그 원고 템플릿
 */

import { config } from '../../config/config.js';

/**
 * IT 원고 템플릿 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 생성 옵션
 * @returns {Object} 템플릿 구조
 */
export function createITTemplate(product, options = {}) {
  const {
    usagePeriod = '2주',
    targetUser = '일반 사용자',
    competitors = []
  } = options;

  return {
    category: 'it',
    structure: {
      title: generateITTitle(product, { usagePeriod, targetUser }),
      sections: [
        {
          type: 'intro_image',
          description: generateUnboxingImageDescription(product)
        },
        {
          type: 'section',
          title: '구매 전 고민했던 점',
          contentGuide: generatePurchaseConsiderationGuide(product, { competitors })
        },
        {
          type: 'product_image',
          description: generateProductImageDescription(product)
        },
        {
          type: 'section',
          title: '핵심 스펙 한눈에',
          contentGuide: generateSpecTableGuide(product)
        },
        {
          type: 'section',
          title: '실사용 테스트',
          contentGuide: generateUsageTestGuide(product, { usagePeriod })
        },
        {
          type: 'usage_image',
          description: generateUsageImageDescription(product)
        },
        {
          type: 'section',
          title: '경쟁 제품과 비교',
          contentGuide: generateComparisonGuide(product, { competitors })
        },
        {
          type: 'section',
          title: '장단점 솔직 정리',
          contentGuide: generateITProsConsGuide(product)
        },
        {
          type: 'section',
          title: '총평 및 추천 대상',
          contentGuide: generateITRecommendationGuide(product, { targetUser }),
          includeCTA: true
        },
        {
          type: 'closing_image',
          description: generateITClosingImageDescription(product)
        }
      ]
    },
    seo: {
      keywords: extractITKeywords(product, { targetUser }),
      tags: generateITTags(product)
    }
  };
}

/**
 * IT 제목 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {string} 제목
 */
function generateITTitle(product, options) {
  const templates = [
    `${product.name} ${options.usagePeriod} 실사용 리뷰 | ${options.targetUser} 추천`,
    `${product.brand || ''} ${product.name} 솔직 후기 | 장단점 총정리`,
    `${product.name} 리뷰 | 이 가격에 이 성능? 실사용 후기`,
    `${product.name} ${options.usagePeriod} 써본 후기 | 구매 전 필독!`
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * 언박싱 이미지 묘사 생성
 * @param {Object} product - 제품 데이터
 * @returns {string} 이미지 묘사
 */
function generateUnboxingImageDescription(product) {
  const scenarios = [
    `(${product.name} 박스를 개봉하는 모습, 깔끔한 데스크 위에서 구성품을 하나씩 꺼내는 장면, 자연광이 들어오는 밝은 분위기)`,
    `(제품 박스와 구성품을 한눈에 볼 수 있게 배열한 플랫레이 샷, 흰색 배경, 위에서 45도 각도로 촬영)`,
    `(택배 박스를 개봉하며 기대감 있는 표정, 제품 박스가 보이는 구도, 거실 테이블에서 촬영)`
  ];

  return scenarios[Math.floor(Math.random() * scenarios.length)];
}

/**
 * 제품 외관 이미지 묘사 생성
 * @param {Object} product - 제품 데이터
 * @returns {string} 이미지 묘사
 */
function generateProductImageDescription(product) {
  return `(${product.name}을 다양한 각도에서 촬영한 모습, 정면/측면/후면 컷, 손에 들어 크기감을 보여주는 샷, 깔끔한 배경에서 제품 디테일이 잘 보이도록)`;
}

/**
 * 사용 장면 이미지 묘사 생성
 * @param {Object} product - 제품 데이터
 * @returns {string} 이미지 묘사
 */
function generateUsageImageDescription(product) {
  return `(${product.name}을 실제로 사용하는 모습, 일상적인 환경에서 자연스럽게 활용하는 장면, 사용자 시점에서 촬영하거나 제3자 시점에서 사용 모습을 담은 컷)`;
}

/**
 * 마무리 이미지 묘사 생성
 * @param {Object} product - 제품 데이터
 * @returns {string} 이미지 묘사
 */
function generateITClosingImageDescription(product) {
  return `(${product.name}을 데스크에 세팅해둔 모습, 또는 손에 들고 만족스러운 표정을 짓는 모습, 따뜻한 톤의 조명으로 마무리 분위기)`;
}

/**
 * 구매 고려사항 가이드 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {Object} 콘텐츠 가이드
 */
function generatePurchaseConsiderationGuide(product, options) {
  return {
    points: [
      '기존에 사용하던 제품의 불편한 점',
      '새 제품에서 기대하는 기능',
      `${options.competitors.length > 0 ? '경쟁 제품들과 비교 고민' : '여러 제품 비교 고민'}`,
      '최종 선택 이유'
    ],
    tone: '공감 유도, 비슷한 고민을 가진 독자와 연결',
    length: '150-200자'
  };
}

/**
 * 스펙 테이블 가이드 생성
 * @param {Object} product - 제품 데이터
 * @returns {Object} 콘텐츠 가이드
 */
function generateSpecTableGuide(product) {
  return {
    format: 'markdown table',
    headers: ['항목', '스펙'],
    sampleRows: [
      ['제품명', product.name || ''],
      ['브랜드', product.brand || ''],
      ['가격', product.price ? `${product.price.toLocaleString()}원` : '']
    ],
    additionalSpecs: product.specs || [],
    tone: '간결하고 명확한 정보 전달',
    note: '핵심 스펙만 5-7개 정도로 정리'
  };
}

/**
 * 실사용 테스트 가이드 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {Object} 콘텐츠 가이드
 */
function generateUsageTestGuide(product, options) {
  return {
    testCategories: [
      { name: '첫인상', description: '개봉 후 첫 사용 느낌' },
      { name: '일상 사용', description: '매일 사용하면서 느낀 점' },
      { name: '성능 테스트', description: '실제 성능 수치나 체감' },
      { name: '배터리/내구성', description: '장시간 사용 시 특이사항' }
    ],
    tone: '구체적인 사용 경험, 수치가 있으면 더 좋음',
    length: '300-400자',
    usagePeriod: options.usagePeriod,
    important: '추상적인 표현보다 구체적인 상황 묘사'
  };
}

/**
 * 경쟁 제품 비교 가이드 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {Object} 콘텐츠 가이드
 */
function generateComparisonGuide(product, options) {
  return {
    format: 'comparison table or bullet points',
    compareWith: options.competitors.length > 0
      ? options.competitors
      : ['유사 가격대 경쟁 제품 1', '유사 가격대 경쟁 제품 2'],
    comparePoints: [
      '가격',
      '핵심 성능',
      '디자인',
      '부가 기능',
      '가성비'
    ],
    tone: '객관적 비교, 이 제품의 강점 부각',
    length: '150-200자',
    note: '경쟁 제품을 깎아내리지 않고 차이점 설명'
  };
}

/**
 * IT 장단점 가이드 생성
 * @param {Object} product - 제품 데이터
 * @returns {Object} 콘텐츠 가이드
 */
function generateITProsConsGuide(product) {
  return {
    format: {
      pros: ['장점 1', '장점 2', '장점 3'],
      cons: ['아쉬운 점 1', '아쉬운 점 2']
    },
    examples: {
      pros: [
        '가격 대비 성능이 뛰어나요',
        '배터리가 오래 가요',
        '디자인이 깔끔해요',
        '연결이 안정적이에요',
        '휴대성이 좋아요'
      ],
      cons: [
        '전용 앱이 조금 불편해요',
        '색상 옵션이 적어요',
        '충전 케이블이 별매예요',
        '설명서가 불친절해요'
      ]
    },
    tone: '솔직한 후기, 신뢰감 형성',
    length: '150-200자',
    important: '장점만 나열하면 광고처럼 보임, 단점 1-2개 필수'
  };
}

/**
 * IT 추천 대상 가이드 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {Object} 콘텐츠 가이드
 */
function generateITRecommendationGuide(product, options) {
  return {
    rating: {
      format: '★ 점수 / 5점',
      criteria: ['성능', '디자인', '가성비', '편의성']
    },
    targets: [
      `${options.targetUser}에게 추천`,
      '가성비 좋은 제품 찾으시는 분',
      '입문용으로 적합한 분'
    ],
    notRecommendFor: [
      '전문가급 성능이 필요하신 분',
      '특정 기능이 필수인 분'
    ],
    cta: {
      text: '구매 링크는 아래에서 확인하세요!',
      linkPlaceholder: '[제품 구매 링크]'
    },
    tone: '자연스러운 구매 유도',
    length: '150-200자'
  };
}

/**
 * IT 키워드 추출
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {string[]} 키워드 목록
 */
function extractITKeywords(product, options) {
  const keywords = [
    product.name,
    product.brand,
    `${product.name} 리뷰`,
    `${product.name} 후기`,
    `${product.brand} 추천`,
    options.targetUser,
    '가성비',
    '실사용',
    '언박싱'
  ].filter(Boolean);

  return [...new Set(keywords)];
}

/**
 * IT 태그 생성
 * @param {Object} product - 제품 데이터
 * @returns {string[]} 태그 목록
 */
function generateITTags(product) {
  const tags = [
    product.name?.replace(/\s+/g, ''),
    product.brand,
    '리뷰',
    '언박싱',
    '가성비템',
    '추천',
    '실사용후기',
    'IT기기',
    '가젯',
    '테크'
  ].filter(Boolean);

  return [...new Set(tags)].slice(0, config.seo.maxTags);
}

export default {
  createITTemplate
};
