# Supabase 설정 가이드

네이버 브랜드커넥트 자동화 도구를 Supabase DB와 연동하는 방법입니다.

## 1. Supabase 프로젝트 생성

### 방법 A: 자동 설정 (권장)

```bash
node src/supabase/setup.js
```

Access Token 입력 후 자동으로:
- 프로젝트 생성
- API 키 발급
- .env 파일 업데이트

### 방법 B: 수동 설정

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. "New Project" 클릭
3. 프로젝트 이름, 비밀번호, 리전 설정 (ap-northeast-2 권장)
4. 프로젝트 생성 완료 대기 (1-2분)

## 2. 테이블 생성

Supabase 대시보드에서:
1. SQL Editor 클릭
2. `src/supabase/schema.sql` 파일 내용 복사
3. 붙여넣기 후 "Run" 클릭

생성되는 테이블:
- `products` - 상품 정보
- `workers` - VM/환경 정보
- `posts` - 게시 기록
- `task_queue` - 작업 큐
- `product_post_counts` - 게시 횟수 뷰

## 3. API 키 설정

Supabase 대시보드에서:
1. Settings → API 클릭
2. "Project URL" 복사
3. "service_role" 키 복사 (보안 주의!)

`.env` 파일에 추가:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxxx
SUPABASE_SERVICE_KEY=eyJxxxxx
```

## 4. 연결 테스트

```bash
node test_supabase.js
```

모든 테스트가 통과하면 설정 완료!

## 5. 기존 데이터 마이그레이션

기존 JSON 파일의 데이터를 DB로 이전:

```bash
node src/supabase/migrate.js
```

마이그레이션 대상:
- `output/product_links.json` → `products` 테이블
- `output/posted_products.json` → `posts` 테이블 (카페)
- `output/blog_posted.json` → `posts` 테이블 (블로그)

## 6. Supabase 버전 스크립트 사용

### 카페 자동 글쓰기
```bash
node cafe_writer_supabase.js
```

### 블로그 자동 글쓰기
```bash
node blog_writer_supabase.js
```

### Full Sync (링크 발급 + 크롤링)
```bash
node full_sync_supabase.js
```

## 분산 환경 설정

여러 VM에서 동시에 실행할 때:

1. 각 VM에 고유한 `WORKER_NAME` 설정:
```env
WORKER_NAME=vm-01-cafe
```

2. 각 VM에서 동일한 Supabase 키 사용

3. `product_post_counts` 뷰를 통해 자동으로 게시 횟수가 적은 상품 선택

## 파일 구조

```
src/supabase/
├── db.js        # Supabase 클라이언트 및 API
├── schema.sql   # 테이블 스키마
├── migrate.js   # JSON → DB 마이그레이션
└── setup.js     # 자동 프로젝트 설정

cafe_writer_supabase.js   # 카페 자동 글쓰기 (Supabase)
blog_writer_supabase.js   # 블로그 자동 글쓰기 (Supabase)
full_sync_supabase.js     # Full Sync (Supabase)
test_supabase.js          # 연동 테스트
```

## 트러블슈팅

### "테이블을 찾을 수 없음" 오류
→ `schema.sql`을 SQL Editor에서 실행

### "연결 실패" 오류
→ `.env`의 SUPABASE_URL, SUPABASE_SERVICE_KEY 확인

### "권한 없음" 오류
→ `schema.sql`의 RLS 정책 부분 다시 실행

### 상품이 조회되지 않음
→ `node src/supabase/migrate.js` 실행하여 데이터 이전
