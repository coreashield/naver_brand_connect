-- 두 번째 함수: increment_account_count (이것을 두 번째로 실행)
CREATE OR REPLACE FUNCTION increment_account_count(
  p_account_id INT,
  p_platform TEXT
)
RETURNS INT AS $$
DECLARE
  v_new_count INT;
  v_kst_date DATE;
BEGIN
  v_kst_date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;

  UPDATE naver_accounts
  SET
    today_cafe_count = 0,
    today_blog_count = 0,
    last_reset_date = v_kst_date
  WHERE id = p_account_id
    AND last_reset_date < v_kst_date;

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
