# 릴리스 가이드

## 새 버전 배포 방법 (자동화)

### 1. 코드 수정 및 version.json 업데이트

```json
{
  "version": "1.1.0",
  "updated_at": "2025-01-15",
  "changes": [
    "새로운 기능 설명",
    "버그 수정 내용"
  ]
}
```

### 2. Git 커밋 및 태그 푸시

```bash
git add .
git commit -m "v1.1.0: 변경사항 설명"
git tag v1.1.0
git push origin main
git push origin v1.1.0
```

### 3. 자동 빌드 및 릴리스 (GitHub Actions)

태그 푸시 시 자동으로:
1. Portable Node.js 20.11.0 다운로드
2. Chromium 브라우저 설치
3. 소스코드 + 의존성 패키징
4. `shopping_connect_vX.X.X.zip` 생성
5. GitHub Releases에 업로드

**→ 수동 작업 불필요!**

---

## 클라이언트 업데이트 (VM/PC)

### 방법 1: 자동 업데이트
```
UPDATE.bat 더블클릭
```
→ 버전 확인 → 새 버전이면 자동 다운로드 & 압축해제

### 방법 2: 수동 다운로드
1. GitHub Releases 페이지 방문
2. 최신 `shopping_connect_vX.X.X.zip` 다운로드
3. 압축 해제 (기존 폴더 덮어쓰기)

---

## 패키지 포함 내용

| 항목 | 설명 |
|------|------|
| `node/` | Portable Node.js 20.11.0 |
| `browsers/` | Chromium 브라우저 |
| `src/` | 소스코드 |
| `node_modules/` | npm 패키지 |
| `START_CAFE.bat` | 카페 글쓰기 실행 |
| `START_BLOG.bat` | 블로그 글쓰기 실행 |
| `START_SYNC.bat` | 상품 동기화 실행 |
| `UPDATE.bat` | 자동 업데이트 |

---

## 버전 규칙 (Semantic Versioning)

- **1.0.0 → 1.0.1**: 버그 수정 (patch)
- **1.0.0 → 1.1.0**: 새 기능 추가 (minor)
- **1.0.0 → 2.0.0**: 호환성 깨지는 변경 (major)

---

## 업데이트 시 보존되는 항목

- `.env` (환경설정)
- `output/` (출력 파일)
- `playwright-data/` (브라우저 세션)
- `browsers/` (기존 브라우저)
