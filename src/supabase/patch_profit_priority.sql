-- =====================================================
-- 패치: 예상 수익 기준 상품 우선순위
-- price × commission_rate 높은 순으로 정렬
-- =====================================================

-- 0. 기존 함수 삭제 (반환 타입 변경을 위해)
DROP FUNCTION IF EXISTS claim_product_for_posting(text, text, integer);

-- 1. 수수료율 숫자 컬럼 추가
ALTER TABLE products ADD COLUMN IF NOT EXISTS commission_numeric INTEGER DEFAULT 0;

-- 2. 예상 수익 컬럼 추가 (가격 × 수수료율)
ALTER TABLE products ADD COLUMN IF NOT EXISTS expected_profit INTEGER DEFAULT 0;

-- 3. 기존 데이터 변환 (예: "18%" -> 18)
UPDATE products
SET commission_numeric = COALESCE(
  NULLIF(REGEXP_REPLACE(commission, '[^0-9]', '', 'g'), '')::INTEGER,
  0
)
WHERE commission IS NOT NULL AND commission_numeric = 0;

-- 4. 예상 수익 계산 (가격 × 수수료율 / 100)
UPDATE products
SET expected_profit = (price_numeric * commission_numeric) / 100;

-- 5. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_products_expected_profit ON products(expected_profit DESC);

-- 6. 자동 업데이트 트리거 (상품 추가/수정 시)
CREATE OR REPLACE FUNCTION update_profit_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- 수수료율 숫자 변환
  NEW.commission_numeric := COALESCE(
    NULLIF(REGEXP_REPLACE(COALESCE(NEW.commission, '0'), '[^0-9]', '', 'g'), '')::INTEGER,
    0
  );
  -- 가격 숫자 변환
  NEW.price_numeric := COALESCE(
    NULLIF(REGEXP_REPLACE(COALESCE(NEW.price, '0'), '[^0-9]', '', 'g'), '')::INTEGER,
    0
  );
  -- 예상 수익 계산
  NEW.expected_profit := (NEW.price_numeric * NEW.commission_numeric) / 100;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_profit_update ON products;
CREATE TRIGGER products_profit_update
  BEFORE INSERT OR UPDATE OF price, commission ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_profit_fields();

-- 7. 뷰 업데이트 (예상 수익 포함)
DROP VIEW IF EXISTS product_post_counts;
CREATE VIEW product_post_counts AS
SELECT
  p.product_id,
  p.name,
  p.store,
  p.price,
  p.price_numeric,
  p.commission,
  p.commission_numeric,
  p.expected_profit,
  p.product_url,
  p.affiliate_link,
  p.naver_shopping_url,
  p.status,
  p.locked_until,
  p.locked_by,
  COALESCE(COUNT(CASE WHEN posts.platform = 'cafe' AND posts.success = true THEN 1 END), 0) as cafe_count,
  COALESCE(COUNT(CASE WHEN posts.platform = 'blog' AND posts.success = true THEN 1 END), 0) as blog_count,
  COALESCE(COUNT(CASE WHEN posts.success = true THEN 1 END), 0) as total_count
FROM products p
LEFT JOIN posts ON p.product_id = posts.product_id
GROUP BY p.product_id, p.name, p.store, p.price, p.price_numeric, p.commission,
         p.commission_numeric, p.expected_profit, p.product_url, p.affiliate_link,
         p.naver_shopping_url, p.status, p.locked_until, p.locked_by;

-- 8. 상품 선택 함수 업데이트 (예상 수익 기준)
CREATE OR REPLACE FUNCTION claim_product_for_posting(
  p_platform TEXT,
  p_worker_id TEXT,
  p_lock_minutes INTEGER DEFAULT 10
)
RETURNS TABLE (
  product_id TEXT,
  name TEXT,
  price TEXT,
  price_numeric INTEGER,
  commission TEXT,
  expected_profit INTEGER,
  affiliate_link TEXT,
  naver_shopping_url TEXT,
  product_url TEXT,
  cafe_count BIGINT,
  blog_count BIGINT,
  total_count BIGINT
) AS $$
DECLARE
  v_product_id TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_lock_until TIMESTAMPTZ := NOW() + (p_lock_minutes || ' minutes')::INTERVAL;
BEGIN
  WITH post_counts AS (
    SELECT
      posts.product_id,
      COUNT(CASE WHEN posts.platform = 'cafe' AND posts.success = true THEN 1 END) as cafe_cnt,
      COUNT(CASE WHEN posts.platform = 'blog' AND posts.success = true THEN 1 END) as blog_cnt,
      COUNT(CASE WHEN posts.success = true THEN 1 END) as total_cnt
    FROM posts
    GROUP BY posts.product_id
  ),
  candidates AS (
    SELECT p.product_id
    FROM products p
    LEFT JOIN post_counts pc ON p.product_id = pc.product_id
    WHERE p.status = 'ON'
      AND p.affiliate_link IS NOT NULL
      AND (p.locked_until IS NULL OR p.locked_until < v_now)
      AND NOT EXISTS (
        SELECT 1 FROM posts
        WHERE posts.product_id = p.product_id
          AND posts.platform = p_platform
          AND posts.posted_at > v_now - INTERVAL '24 hours'
      )
    ORDER BY
      -- 1순위: 게시 횟수 적은 순 (해당 플랫폼)
      CASE WHEN p_platform = 'cafe' THEN COALESCE(pc.cafe_cnt, 0) ELSE COALESCE(pc.blog_cnt, 0) END ASC,
      -- 2순위: 예상 수익 높은 순 (가격 × 수수료율) ← 핵심 변경!
      p.expected_profit DESC,
      -- 3순위: 총 게시 횟수 적은 순
      COALESCE(pc.total_cnt, 0) ASC,
      -- 4순위: 랜덤
      RANDOM()
    LIMIT 1
    FOR UPDATE OF p SKIP LOCKED
  )
  UPDATE products p
  SET locked_until = v_lock_until,
      locked_by = p_worker_id
  FROM candidates c
  WHERE p.product_id = c.product_id
  RETURNING p.product_id INTO v_product_id;

  IF v_product_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ppc.product_id,
    ppc.name,
    ppc.price,
    ppc.price_numeric,
    ppc.commission,
    ppc.expected_profit,
    ppc.affiliate_link,
    ppc.naver_shopping_url,
    ppc.product_url,
    ppc.cafe_count,
    ppc.blog_count,
    ppc.total_count
  FROM product_post_counts ppc
  WHERE ppc.product_id = v_product_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 실행 완료! Supabase SQL Editor에서 실행하세요.
-- =====================================================

-- 확인 쿼리 (상위 10개 예상 수익 상품):
-- SELECT name, price, commission, expected_profit
-- FROM products
-- WHERE status = 'ON'
-- ORDER BY expected_profit DESC
-- LIMIT 10;
