-- =====================================================
-- Naver Brand Connect - Schema Migration v2
-- 상품 정보 확장 + 타겟 연령 추론 지원
-- =====================================================

-- 새 컬럼 추가 (기존 테이블에)
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating DECIMAL(2,1);
ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS top_reviews JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS target_audience JSONB DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS detail_crawled_at TIMESTAMPTZ;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating DESC);

-- 게시 횟수 뷰 업데이트 (새 필드 포함)
CREATE OR REPLACE VIEW product_post_counts AS
SELECT
  p.product_id,
  p.name,
  p.store,
  p.price,
  p.original_price,
  p.commission,
  p.product_url,
  p.affiliate_link,
  p.status,
  p.category,
  p.brand,
  p.rating,
  p.review_count,
  p.target_audience,
  COALESCE(COUNT(CASE WHEN posts.platform = 'cafe' THEN 1 END), 0) as cafe_count,
  COALESCE(COUNT(CASE WHEN posts.platform = 'blog' THEN 1 END), 0) as blog_count,
  COALESCE(COUNT(*), 0) as total_count
FROM products p
LEFT JOIN posts ON p.product_id = posts.product_id AND posts.success = true
GROUP BY p.product_id, p.name, p.store, p.price, p.original_price, p.commission,
         p.product_url, p.affiliate_link, p.status, p.category, p.brand,
         p.rating, p.review_count, p.target_audience;

-- =====================================================
-- target_audience JSONB 구조 예시:
-- {
--   "age_group": "20-30대",
--   "gender": "여성",
--   "keywords": ["직장인", "데일리룩", "출근룩"],
--   "persona": "20-30대 여성 직장인, 깔끔한 출근룩을 원하는 분"
-- }
-- =====================================================
