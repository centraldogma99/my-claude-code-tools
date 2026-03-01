# OpenCode 플러그인 → Claude Code Hooks 마이그레이션

## TL;DR

> **Quick Summary**: OpenCode의 iterm-tab-color.ts와 notify.ts 플러그인을 Claude Code hooks 시스템(bash 스크립트)으로 마이그레이션한다. 동일한 기능을 Claude Code의 이벤트 모델에 맞게 재설계하여 구현한다.
> 
> **Deliverables**:
> - `hooks/iterm-tab-color.sh` — iTerm 탭 색상 변경 스크립트
> - `hooks/notify.sh` — macOS 알림 + SCV 사운드 스크립트
> - `settings.json` — Claude Code hook 이벤트 설정
> - 프로젝트 루트 README에 설치/사용 가이드 추가
> 
> **Estimated Effort**: Short (2-3시간)
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1, 2 (병렬) → Task 3 → Task 4

---

## Context

### Original Request
OpenCode 플러그인들을 Claude Code 기반으로 마이그레이션. iterm-tab-color와 notify 플러그인 2개만 대상. worktree 플러그인은 제외.

### Interview Summary
**Key Discussions**:
- 마이그레이션 범위: iterm-tab-color + notify만 (worktree 제외)
- 마이그레이션 충실도: 기능 동등 (같은 목적, Claude Code 방식으로 재설계)
- 배포 모델: 이 레포가 소스 저장소. 사용자는 심링크/복사로 프로젝트에 적용. README 가이드 제공.

**Research Findings**:
- Claude Code는 18개 hook 이벤트 지원 (SessionStart, PreToolUse, Notification, Stop 등)
- hooks는 settings.json에 matcher/handler 구조로 설정
- Notification matcher 값: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`
- Stop은 matcher 미지원, 매번 발동
- `async: true`로 비동기 실행 가능 (백그라운드, non-blocking)
- `$CLAUDE_PROJECT_DIR`로 프로젝트 루트 경로 참조 가능

### Metis Review
**Identified Gaps** (addressed):
- **사운드 파일 경로**: `$CLAUDE_PROJECT_DIR`는 사용자 프로젝트를 가리킴, 이 소스 레포가 아님 → `~/.claude/hooks/assets/sounds/sc_scv/` 규약 채택 (원본 notify.ts:104 동일)
- **isITerm() 가드 누락**: 원본에는 `TERM_PROGRAM`, `LC_TERMINAL`, `ITERM_SESSION_ID` 확인 존재 → 포함
- **SSH_TTY 가드 누락**: 원본에서 SSH 환경 시 skip 처리 → 양쪽 스크립트 모두 포함
- **TMUX passthrough**: 원본에서 TMUX 내 이스케이프 시퀀스 래핑 처리 → 포함
- **jq 의존성**: JSON stdin 파싱에 필요 → 전제조건으로 문서화
- **permission.replied → yellow 전환 상실**: Claude Code에서 직접 매핑 불가 → `PreToolUse(async)→yellow`가 부분 커버 (권한 허용 후 도구 실행 시). 의식적 수용.
- **한국어 알림 텍스트**: 원본이 한국어("권한 필요", "질문 있음", "완료") → 동일하게 유지
- **question과 permission에 같은 사운드**: 원본 동작 일치 (notify.ts:139에서 playSound("permission") 사용)

---

## Work Objectives

### Core Objective
OpenCode의 iterm-tab-color 및 notify 플러그인과 기능적으로 동등한 Claude Code hooks를 bash 스크립트로 구현한다.

### Concrete Deliverables
- `hooks/iterm-tab-color.sh` — 자체 완결형 bash 스크립트
- `hooks/notify.sh` — 자체 완결형 bash 스크립트
- `settings.json` — 4개 hook 이벤트 설정 (UserPromptSubmit, PreToolUse, Notification, Stop)
- README.md — 설치/사용 가이드 (전제조건, 복사/심링크 방법, settings.json 스니펫)

### Definition of Done
- [ ] 모든 hook 스크립트가 실행 가능하고(`chmod +x`), exit 0으로 정상 종료
- [ ] settings.json이 유효한 JSON이고, 모든 참조 스크립트 존재
- [ ] 의존성 누락 시 silent fail (크래시 없음)
- [ ] iTerm이 아닌 환경에서 graceful skip (에러 없음)
- [ ] SSH 환경에서 탭 색상 변경 skip

### Must Have
- iTerm 감지 가드 (`TERM_PROGRAM`, `LC_TERMINAL`, `ITERM_SESSION_ID`)
- SSH 환경 가드 (`SSH_TTY`)
- TMUX passthrough 이스케이프 시퀀스 래핑
- 탭 비활성 시에만 알림 발송 (isTabActive 로직)
- `afplay`로 SCV 사운드 재생 (fire-and-forget, `&`으로 백그라운드)
- `terminal-notifier`로 macOS 알림 (fire-and-forget)
- 모든 에러를 silent fail 처리 (`2>/dev/null || true` 패턴)
- 한국어 알림 텍스트 유지 ("권한 필요", "질문 있음", "완료")

### Must NOT Have (Guardrails)
- 공유 라이브러리 파일 (common.sh, utils.sh 등) — 각 스크립트 자체 완결
- 설정/커스터마이징 메커니즘 — v1에서는 하드코딩
- 의존성 자동 설치 시도 (jq, terminal-notifier 등)
- stdout으로 JSON 출력 (async hooks는 stdout 무시)
- `exit 2` 사용 (비동기 hook에서는 의미 없음, 모든 경로에서 `exit 0`)
- 새로운 사운드 카테고리 추가 — 원본과 동일하게 permission/completion 2개만
- iTerm 외 터미널 지원 확장 (Terminal.app, Warp, Kitty 등)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> Every criterion MUST be verifiable by running a command or using a tool.

### Test Decision
- **Infrastructure exists**: NO (bash hook 스크립트, 테스트 프레임워크 불필요)
- **Automated tests**: NO
- **Agent-Executed QA**: ALWAYS (모든 태스크의 유일한 검증 수단)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

> bash hook 스크립트 특성상 단위 테스트 대신 Agent-Executed QA가 주요 검증 방법.
> 각 시나리오는 bash 명령으로 실행하고, exit code와 출력으로 판단한다.

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Hook scripts** | Bash | stdin에 JSON 주입 → exit code 확인 → stderr/stdout 확인 |
| **settings.json** | Bash (jq) | JSON 유효성 + 구조 검증 |
| **README.md** | Bash (grep) | 필수 섹션 존재 확인 |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: hooks/iterm-tab-color.sh [no dependencies]
└── Task 2: hooks/notify.sh [no dependencies]

Wave 2 (After Wave 1):
├── Task 3: settings.json 업데이트 [depends: 1, 2 — 스크립트 파일명 필요]
└── Task 4: README.md 작성 [depends: 1, 2, 3 — 전체 구조 확정 후]
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4 | 2 |
| 2 | None | 3, 4 | 1 |
| 3 | 1, 2 | 4 | None |
| 4 | 1, 2, 3 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | task(category="quick", load_skills=[], run_in_background=false) × 2 (parallel) |
| 2 | 3 | task(category="quick", load_skills=[], run_in_background=false) |
| 2 | 4 | task(category="quick", load_skills=[], run_in_background=false) |

---

## TODOs

- [ ] 1. hooks/iterm-tab-color.sh 작성

  **What to do**:
  - stdin에서 JSON을 읽어 `hook_event_name` 필드로 이벤트 유형 판별
  - 이벤트별 iTerm 탭 색상 변경:
    - `UserPromptSubmit` → yellow (`ffc800`)
    - `PreToolUse` → yellow (`ffc800`)
    - `Notification` → red (`ff3232`) — `notification_type`이 `permission_prompt`인 경우만 (stdin JSON에서 확인)
    - `Stop` → green (`32c832`)
  - iTerm 감지 가드 구현:
    ```bash
    is_iterm() {
      [ "$TERM_PROGRAM" = "iTerm.app" ] || [ "$LC_TERMINAL" = "iTerm2" ] || [ -n "$ITERM_SESSION_ID" ]
    }
    ```
  - SSH 가드: `[ -n "$SSH_TTY" ]`이면 즉시 exit 0
  - TMUX passthrough 래핑 (원본 iterm-tab-color.ts:24-26):
    ```bash
    if [ -n "$TMUX" ]; then
      # TMUX passthrough: \ePtmux;\e{seq}\e\\
      output=$(printf '\ePtmux;\e\e]1337;SetColors=tab=%s\a\e\\' "$color_hex")
    else
      output=$(printf '\e]1337;SetColors=tab=%s\a' "$color_hex")
    fi
    printf '%s' "$output" > /dev/tty 2>/dev/null || true
    ```
  - reset 색상은 `default` 문자열 사용: `\e]1337;SetColors=tab=default\a`
  - 모든 경로에서 `exit 0` 보장
  - `#!/bin/bash` shebang + 실행 권한

  **Must NOT do**:
  - stdout에 JSON 출력하지 않음 (async hook)
  - jq 미설치 시 크래시 → `command -v jq >/dev/null 2>&1 || exit 0`
  - /dev/tty 접근 실패 시 크래시 → `> /dev/tty 2>/dev/null || true`
  - exit 2 사용하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 bash 스크립트 작성, 명확한 요구사항, 복잡하지 않은 로직
  - **Skills**: []
    - 별도 스킬 불필요 (순수 파일 생성)
  - **Skills Evaluated but Omitted**:
    - `playwright`: 브라우저 테스트 불필요
    - `git-master`: git 작업 없음

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (원본 코드 — 동작 명세):
  - `opencode-plugins/iterm-tab-color.ts:4-10` — isITerm() 감지 로직 (TERM_PROGRAM, LC_TERMINAL, ITERM_SESSION_ID 체크)
  - `opencode-plugins/iterm-tab-color.ts:12-31` — setTabColor() 함수 전체: 색상 코드 매핑, TMUX passthrough 래핑, /dev/tty 출력, 에러 무시 패턴
  - `opencode-plugins/iterm-tab-color.ts:33-52` — 이벤트 핸들러: session.status→색상, permission.asked→red, permission.replied→yellow 매핑

  **Claude Code Hooks 문서 (이벤트 모델)**:
  - https://docs.anthropic.com/en/docs/claude-code/hooks — Hook events 섹션: UserPromptSubmit, PreToolUse, Notification, Stop 이벤트의 stdin JSON 구조
  - Notification matcher values: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`
  - Stop: matcher 미지원, 매번 발동
  - async hooks는 stdout 무시됨

  **Acceptance Criteria**:

  - [ ] 파일 존재: `hooks/iterm-tab-color.sh`
  - [ ] 실행 권한: `test -x hooks/iterm-tab-color.sh` → exit 0
  - [ ] shebang: 첫 줄이 `#!/bin/bash`
  - [ ] Stop 이벤트 처리: `echo '{"hook_event_name":"Stop","session_id":"test","cwd":"/tmp"}' | bash hooks/iterm-tab-color.sh; echo $?` → exit 0
  - [ ] Notification 이벤트 처리: `echo '{"hook_event_name":"Notification","notification_type":"permission_prompt","session_id":"test","cwd":"/tmp"}' | bash hooks/iterm-tab-color.sh; echo $?` → exit 0
  - [ ] PreToolUse 이벤트 처리: `echo '{"hook_event_name":"PreToolUse","tool_name":"Bash","session_id":"test","cwd":"/tmp"}' | bash hooks/iterm-tab-color.sh; echo $?` → exit 0
  - [ ] UserPromptSubmit 이벤트 처리: `echo '{"hook_event_name":"UserPromptSubmit","session_id":"test","cwd":"/tmp"}' | bash hooks/iterm-tab-color.sh; echo $?` → exit 0
  - [ ] jq 미설치 시 graceful exit: `PATH=/usr/bin echo '{}' | bash hooks/iterm-tab-color.sh; echo $?` → exit 0
  - [ ] SSH 환경 가드: `SSH_TTY=/dev/pts/0 echo '{"hook_event_name":"Stop"}' | bash hooks/iterm-tab-color.sh; echo $?` → exit 0 (아무 동작 없이)
  - [ ] 소스에 isITerm 가드 포함: `grep -q 'TERM_PROGRAM' hooks/iterm-tab-color.sh` → exit 0
  - [ ] 소스에 TMUX passthrough 포함: `grep -q 'TMUX' hooks/iterm-tab-color.sh` → exit 0
  - [ ] 소스에 /dev/tty 출력 포함: `grep -q '/dev/tty' hooks/iterm-tab-color.sh` → exit 0

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Stop 이벤트로 green 색상 설정
    Tool: Bash
    Preconditions: hooks/iterm-tab-color.sh 존재, 실행 가능
    Steps:
      1. echo '{"hook_event_name":"Stop","session_id":"test","cwd":"/tmp"}' | bash hooks/iterm-tab-color.sh
      2. Assert: exit code is 0
      3. Assert: stderr is empty
    Expected Result: 스크립트가 정상 종료 (색상 변경은 iTerm 환경에서만 실제 동작)
    Evidence: Exit code captured

  Scenario: jq 없이 실행 시 graceful exit
    Tool: Bash
    Preconditions: hooks/iterm-tab-color.sh 존재
    Steps:
      1. PATH=/usr/bin echo '{"hook_event_name":"Stop"}' | bash hooks/iterm-tab-color.sh
      2. Assert: exit code is 0
      3. Assert: no error output to stderr (or gracefully handled)
    Expected Result: jq 없어도 crash 없이 종료
    Evidence: Exit code captured

  Scenario: 알 수 없는 이벤트 처리
    Tool: Bash
    Preconditions: hooks/iterm-tab-color.sh 존재
    Steps:
      1. echo '{"hook_event_name":"UnknownEvent"}' | bash hooks/iterm-tab-color.sh
      2. Assert: exit code is 0
    Expected Result: 알 수 없는 이벤트도 crash 없이 처리
    Evidence: Exit code captured
  ```

  **Commit**: YES (groups with 2)
  - Message: `feat(hooks): add iterm-tab-color and notify hook scripts`
  - Files: `hooks/iterm-tab-color.sh`, `hooks/notify.sh`
  - Pre-commit: `test -x hooks/iterm-tab-color.sh && test -x hooks/notify.sh`

---

- [ ] 2. hooks/notify.sh 작성

  **What to do**:
  - stdin에서 JSON을 읽어 `hook_event_name` 필드로 이벤트 유형 판별
  - 이벤트별 동작:
    - `Notification` (notification_type=`permission_prompt`) → isTabActive 확인 → 알림("권한 필요") + permission 사운드
    - `Notification` (notification_type=`elicitation_dialog`) → isTabActive 확인 → 알림("질문 있음") + permission 사운드 (원본과 동일: 같은 사운드 카테고리)
    - `Stop` → isTabActive 확인 → 알림("완료") + completion 사운드
  - isTabActive() bash 구현 (원본 notify.ts:10-73):
    ```bash
    is_tab_active() {
      # SSH에서는 항상 알림
      [ -n "$SSH_TTY" ] && return 1
      
      # iTerm2가 최상단 앱인지 확인
      local frontmost
      frontmost=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null) || return 1
      [ "$frontmost" != "iTerm2" ] && return 1
      
      # 현재 세션이 활성 세션인지 확인
      local our_session_id="${ITERM_SESSION_ID%%:*}"  # ':' 앞부분
      # 원본 코드에서는 ITERM_SESSION_ID를 ':'로 split 후 [1] 사용
      our_session_id=$(echo "$ITERM_SESSION_ID" | cut -d: -f2)
      [ -z "$our_session_id" ] && return 1
      
      local active_session
      active_session=$(osascript -e 'tell application "iTerm2" to get unique ID of current session of current tab of current window' 2>/dev/null) || return 1
      
      [ "$our_session_id" = "$active_session" ] && return 0
      return 1
    }
    ```
  - 알림 발송 함수 (fire-and-forget):
    ```bash
    send_notification() {
      local title="$1" message="$2"
      /opt/homebrew/opt/terminal-notifier/bin/terminal-notifier \
        -title "$title" -message "$message" -timeout 5 &>/dev/null &
    }
    ```
    - 경로 fallback: `command -v terminal-notifier`로 PATH에서도 탐색
  - 사운드 재생 함수 (fire-and-forget):
    ```bash
    play_sound() {
      local category="$1"
      local sound_dir="$HOME/.claude/hooks/assets/sounds/sc_scv"
      
      if [ "$category" = "permission" ]; then
        local sounds=("SomethingsInTheWay.mp3" "CantBuildThere.mp3")
      else
        local sounds=("JobsFinished.mp3" "GoodToGoSir.mp3")
      fi
      
      local idx=$((RANDOM % ${#sounds[@]}))
      local sound_file="$sound_dir/${sounds[$idx]}"
      [ -f "$sound_file" ] && afplay "$sound_file" &>/dev/null &
    }
    ```
  - 프로젝트 이름 추출: `cwd` 필드에서 `basename` 사용
  - 모든 경로에서 `exit 0` 보장
  - `#!/bin/bash` shebang + 실행 권한

  **Must NOT do**:
  - stdout에 JSON 출력하지 않음 (async hook)
  - jq 미설치 시 크래시
  - terminal-notifier 미설치 시 크래시
  - 사운드 파일 미존재 시 크래시
  - exit 2 사용하지 않음
  - question 이벤트에 새로운 사운드 카테고리 추가하지 않음 (permission과 동일 사운드)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 bash 스크립트, 명확한 요구사항
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: 브라우저 테스트 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (원본 코드 — 동작 명세):
  - `opencode-plugins/notify.ts:10-73` — isTabActive() 전체 구현: SSH 가드, osascript로 frontmost app 체크, ITERM_SESSION_ID로 활성 탭 판별
  - `opencode-plugins/notify.ts:79-96` — sendNotification() 함수: terminal-notifier 경로, 인자, fire-and-forget 패턴
  - `opencode-plugins/notify.ts:102-118` — playSound() 함수: 사운드 디렉토리 경로(`~/.claude/hooks/assets/sounds/sc_scv`), 카테고리별 파일 목록, 랜덤 선택, afplay fire-and-forget
  - `opencode-plugins/notify.ts:120-150` — 이벤트 핸들러: permission→알림+permission사운드, question→알림+permission사운드, idle→알림+completion사운드

  **사운드 에셋 (이 레포 내)**:
  - `assets/sounds/sc_scv/SomethingsInTheWay.mp3` — permission 사운드 옵션 1
  - `assets/sounds/sc_scv/CantBuildThere.mp3` — permission 사운드 옵션 2
  - `assets/sounds/sc_scv/JobsFinished.mp3` — completion 사운드 옵션 1
  - `assets/sounds/sc_scv/GoodToGoSir.mp3` — completion 사운드 옵션 2

  **Claude Code Hooks 문서**:
  - https://docs.anthropic.com/en/docs/claude-code/hooks — Notification 이벤트: `notification_type` 필드로 `permission_prompt`, `elicitation_dialog` 구분
  - Stop 이벤트: 매번 발동, 프로젝트 이름은 `cwd` 필드에서 추출 가능

  **Acceptance Criteria**:

  - [ ] 파일 존재: `hooks/notify.sh`
  - [ ] 실행 권한: `test -x hooks/notify.sh` → exit 0
  - [ ] shebang: 첫 줄이 `#!/bin/bash`
  - [ ] Stop 이벤트 처리: `echo '{"hook_event_name":"Stop","cwd":"/tmp/my-project","session_id":"test"}' | bash hooks/notify.sh; echo $?` → exit 0
  - [ ] Notification (permission) 처리: `echo '{"hook_event_name":"Notification","notification_type":"permission_prompt","cwd":"/tmp/test","session_id":"test"}' | bash hooks/notify.sh; echo $?` → exit 0
  - [ ] Notification (elicitation) 처리: `echo '{"hook_event_name":"Notification","notification_type":"elicitation_dialog","cwd":"/tmp/test","session_id":"test"}' | bash hooks/notify.sh; echo $?` → exit 0
  - [ ] jq 미설치 시 graceful exit: `PATH=/usr/bin echo '{}' | bash hooks/notify.sh; echo $?` → exit 0
  - [ ] terminal-notifier 미설치 시 graceful exit
  - [ ] 사운드 파일 미존재 시 graceful exit (afplay 호출 전 파일 존재 확인)
  - [ ] 소스에 isTabActive/is_tab_active 로직 포함: `grep -q 'osascript' hooks/notify.sh` → exit 0
  - [ ] 소스에 사운드 경로 포함: `grep -q '.claude/hooks/assets/sounds' hooks/notify.sh` → exit 0
  - [ ] 소스에 terminal-notifier 포함: `grep -q 'terminal-notifier' hooks/notify.sh` → exit 0
  - [ ] 소스에 한국어 알림 텍스트 포함: `grep -q '권한 필요' hooks/notify.sh && grep -q '완료' hooks/notify.sh` → exit 0

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Stop 이벤트로 완료 알림 시도
    Tool: Bash
    Preconditions: hooks/notify.sh 존재, 실행 가능
    Steps:
      1. echo '{"hook_event_name":"Stop","cwd":"/tmp/my-project","session_id":"test"}' | bash hooks/notify.sh
      2. Assert: exit code is 0
      3. Assert: no crash on stderr
    Expected Result: 스크립트 정상 종료 (알림/사운드는 환경에 따라 실제 동작)
    Evidence: Exit code captured

  Scenario: 의존성 없는 환경에서 graceful 종료
    Tool: Bash
    Preconditions: hooks/notify.sh 존재
    Steps:
      1. PATH=/usr/bin echo '{"hook_event_name":"Stop","cwd":"/tmp/test"}' | bash hooks/notify.sh
      2. Assert: exit code is 0
    Expected Result: jq/terminal-notifier 없어도 crash 없이 종료
    Evidence: Exit code captured

  Scenario: 빈 JSON 입력 처리
    Tool: Bash
    Preconditions: hooks/notify.sh 존재
    Steps:
      1. echo '{}' | bash hooks/notify.sh
      2. Assert: exit code is 0
    Expected Result: 필드 누락 시에도 crash 없음
    Evidence: Exit code captured
  ```

  **Commit**: YES (groups with 1)
  - Message: `feat(hooks): add iterm-tab-color and notify hook scripts`
  - Files: `hooks/iterm-tab-color.sh`, `hooks/notify.sh`
  - Pre-commit: `test -x hooks/iterm-tab-color.sh && test -x hooks/notify.sh`

---

- [ ] 3. settings.json 업데이트

  **What to do**:
  - 기존 `settings.json`에 hooks 설정 추가
  - 4개 hook 이벤트 설정:
    1. `UserPromptSubmit` → `hooks/iterm-tab-color.sh` (async)
    2. `PreToolUse` (matcher: `"*"`) → `hooks/iterm-tab-color.sh` (async)
    3. `Notification` → 2개 matcher group:
       - matcher `permission_prompt`: `hooks/iterm-tab-color.sh` (async) + `hooks/notify.sh` (async)
       - matcher `elicitation_dialog`: `hooks/notify.sh` (async)
    4. `Stop` → `hooks/iterm-tab-color.sh` (async) + `hooks/notify.sh` (async)
  - 스크립트 경로에 `"$CLAUDE_PROJECT_DIR"/` 접두사 사용
  - 모든 hook에 `async: true` 설정
  - JSON 구조 예시:
    ```json
    {
      "$schema": "https://json.schemastore.org/claude-code-settings.json",
      "hooks": {
        "UserPromptSubmit": [
          {
            "hooks": [
              {
                "type": "command",
                "command": "\"$CLAUDE_PROJECT_DIR\"/hooks/iterm-tab-color.sh",
                "async": true
              }
            ]
          }
        ],
        "PreToolUse": [
          {
            "matcher": "*",
            "hooks": [
              {
                "type": "command",
                "command": "\"$CLAUDE_PROJECT_DIR\"/hooks/iterm-tab-color.sh",
                "async": true
              }
            ]
          }
        ],
        "Notification": [
          {
            "matcher": "permission_prompt",
            "hooks": [
              {
                "type": "command",
                "command": "\"$CLAUDE_PROJECT_DIR\"/hooks/iterm-tab-color.sh",
                "async": true
              },
              {
                "type": "command",
                "command": "\"$CLAUDE_PROJECT_DIR\"/hooks/notify.sh",
                "async": true
              }
            ]
          },
          {
            "matcher": "elicitation_dialog",
            "hooks": [
              {
                "type": "command",
                "command": "\"$CLAUDE_PROJECT_DIR\"/hooks/notify.sh",
                "async": true
              }
            ]
          }
        ],
        "Stop": [
          {
            "hooks": [
              {
                "type": "command",
                "command": "\"$CLAUDE_PROJECT_DIR\"/hooks/iterm-tab-color.sh",
                "async": true
              },
              {
                "type": "command",
                "command": "\"$CLAUDE_PROJECT_DIR\"/hooks/notify.sh",
                "async": true
              }
            ]
          }
        ]
      }
    }
    ```

  **Must NOT do**:
  - 기존 `$schema` 필드 제거하지 않음
  - timeout, statusMessage 등 불필요한 옵션 추가하지 않음
  - prompt/agent 타입 hook 사용하지 않음 (command 타입만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 JSON 파일 편집, 구조 명확
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4
  - **Blocked By**: Task 1, Task 2

  **References**:

  **Pattern References**:
  - `settings.json` — 현재 파일 (schema 참조만 있음)
  - Claude Code hooks 설정 형식: https://docs.anthropic.com/en/docs/claude-code/hooks#configuration

  **Acceptance Criteria**:

  - [ ] `settings.json`이 유효한 JSON: `jq . settings.json > /dev/null 2>&1` → exit 0
  - [ ] `$schema` 필드 유지: `jq -r '.["$schema"]' settings.json` → `https://json.schemastore.org/claude-code-settings.json`
  - [ ] hooks 섹션 존재: `jq '.hooks' settings.json` → not null
  - [ ] 4개 이벤트 키 존재: `jq '.hooks | keys' settings.json` → `["Notification", "PreToolUse", "Stop", "UserPromptSubmit"]`
  - [ ] 모든 hook command에 async 설정: `jq '[.. | .async? // empty] | all' settings.json` → true
  - [ ] 모든 command 경로가 `"$CLAUDE_PROJECT_DIR"/hooks/` 시작: `jq -r '[.. | .command? // empty] | .[]' settings.json | grep -v 'CLAUDE_PROJECT_DIR' | wc -l` → 0

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: settings.json JSON 유효성
    Tool: Bash (jq)
    Preconditions: settings.json 존재
    Steps:
      1. jq . settings.json > /dev/null 2>&1
      2. Assert: exit code is 0
    Expected Result: 유효한 JSON
    Evidence: Exit code captured

  Scenario: 모든 이벤트 키 확인
    Tool: Bash (jq)
    Preconditions: settings.json 존재
    Steps:
      1. jq -e '.hooks.UserPromptSubmit' settings.json > /dev/null
      2. jq -e '.hooks.PreToolUse' settings.json > /dev/null
      3. jq -e '.hooks.Notification' settings.json > /dev/null
      4. jq -e '.hooks.Stop' settings.json > /dev/null
      5. Assert: all exit codes are 0
    Expected Result: 4개 이벤트 모두 설정됨
    Evidence: Exit codes captured

  Scenario: Notification에 2개 matcher group 존재
    Tool: Bash (jq)
    Preconditions: settings.json 존재
    Steps:
      1. jq '.hooks.Notification | length' settings.json
      2. Assert: output is 2
      3. jq -r '.hooks.Notification[0].matcher' settings.json
      4. Assert: output is "permission_prompt"
      5. jq -r '.hooks.Notification[1].matcher' settings.json
      6. Assert: output is "elicitation_dialog"
    Expected Result: Notification에 permission_prompt와 elicitation_dialog 매처 존재
    Evidence: Output captured
  ```

  **Commit**: YES
  - Message: `feat(hooks): configure Claude Code hook events in settings.json`
  - Files: `settings.json`
  - Pre-commit: `jq . settings.json > /dev/null 2>&1`

---

- [ ] 4. README.md 설치/사용 가이드 작성

  **What to do**:
  - 프로젝트 루트에 `README.md` 생성 (현재 미존재)
  - 최소한의 가이드 포함:
    1. **개요**: 이 레포가 무엇인지 한 줄 설명
    2. **전제조건**: jq, terminal-notifier, iTerm2, macOS
    3. **설치 방법**:
       - 방법 1: 이 레포를 프로젝트의 `.claude/` 디렉토리로 심링크
       - 방법 2: hooks/, assets/, settings.json을 프로젝트에 복사
       - 사운드 파일 설치: `cp -r assets/sounds ~/.claude/hooks/assets/sounds` 또는 `ln -s $(pwd)/assets/sounds ~/.claude/hooks/assets/sounds`
    4. **settings.json 적용**: 사용자 프로젝트의 `.claude/settings.json`에 hooks 설정 복사 방법
    5. **제공 hooks**: 각 hook 스크립트의 기능 한 줄 설명
  - 한국어로 작성 (원본 플러그인 문서가 한국어)
  - 길지 않게, 실용적으로

  **Must NOT do**:
  - 튜토리얼/스크린샷 추가하지 않음
  - 트러블슈팅 섹션 추가하지 않음
  - 기여 가이드 추가하지 않음
  - opencode-plugins 관련 내용 포함하지 않음 (마이그레이션 결과물만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 짧은 마크다운 문서 작성
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, after Task 3)
  - **Blocks**: None (final task)
  - **Blocked By**: Task 1, Task 2, Task 3

  **References**:

  **Pattern References**:
  - `opencode-plugins/worktree/README.md` — 기존 한국어 README 패턴 (구조, 톤 참고)
  - `settings.json` — 사용자에게 보여줄 설정 스니펫

  **Acceptance Criteria**:

  - [ ] 파일 존재: `test -f README.md` → exit 0
  - [ ] 전제조건 섹션 포함: `grep -q 'jq' README.md && grep -q 'terminal-notifier' README.md` → exit 0
  - [ ] 설치 방법 섹션 포함: `grep -q '설치' README.md` → exit 0
  - [ ] 사운드 파일 설치 안내 포함: `grep -q '.claude/hooks/assets/sounds' README.md` → exit 0
  - [ ] settings.json 적용 안내 포함: `grep -q 'settings.json' README.md` → exit 0

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: README 필수 섹션 확인
    Tool: Bash (grep)
    Preconditions: README.md 존재
    Steps:
      1. grep -q 'jq' README.md
      2. grep -q 'terminal-notifier' README.md
      3. grep -q '설치' README.md
      4. grep -q 'settings.json' README.md
      5. grep -q '.claude/hooks/assets/sounds' README.md
      6. Assert: all exit codes are 0
    Expected Result: 모든 필수 정보 포함
    Evidence: Exit codes captured
  ```

  **Commit**: YES
  - Message: `docs: add installation and usage guide`
  - Files: `README.md`
  - Pre-commit: `test -f README.md`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 + 2 | `feat(hooks): add iterm-tab-color and notify hook scripts` | `hooks/iterm-tab-color.sh`, `hooks/notify.sh` | `test -x hooks/iterm-tab-color.sh && test -x hooks/notify.sh` |
| 3 | `feat(hooks): configure Claude Code hook events in settings.json` | `settings.json` | `jq . settings.json > /dev/null 2>&1` |
| 4 | `docs: add installation and usage guide` | `README.md` | `test -f README.md` |

---

## Success Criteria

### Verification Commands
```bash
# 모든 hook 스크립트 실행 가능
test -x hooks/iterm-tab-color.sh && test -x hooks/notify.sh && echo "PASS"

# settings.json 유효
jq . settings.json > /dev/null 2>&1 && echo "PASS"

# 모든 참조 스크립트 존재
jq -r '.. | .command? // empty' settings.json | while read cmd; do
  script=$(echo "$cmd" | sed 's|"$CLAUDE_PROJECT_DIR"/||; s|"||g')
  test -f "$script" && echo "PASS: $script" || echo "FAIL: $script missing"
done

# hook 스크립트에 하드코딩된 절대경로 없음 (/dev/tty, 시스템 바이너리 제외)
! grep -n '^/' hooks/*.sh | grep -v '/dev/tty' | grep -v '/opt/homebrew' | grep -v '/usr/' | grep -v '/bin/' | grep -q .

# 모든 스크립트가 어떤 입력에도 exit 0
echo '{}' | bash hooks/iterm-tab-color.sh; [ $? -eq 0 ] && echo "PASS"
echo '{}' | bash hooks/notify.sh; [ $? -eq 0 ] && echo "PASS"
```

### Final Checklist
- [ ] 모든 "Must Have" 구현됨
- [ ] 모든 "Must NOT Have" 준수됨
- [ ] 모든 hook 스크립트가 모든 입력에 대해 exit 0
- [ ] settings.json이 유효한 JSON
- [ ] README.md에 설치 가이드 포함
- [ ] 의존성 미설치 시 silent fail
