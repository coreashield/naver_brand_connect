# Naver Brand Connect 자동화 프로젝트

## 프로젝트 개요
네이버 브랜드커넥트 상품을 블로그/카페에 자동으로 포스팅하는 도구

## 핵심 파일

### 글쓰기 (src/writers/)
- `blog_writer_supabase.js` - 블로그 자동 글쓰기
- `cafe_writer_supabase.js` - 카페 자동 글쓰기 (200개/일, 2~3분 간격)

### 콘텐츠 생성 (src/utils/)
- `content_generator.js` - Gemini AI 기반 8가지 스타일 콘텐츠 생성

### 크롤러 (src/crawlers/)
- `link_crawler.js` - 브랜드커넥트에서 상품 링크 수집
- `product_detail_crawler.js` - 상품 상세 정보 크롤링

### DB (src/supabase/)
- `db.js` - Supabase 연결 및 CRUD

## 배포 구조

### Clone 사용자
```
git pull → sync.bat → packages\START_*.bat
```

### Portable 사용자 (VM)
```
portable_package_v2.zip 압축 해제 → .env 설정 → START_*.bat
```

## 주요 설정

### 카페 글쓰기
- DAILY_LIMIT = 200 (일일 한도)
- 간격: 2~3분 (빠르게 쓰고 00시까지 대기)
- 00시 자동 리셋

### 블로그 글쓰기
- 해시태그: 15~30개 (상품 관련만)
- 발행 버튼 2번 클릭 (첫 번째 → 해시태그 입력 → 최종 발행)

### 콘텐츠 생성
- 스타일: 8가지 랜덤 선택
- 이모지/이모티콘: 사용 안 함
- [QUOTE] 태그: 핵심 메시지 3~5개
- 모바일 최적화: 짧은 문장, 줄바꿈 많이

### 이미지 처리
- 첫 번째 이미지 스킵 (로고/배너 제외)
- 최소 5KB 이상만 다운로드

## 파일 수정 시 주의사항

1. `src/` 수정 후 `sync.bat` 실행 필요 (packages/src 동기화)
2. portable zip 재배포 시 `packages/` 전체 압축
3. `.env`는 git에 포함 안 됨 (보안)
