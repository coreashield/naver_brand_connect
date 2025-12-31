/**
 * 프로젝트 설정 파일
 */

export const config = {
  // 카테고리 설정
  categories: {
    fashion: {
      name: '패션',
      subcategories: ['의류', '가방', '신발', '액세서리'],
      keywords: ['코디', '스타일링', '착용샷', '사이즈', '핏감']
    },
    it: {
      name: 'IT',
      subcategories: ['이어폰', '스마트워치', '태블릿', '가전', '스마트폰'],
      keywords: ['스펙', '성능', '배터리', '사용감', '가성비']
    }
  },

  // 원고 설정
  content: {
    minLength: 1500,
    maxLength: 2000,
    keywordDensity: {
      min: 0.01,
      max: 0.03
    }
  },

  // 상품 선택 기준
  productSelection: {
    minReviewCount: 50,
    minRating: 4.0,
    priceRange: {
      fashion: { min: 10000, max: 200000 },
      it: { min: 20000, max: 500000 }
    }
  },

  // SEO 설정
  seo: {
    titleMaxLength: 60,
    descriptionMaxLength: 160,
    maxTags: 10
  },

  // 출력 설정
  output: {
    directory: './output',
    fileNameFormat: '원고_{date}_{productName}.md'
  },

  // 이미지 묘사 설정
  imageDescription: {
    positions: ['intro', 'detail', 'usage', 'closing'],
    styles: {
      fashion: {
        angles: ['전신샷', '상반신', '클로즈업', '45도 각도'],
        lighting: ['자연광', '간접조명', '스튜디오'],
        backgrounds: ['화이트톤 인테리어', '거울 앞', '야외']
      },
      it: {
        angles: ['정면', '측면', '45도 위에서', '손에 든 모습'],
        lighting: ['자연광', '소프트박스', '간접조명'],
        backgrounds: ['깔끔한 데스크', '흰색 배경', '실제 사용 환경']
      }
    }
  },

  // 심리 트리거 설정
  psychologyTriggers: {
    scarcity: [
      '품절 임박이라 서둘러 구매했어요',
      '인기 상품이라 재입고 알림 걸어두는 걸 추천',
      '시즌 한정이라 지금 아니면 구하기 어려울 수도'
    ],
    socialProof: [
      '리뷰 {reviewCount}개 넘는 인기템',
      '주변에서도 다들 쓰더라고요',
      '{sales}개 이상 팔린 베스트셀러'
    ],
    authority: [
      '전문가들도 추천하는',
      '{certification} 인증 받은 제품',
      '유명 유튜버들 사이에서 화제인'
    ],
    urgency: [
      '지금 할인 중이라 더 좋은 타이밍',
      '이 가격에 만나기 쉽지 않아요',
      '프로모션 기간 놓치지 마세요'
    ],
    story: [
      '저도 처음엔 반신반의했는데',
      '솔직히 기대 안 했는데 대박',
      '진작 살걸 후회한 템'
    ]
  }
};

export default config;
