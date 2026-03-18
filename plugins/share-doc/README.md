# share-doc

HTML 또는 Markdown 파일을 share-doc 레포지토리에 업로드하여 GitHub Pages로 공유하는 플러그인입니다.

## 사용법

```
/share-doc report.html
/share-doc spec.md
/share-doc ./dist/index.html
/share-doc docs/map-allocation-workshop-mvp.html
```

## 동작

1. 인자로 받은 HTML/Markdown 파일을 찾는다
2. `gh api`로 `jobisnvillains/share-doc` 레포지토리에 직접 업로드 (로컬 clone 불필요)
3. GitHub Pages URL 안내

## 사전 조건

- `gh` CLI 설치 및 GitHub Enterprise 인증 (`gh auth login --hostname github.jobis.co`)

## GitHub Pages URL

```
https://pages.github.jobis.co/jobisnvillains/share-doc/{파일명}
```
