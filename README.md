# Naver Brand Connect Automation

네이버 브랜드커넥트 자동화 도구 - 카페/블로그 자동 글쓰기

## Features

- **Gemini AI 콘텐츠 생성**: 상품 정보 기반 자연스러운 글 자동 작성
- **카페 자동 글쓰기**: 24시간 자동 실행, 볼드 처리, 해시태그 자동 생성
- **블로그 자동 글쓰기**: 2500-3500자 장문 콘텐츠, 이미지 자동 배치
- **스마트 이미지 수집**: 스마트스토어에서 실제 상품 이미지 자동 다운로드
- **Portable 배포**: Node.js 없이 실행 가능한 standalone 패키지

## Requirements

- Node.js 18+
- Gemini API Key

## Installation

```bash
# Clone repository
git clone https://github.com/coreashield/naver_brand_connect.git
cd naver_brand_connect

# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium
```

## Configuration

`.env` 파일 생성:

```env
NAVER_ID = your_naver_id
NAVER_PW = your_naver_password
CAFE_ADR = https://cafe.naver.com/ca-fe/cafes/YOUR_CAFE_ID/articles/write?boardType=L
GEMINI_API_KEY = your_gemini_api_key
```

## Usage

### 1. 상품 링크 크롤링

```bash
node link_crawler.js
```

`output/product_links.json`에 상품 목록 저장

### 2. 카페 자동 글쓰기

```bash
node cafe_writer.js
```

또는 배치 파일 실행:
```
카페글쓰기.bat
```

### 3. 블로그 자동 글쓰기

```bash
node blog_writer.js
```

또는 배치 파일 실행:
```
blog_auto.bat
```

## Portable Deployment (Node.js 없이 배포)

다른 컴퓨터에 Node.js 설치 없이 배포하려면:

```bash
# Standalone 패키지 생성
create_standalone_package.bat
```

생성된 `cafe_standalone` 폴더를 복사하여 배포:

```
cafe_standalone/
├── START.bat      ← 실행 파일
├── .env           ← 설정 (수정 필요)
├── output/        ← product_links.json 여기에
├── node/          ← Node.js portable
├── browsers/      ← Chromium
└── node_modules/
```

대상 컴퓨터에서:
1. `.env` 파일 수정
2. `output/product_links.json` 준비
3. `START.bat` 실행

## File Structure

```
├── cafe_writer.js          # 카페 자동 글쓰기 (메인)
├── blog_writer.js          # 블로그 자동 글쓰기
├── link_crawler.js         # 상품 링크 크롤러
├── .env                    # 환경 설정 (git 제외)
├── output/
│   ├── product_links.json  # 상품 목록
│   ├── posted_products.json # 카페 게시 기록
│   └── blog_posted.json    # 블로그 게시 기록
└── cafe_standalone/        # Portable 패키지 (git 제외)
```

## Notes

- 게시 간격: 5-10분 랜덤 (스팸 방지)
- 상품 선택: 게시 횟수 낮은 것 우선
- 이미지: 최대 3장, 5KB 미만 에러 이미지 자동 제외
- 볼드 처리: Gemini가 **강조** 표시한 부분 자동 Ctrl+B 적용

## License

Private - For authorized use only
