# 릴리스 가이드

## 새 버전 배포 방법

### 1. 코드 수정 후 version.json 업데이트

```json
{
  "version": "1.1.0",  // 버전 증가
  "updated_at": "2025-01-15",
  "changes": [
    "새로운 기능 설명",
    "버그 수정 내용"
  ]
}
```

### 2. Git 커밋 및 태그 생성

```bash
git add .
git commit -m "v1.1.0: 새로운 기능 추가"
git tag v1.1.0
git push origin main
git push origin v1.1.0
```

### 3. GitHub Releases 생성 (선택)

1. GitHub 저장소 → Releases → "Create a new release"
2. 태그 선택: v1.1.0
3. 릴리스 제목: v1.1.0
4. 설명 작성 (변경사항)
5. "Publish release" 클릭

---

## 클라이언트 설정

### updater.js 설정 (완료됨)

```javascript
const CONFIG = {
  github: {
    owner: 'coreashield',
    repo: 'shopping_connect',
    branch: 'main'
  }
};
```

---

## 사용법

### 수동 업데이트 확인
```bash
node updater.js
```

### 자동 실행 (업데이트 포함)
```bash
node auto_run.js cafe    # 카페
node auto_run.js blog    # 블로그
node auto_run.js both    # 둘 다
```

### 배치 파일 실행
```
start.bat           # 메뉴 표시
start.bat cafe      # 카페 직접 실행
start.bat blog      # 블로그 직접 실행
start.bat update    # 업데이트 확인
```

---

## 버전 규칙 (Semantic Versioning)

- **1.0.0 → 1.0.1**: 버그 수정 (patch)
- **1.0.0 → 1.1.0**: 새 기능 추가 (minor)
- **1.0.0 → 2.0.0**: 호환성 깨지는 변경 (major)
