---
name: create-worktree
description: Git worktree를 생성하고 iTerm2 새 탭에서 Claude를 실행하여 작업을 이어가게 합니다. "worktree 만들어", "worktree에서 작업", "워크트리" 등의 패턴으로 트리거됩니다.
---

# Create Worktree

현재 대화 맥락에서 worktree를 생성하고, 컨텍스트를 전달하여 새 Claude 세션에서 작업을 이어갑니다.

## 실행 절차

### 1. 브랜치 이름 결정

현재 대화에서 작업 내용을 파악하여 브랜치 이름을 자동 생성합니다:

- 기능 추가: `feat/<설명>` (예: `feat/claim-form-validation`)
- 버그 수정: `fix/<설명>` (예: `fix/login-redirect`)
- 리팩토링: `refactor/<설명>`
- 기타: `chore/<설명>`

작업 내용을 파악할 수 없으면 **AskUserQuestion**으로 사용자에게 이름을 요청합니다.

사용자가 직접 이름을 지정한 경우 해당 이름을 그대로 사용합니다.

### 2. 컨텍스트 요약 작성

현재 대화의 핵심 맥락을 마크다운으로 요약하여 임시 파일에 저장합니다.

파일 경로: `/tmp/claude-worktree-context-<timestamp>.md`

포함할 내용:

- **작업 목표**: 무엇을 해야 하는지
- **관련 파일**: 어떤 파일을 수정/참고해야 하는지
- **핵심 결정사항**: 이미 결정된 기술적 선택
- **주의사항**: 알려진 제약사항이나 주의점
- **진행 상황**: 이미 완료된 작업이 있다면

### 3. 스크립트 실행

Write tool로 컨텍스트 파일을 작성한 후, Bash tool로 스크립트를 실행합니다:

```bash
bash .claude/skills/create-worktree/scripts/create-worktree.sh \
  --name <브랜치명> \
  --source-dir <현재 프로젝트 루트 경로> \
  --context-file /tmp/claude-worktree-context-<timestamp>.md
```

선택적 파라미터:
- `--base-branch <branch>`: 기준 브랜치 지정 (기본: 현재 브랜치)
- `--skip-install`: pnpm install 건너뛰기

### 4. 결과 안내

사용자에게 다음을 안내합니다:

- worktree 경로
- 생성된 브랜치명
- iTerm2 새 탭에서 Claude가 실행되었음
- 새 세션에서 MEMORY.md를 통해 컨텍스트가 자동 전달됨
