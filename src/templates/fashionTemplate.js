/**
 * 패션 카테고리 블로그 원고 템플릿
 */

import { config } from '../../config/config.js';

/**
 * 패션 원고 템플릿 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 생성 옵션
 * @returns {Object} 템플릿 구조
 */
export function createFashionTemplate(product, options = {}) {
  const {
    season = getCurrentSeason(),
    style = '캐주얼',
    targetAge = '20-30대',
    bodyType = null
  } = options;

  return {
    category: 'fashion',
    structure: {
      title: generateFashionTitle(product, { season, style }),
      sections: [
        {
          type: 'intro_image',
          description: generateIntroImageDescription(product, 'fashion')
        },
        {
          type: 'section',
          title: '이 옷을 선택한 이유',
          contentGuide: generatePurchaseReasonGuide(product, { season, style })
        },
        {
          type: 'wearing_image',
          description: generateWearingImageDescription(product)
        },
        {
          type: 'section',
          title: '실제 착용 후기',
          contentGuide: generateWearingReviewGuide(product, { bodyType })
        },
        {
          type: 'section',
          title: '다양한 코디 제안',
          contentGuide: generateStylingGuide(product, { style, targetAge })
        },
        {
          type: 'detail_image',
          description: generateDetailImageDescription(product, 'fashion')
        },
        {
          type: 'section',
          title: '장단점 솔직 정리',
          contentGuide: generateProsConsGuide(product)
        },
        {
          type: 'section',
          title: '이런 분께 추천해요',
          contentGuide: generateRecommendationGuide(product, { targetAge, bodyType }),
          includeCTA: true
        },
        {
          type: 'closing_image',
          description: generateClosingImageDescription(product, 'fashion')
        }
      ]
    },
    seo: {
      keywords: extractFashionKeywords(product, { season, style }),
      tags: generateFashionTags(product, { season, style })
    }
  };
}

/**
 * 현재 계절 반환
 * @returns {string} 계절
 */
function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return '봄';
  if (month >= 6 && month <= 8) return '여름';
  if (month >= 9 && month <= 11) return '가을';
  return '겨울';
}

/**
 * 패션 제목 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {string} 제목
 */
function generateFashionTitle(product, options) {
  const templates = [
    `${options.season} ${product.name} 솔직 리뷰 | ${product.brand || ''} 실착 후기`,
    `${product.name} 한 달 착용 후기 | ${options.style} 코디 추천`,
    `${product.brand || '가성비'} ${product.name} 리뷰 | 실제 착용샷 공개`,
    `${options.season} 필수템! ${product.name} 솔직 후기 (사이즈/핏감 총정리)`
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * 도입부 이미지 묘사 생성
 * @param {Object} product - 제품 데이터
 * @param {string} category - 카테고리
 * @returns {string} 이미지 묘사
 */
function generateIntroImageDescription(product, category) {
  const styles = config.imageDescription.styles[category];
  const scenarios = [
    `(택배 박스를 개봉하며 설레는 표정으로 카메라를 바라보는 모습, 거실 소파에 앉아 ${styles.lighting[0]}이 들어오는 오후 시간대, 상반신이 보이는 중간 거리 샷)`,
    `(${product.name}이 담긴 쇼핑백을 들고 현관에서 촬영한 모습, ${styles.lighting[1]}으로 밝은 분위기, 전신이 보이는 거리)`,
    `(옷걸이에 걸린 ${product.name}을 배경으로 손으로 가리키는 포즈, ${styles.backgrounds[0]}, ${styles.angles[2]})`
  ];

  return scenarios[Math.floor(Math.random() * scenarios.length)];
}

/**
 * 착용샷 이미지 묘사 생성
 * @param {Object} product - 제품 데이터
 * @returns {string} 이미지 묘사
 */
function generateWearingImageDescription(product) {
  const scenarios = [
    `(${product.name}을 착용하고 전신 거울 앞에서 촬영한 모습, 자연광이 들어오는 창가, 정면과 측면 두 컷)`,
    `(실제 착용한 모습을 45도 각도에서 촬영, 화이트톤 인테리어 배경, 핏감이 잘 드러나는 포즈)`,
    `(야외에서 착용샷, 카페 앞 또는 거리에서 자연스러운 포즈, 전신과 상반신 컷)`
  ];

  return scenarios[Math.floor(Math.random() * scenarios.length)];
}

/**
 * 디테일 이미지 묘사 생성
 * @param {Object} product - 제품 데이터
 * @param {string} category - 카테고리
 * @returns {string} 이미지 묘사
 */
function generateDetailImageDescription(product, category) {
  return `(${product.name}의 소재감과 디테일을 보여주는 클로즈업 컷, 라벨/택/마감 처리 부분, 손으로 소재를 만지는 모습, 자연광 아래에서 질감이 잘 드러나도록 촬영)`;
}

/**
 * 마무리 이미지 묘사 생성
 * @param {Object} product - 제품 데이터
 * @param {string} category - 카테고리
 * @returns {string} 이미지 묘사
 */
function generateClosingImageDescription(product, category) {
  return `(${product.name}을 착용하고 만족스러운 표정으로 거울을 보는 모습, 또는 옷을 정리하며 마무리하는 자연스러운 일상 컷, 따뜻한 톤의 간접조명)`;
}

/**
 * 구매 이유 가이드 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {Object} 콘텐츠 가이드
 */
function generatePurchaseReasonGuide(product, options) {
  return {
    points: [
      `${options.season}에 입을 옷을 찾다가 발견`,
      `${product.brand || '이 브랜드'}가 요즘 핫해서 관심 있었음`,
      `리뷰 보니 핏감이 좋다고 해서 구매 결심`,
      `가격 대비 퀄리티가 좋다는 후기에 혹해서`
    ],
    tone: '공감 유도, 비슷한 고민을 가진 독자와 연결',
    length: '150-200자'
  };
}

/**
 * 착용 리뷰 가이드 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {Object} 콘텐츠 가이드
 */
function generateWearingReviewGuide(product, options) {
  return {
    points: [
      '핏감 (슬림핏/레귤러핏/오버핏)',
      '소재감 (부드러움/뻣뻣함/두께)',
      '사이즈 팁 (평소 사이즈 대비)',
      '착용감 (편안함/활동성)',
      options.bodyType ? `${options.bodyType} 체형 기준 후기` : '체형별 추천 사이즈'
    ],
    tone: '솔직하고 구체적인 묘사',
    length: '250-350자',
    mustInclude: ['실제 착용한 사이즈', '평소 사이즈 정보']
  };
}

/**
 * 스타일링 가이드 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {Object} 콘텐츠 가이드
 */
function generateStylingGuide(product, options) {
  return {
    styles: [
      { name: '데일리룩', description: '편하게 입기 좋은 일상 코디' },
      { name: '오피스룩', description: '출근할 때 입기 좋은 깔끔한 스타일' },
      { name: '데이트룩', description: '약속 있을 때 예쁘게 입는 코디' }
    ],
    tone: '실용적인 조합 추천',
    length: '200-250자',
    format: '스타일별 소제목 + 아이템 조합 설명'
  };
}

/**
 * 장단점 가이드 생성
 * @param {Object} product - 제품 데이터
 * @returns {Object} 콘텐츠 가이드
 */
function generateProsConsGuide(product) {
  return {
    format: {
      pros: ['장점 1', '장점 2', '장점 3'],
      cons: ['아쉬운 점 1', '아쉬운 점 2 (선택)']
    },
    examples: {
      pros: [
        '핏감이 정말 예뻐요',
        '가격 대비 퀄리티가 좋아요',
        '다양한 코디에 활용 가능해요',
        '세탁해도 변형이 없어요',
        '색감이 화면과 똑같아요'
      ],
      cons: [
        '사이즈가 조금 작게 나와요',
        '주름이 잘 생겨요',
        '단독 세탁 필요해요',
        '배송이 조금 느렸어요'
      ]
    },
    tone: '솔직한 후기, 신뢰감 형성',
    length: '150-200자',
    important: '장점만 나열하면 광고처럼 보임, 단점 1-2개 필수'
  };
}

/**
 * 추천 대상 가이드 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {Object} 콘텐츠 가이드
 */
function generateRecommendationGuide(product, options) {
  return {
    targets: [
      `${options.targetAge} 여성분들`,
      '데일리 아이템 찾으시는 분',
      '가성비 좋은 옷 원하시는 분'
    ],
    cta: {
      text: '구매 링크는 아래에서 확인하세요!',
      linkPlaceholder: '[제품 구매 링크]'
    },
    tone: '자연스러운 구매 유도',
    length: '100-150자'
  };
}

/**
 * 패션 키워드 추출
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {string[]} 키워드 목록
 */
function extractFashionKeywords(product, options) {
  const keywords = [
    product.name,
    product.brand,
    options.season,
    `${options.season} 코디`,
    `${product.name} 후기`,
    `${product.name} 리뷰`,
    options.style,
    '데일리룩',
    '여성 패션'
  ].filter(Boolean);

  return [...new Set(keywords)];
}

/**
 * 패션 태그 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 옵션
 * @returns {string[]} 태그 목록
 */
function generateFashionTags(product, options) {
  const tags = [
    product.name?.replace(/\s+/g, ''),
    product.brand,
    `${options.season}코디`,
    `${options.season}패션`,
    '데일리룩',
    '오오티디',
    'OOTD',
    '패션스타그램',
    '코디추천',
    options.style
  ].filter(Boolean);

  return [...new Set(tags)].slice(0, config.seo.maxTags);
}

export default {
  createFashionTemplate,
  getCurrentSeason
};
