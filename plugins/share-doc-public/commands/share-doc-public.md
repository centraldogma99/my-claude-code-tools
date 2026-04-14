---
argument-hint: 업로드할 파일 경로 (예: report.html, spec.md, ./dist/index.html)
---

HTML 또는 Markdown 파일을 공개 share-doc 레포지토리에 업로드하여 GitHub Pages로 공유합니다.

> ⚠️ **주의**: 이 플러그인으로 업로드되는 문서는 **누구나 접근 가능한 공개(public) 문서**가 됩니다.
> 사내 정보/기밀/민감한 내용이 포함된 경우 `/share-doc` (GHES, 사내 전용) 을 사용하세요.

업로드할 파일: $ARGUMENTS

## 설정

- 공개 GitHub 레포: `MicroprotectCorp/share-doc` (호스트: `github.com`)
- `gh` CLI 인증 필요 (`gh auth login --hostname github.com`)

## 절차

1. 인자로 받은 파일을 찾는다. 상대 경로인 경우 현재 작업 디렉토리 기준으로 해석한다.
2. 파일이 존재하지 않으면 사용자에게 알리고, 파일명이나 경로를 확인하도록 안내한다.
3. **업로드 전 공개 여부 확인**: 파일 내용에 사내 정보/기밀/민감한 내용이 포함돼 있는지 점검하고, 업로드해도 괜찮은지 사용자에게 한 번 확인받는다.
4. `gh api`를 사용하여 파일을 share-doc 레포지토리에 업로드한다.
   - 먼저 해당 경로에 기존 파일이 있는지 확인한다:
     `gh api repos/MicroprotectCorp/share-doc/contents/{파일경로} --hostname github.com`
   - 기존 파일이 있으면 덮어쓸지 사용자에게 확인한다. 덮어쓸 경우 응답의 `sha` 값을 사용한다.
   - 파일 내용을 base64로 인코딩하여 업로드한다:
     ```
     gh api repos/MicroprotectCorp/share-doc/contents/{파일경로} \
       --hostname github.com \
       --method PUT \
       -f message="docs: share {파일명}" \
       -f content="{base64 인코딩된 내용}" \
       -f sha="{기존 파일 sha, 신규면 생략}"
     ```
   - 별도 요청이 없으면 레포지토리 루트에 배치한다.
5. 업로드 성공 시 GitHub Pages URL을 안내하고 종료한다:
   `https://microprotectcorp.github.io/share-doc/{파일명}`
   - 하위 디렉토리에 배치한 경우: `https://microprotectcorp.github.io/share-doc/{경로}/{파일명}`
   - **Markdown 파일(`.md`)인 경우**: GitHub Pages는 `.md` 확장자 없이 접근해야 하므로, URL 안내 시 파일명에서 `.md`를 제거한다.
     - 예: `spec.md` 업로드 → `https://microprotectcorp.github.io/share-doc/spec`
     - 예: `docs/guide.md` 업로드 → `https://microprotectcorp.github.io/share-doc/docs/guide`
6. 업로드 실패 시 (인증 오류, 네트워크 문제 등):
   - 무엇이 잘못되었는지 명확히 설명한다.
   - 가능한 대안을 제시한다 (gh auth 확인, 재시도 등).
