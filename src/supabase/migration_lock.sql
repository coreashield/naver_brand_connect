-- =====================================================
-- Migration: 분산 락 + 가격 우선순위
-- 동시 실행 시 상품 중복 방지
-- =====================================================

-- 1. products 테이블에 락 컬럼 추가
ALTER TABLE products ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS locked_by TEXT DEFAULT NULL;

-- 2. 가격을 숫자로 변환하는 컬럼 추가 (정렬용)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_numeric INTEGER DEFAULT 0;

-- 3. 기존 가격 데이터 숫자로 변환
UPDATE products
SET price_numeric = COALESCE(
  NULLIF(REGEXP_REPLACE(price, '[^0-9]', '', 'g'), '')::INTEGER,
  0
)
WHERE price IS NOT NULL AND price_numeric = 0;

-- 4. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_products_locked ON products(locked_until);
CREATE INDEX IF NOT EXISTS idx_products_price_numeric ON products(price_numeric DESC);

-- 5. 뷰 업데이트 (락 정보 + 가격 포함)
DROP VIEW IF EXISTS product_post_counts;
CREATE VIEW product_post_counts AS
SELECT
  p.product_id,
  p.name,
  p.store,
  p.price,
  p.price_numeric,
  p.commission,
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
         p.product_url, p.affiliate_link, p.naver_shopping_url, p.status, p.locked_until, p.locked_by;

-- 6. 원자적 상품 클레임 함수 (락 획득)
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
  -- 1. 후보 상품 선택 및 즉시 락 (단일 트랜잭션)
  -- products 테이블에서 직접 조회하여 FOR UPDATE 사용 가능
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
      -- 1순위: 게시 횟수 적은 순
      CASE WHEN p_platform = 'cafe' THEN COALESCE(pc.cafe_cnt, 0) ELSE COALESCE(pc.blog_cnt, 0) END ASC,
      -- 2순위: 가격 높은 순
      p.price_numeric DESC,
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

  -- 2. 락 획득 실패시 빈 결과
  IF v_product_id IS NULL THEN
    RETURN;
  END IF;

  -- 3. 선택된 상품 정보 반환
  RETURN QUERY
  SELECT
    ppc.product_id,
    ppc.name,
    ppc.price,
    ppc.price_numeric,
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

-- 7. 락 해제 함수
CREATE OR REPLACE FUNCTION release_product_lock(p_product_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET locked_until = NULL,
      locked_by = NULL
  WHERE product_id = p_product_id;
END;
$$ LANGUAGE plpgsql;

-- 8. 만료된 락 정리 함수 (선택적 - 크론잡용)
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE products
  SET locked_until = NULL,
      locked_by = NULL
  WHERE locked_until < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 9. 가격 자동 변환 트리거 (새 상품 추가/수정 시)
CREATE OR REPLACE FUNCTION update_price_numeric()
RETURNS TRIGGER AS $$
BEGIN
  NEW.price_numeric := COALESCE(
    NULLIF(REGEXP_REPLACE(COALESCE(NEW.price, '0'), '[^0-9]', '', 'g'), '')::INTEGER,
    0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_price_numeric ON products;
CREATE TRIGGER products_price_numeric
  BEFORE INSERT OR UPDATE OF price ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_price_numeric();

-- =====================================================
-- 실행 완료!
-- Supabase SQL Editor에서 이 스크립트를 실행하세요.
-- =====================================================
