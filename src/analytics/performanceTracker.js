/**
 * 성과 추적 모듈
 * 포스팅 성과 및 통계 관리
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PERFORMANCE_PATH = join(__dirname, '../../data/performance.json');

/**
 * 성과 데이터 구조
 * @typedef {Object} PerformanceData
 * @property {Array} posts - 포스팅 성과 목록
 * @property {Object} summary - 요약 통계
 * @property {string} lastUpdated - 마지막 업데이트 시간
 */

/**
 * 성과 데이터 로드
 * @returns {PerformanceData} 성과 데이터
 */
export function loadPerformanceData() {
  try {
    if (existsSync(PERFORMANCE_PATH)) {
      const data = readFileSync(PERFORMANCE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('성과 데이터 로드 실패:', error.message);
  }
  return {
    posts: [],
    summary: {
      totalPosts: 0,
      totalViews: 0,
      totalClicks: 0,
      totalRevenue: 0
    },
    lastUpdated: null
  };
}

/**
 * 성과 데이터 저장
 * @param {PerformanceData} data - 저장할 데이터
 */
export function savePerformanceData(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    writeFileSync(PERFORMANCE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('성과 데이터 저장 실패:', error.message);
  }
}

/**
 * 새 포스트 성과 기록 추가
 * @param {Object} postPerformance - 포스트 성과 정보
 */
export function addPostPerformance(postPerformance) {
  const data = loadPerformanceData();

  const record = {
    id: `post_${Date.now()}`,
    productId: postPerformance.productId,
    productName: postPerformance.productName,
    category: postPerformance.category,
    publishedAt: postPerformance.publishedAt || new Date().toISOString(),
    outputFile: postPerformance.outputFile,
    metrics: {
      views: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0
    },
    keywords: postPerformance.keywords || [],
    createdAt: new Date().toISOString()
  };

  data.posts.push(record);
  data.summary.totalPosts = data.posts.length;

  savePerformanceData(data);
  return record;
}

/**
 * 포스트 성과 업데이트
 * @param {string} postId - 포스트 ID
 * @param {Object} metrics - 업데이트할 지표
 */
export function updatePostMetrics(postId, metrics) {
  const data = loadPerformanceData();

  const postIndex = data.posts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    console.error('포스트를 찾을 수 없습니다:', postId);
    return null;
  }

  const post = data.posts[postIndex];

  // 이전 값 저장 (요약 업데이트용)
  const prevMetrics = { ...post.metrics };

  // 지표 업데이트
  Object.keys(metrics).forEach(key => {
    if (post.metrics.hasOwnProperty(key)) {
      post.metrics[key] = metrics[key];
    }
  });

  // 요약 통계 업데이트
  data.summary.totalViews += (post.metrics.views - prevMetrics.views);
  data.summary.totalClicks += (post.metrics.clicks - prevMetrics.clicks);
  data.summary.totalRevenue += (post.metrics.revenue - prevMetrics.revenue);

  data.posts[postIndex] = post;
  savePerformanceData(data);

  return post;
}

/**
 * 일별 성과 리포트 생성
 * @param {string} date - 날짜 (YYYY-MM-DD)
 * @returns {Object} 일별 리포트
 */
export function getDailyReport(date = null) {
  const data = loadPerformanceData();
  const targetDate = date || new Date().toISOString().split('T')[0];

  const dailyPosts = data.posts.filter(p => {
    const postDate = p.publishedAt?.split('T')[0];
    return postDate === targetDate;
  });

  const dailyMetrics = dailyPosts.reduce((acc, post) => {
    acc.views += post.metrics.views;
    acc.clicks += post.metrics.clicks;
    acc.conversions += post.metrics.conversions;
    acc.revenue += post.metrics.revenue;
    return acc;
  }, { views: 0, clicks: 0, conversions: 0, revenue: 0 });

  return {
    date: targetDate,
    postsCount: dailyPosts.length,
    metrics: dailyMetrics,
    posts: dailyPosts.map(p => ({
      productName: p.productName,
      category: p.category,
      metrics: p.metrics
    }))
  };
}

/**
 * 주간 성과 리포트 생성
 * @returns {Object} 주간 리포트
 */
export function getWeeklyReport() {
  const data = loadPerformanceData();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const weeklyPosts = data.posts.filter(p => {
    const postDate = new Date(p.publishedAt);
    return postDate >= oneWeekAgo;
  });

  const byCategory = {};
  const byDay = {};

  weeklyPosts.forEach(post => {
    // 카테고리별 집계
    if (!byCategory[post.category]) {
      byCategory[post.category] = { count: 0, views: 0, clicks: 0, revenue: 0 };
    }
    byCategory[post.category].count++;
    byCategory[post.category].views += post.metrics.views;
    byCategory[post.category].clicks += post.metrics.clicks;
    byCategory[post.category].revenue += post.metrics.revenue;

    // 일별 집계
    const day = post.publishedAt?.split('T')[0];
    if (day) {
      if (!byDay[day]) {
        byDay[day] = { count: 0, views: 0, clicks: 0 };
      }
      byDay[day].count++;
      byDay[day].views += post.metrics.views;
      byDay[day].clicks += post.metrics.clicks;
    }
  });

  // 상위 성과 포스트
  const topPosts = [...weeklyPosts]
    .sort((a, b) => b.metrics.views - a.metrics.views)
    .slice(0, 5)
    .map(p => ({
      productName: p.productName,
      category: p.category,
      views: p.metrics.views,
      clicks: p.metrics.clicks
    }));

  return {
    period: {
      start: oneWeekAgo.toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    },
    totalPosts: weeklyPosts.length,
    byCategory,
    byDay,
    topPosts
  };
}

/**
 * 키워드 성과 분석
 * @returns {Object} 키워드별 성과
 */
export function getKeywordPerformance() {
  const data = loadPerformanceData();
  const keywordStats = {};

  data.posts.forEach(post => {
    (post.keywords || []).forEach(keyword => {
      if (!keywordStats[keyword]) {
        keywordStats[keyword] = {
          count: 0,
          totalViews: 0,
          totalClicks: 0,
          avgViews: 0
        };
      }
      keywordStats[keyword].count++;
      keywordStats[keyword].totalViews += post.metrics.views;
      keywordStats[keyword].totalClicks += post.metrics.clicks;
    });
  });

  // 평균 계산
  Object.keys(keywordStats).forEach(keyword => {
    const stat = keywordStats[keyword];
    stat.avgViews = stat.count > 0 ? Math.round(stat.totalViews / stat.count) : 0;
  });

  // 성과순 정렬
  const sortedKeywords = Object.entries(keywordStats)
    .sort((a, b) => b[1].totalViews - a[1].totalViews)
    .slice(0, 20);

  return Object.fromEntries(sortedKeywords);
}

/**
 * 성과 대시보드 데이터 생성
 * @returns {Object} 대시보드 데이터
 */
export function getDashboardData() {
  const data = loadPerformanceData();
  const weekly = getWeeklyReport();
  const keywords = getKeywordPerformance();

  // 트렌드 계산 (최근 7일 vs 이전 7일)
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const previousWeekPosts = data.posts.filter(p => {
    const postDate = new Date(p.publishedAt);
    return postDate >= twoWeeksAgo && postDate < oneWeekAgo;
  });

  const previousWeekViews = previousWeekPosts.reduce((sum, p) => sum + p.metrics.views, 0);
  const currentWeekViews = data.posts
    .filter(p => new Date(p.publishedAt) >= oneWeekAgo)
    .reduce((sum, p) => sum + p.metrics.views, 0);

  const viewsTrend = previousWeekViews > 0
    ? Math.round((currentWeekViews - previousWeekViews) / previousWeekViews * 100)
    : 0;

  return {
    overview: {
      totalPosts: data.summary.totalPosts,
      totalViews: data.summary.totalViews,
      totalClicks: data.summary.totalClicks,
      totalRevenue: data.summary.totalRevenue,
      avgViewsPerPost: data.summary.totalPosts > 0
        ? Math.round(data.summary.totalViews / data.summary.totalPosts)
        : 0
    },
    trends: {
      views: viewsTrend,
      postsThisWeek: weekly.totalPosts
    },
    weekly,
    topKeywords: Object.entries(keywords).slice(0, 10),
    lastUpdated: data.lastUpdated
  };
}

export default {
  loadPerformanceData,
  savePerformanceData,
  addPostPerformance,
  updatePostMetrics,
  getDailyReport,
  getWeeklyReport,
  getKeywordPerformance,
  getDashboardData
};
