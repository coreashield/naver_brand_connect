-- =====================================================
-- Naver Brand Connect - Migration V4
-- Multi-Account Management System
-- =====================================================

-- Naver Accounts Table
CREATE TABLE IF NOT EXISTS naver_accounts (
  id SERIAL PRIMARY KEY,              -- 1, 2, 3... (ACCOUNT_ID와 매칭)
  naver_id TEXT UNIQUE NOT NULL,
  naver_pw TEXT NOT NULL,
  blog_id TEXT,
  cafe_url TEXT,

  -- 일일 할당량
  daily_cafe_limit INT DEFAULT 200,
  daily_blog_limit INT DEFAULT 5,

  -- 오늘 사용량 (00시 리셋)
  today_cafe_count INT DEFAULT 0,
  today_blog_count INT DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,

  -- 상태
  status TEXT DEFAULT 'active',  -- active, suspended
  memo TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_naver_accounts_status ON naver_accounts(status);
CREATE INDEX IF NOT EXISTS idx_naver_accounts_reset_date ON naver_accounts(last_reset_date);

-- RLS Policy
ALTER TABLE naver_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on naver_accounts" ON naver_accounts;
CREATE POLICY "Service role full access on naver_accounts" ON naver_accounts FOR ALL USING (true);

-- Add account_id to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS account_id INT REFERENCES naver_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_account ON posts(account_id);

-- =====================================================
-- Function: Get account by ID (with auto-reset)
-- =====================================================
CREATE OR REPLACE FUNCTION get_account_by_id(p_account_id INT)
RETURNS TABLE (
  id INT,
  naver_id TEXT,
  naver_pw TEXT,
  blog_id TEXT,
  cafe_url TEXT,
  today_cafe_count INT,
  today_blog_count INT,
  daily_cafe_limit INT,
  daily_blog_limit INT,
  cafe_remaining INT,
  blog_remaining INT
) AS $$
BEGIN
  -- 날짜 변경 시 자동 리셋
  UPDATE naver_accounts
  SET
    today_cafe_count = 0,
    today_blog_count = 0,
    last_reset_date = CURRENT_DATE,
    updated_at = NOW()
  WHERE naver_accounts.id = p_account_id
    AND last_reset_date < CURRENT_DATE;

  RETURN QUERY
  SELECT
    na.id,
    na.naver_id,
    na.naver_pw,
    na.blog_id,
    na.cafe_url,
    na.today_cafe_count,
    na.today_blog_count,
    na.daily_cafe_limit,
    na.daily_blog_limit,
    na.daily_cafe_limit - na.today_cafe_count,
    na.daily_blog_limit - na.today_blog_count
  FROM naver_accounts na
  WHERE na.id = p_account_id AND na.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function: Increment account post count
-- =====================================================
CREATE OR REPLACE FUNCTION increment_account_count(
  p_account_id INT,
  p_platform TEXT
)
RETURNS INT AS $$
DECLARE
  v_new_count INT;
BEGIN
  -- 날짜 변경 시 먼저 리셋
  UPDATE naver_accounts
  SET
    today_cafe_count = 0,
    today_blog_count = 0,
    last_reset_date = CURRENT_DATE
  WHERE id = p_account_id
    AND last_reset_date < CURRENT_DATE;

  -- 카운트 증가
  IF p_platform = 'cafe' THEN
    UPDATE naver_accounts
    SET today_cafe_count = today_cafe_count + 1, updated_at = NOW()
    WHERE id = p_account_id
    RETURNING today_cafe_count INTO v_new_count;
  ELSE
    UPDATE naver_accounts
    SET today_blog_count = today_blog_count + 1, updated_at = NOW()
    WHERE id = p_account_id
    RETURNING today_blog_count INTO v_new_count;
  END IF;

  RETURN v_new_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- View: Account daily statistics
-- =====================================================
CREATE OR REPLACE VIEW account_daily_stats AS
SELECT
  na.id,
  na.naver_id,
  na.status,
  na.today_cafe_count,
  na.daily_cafe_limit,
  na.daily_cafe_limit - na.today_cafe_count as cafe_remaining,
  na.today_blog_count,
  na.daily_blog_limit,
  na.daily_blog_limit - na.today_blog_count as blog_remaining,
  na.last_reset_date,
  na.memo,
  na.updated_at
FROM naver_accounts na
ORDER BY na.id;

-- =====================================================
-- Insert initial account (from current .env)
-- Uncomment and modify as needed
-- =====================================================
-- INSERT INTO naver_accounts (naver_id, naver_pw, blog_id, cafe_url, memo)
-- VALUES (
--   'ingredient7303126',
--   'coreashield2@',
--   'ingredient7303126',
--   'https://cafe.naver.com/ca-fe/cafes/30400177/articles/write?boardType=L',
--   '메인 계정'
-- )
-- ON CONFLICT (naver_id) DO NOTHING;
