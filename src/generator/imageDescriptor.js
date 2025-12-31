/**
 * 이미지 묘사 생성 모듈
 * 블로그 원고에 삽입할 이미지 촬영 가이드 생성
 */

import { config } from '../../config/config.js';

/**
 * 이미지 묘사 세트 생성
 * @param {Object} product - 제품 데이터
 * @param {string} category - 카테고리 ('fashion' | 'it')
 * @returns {Object} 이미지 묘사 세트
 */
export function generateImageDescriptions(product, category) {
  const styles = config.imageDescription.styles[category];

  if (!styles) {
    return generateGenericImageDescriptions(product);
  }

  if (category === 'fashion') {
    return generateFashionImages(product, styles);
  } else {
    return generateITImages(product, styles);
  }
}

/**
 * 패션 카테고리 이미지 묘사 세트
 * @param {Object} product - 제품 데이터
 * @param {Object} styles - 스타일 설정
 * @returns {Object} 이미지 묘사
 */
function generateFashionImages(product, styles) {
  const productName = product.name || '제품';

  return {
    intro: selectRandom([
      `(택배 박스를 개봉하며 설레는 표정, 거실 소파에서 ${styles.lighting[0]}이 들어오는 오후, 상반신 중간 거리 샷)`,
      `(${productName}이 담긴 쇼핑백을 들고 현관에서 촬영, ${styles.lighting[1]}으로 밝은 분위기)`,
      `(옷걸이에 걸린 ${productName}을 ${styles.angles[3]}에서 촬영, ${styles.backgrounds[0]})`
    ]),

    wearing: selectRandom([
      `(${productName} 착용하고 ${styles.angles[0]} 거울 앞에서 촬영, ${styles.lighting[0]}이 들어오는 창가, 핏감이 잘 보이는 포즈)`,
      `(실제 착용 모습 ${styles.angles[3]}에서 촬영, ${styles.backgrounds[0]} 배경, 정면과 측면 두 컷)`,
      `(야외 착용샷, 카페 앞에서 자연스러운 포즈, ${styles.angles[0]}과 ${styles.angles[1]} 컷)`
    ]),

    detail: selectRandom([
      `(${productName}의 소재감과 디테일 ${styles.angles[2]}, 라벨/택/마감 부분, ${styles.lighting[0]}에서 질감이 드러나도록)`,
      `(손으로 소재를 만지는 모습, ${styles.angles[2]}으로 촬영, 봉제선과 마감 디테일)`,
      `(${productName} 태그와 케어라벨, 소재 혼용률이 보이는 클로즈업 샷)`
    ]),

    styling: selectRandom([
      `(${productName}을 활용한 코디 전신샷, ${styles.backgrounds[1]} 앞에서 포즈, 함께 매치한 아이템들이 잘 보이도록)`,
      `(다양한 코디 조합 3가지를 한 컷에, ${styles.backgrounds[0]}에서 나란히 배치)`,
      `(TPO별 스타일링 - 캐주얼/오피스/데이트 각각 다른 코디로 촬영)`
    ]),

    closing: selectRandom([
      `(${productName} 착용하고 만족스러운 표정으로 거울 보는 모습, ${styles.lighting[2]}의 따뜻한 분위기)`,
      `(옷을 정리하며 마무리하는 자연스러운 일상 컷, ${styles.backgrounds[0]})`,
      `(오늘의 OOTD 완성! 느낌으로 포즈 잡은 전신샷, ${styles.lighting[0]})`
    ])
  };
}

/**
 * IT 카테고리 이미지 묘사 세트
 * @param {Object} product - 제품 데이터
 * @param {Object} styles - 스타일 설정
 * @returns {Object} 이미지 묘사
 */
function generateITImages(product, styles) {
  const productName = product.name || '제품';

  return {
    unboxing: selectRandom([
      `(${productName} 박스 개봉 모습, ${styles.backgrounds[0]} 위에서 구성품을 하나씩 꺼내는 장면, ${styles.lighting[0]})`,
      `(제품 박스와 구성품 플랫레이 샷, ${styles.backgrounds[1]}, ${styles.angles[2]}로 촬영)`,
      `(택배 개봉하며 기대감 있는 표정, ${productName} 박스가 보이는 구도)`
    ]),

    product: selectRandom([
      `(${productName}을 ${styles.angles[0]}/${styles.angles[1]}/${styles.angles[2]} 다양한 각도에서, ${styles.backgrounds[0]}에서 디테일이 잘 보이도록)`,
      `(${styles.angles[3]}으로 크기감을 보여주는 샷, ${styles.backgrounds[1]} 배경)`,
      `(제품의 버튼/포트/디자인 요소 클로즈업, ${styles.lighting[1]}으로 선명하게)`
    ]),

    usage: selectRandom([
      `(${productName}을 ${styles.backgrounds[2]}에서 실제 사용하는 모습, 자연스러운 일상 장면)`,
      `(사용자 시점에서 ${productName} 활용하는 모습, 손에 든 채로 화면/기능 보여주기)`,
      `(${productName}을 착용/사용 중인 모습, ${styles.lighting[0]}에서 촬영)`
    ]),

    comparison: selectRandom([
      `(${productName}과 경쟁 제품을 나란히 놓고 비교하는 샷, ${styles.backgrounds[0]} 위에서)`,
      `(크기 비교를 위해 손이나 일상 물건과 함께 촬영, 스케일감 표현)`,
      `(스펙 비교표와 함께 실물 사진을 나란히 배치한 구성)`
    ]),

    closing: selectRandom([
      `(${productName}을 ${styles.backgrounds[0]}에 세팅해둔 모습, ${styles.lighting[2]}으로 마무리 분위기)`,
      `(손에 들고 만족스러운 표정, 제품의 전체 모습이 보이는 구도)`,
      `(일상에서 ${productName}을 활용하는 자연스러운 마무리 컷)`
    ])
  };
}

/**
 * 일반 이미지 묘사 세트 (카테고리 없을 때)
 * @param {Object} product - 제품 데이터
 * @returns {Object} 이미지 묘사
 */
function generateGenericImageDescriptions(product) {
  const productName = product.name || '제품';

  return {
    intro: `(${productName} 언박싱 장면, 밝은 자연광 아래에서 박스를 개봉하는 모습)`,
    product: `(${productName}을 다양한 각도에서 촬영, 정면/측면/디테일 컷)`,
    usage: `(${productName}을 실제 사용하는 모습, 일상적인 환경에서)`,
    closing: `(${productName}과 함께하는 마무리 컷, 만족스러운 분위기)`
  };
}

/**
 * 배열에서 랜덤 선택
 * @param {Array} arr - 배열
 * @returns {*} 선택된 항목
 */
function selectRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 이미지 묘사를 원고에 삽입할 형태로 포맷팅
 * @param {string} description - 이미지 묘사
 * @returns {string} 포맷팅된 이미지 묘사
 */
export function formatImageDescription(description) {
  // 이미 괄호로 감싸져 있으면 그대로 반환
  if (description.startsWith('(') && description.endsWith(')')) {
    return `\n${description}\n`;
  }
  return `\n(${description})\n`;
}

/**
 * 이미지 위치별 묘사 생성
 * @param {Object} product - 제품 데이터
 * @param {string} category - 카테고리
 * @param {string} position - 위치 ('intro' | 'detail' | 'usage' | 'closing')
 * @returns {string} 이미지 묘사
 */
export function getImageDescriptionByPosition(product, category, position) {
  const descriptions = generateImageDescriptions(product, category);
  return descriptions[position] || descriptions.product || descriptions.intro;
}

export default {
  generateImageDescriptions,
  formatImageDescription,
  getImageDescriptionByPosition
};
