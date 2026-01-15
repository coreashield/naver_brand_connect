-- =====================================================
-- Naver Brand Connect - Cafe Alias Column Patch
-- cafe_alias 컬럼 추가 (카페 메인/가입 URL 구성용)
-- =====================================================

-- 1. naver_accounts 테이블에 cafe_alias 컬럼 추가
ALTER TABLE naver_accounts
ADD COLUMN IF NOT EXISTS cafe_alias TEXT;

-- 2. 컬럼 코멘트 추가
COMMENT ON COLUMN naver_accounts.cafe_alias IS '카페 별칭 (예: todaydeuktem) - 카페 메인/가입 URL 구성에 사용';

-- 3. naver_accounts_with_kst 뷰 재생성 (cafe_alias 포함)
-- 참고: 기존 뷰가 없으면 이 부분은 건너뛰어도 됩니다
CREATE OR REPLACE VIEW naver_accounts_with_kst AS
SELECT
  na.id,
  na.naver_id,
  na.naver_pw,
  na.blog_id,
  na.cafe_url,
  na.cafe_alias,
  na.today_cafe_count,
  na.today_blog_count,
  na.daily_cafe_limit,
  na.daily_blog_limit,
  na.last_reset_date,
  na.memo,
  na.status,
  na.created_at,
  na.updated_at
FROM naver_accounts na;

-- =====================================================
-- 사용 예시:
-- 카페 메인 URL: https://cafe.naver.com/{cafe_alias}
-- 카페 가입 URL: https://cafe.naver.com/{cafe_alias}/join
-- =====================================================

-- 패치 완료 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'naver_accounts'
AND column_name = 'cafe_alias';
