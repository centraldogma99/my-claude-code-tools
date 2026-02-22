# OpenCode Worktree Plugin — 사용 가이드

Git worktree를 활용해 **격리된 브랜치 환경**을 만들고, 그 안에서 새 OpenCode 세션을 자동으로 시작하는 플러그인입니다. 메인 작업을 중단하지 않고 별도 브랜치에서 병렬 개발이 가능합니다.

---

## 요구 사항

- **런타임**: [Bun](https://bun.sh)
- **터미널**: tmux 또는 iTerm (macOS)
- **Git**: 프로젝트가 Git 저장소여야 합니다

---

## 설치

### 방법 1: 로컬 플러그인 (프로젝트 단위)

플러그인 파일들을 프로젝트의 `.opencode/plugins/` 디렉토리에 복사합니다.

```
your-project/
└── .opencode/
    └── plugins/
        └── worktree/
            ├── worktree.ts
            ├── state.ts
            ├── terminal.ts
            └── utils.ts
```

외부 의존성(`jsonc-parser`)을 사용하므로, `.opencode/package.json`에 추가합니다.

```json
{
  "dependencies": {
    "jsonc-parser": "^3.0.0"
  }
}
```

OpenCode가 시작할 때 자동으로 `bun install`을 실행하여 의존성을 설치합니다.

### 방법 2: 로컬 플러그인 (글로벌)

모든 프로젝트에서 사용하려면 `~/.config/opencode/plugins/` 디렉토리에 동일하게 배치합니다.

```
~/.config/opencode/
└── plugins/
    └── worktree/
        ├── worktree.ts
        ├── state.ts
        ├── terminal.ts
        └── utils.ts
```

### 방법 3: npm 패키지

npm에 퍼블리시된 경우, `opencode.json`에 패키지 이름을 추가합니다.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-worktree"]
}
```

---

## 제공 도구

### `worktree_create`

새 Git worktree를 생성하고, 새 터미널 창에서 OpenCode를 엽니다.

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `branch` | 권장 | 생성할 브랜치 이름 (예: `feature/dark-mode`) |
| `baseBranch` | 선택 | 베이스 브랜치 (기본값: 현재 HEAD) |

**동작 순서:**

1. 지정한 브랜치로 Git worktree 생성
2. 설정 파일에 따라 파일 복사 / 디렉토리 심링크
3. `postCreate` 훅 실행
4. 현재 OpenCode 세션을 포크하여 새 터미널에서 실행

**사용 예시:**

```
# 대화 중 AI가 자동으로 호출
"이 기능은 별도 브랜치에서 작업해줘"

# 브랜치와 베이스를 직접 지정
worktree_create(branch="fix/login-bug", baseBranch="main")
```

> **참고**: `branch`를 생략하면 대화 맥락에서 자동으로 이름을 추론합니다. 맥락이 부족하면 사용자에게 물어봅니다.

---

### `worktree_delete`

현재 세션의 worktree를 삭제 예약합니다.

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `reason` | 예 | 삭제 사유 |

**동작 순서:**

1. 삭제 대기 상태로 마킹
2. 세션이 유휴 상태가 되면 자동으로:
   - `preDelete` 훅 실행
   - 모든 변경사항 커밋 (스냅샷)
   - worktree 제거

> 즉시 삭제되지 않고, **세션 종료 시 안전하게 정리**됩니다. 작업 중인 변경사항은 커밋으로 보존됩니다.

---

## 설정

프로젝트 루트의 `.opencode/worktree.jsonc` 파일로 동작을 커스터마이즈할 수 있습니다. 파일이 없으면 첫 실행 시 기본 템플릿이 자동 생성됩니다.

```jsonc
{
  "sync": {
    // worktree 생성 시 메인 프로젝트에서 복사할 파일
    "copyFiles": [".env", ".env.local", "config.local.json"],

    // 복사 대신 심볼릭 링크로 공유할 디렉토리
    "symlinkDirs": ["node_modules", ".next/cache"],

    // (예약됨, 현재 미사용)
    "exclude": []
  },
  "hooks": {
    // worktree 생성 직후 실행할 쉘 명령
    "postCreate": ["bun install", "cp .env.example .env"],

    // worktree 삭제 직전 실행할 쉘 명령
    "preDelete": ["bun run clean"]
  }
}
```

### 설정 항목 설명

| 항목 | 용도 | 예시 |
|------|------|------|
| `sync.copyFiles` | Git에 추적되지 않는 설정 파일을 워크트리로 복사 | `.env`, `credentials.json` |
| `sync.symlinkDirs` | 용량이 큰 디렉토리를 심링크로 공유하여 디스크 절약 | `node_modules`, `.venv` |
| `hooks.postCreate` | 워크트리 생성 후 의존성 설치 등 초기화 | `npm install`, `pip install -r requirements.txt` |
| `hooks.preDelete` | 워크트리 삭제 전 임시 파일 정리 등 | `make clean`, `rm -rf dist` |

---

## 터미널 지원

| 환경 | 동작 |
|------|------|
| **tmux 세션 내** | 같은 tmux 세션에 새 윈도우 생성 |
| **tmux 외 (macOS)** | iTerm에 새 탭 생성 |

- tmux 여부는 `$TMUX` 환경변수로 자동 감지됩니다.
- tmux가 아닌 경우 macOS의 iTerm을 기본으로 사용합니다.

---

## 일반적인 워크플로우

### 1. 기능 개발을 별도 브랜치에서 시작

```
사용자: "다크모드 기능을 별도 브랜치에서 구현해줘"

→ worktree_create(branch="feature/dark-mode")
→ 새 터미널이 열리고, 포크된 세션에서 작업 시작
→ 메인 세션은 그대로 유지
```

### 2. 핫픽스를 main 기준으로 생성

```
사용자: "main 브랜치 기준으로 로그인 버그 수정해줘"

→ worktree_create(branch="hotfix/login", baseBranch="main")
→ main에서 분기한 별도 환경에서 수정 작업
```

### 3. 작업 완료 후 정리

```
사용자: "이 워크트리 정리해줘"

→ worktree_delete(reason="작업 완료")
→ 변경사항 자동 커밋 후 워크트리 제거
```

---

## 파일 저장 위치

| 항목 | 경로 |
|------|------|
| 워크트리 디렉토리 | `~/.local/share/opencode/worktree/{projectId}/{branch}` |
| 플러그인 상태 | `~/.local/share/opencode/plugins/worktree/{projectId}.json` |

- `{projectId}`는 Git 저장소의 루트 커밋 해시로 결정됩니다.

---

## 알아두면 좋은 점

- **세션 포크**: 워크트리의 OpenCode 세션은 원래 세션에서 포크되므로, **기존 대화 맥락과 계획이 유지**됩니다.
- **자동 커밋**: 워크트리 삭제 시 모든 변경사항이 `chore(worktree): session snapshot` 메시지로 자동 커밋됩니다. 작업 내용이 유실되지 않습니다.
- **동시 삭제 제한**: 한 번에 하나의 워크트리만 삭제 예약할 수 있습니다.
- **브랜치 자동 생성**: 지정한 브랜치가 존재하지 않으면 자동으로 생성됩니다. 이미 존재하면 해당 브랜치를 체크아웃합니다.
- **iTerm 전용**: tmux를 사용하지 않는 경우 macOS iTerm만 지원합니다 (Terminal.app, Warp 등은 미지원).
