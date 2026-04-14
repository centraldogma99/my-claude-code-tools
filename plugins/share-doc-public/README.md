# share-doc-public

HTML 또는 Markdown 파일을 **공개(public)** share-doc 레포지토리에 업로드하여 GitHub Pages로 공유하는 플러그인입니다.

> ⚠️ 업로드되는 문서는 **누구나 접근 가능한 공개 문서**가 됩니다.
> 사내 정보/기밀이 포함된 경우 `share-doc` (GHES, 사내 전용) 플러그인을 사용하세요.

## 사용법

```
/share-doc-public report.html
/share-doc-public spec.md
/share-doc-public ./dist/index.html
/share-doc-public docs/guide.md
```

## 동작

1. 인자로 받은 HTML/Markdown 파일을 찾는다
2. 공개 여부를 사용자에게 한 번 확인
3. `gh api`로 `MicroprotectCorp/share-doc` 레포지토리에 직접 업로드 (로컬 clone 불필요)
4. GitHub Pages URL 안내

## 사전 조건

- `gh` CLI 설치 및 공개 GitHub 인증 (`gh auth login --hostname github.com`)

## GitHub Pages URL

```
https://microprotectcorp.github.io/share-doc/{파일명}
```

## share-doc vs share-doc-public

| 플러그인 | 레포지토리 | 호스트 | 접근 범위 |
|---------|----------|--------|----------|
| `share-doc` | `jobisnvillains/share-doc` | `github.jobis.co` (GHES) | 사내 구성원만 |
| `share-doc-public` | `MicroprotectCorp/share-doc` | `github.com` | 누구나 (공개) |
