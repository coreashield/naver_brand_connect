# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Naver Brand Connect automation tool for affiliate marketing. Automatically posts product content to Naver Cafe and Blog platforms using Playwright browser automation and Gemini AI for content generation.

**Language**: JavaScript (ES Modules)
**Runtime**: Node.js 18+
**Key Dependencies**: Playwright, Gemini AI, Supabase, Sharp

## Commands

### Installation
```bash
npm install
npx playwright install chromium
```

### Main Operations
```bash
# Full sync: Link issuance + product crawling + JSON update
node full_sync.js

# Cafe auto-posting (JSON mode)
node cafe_writer.js

# Blog auto-posting (JSON mode)
node app.js

# Supabase-based operations (distributed mode)
node src/writers/cafe_writer_supabase.js
node src/writers/blog_writer_supabase.js
node full_sync_supabase.js

# CLI content generator
node src/index.js --url "product_url"
node src/index.js --mode daily    # Show daily guide
node src/index.js --mode stats    # Show statistics
```

### Testing & Setup
```bash
node test_supabase.js             # Test Supabase connection
node src/supabase/setup.js        # Auto-setup Supabase project
node src/supabase/migrate.js      # Migrate JSON data to Supabase
```

## Architecture

```
src/
├── writers/           # Auto-posting scripts (Supabase versions)
│   ├── cafe_writer_supabase.js    # Cafe posting (200/day limit)
│   └── blog_writer_supabase.js    # Blog posting (5-8 images)
├── crawlers/          # Data collection
│   ├── link_crawler.js            # Affiliate link extraction
│   ├── product_detail_crawler.js  # Product details scraping
│   └── naver_url_enricher.js      # Naver Shopping URL resolution
├── supabase/          # Database layer
│   ├── db.js          # Supabase client & API functions
│   ├── schema.sql     # PostgreSQL schema (products, workers, posts, task_queue)
│   └── migrate.js     # JSON to Supabase migration
├── utils/
│   ├── content_generator.js       # Gemini AI prompts (8 writing styles)
│   └── title_suffixes.js          # Title variations
└── index.js           # CLI entry point

# Root-level scripts (standalone versions using JSON files)
app.js                 # Blog writer (main)
cafe_writer.js         # Cafe writer
full_sync.js           # Link issuance + crawling combo
auto_link_issuer.js    # Affiliate link generator
```

## Data Flow

1. **Link Issuance** (`auto_link_issuer.js`/`full_sync.js`): Login to Brand Connect → Issue affiliate links for all 14 categories
2. **Crawling** (`link_crawler.js`): Extract product data from issued links → Save to `output/product_links.json`
3. **Posting** (`cafe_writer.js`/`blog_writer.js`): Select product with lowest post count → Generate AI content → Post via Playwright
4. **Tracking**: Record posts to `output/posted_products.json` (JSON) or `posts` table (Supabase)

## Supabase Schema

- `products`: Product catalog with affiliate links
- `workers`: VM/environment registration for distributed posting
- `posts`: Post history with success/failure tracking
- `task_queue`: Distributed task management
- `product_post_counts`: View for selecting least-posted products

## Key Patterns

### Browser Automation
- Uses Playwright with Chromium in persistent context mode
- Login handled via cookie persistence in `./playwright-data`
- CAPTCHA detection: waits for manual solving when detected

### Content Generation
- 8 writing styles: friendly, expert, storytelling, comparison, emotional, practical, trend, value
- Gemini generates Korean content with `[QUOTE]` markers for highlighted text
- Images: Skip first image (logo/banner), minimum 5KB size validation

### Posting Limits
- Cafe: 200 posts/day, auto-reset at midnight, 2-3 minute intervals
- Blog: Longer content (2500-3500 chars), 15-30 hashtags

## Environment Variables

Required in `.env`:
```
NAVER_ID, NAVER_PW       # Naver credentials
GEMINI_API_KEY           # Google AI API
CAFE_ADR                 # Cafe write page URL
SUPABASE_URL             # (Optional) Supabase project URL
SUPABASE_SERVICE_KEY     # (Optional) Supabase service role key
```

## Portable Deployment

The `packages/` directory contains a self-contained distribution with Node.js runtime and Chromium browser. Use `sync.bat` to sync source code changes to the portable package.

## Release & Deployment (중요!)

코드 수정 후 반드시 GitHub Releases에 배포해야 함. 클라이언트 PC/VM이 자동 업데이트로 받아감.

### 릴리스 절차 (필수)

```bash
# 1. version.json 버전 업데이트 (예: 1.1.0 → 1.2.0)
# 2. 커밋
git add .
git commit -m "v1.2.0: 변경사항 설명"

# 3. 태그 생성 및 푸시
git tag v1.2.0
git push origin main
git push origin v1.2.0
```

→ GitHub Actions가 자동으로:
- Portable Node.js + Chromium 패키지 빌드
- `shopping_connect_vX.X.X.zip` 생성
- GitHub Releases에 업로드

### 클라이언트 업데이트

배포된 PC/VM에서:
```
INSTALL.bat 더블클릭 → 자동으로 최신 버전 다운로드 & 설치
```

### 버전 규칙

- **patch** (1.0.0 → 1.0.1): 버그 수정
- **minor** (1.0.0 → 1.1.0): 새 기능 추가
- **major** (1.0.0 → 2.0.0): 호환성 변경

### 주의사항

- 코드만 push하고 태그 없이 끝내면 클라이언트에 배포 안됨!
- 반드시 `git tag vX.X.X` + `git push origin vX.X.X` 필요
