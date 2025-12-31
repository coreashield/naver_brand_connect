/**
 * 블로그 원고 생성 모듈
 * 제품 정보와 템플릿을 기반으로 SEO 최적화된 원고 생성
 */

import { config } from '../../config/config.js';
import { createFashionTemplate } from '../templates/fashionTemplate.js';
import { createITTemplate } from '../templates/itTemplate.js';
import { generateImageDescriptions, formatImageDescription } from './imageDescriptor.js';

/**
 * 원고 생성 메인 함수
 * @param {Object} product - 제품 데이터
 * @param {Object} options - 생성 옵션
 * @returns {Object} 생성된 원고 데이터
 */
export function generateContent(product, options = {}) {
  const category = product.category || 'fashion';

  // 카테고리별 템플릿 생성
  const template = category === 'fashion'
    ? createFashionTemplate(product, options)
    : createITTemplate(product, options);

  // 이미지 묘사 생성
  const imageDescriptions = generateImageDescriptions(product, category);

  // 원고 구조 생성
  const content = buildContentStructure(product, template, imageDescriptions);

  // SEO 최적화
  const seoOptimized = applySEOOptimization(content, template.seo);

  // 심리 트리거 삽입
  const withTriggers = insertPsychologyTriggers(seoOptimized, product);

  // 글자 수 검증
  const validated = validateContentLength(withTriggers);

  return {
    title: template.structure.title,
    content: validated.content,
    markdown: generateMarkdown(template.structure.title, validated.content),
    seo: template.seo,
    meta: {
      category,
      productId: product.id,
      productName: product.name,
      generatedAt: new Date().toISOString(),
      charCount: validated.charCount,
      isValid: validated.isValid
    }
  };
}

/**
 * 콘텐츠 구조 생성
 * @param {Object} product - 제품 데이터
 * @param {Object} template - 템플릿
 * @param {Object} imageDescriptions - 이미지 묘사
 * @returns {Array} 콘텐츠 섹션 배열
 */
function buildContentStructure(product, template, imageDescriptions) {
  const sections = [];

  template.structure.sections.forEach(section => {
    if (section.type.includes('image')) {
      // 이미지 묘사 섹션
      sections.push({
        type: 'image',
        content: formatImageDescription(section.description)
      });
    } else if (section.type === 'section') {
      // 텍스트 섹션
      sections.push({
        type: 'section',
        title: section.title,
        contentGuide: section.contentGuide,
        includeCTA: section.includeCTA || false
      });
    }
  });

  return sections;
}

/**
 * SEO 최적화 적용
 * @param {Array} content - 콘텐츠 섹션 배열
 * @param {Object} seo - SEO 설정
 * @returns {Array} SEO 최적화된 콘텐츠
 */
function applySEOOptimization(content, seo) {
  return content.map(section => {
    if (section.type === 'section' && section.contentGuide) {
      // 키워드 밀도 가이드 추가
      section.contentGuide.seoKeywords = seo.keywords?.slice(0, 3) || [];
      section.contentGuide.keywordDensityGuide = `키워드를 자연스럽게 ${config.content.keywordDensity.min * 100}-${config.content.keywordDensity.max * 100}% 비율로 포함`;
    }
    return section;
  });
}

/**
 * 심리 트리거 삽입
 * @param {Array} content - 콘텐츠
 * @param {Object} product - 제품 데이터
 * @returns {Array} 트리거가 삽입된 콘텐츠
 */
function insertPsychologyTriggers(content, product) {
  const triggers = config.psychologyTriggers;

  return content.map(section => {
    if (section.type === 'section') {
      // 추천 섹션에 희소성/긴급성 트리거
      if (section.title?.includes('추천') || section.includeCTA) {
        section.suggestedTriggers = [
          selectRandom(triggers.socialProof).replace('{reviewCount}', product.reviews?.count || '많은'),
          selectRandom(triggers.urgency)
        ];
      }
      // 구매 이유 섹션에 스토리 트리거
      if (section.title?.includes('이유') || section.title?.includes('고민')) {
        section.suggestedTriggers = [
          selectRandom(triggers.story)
        ];
      }
    }
    return section;
  });
}

/**
 * 글자 수 검증
 * @param {Array} content - 콘텐츠
 * @returns {Object} 검증 결과
 */
function validateContentLength(content) {
  // 예상 글자 수 계산 (각 섹션의 length 가이드 기반)
  let estimatedChars = 0;

  content.forEach(section => {
    if (section.type === 'image') {
      estimatedChars += 100; // 이미지 묘사 평균
    } else if (section.type === 'section') {
      const lengthGuide = section.contentGuide?.length || '150-200자';
      const match = lengthGuide.match(/(\d+)/);
      estimatedChars += match ? parseInt(match[1]) : 150;
    }
  });

  const isValid = estimatedChars >= config.content.minLength &&
                  estimatedChars <= config.content.maxLength;

  return {
    content,
    charCount: estimatedChars,
    isValid,
    message: isValid
      ? `글자 수 적정 (약 ${estimatedChars}자)`
      : `글자 수 조정 필요 (약 ${estimatedChars}자, 목표: ${config.content.minLength}-${config.content.maxLength}자)`
  };
}

/**
 * 마크다운 형식 생성
 * @param {string} title - 제목
 * @param {Array} content - 콘텐츠 섹션
 * @returns {string} 마크다운 문자열
 */
function generateMarkdown(title, content) {
  let markdown = `# ${title}\n\n`;

  content.forEach(section => {
    if (section.type === 'image') {
      markdown += `${section.content}\n`;
    } else if (section.type === 'section') {
      markdown += `## ${section.title}\n\n`;
      markdown += generateSectionContent(section);
      markdown += '\n\n';
    }
  });

  return markdown;
}

/**
 * 섹션 콘텐츠 생성 (가이드 기반)
 * @param {Object} section - 섹션 데이터
 * @returns {string} 생성된 콘텐츠
 */
function generateSectionContent(section) {
  const guide = section.contentGuide;
  if (!guide) return '[콘텐츠 작성 필요]\n';

  let content = '';

  // 포인트가 있는 경우
  if (guide.points) {
    content += `<!-- 작성 가이드:\n`;
    guide.points.forEach(point => {
      content += `- ${point}\n`;
    });
    content += `-->\n\n`;
    content += `[여기에 ${guide.length || '150-200자'} 분량의 내용 작성]\n`;
  }

  // 스타일 가이드가 있는 경우 (코디 제안 등)
  if (guide.styles) {
    guide.styles.forEach(style => {
      content += `### ${style.name}\n`;
      content += `${style.description}\n\n`;
    });
  }

  // 테스트 카테고리가 있는 경우 (IT 실사용)
  if (guide.testCategories) {
    guide.testCategories.forEach(test => {
      content += `### ${test.name}\n`;
      content += `${test.description}\n\n`;
    });
  }

  // 장단점 형식
  if (guide.format?.pros) {
    content += `**장점**\n`;
    content += `- ✅ [장점 1]\n- ✅ [장점 2]\n- ✅ [장점 3]\n\n`;
    content += `**아쉬운 점**\n`;
    content += `- ⚠️ [단점 1]\n- ⚠️ [단점 2]\n\n`;
  }

  // 스펙 테이블 형식
  if (guide.format === 'markdown table') {
    content += `| 항목 | 스펙 |\n`;
    content += `|------|------|\n`;
    if (guide.sampleRows) {
      guide.sampleRows.forEach(row => {
        content += `| ${row[0]} | ${row[1]} |\n`;
      });
    }
    content += `| [추가 스펙] | [값] |\n\n`;
  }

  // CTA 포함
  if (section.includeCTA && guide.cta) {
    content += `\n${guide.cta.text}\n`;
    content += `👉 ${guide.cta.linkPlaceholder}\n`;
  }

  // 심리 트리거 제안
  if (section.suggestedTriggers) {
    content += `\n<!-- 추천 표현: ${section.suggestedTriggers.join(' / ')} -->\n`;
  }

  return content;
}

/**
 * 배열에서 랜덤 선택
 * @param {Array} arr - 배열
 * @returns {*} 선택된 항목
 */
function selectRandom(arr) {
  if (!arr || arr.length === 0) return '';
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 최종 원고 파일 생성
 * @param {Object} generatedContent - 생성된 콘텐츠
 * @param {Object} product - 제품 데이터
 * @returns {Object} 파일 정보
 */
export function createOutputFile(generatedContent, product) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const safeName = (product.name || 'product').replace(/[^a-zA-Z0-9가-힣]/g, '_').substring(0, 30);
  const fileName = `원고_${date}_${safeName}.md`;

  return {
    fileName,
    filePath: `${config.output.directory}/${fileName}`,
    content: generatedContent.markdown,
    meta: generatedContent.meta
  };
}

export default {
  generateContent,
  createOutputFile
};
