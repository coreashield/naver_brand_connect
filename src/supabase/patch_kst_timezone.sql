-- =====================================================
-- Patch: 한국시간(KST) 기준 00시 리셋으로 변경
-- Supabase SQL Editor에서 실행하세요
-- =====================================================

-- =====================================================
-- Function: Get account by ID (한국시간 기준)
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
DECLARE
  v_kst_date DATE;
BEGIN
  -- 한국시간 기준 오늘 날짜
  v_kst_date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;

  -- 한국시간 기준 날짜 변경 시 자동 리셋
  UPDATE naver_accounts
  SET
    today_cafe_count = 0,
    today_blog_count = 0,
    last_reset_date = v_kst_date,
    updated_at = NOW()
  WHERE naver_accounts.id = p_account_id
    AND last_reset_date < v_kst_date;

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
-- Function: Increment account post count (한국시간 기준)
-- =====================================================
CREATE OR REPLACE FUNCTION increment_account_count(
  p_account_id INT,
  p_platform TEXT
)
RETURNS INT AS $$
DECLARE
  v_new_count INT;
  v_kst_date DATE;
BEGIN
  -- 한국시간 기준 오늘 날짜
  v_kst_date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;

  -- 한국시간 기준 날짜 변경 시 먼저 리셋
  UPDATE naver_accounts
  SET
    today_cafe_count = 0,
    today_blog_count = 0,
    last_reset_date = v_kst_date
  WHERE id = p_account_id
    AND last_reset_date < v_kst_date;

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
-- 완료! 이제 한국시간 00:00 기준으로 카운트가 리셋됩니다.
-- =====================================================
