# Naver Brand Connect - 배포 가이드

## 프로젝트 구조

```
shopping_connect/
├── src/                          # 소스 코드 (메인)
│   ├── writers/
│   │   ├── blog_writer_supabase.js   # 블로그 자동 글쓰기
│   │   └── cafe_writer_supabase.js   # 카페 자동 글쓰기 (200개/일)
│   ├── crawlers/
│   │   ├── link_crawler.js           # 상품 링크 크롤러
│   │   └── product_detail_crawler.js # 상품 상세 크롤러
│   ├── utils/
│   │   └── content_generator.js      # AI 콘텐츠 생성 (8가지 스타일)
│   └── supabase/
│       └── db.js                     # DB 연결
│
├── packages/                     # Portable 패키지 (배포용)
│   ├── node/                     # Node.js 런타임 포함
│   ├── browsers/                 # Chromium 브라우저 포함
│   ├── node_modules/             # 의존성 라이브러리 포함
│   ├── src/                      # 소스 코드 (sync.bat으로 동기화)
│   ├── START_BLOG.bat            # 블로그 실행
│   ├── START_CAFE.bat            # 카페 실행
│   └── .env                      # 환경설정 (직접 생성)
│
├── .env                          # 환경설정 (개발용)
├── .env.sample                   # 환경설정 템플릿
├── sync.bat                      # 코드 동기화 (src → packages/src)
├── setup.bat                     # 신규 설치 (GitHub에서 다운로드)
├── 블로그글쓰기.bat               # 블로그 실행 (개발환경용)
├── 카페글쓰기.bat                 # 카페 실행 (개발환경용)
└── portable_package_v2.zip       # 배포용 압축 파일
```

---

## 배포 시나리오

### 1. 최초 배포 (VM/신규 사용자)

**대상**: npm, git, VSCode 없는 환경

**방법**: portable_package_v2.zip 전달

**받는 사람 실행 방법**:
```
1. portable_package_v2.zip 압축 해제
2. .env.sample → .env 복사
3. .env 파일 편집 (NAVER_ID, NAVER_PW, SUPABASE 정보 등)
4. START_CAFE.bat 또는 START_BLOG.bat 실행
```

**필요 조건**: 없음 (모든 것 포함됨)

---

### 2. Clone 사용자 (개발환경)

**대상**: git clone 한 개발자/운영자

**최초 설치**:
```bash
git clone https://github.com/coreashield/naver_brand_connect.git
cd naver_brand_connect
setup.bat    # portable 패키지 다운로드 (node, browsers, node_modules)
```

**코드 업데이트 후 실행**:
```bash
git pull     # 코드 업데이트
sync.bat     # packages/src 동기화
packages\START_CAFE.bat   # 실행
```

---

### 3. 새 버전 배포 방법

**개발자 작업**:
```bash
# 1. 코드 수정 후
git add .
git commit -m "업데이트 내용"
git push

# 2. packages/src 동기화
sync.bat

# 3. 새 portable zip 생성
powershell Compress-Archive -Path packages\* -DestinationPath portable_package_v2.zip -Force

# 4. GitHub Releases에 업로드 (선택)
gh release create v2.0 portable_package_v2.zip
```

---

## 환경설정 (.env)

```env
# 네이버 계정
NAVER_ID=your_naver_id
NAVER_PW=your_naver_pw

# 카페 설정
CAFE_URL=https://cafe.naver.com/your_cafe
MENU_ID=123

# Supabase 설정
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# AI 설정
GEMINI_API_KEY=your_gemini_key

# 실행 모드 (선택)
HEADLESS=false
```

---

## 주요 기능

### 카페 글쓰기 (cafe_writer_supabase.js)
- 일일 한도: 200개
- 간격: 2~3분 (빠르게 작성)
- 00시 자동 리셋
- 24시간 연속 실행

### 블로그 글쓰기 (blog_writer_supabase.js)
- 해시태그: 15~30개 (상품 관련)
- 발행 버튼 자동 클릭
- AI 콘텐츠 8가지 스타일 랜덤

### 콘텐츠 생성 (content_generator.js)
- 스타일: 친근한추천, 전문분석, 스토리텔링, 비교분석, 감성소개, 실용정보, 트렌드소개, 가성비추천
- 이모지 사용 안 함
- [QUOTE] 태그 지원
- 모바일 최적화 (짧은 문장, 여백)

### 이미지 처리
- 첫 번째 이미지 스킵 (로고/배너 제외)
- 최소 5KB 이상만 다운로드
- 블로그: 5~8장, 카페: 3장

---

## 문제 해결

### "이미지 없음" 스킵
- 원인: 상품 페이지 삭제 또는 IP 차단
- 동작: 자동으로 다음 상품으로 넘어감

### 일일 한도 도달
- 동작: 자정까지 자동 대기 후 재시작

### 로그인 실패
- 원인: 캡챠 또는 2단계 인증
- 해결: 브라우저 모드(HEADLESS=false)로 수동 로그인
