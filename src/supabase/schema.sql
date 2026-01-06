-- =====================================================
-- Naver Brand Connect - Supabase Schema
-- 이 SQL을 Supabase 대시보드 SQL Editor에서 실행하세요
-- =====================================================

-- Products 테이블 (상품 정보)
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  store TEXT,
  price TEXT,
  original_price TEXT,
  commission TEXT,
  status TEXT DEFAULT 'ON',
  product_url TEXT,
  affiliate_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workers 테이블 (각 VM/환경)
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  platform TEXT,
  status TEXT DEFAULT 'idle',
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts 테이블 (게시 기록)
CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT REFERENCES products(product_id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  posted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task Queue 테이블 (작업 큐)
CREATE TABLE IF NOT EXISTS task_queue (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT REFERENCES products(product_id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  assigned_worker UUID REFERENCES workers(id) ON DELETE SET NULL,
  priority INT DEFAULT 0,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(product_id);
CREATE INDEX IF NOT EXISTS idx_posts_product ON posts(product_id);
CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
CREATE INDEX IF NOT EXISTS idx_queue_status ON task_queue(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_queue_worker ON task_queue(assigned_worker);

-- Updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Products 테이블에 트리거 적용
DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 게시 횟수 뷰 (카페/블로그별 통계)
CREATE OR REPLACE VIEW product_post_counts AS
SELECT
  p.product_id,
  p.name,
  p.store,
  p.price,
  p.commission,
  p.product_url,
  p.affiliate_link,
  p.status,
  COALESCE(COUNT(CASE WHEN posts.platform = 'cafe' THEN 1 END), 0) as cafe_count,
  COALESCE(COUNT(CASE WHEN posts.platform = 'blog' THEN 1 END), 0) as blog_count,
  COALESCE(COUNT(*), 0) as total_count
FROM products p
LEFT JOIN posts ON p.product_id = posts.product_id AND posts.success = true
GROUP BY p.product_id, p.name, p.store, p.price, p.commission, p.product_url, p.affiliate_link, p.status;

-- RLS (Row Level Security) 비활성화 (서비스 키 사용하므로)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_queue ENABLE ROW LEVEL SECURITY;

-- Service Role은 모든 접근 허용
CREATE POLICY "Service role full access" ON products FOR ALL USING (true);
CREATE POLICY "Service role full access" ON workers FOR ALL USING (true);
CREATE POLICY "Service role full access" ON posts FOR ALL USING (true);
CREATE POLICY "Service role full access" ON task_queue FOR ALL USING (true);

-- =====================================================
-- 설정 완료!
-- =====================================================
