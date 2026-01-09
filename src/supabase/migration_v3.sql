-- =====================================================
-- Naver Brand Connect - Migration V3
-- 일일 발급 추적 테이블 추가
-- Supabase 대시보드 SQL Editor에서 실행하세요
-- =====================================================

-- Daily Issuance 테이블 (일일 발급 추적)
CREATE TABLE IF NOT EXISTS daily_issuance (
  id BIGSERIAL PRIMARY KEY,
  issue_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  issued_count INT DEFAULT 0,
  target_count INT DEFAULT 1000,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_daily_issuance_date ON daily_issuance(issue_date);

-- RLS 정책
ALTER TABLE daily_issuance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON daily_issuance FOR ALL USING (true);

-- =====================================================
-- 일일 발급 카운트 증가 함수 (원자적 연산)
-- =====================================================
CREATE OR REPLACE FUNCTION increment_daily_issuance(increment_by INT DEFAULT 1)
RETURNS INT AS $$
DECLARE
  current_count INT;
BEGIN
  -- 오늘 레코드가 없으면 생성
  INSERT INTO daily_issuance (issue_date, issued_count, started_at)
  VALUES (CURRENT_DATE, 0, NOW())
  ON CONFLICT (issue_date) DO NOTHING;

  -- 카운트 증가 및 현재 값 반환
  UPDATE daily_issuance
  SET issued_count = issued_count + increment_by
  WHERE issue_date = CURRENT_DATE
  RETURNING issued_count INTO current_count;

  RETURN current_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 설정 완료!
-- =====================================================
