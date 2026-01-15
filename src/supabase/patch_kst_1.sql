-- 첫 번째 함수: get_account_by_id (이것만 먼저 실행)
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
  v_kst_date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;

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
