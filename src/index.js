/**
 * 쇼핑커넥트 블로그 원고 자동 생성 프로그램
 * 메인 실행 파일
 *
 * 사용법:
 *   node src/index.js --url "제품URL"
 *   node src/index.js --mode daily
 *   node src/index.js --mode stats
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { config } from '../config/config.js';
import {
  parseProductData,
  validateProductData,
  extractProductId,
  detectCategory
} from './scraper/productScraper.js';
import {
  loadWrittenProducts,
  markProductAsWritten,
  getTodayCategory,
  getDailySelectionGuide,
  getWritingStats,
  isProductWritten
} from './scraper/productSelector.js';
import { generateContent, createOutputFile } from './generator/contentGenerator.js';
import {
  addPostPerformance,
  getDashboardData,
  getWeeklyReport
} from './analytics/performanceTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 명령행 인자 파싱
 * @returns {Object} 파싱된 인자
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    mode: 'generate',
    url: null,
    category: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
      case '-u':
        parsed.url = args[++i];
        break;
      case '--mode':
      case '-m':
        parsed.mode = args[++i];
        break;
      case '--category':
      case '-c':
        parsed.category = args[++i];
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

/**
 * 도움말 출력
 */
function printHelp() {
  console.log(`
📝 쇼핑커넥트 블로그 원고 자동 생성 프로그램

사용법:
  node src/index.js [옵션]

옵션:
  --url, -u <URL>      제품 URL로 원고 생성
  --mode, -m <모드>    실행 모드 선택
    - generate         원고 생성 (기본값)
    - daily            오늘의 가이드 출력
    - stats            통계 대시보드
    - weekly           주간 리포트
  --category, -c       카테고리 지정 (fashion/it)
  --help, -h           도움말 출력

예시:
  node src/index.js --url "https://brand.naver.com/..."
  node src/index.js --mode daily
  node src/index.js --mode stats
`);
}

/**
 * 오늘의 가이드 출력
 */
function printDailyGuide() {
  const guide = getDailySelectionGuide();

  console.log(`
╔══════════════════════════════════════════════════╗
║           📅 오늘의 블로그 작성 가이드           ║
╚══════════════════════════════════════════════════╝

📆 날짜: ${guide.date}
📁 오늘의 카테고리: ${guide.categoryName} (${guide.targetCategory})
📂 서브카테고리: ${guide.targetSubcategory || '자유'}

📊 누적 작성: ${guide.totalWritten}개

🔑 추천 키워드:
${guide.recommendedKeywords.map(k => `   • ${k}`).join('\n')}

📝 최근 작성:
${guide.recentWritten.length > 0
  ? guide.recentWritten.map(p => `   • ${p.name} (${p.category})`).join('\n')
  : '   (아직 작성된 글이 없습니다)'}

📋 상품 선택 기준:
   • 최소 리뷰 수: ${guide.selectionCriteria.minReviewCount}개
   • 최소 평점: ${guide.selectionCriteria.minRating}점

💡 다음 단계:
   1. 네이버 쇼핑커넥트에서 ${guide.categoryName} 상품 URL 복사
   2. node src/index.js --url "복사한URL" 실행
   3. output 폴더에서 생성된 원고 확인 및 수정
`);
}

/**
 * 통계 대시보드 출력
 */
function printStats() {
  const stats = getWritingStats();
  const dashboard = getDashboardData();

  console.log(`
╔══════════════════════════════════════════════════╗
║              📊 성과 대시보드                    ║
╚══════════════════════════════════════════════════╝

📈 전체 현황:
   • 총 포스팅: ${stats.total}개
   • 패션: ${stats.byCategory.fashion || 0}개
   • IT: ${stats.byCategory.it || 0}개
   • 최근 1주일: ${stats.recentWeek}개

📊 월별 작성:
${Object.entries(stats.byMonth)
  .sort((a, b) => b[0].localeCompare(a[0]))
  .slice(0, 3)
  .map(([month, count]) => `   • ${month}: ${count}개`)
  .join('\n') || '   (데이터 없음)'}

📉 성과 지표:
   • 총 조회수: ${dashboard.overview.totalViews.toLocaleString()}
   • 총 클릭수: ${dashboard.overview.totalClicks.toLocaleString()}
   • 평균 조회수/포스트: ${dashboard.overview.avgViewsPerPost}
   • 총 수익: ${dashboard.overview.totalRevenue.toLocaleString()}원

📈 주간 트렌드:
   • 조회수 변화: ${dashboard.trends.views > 0 ? '+' : ''}${dashboard.trends.views}%
   • 이번 주 포스팅: ${dashboard.trends.postsThisWeek}개

🔑 상위 키워드:
${dashboard.topKeywords.slice(0, 5)
  .map(([kw, stat]) => `   • ${kw}: 조회 ${stat.totalViews}`)
  .join('\n') || '   (데이터 없음)'}
`);
}

/**
 * 주간 리포트 출력
 */
function printWeeklyReport() {
  const report = getWeeklyReport();

  console.log(`
╔══════════════════════════════════════════════════╗
║              📅 주간 리포트                      ║
╚══════════════════════════════════════════════════╝

📆 기간: ${report.period.start} ~ ${report.period.end}
📝 총 포스팅: ${report.totalPosts}개

📁 카테고리별:
${Object.entries(report.byCategory)
  .map(([cat, stat]) => `   • ${cat}: ${stat.count}개 (조회 ${stat.views})`)
  .join('\n') || '   (데이터 없음)'}

📊 일별 포스팅:
${Object.entries(report.byDay)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([day, stat]) => `   • ${day}: ${stat.count}개`)
  .join('\n') || '   (데이터 없음)'}

🏆 상위 성과 포스트:
${report.topPosts
  .map((p, i) => `   ${i + 1}. ${p.productName} - 조회 ${p.views}`)
  .join('\n') || '   (데이터 없음)'}
`);
}

/**
 * 원고 생성 실행
 * @param {string} url - 제품 URL
 * @param {Object} options - 옵션
 */
async function generateBlogPost(url, options = {}) {
  console.log('\n🚀 블로그 원고 생성 시작...\n');

  // URL 검증
  if (!url) {
    console.error('❌ 제품 URL이 필요합니다.');
    console.log('사용법: node src/index.js --url "제품URL"');
    return;
  }

  // 제품 ID 추출
  const productId = extractProductId(url);
  if (!productId) {
    console.error('❌ 유효한 제품 URL이 아닙니다.');
    return;
  }

  // 이미 작성된 제품인지 확인
  if (isProductWritten(productId)) {
    console.warn('⚠️  이 제품은 이미 작성되었습니다.');
    console.log('다른 제품을 선택하시거나, data/writtenProducts.json에서 기록을 삭제하세요.');
    return;
  }

  console.log(`📦 제품 ID: ${productId}`);
  console.log('📡 Playwright MCP를 통해 제품 정보를 스크래핑해주세요.\n');

  // 샘플 제품 데이터 (실제로는 Playwright MCP에서 가져옴)
  const sampleProductData = {
    id: productId,
    name: '[제품명을 입력하세요]',
    brand: '[브랜드명]',
    price: 0,
    originalPrice: 0,
    discountRate: 0,
    description: '[제품 설명]',
    specs: ['스펙1', '스펙2', '스펙3'],
    images: [],
    reviews: {
      count: 0,
      rating: 0,
      summary: []
    },
    url: url
  };

  // 카테고리 결정
  const category = options.category || getTodayCategory();
  sampleProductData.category = category;

  console.log(`📁 카테고리: ${category === 'fashion' ? '패션' : 'IT'}`);

  // 원고 생성
  console.log('✍️  원고 생성 중...');
  const content = generateContent(sampleProductData, {
    season: getCurrentSeason(),
    usagePeriod: '2주'
  });

  // 출력 파일 생성
  const outputFile = createOutputFile(content, sampleProductData);

  // output 디렉토리 확인 및 생성
  const outputDir = join(__dirname, '../output');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // 파일 저장
  const fullPath = join(outputDir, outputFile.fileName);
  writeFileSync(fullPath, outputFile.content, 'utf-8');

  console.log(`\n✅ 원고 생성 완료!`);
  console.log(`📄 파일: ${outputFile.fileName}`);
  console.log(`📂 경로: ${fullPath}`);
  console.log(`📊 예상 글자 수: ${content.meta.charCount}자`);

  // 작성 기록
  markProductAsWritten({
    id: productId,
    name: sampleProductData.name,
    category: category,
    outputFile: outputFile.fileName
  });

  // 성과 추적 기록
  addPostPerformance({
    productId: productId,
    productName: sampleProductData.name,
    category: category,
    outputFile: outputFile.fileName,
    keywords: content.seo.keywords
  });

  console.log('\n📝 다음 단계:');
  console.log('   1. output 폴더에서 생성된 마크다운 파일 열기');
  console.log('   2. [괄호] 안의 내용을 실제 내용으로 교체');
  console.log('   3. 이미지 촬영 가이드에 따라 사진 촬영');
  console.log('   4. 네이버 블로그에 포스팅');
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
 * 메인 실행 함수
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return;
  }

  switch (args.mode) {
    case 'daily':
      printDailyGuide();
      break;
    case 'stats':
      printStats();
      break;
    case 'weekly':
      printWeeklyReport();
      break;
    case 'generate':
    default:
      if (args.url) {
        await generateBlogPost(args.url, { category: args.category });
      } else {
        printDailyGuide();
        console.log('\n💡 원고를 생성하려면 --url 옵션으로 제품 URL을 전달하세요.');
      }
      break;
  }
}

// 실행
main().catch(console.error);
