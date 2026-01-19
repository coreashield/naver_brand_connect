/**
 * AI 콘텐츠 생성기
 * 다양한 스타일의 블로그/카페 글 생성
 * Gemini AI 사용
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

// 글쓰기 스타일 정의 (상품 소개 중심, 이모지 사용 안함)
const WRITING_STYLES = {
  // 1. 친근한 추천형
  friendly_recommend: {
    name: '친근한 추천',
    tone: '친근하고 대화하듯이',
    structure: '관심유도 → 상품소개 → 특징설명 → 추천대상',
    example_phrases: ['혹시 이런 거 찾고 계셨나요?', '딱 이 상품이에요', '특히 좋은 점은', '이런 분들께 추천드려요']
  },

  // 2. 전문 분석형
  expert_analysis: {
    name: '전문 분석',
    tone: '객관적이고 분석적으로',
    structure: '상품개요 → 스펙분석 → 장점정리 → 추천',
    example_phrases: ['분석해보면', '주목할 점은', '특징을 살펴보면', '종합적으로']
  },

  // 3. 스토리텔링형
  storytelling: {
    name: '스토리텔링',
    tone: '이야기를 들려주듯이',
    structure: '상황공감 → 해결책소개 → 상품특징 → 기대효과',
    example_phrases: ['이런 고민 있으셨죠?', '그래서 소개해드리는', '이 상품의 특별한 점은', '이렇게 달라질 수 있어요']
  },

  // 4. 비교 분석형
  comparison: {
    name: '비교 분석',
    tone: '꼼꼼하게 비교하며',
    structure: '기존고민 → 이상품차별점 → 비교포인트 → 선택이유',
    example_phrases: ['다른 제품과 다르게', '이 상품만의 장점', '비교해보면', '결정적인 차이는']
  },

  // 5. 감성 소개형
  emotional_intro: {
    name: '감성 소개',
    tone: '감성적이고 따뜻하게',
    structure: '공감형성 → 상품매력 → 기대효과 → 추천',
    example_phrases: ['이런 마음 아시죠?', '특별한 상품을 소개해요', '작은 변화가', '여러분께 추천드려요']
  },

  // 6. 실용 정보형
  practical_info: {
    name: '실용 정보',
    tone: '정보 전달 위주로',
    structure: '핵심정보 → 상품특징 → 활용팁 → 구매안내',
    example_phrases: ['알아두면 좋은', '이 상품의 특징은', '활용 팁을 드리면', '참고하세요']
  },

  // 7. 트렌드 소개형
  trend_intro: {
    name: '트렌드 소개',
    tone: '트렌디하고 감각적으로',
    structure: '트렌드언급 → 상품연결 → 활용법 → 추천',
    example_phrases: ['요즘 핫한', '많은 분들이 찾는', '이거 아직 모르면', '지금 바로']
  },

  // 8. 가성비 추천형
  value_recommend: {
    name: '가성비 추천',
    tone: '합리적이고 경제적으로',
    structure: '가치소개 → 구성설명 → 혜택강조 → 추천',
    example_phrases: ['가성비 좋은', '구성을 보시면', '이 가격에 이 품질', '현명한 선택']
  }
};

// 도입부 패턴 (상품 소개용)
const INTRO_PATTERNS = [
  '안녕하세요, 오늘은 {product_keyword} 소개해드릴게요.',
  '{target_audience}분들 주목! 좋은 상품 소개해드려요.',
  '요즘 이런 상품 찾고 계신 분들 많으시죠?',
  '{product_keyword} 찾으셨다면 이 글 주목해주세요!',
  '{season}에 딱 맞는 상품 추천드릴게요.',
  '{product_keyword} 상품 정보 정리해봤어요.',
  '{target_audience}를 위한 추천 상품!',
  '많은 분들이 찾으시는 {product_keyword} 소개합니다.',
];

// 계절/시기 관련
function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return '봄';
  if (month >= 6 && month <= 8) return '여름';
  if (month >= 9 && month <= 11) return '가을';
  return '겨울';
}

// 랜덤 선택 헬퍼
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 상품 정보 기반 프롬프트 생성
 */
function buildPrompt(productInfo, style, platform = 'blog') {
  const styleConfig = WRITING_STYLES[style];

  // 기본값 설정
  const name = productInfo.name || '추천 상품';
  const keywords = productInfo.keywords || [];
  const brand = productInfo.brand || productInfo.manufacturer || '';
  const price = productInfo.price ? `${productInfo.price.toLocaleString()}원` : '';
  const originalPrice = productInfo.originalPrice ? `${productInfo.originalPrice.toLocaleString()}원` : '';
  const rating = productInfo.rating || '';
  const reviewCount = productInfo.reviewCount || '';
  const targetAudience = productInfo.targetAudience || { persona: '일반 소비자' };

  // 플랫폼별 길이 설정
  const lengthGuide = platform === 'blog'
    ? '2500-3500자 분량으로'
    : '800-1200자 분량으로 간결하게';

  // 할인 정보
  const discountInfo = (originalPrice && price)
    ? `원가 ${originalPrice}에서 ${price}로 할인 중`
    : price ? `가격 ${price}` : '';

  // 평점 정보
  const ratingInfo = rating
    ? `평점 ${rating}점${reviewCount ? `, 리뷰 ${reviewCount.toLocaleString()}개` : ''}`
    : '';

  const prompt = `
당신은 네이버 ${platform === 'blog' ? '블로그' : '카페'}에 상품을 소개하는 콘텐츠 크리에이터입니다.
다음 상품에 대해 자연스럽고 읽기 좋은 소개글을 작성해주세요.

## 상품 정보
- 상품명: ${name}
${brand ? `- 브랜드: ${brand}` : ''}
${discountInfo ? `- 가격: ${discountInfo}` : ''}
${ratingInfo ? `- 평가: ${ratingInfo}` : ''}
${keywords.length > 0 ? `- 키워드: ${keywords.slice(0, 5).join(', ')}` : ''}

## 타겟 독자
- ${targetAudience.persona || `${targetAudience.ageGroup || '20-40대'} ${targetAudience.gender || '공용'}`}

## 글쓰기 스타일: ${styleConfig.name}
- 톤앤매너: ${styleConfig.tone}
- 구조: ${styleConfig.structure}
- 자주 쓰는 표현: ${styleConfig.example_phrases.join(', ')}
- 이모지/이모티콘: 절대 사용 금지 (AI가 쓴 글처럼 보임)

## 작성 규칙
1. ${lengthGuide} 작성
2. 자연스러운 일상 언어 사용 (광고 느낌 배제)
3. 상품 소개/추천 형식으로 작성 (개인 리뷰가 아닌 정보 전달 위주)
4. 현재 계절(${getCurrentSeason()})에 맞는 내용 포함
5. 첫 줄은 반드시 제목이어야 하며, 제목에 상품명("${name}")을 반드시 포함할 것
6. 소제목은 ** ** 로 감싸기
7. 상품 링크나 가격은 언급하지 않기 (별도 추가됨)
8. 너무 과장하거나 완벽하다는 표현 피하기
9. 장점과 특징을 균형있게 소개

## 인용구 포맷 (필수!)
- 핵심 메시지 3-5개는 반드시 [QUOTE]내용[/QUOTE] 형식으로 감싸기
- 예시: [QUOTE]이 상품의 가장 큰 장점은 바로 이것입니다![/QUOTE]
- 강조하고 싶은 문구, 핵심 포인트에 사용
- 독자의 시선을 끌 수 있는 문장에 활용

## 모바일 최적화 (매우 중요!!!)
- 한 문장은 최대 20-25자 이내로 짧게
- 1-2문장마다 반드시 빈 줄(줄바꿈) 삽입
- 긴 문단 절대 금지 (2문장 넘으면 반드시 줄바꿈)
- 핵심 포인트는 한 줄에 하나씩
- 문단과 문단 사이에 빈 줄 2개 넣기
- 모바일 화면에서 읽기 편하게 여백 많이 사용
- 스크롤하면서 읽기 좋게 시원시원하게 배치

## 추가 지시사항
- 첫 문장은 독자의 관심을 끄는 질문이나 공감 문장으로 시작
- 상품의 특징과 장점을 알기 쉽게 설명
- 어떤 분들에게 추천하는지 명확하게 안내
- 마지막은 자연스러운 추천으로 마무리
- AI가 쓴 글처럼 보이지 않도록 완벽한 문법보다 자연스러움 우선

## 금지사항 (매우 중요!)
- 이모지, 이모티콘 절대 사용 금지 (😀❤️🎉 등 모든 종류)
- 특수문자로 꾸미기 금지 (★☆♥♡ 등)
- 과도한 느낌표 사용 금지 (문장당 하나 이하)
`.trim();

  return prompt;
}

/**
 * Gemini API로 콘텐츠 생성
 */
async function generateWithGemini(prompt, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.9,  // 창의성 높임
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 4096,
    }
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

/**
 * 메인 콘텐츠 생성 함수
 * @param {Object} productInfo - 상품 정보 (크롤러 결과)
 * @param {Object} options - 옵션
 * @returns {Object} 생성된 콘텐츠
 */
export async function generateContent(productInfo, options = {}) {
  const {
    platform = 'blog',
    style = null,  // null이면 랜덤 선택
    apiKey = process.env.GEMINI_API_KEY
  } = options;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.');
  }

  // 스타일 선택 (랜덤 또는 지정)
  const styleKeys = Object.keys(WRITING_STYLES);
  const selectedStyle = style || randomChoice(styleKeys);
  const styleConfig = WRITING_STYLES[selectedStyle];

  console.log(`📝 글쓰기 스타일: ${styleConfig.name}`);

  // 프롬프트 생성
  const prompt = buildPrompt(productInfo, selectedStyle, platform);

  // 콘텐츠 생성
  const content = await generateWithGemini(prompt, apiKey);

  // 제목 추출
  let title = '';
  let body = content;

  const titleMatch = content.match(/\[제목\]\s*(.+?)(?:\n|$)/);
  if (titleMatch) {
    title = titleMatch[1].trim();
    body = content.replace(/\[제목\]\s*.+?\n?/, '').trim();
  } else {
    // 첫 줄을 제목으로
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      title = lines[0].replace(/^[#\*]+\s*/, '').trim();
      body = lines.slice(1).join('\n').trim();
    }
  }

  return {
    title,
    body,
    style: selectedStyle,
    styleName: styleConfig.name,
    platform,
    generatedAt: new Date().toISOString()
  };
}

/**
 * 사용 가능한 스타일 목록 반환
 */
export function getAvailableStyles() {
  return Object.entries(WRITING_STYLES).map(([key, value]) => ({
    key,
    name: value.name,
    tone: value.tone
  }));
}

/**
 * 랜덤 스타일 선택
 */
export function getRandomStyle() {
  const keys = Object.keys(WRITING_STYLES);
  return randomChoice(keys);
}

// 내보내기
export { WRITING_STYLES, buildPrompt };
