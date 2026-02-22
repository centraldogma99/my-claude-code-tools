# OpenCode Worktree Plugin — 분석 문서

## 개요

Git worktree를 활용하여 **격리된 개발 환경을 자동 생성/삭제**하는 [OpenCode](https://opencode.ai) 플러그인이다. 워크트리 생성 시 새 터미널에서 OpenCode 세션을 포크하여, 독립적인 브랜치에서 **병렬 개발**이 가능하다.

**런타임**: Bun (`Bun.spawn`, `Bun.file`, `Bun.write`, `Bun.sleep` 등 사용)

---

## 파일 구조

```
worktree/
├── worktree.ts   # 메인 플러그인 (tools + event handler)
├── state.ts      # JSON 파일 기반 세션/상태 관리
├── terminal.ts   # 터미널 열기 (tmux / iTerm)
└── utils.ts      # 유틸리티 (escape, Mutex, projectId 등)
```

---

## 아키텍처

```
┌──────────────────────────────────────────────────────┐
│  OpenCode Host (Plugin Context)                      │
│  ctx.directory, ctx.client                           │
└─────────┬────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────┐
│  WorktreePlugin (worktree.ts)                        │
│                                                      │
│  Tools:                                              │
│  ├─ worktree_create  → git worktree add + fork 세션  │
│  └─ worktree_delete  → pendingDelete 마킹            │
│                                                      │
│  Event Handler:                                      │
│  └─ session.idle → 실제 삭제 수행 (commit + remove)   │
└──────┬───────────┬───────────┬───────────────────────┘
       │           │           │
       ▼           ▼           ▼
   state.ts    terminal.ts   utils.ts
   (JSON 상태)  (tmux/iTerm)  (escape, Mutex, projectId)
```

---

## 모듈별 상세 분석

### 1. `worktree.ts` — 메인 플러그인 (299줄)

**Export**: `WorktreePlugin: Plugin`

| 구성 요소 | 설명 |
|-----------|------|
| **`worktree_create` tool** | 워크트리 생성 → config 동기화 → 세션 포크 → 터미널 오픈 |
| **`worktree_delete` tool** | 즉시 삭제하지 않고 `pendingDelete`로 마킹만 함 |
| **`session.idle` event** | 세션 유휴 시 pending 워크트리를 실제 삭제 (commit → remove) |

**핵심 흐름 — `worktree_create`:**

```
1. 브랜치명 유효성 검사 (validateBranch)
2. git worktree add (기존 브랜치면 checkout, 없으면 -b 생성)
3. .opencode/worktree.jsonc 설정 로드
4. copyFiles: 설정된 파일들을 워크트리로 복사
5. symlinkDirs: 설정된 디렉토리를 심볼릭 링크
6. postCreate 훅 실행
7. OpenCode 세션 포크 (plan.md + delegations 복사)
8. 새 터미널에서 opencode --session <forked_id> 실행
9. 세션 상태 저장
```

**핵심 흐름 — `worktree_delete` → `session.idle`:**

```
1. [worktree_delete] pendingDelete 상태에 {branch, path} 저장
2. [session.idle 이벤트] pending 감지 시:
   a. preDelete 훅 실행
   b. git add -A && git commit (스냅샷)
   c. git worktree remove --force
   d. 상태 정리
```

**설정 파일 (`WorktreeConfig`):**

```jsonc
// .opencode/worktree.jsonc
{
  "sync": {
    "copyFiles": [".env", "config.json"],    // 워크트리로 복사할 파일
    "symlinkDirs": ["node_modules", ".git"], // 심볼릭 링크로 공유할 디렉토리
    "exclude": []                            // (현재 미사용)
  },
  "hooks": {
    "postCreate": ["npm install"],           // 워크트리 생성 후 실행할 명령
    "preDelete": ["npm run clean"]           // 워크트리 삭제 전 실행할 명령
  }
}
```

**주요 내부 함수:**

| 함수 | 역할 |
|------|------|
| `validateBranch(name)` | Git 브랜치명 유효성 검사 (길이, 특수문자, 예약어 등) |
| `pathExists(filePath)` | `ENOENT`만 false, 그 외 에러는 throw |
| `getRootSessionId(client, sessionId)` | 세션 체인을 최대 10단계까지 순회하여 루트 세션 ID 반환 |
| `forkWithContext(client, sessionId, projectId)` | 세션 포크 + plan.md/delegations 복사 (실패 시 롤백) |
| `git(args, cwd)` | Git 명령 실행 래퍼 (`Bun.spawn`) |
| `createWorktree(repoRoot, branch, baseBranch?)` | `git worktree add` 실행 |
| `removeWorktree(repoRoot, worktreePath)` | `git worktree remove --force` |
| `isPathSafe(relPath, baseDir)` | path traversal 방지 (절대경로, `..` 차단) |
| `copyFiles(src, dest, files, log)` | 설정된 파일들을 안전하게 복사 |
| `symlinkDirs(src, dest, dirs, log)` | 설정된 디렉토리를 심볼릭 링크 |
| `runHooks(cwd, commands, log)` | Bash 훅 명령 순차 실행 |
| `loadWorktreeConfig(directory)` | `.opencode/worktree.jsonc` 파싱 (없으면 기본값 생성) |

---

### 2. `state.ts` — 상태 관리 (73줄)

JSON 파일 기반의 플러그인 상태 관리. 프로젝트별로 별도 상태 파일 유지.

**상태 파일 경로**: `~/.local/share/opencode/plugins/worktree/{projectId}.json`

**데이터 모델:**

```typescript
interface State {
  sessions: Session[]            // 활성 워크트리 세션 목록
  pendingDelete?: PendingDelete  // 삭제 대기 중인 워크트리
}

interface Session {
  id: string        // OpenCode 세션 ID
  branch: string    // Git 브랜치명
  path: string      // 워크트리 경로
  createdAt: string // ISO 8601
}

interface PendingDelete {
  branch: string
  path: string
}
```

**API:**

| 함수 | 설명 |
|------|------|
| `getStatePath(projectRoot)` | 프로젝트별 상태 파일 경로 반환 |
| `loadState(projectRoot)` | 상태 로드 (없으면 빈 상태) |
| `saveState(projectRoot, state)` | 상태 저장 (JSON pretty-print) |
| `getWorktreePath(projectRoot, branch)` | 워크트리 디스크 경로 계산 |
| `addSession(projectRoot, session)` | 세션 추가 (upsert 방식) |
| `getSession(projectRoot, sessionId)` | 세션 ID로 조회 |
| `removeSession(projectRoot, branch)` | 브랜치명으로 세션 제거 |
| `setPendingDelete(projectRoot, del)` | 삭제 대기 상태 설정 |
| `getPendingDelete(projectRoot)` | 삭제 대기 상태 조회 |
| `clearPendingDelete(projectRoot)` | 삭제 대기 상태 해제 |

**워크트리 경로**: `~/.local/share/opencode/worktree/{projectId}/{branch}`

---

### 3. `terminal.ts` — 터미널 관리 (114줄)

워크트리 생성 후 새 터미널 윈도우를 여는 로직. **tmux**와 **iTerm** 두 가지 방식을 지원.

**감지 로직:**

```
TMUX 환경변수 있음? → tmux 모드
없음? → iTerm 모드 (macOS 기본)
```

| 함수 | 설명 |
|------|------|
| `detectTerminalType()` | `$TMUX` 환경변수로 tmux/iterm 감지 |
| `openTmuxWindow(options)` | `tmux new-window`로 새 윈도우 생성 (Mutex 보호) |
| `openITermTerminal(cwd, command?)` | AppleScript로 iTerm 새 탭 생성 |
| `openTerminal(cwd, command?, windowName?)` | 감지 결과에 따라 위 둘 중 하나 호출 |
| `wrapWithSelfCleanup(script)` | `trap 'rm -f "$0"' EXIT`로 스크립트 자동 삭제 |

**tmux 방식:**

- `tmux new-window -n {windowName} -c {cwd}` 실행
- 임시 쉘 스크립트 생성 → 실행 후 자동 삭제
- `Mutex`로 동시 tmux 명령 직렬화
- 150ms 안정화 딜레이

**iTerm 방식:**

- AppleScript(`osascript`)로 iTerm 제어
- 현재 윈도우에 새 탭 생성
- 임시 쉘 스크립트 생성 → `write text`로 실행

---

### 4. `utils.ts` — 유틸리티 (95줄)

| 함수/클래스 | 설명 |
|-------------|------|
| `escapeBash(str)` | Bash 인젝션 방지 (`\`, `"`, `$`, `` ` ``, `!`, 개행 이스케이프) |
| `escapeAppleScript(str)` | AppleScript 인젝션 방지 (`\`, `"`, 개행 이스케이프) |
| `isInsideTmux()` | `$TMUX` 환경변수 존재 여부 |
| `getTempDir()` | OS 임시 디렉토리 (심볼릭 링크 resolve) |
| `getProjectId(projectRoot)` | Git 루트 커밋 해시 → 프로젝트 ID (실패 시 경로 SHA-256 앞 16자) |
| `Mutex` 클래스 | Promise 기반 뮤텍스 (`acquire`, `release`, `runExclusive`) |

**`getProjectId` 전략:**

```
1순위: git rev-list --max-parents=0 --all → 루트 커밋 해시 (40자 hex)
2순위: SHA-256(projectRoot).slice(0, 16) — Git 실패 시 폴백
```

---

## 데이터 플로우 — 전체 라이프사이클

```
[사용자: worktree_create 호출]
    │
    ├─ validateBranch("feature/dark-mode")
    ├─ git worktree add ~/.local/share/opencode/worktree/{pid}/feature/dark-mode
    ├─ loadWorktreeConfig → .opencode/worktree.jsonc
    ├─ copyFiles(.env, etc.)
    ├─ symlinkDirs(node_modules, etc.)
    ├─ runHooks(postCreate)
    ├─ forkWithContext(session) → plan.md + delegations 복사
    ├─ openTerminal(worktreePath, "opencode --session {forked.id}")
    └─ addSession(state)

    ... 격리된 워크트리에서 작업 ...

[사용자: worktree_delete 호출]
    │
    └─ setPendingDelete({branch, path})

[OpenCode: session.idle 이벤트 발생]
    │
    ├─ getPendingDelete()
    ├─ runHooks(preDelete)
    ├─ git add -A && git commit "session snapshot"
    ├─ git worktree remove --force
    ├─ clearPendingDelete()
    └─ removeSession()
```

---

## 디스크 레이아웃

```
~/.local/share/opencode/
├── worktree/
│   └── {projectId}/
│       └── {branch}/          ← 실제 워크트리 디렉토리
├── workspace/
│   └── {projectId}/
│       └── {sessionId}/
│           └── plan.md        ← 포크 시 복사되는 계획 파일
├── delegations/
│   └── {projectId}/
│       └── {sessionId}/       ← 포크 시 복사되는 위임 데이터
└── plugins/
    └── worktree/
        └── {projectId}.json   ← 플러그인 상태 파일
```

---

## 보안 고려사항

| 항목 | 구현 |
|------|------|
| Path traversal 방지 | `isPathSafe()` — 절대 경로/`..` 차단, `resolve` 후 prefix 검증 |
| Bash injection 방지 | `escapeBash()` — `"`, `$`, `` ` ``, `!` 등 이스케이프 |
| AppleScript injection 방지 | `escapeAppleScript()` — `"`, `\` 이스케이프 |
| Null byte 차단 | 양쪽 escape 함수 모두 `\x00` 포함 시 throw |
| 브랜치명 검증 | `validateBranch()` — 제어 문자, 쉘 메타 문자 차단 |
| 세션 체인 순환 방지 | `MAX_SESSION_CHAIN_DEPTH = 10` |
| tmux 레이스 컨디션 방지 | `Mutex` 클래스로 tmux 명령 직렬화 |
| 실패 시 롤백 | `forkWithContext` — 생성 실패 시 workspace/delegations/session 정리 |

---

## 제한사항 및 참고

- **macOS 전용**: iTerm 모드는 AppleScript 사용 (macOS only)
- **Bun 전용**: `Bun.spawn`, `Bun.file`, `Bun.write` 등 Bun API 의존
- **`@ts-nocheck`**: 모든 파일에 타입 체크 비활성화 — SDK 타입 호환성 이슈로 추정
- **`sync.exclude`**: 설정 스키마에 있지만 실제 구현에서 사용되지 않음
- **단일 pendingDelete**: 동시에 하나의 워크트리만 삭제 대기 가능
- **iTerm 고정**: tmux가 아닌 경우 iTerm으로 고정 (Terminal.app, Warp 등 미지원)
