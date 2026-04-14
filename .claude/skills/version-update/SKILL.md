---
name: version-update
description: "플러그인 버전 업데이트 자동화. plugin.json, marketplace.json, plugins/README.md 3곳의 버전을 동시에 갱신한다. 플러그인 업데이트, 버전 올리기, 버전 범프 등의 요청 시 사용."
argument-hint: "[플러그인명] [patch|minor|major|auto]"
allowed-tools: Read, Edit, Glob, Grep, Bash(cat), Bash(echo)
---

# 플러그인 버전 업데이트

플러그인을 업데이트할 때 버전을 3곳에서 동시에 올려야 한다. 이 스킬이 그 작업을 수행한다.

## 인자 파싱

- `$0` — 플러그인 이름 (예: `merlin`, `trace`). 생략 시 사용자에게 물어본다.
- `$1` — 범프 타입: `patch`, `minor`, `major`, `auto`. 생략 시 사용자에게 물어본다.

## 버전 업데이트 대상 (3곳)

1. **`plugins/<플러그인명>/.claude-plugin/plugin.json`** — `"version"` 필드
2. **`.claude-plugin/marketplace.json`** — 해당 플러그인 항목의 `"version"` 필드
3. **`plugins/README.md`** — 아이템 목록 테이블의 해당 플러그인 행의 버전 열

## 실행 절차

### 1단계: 검증

- 플러그인 이름이 주어졌는지 확인. 없으면 사용자에게 질문한다.
- `plugins/<플러그인명>/.claude-plugin/plugin.json` 파일이 존재하는지 확인한다.
- 존재하지 않으면 에러를 알려주고 `plugins/` 하위의 사용 가능한 플러그인 목록을 보여준다.

### 2단계: 현재 버전 읽기

- `plugins/<플러그인명>/.claude-plugin/plugin.json`에서 현재 `version` 값을 읽는다.
- Semantic Versioning (MAJOR.MINOR.PATCH) 형식인지 확인한다.

### 3단계: 범프 타입 결정

범프 타입(`$1`)이 생략된 경우, 사용자에게 질문한다:

> **`<플러그인명>` (현재 `<현재버전>`) — 어떤 버전을 올릴까요?**
>
> 1. `patch` — 버그 수정, 문구 변경 등 소규모 수정 (X.X.0 → X.X.1)
> 2. `minor` — 새 기능 추가, 동작 변경 등 (X.0.X → X.1.0)
> 3. `major` — 호환성이 깨지는 대규모 변경 (0.X.X → 1.0.0)
> 4. `auto` — 잘 모르겠음, 변경 내용 보고 알아서 결정해줘

`auto`가 선택된 경우:
- 해당 플러그인 디렉토리의 **최근 git diff 또는 커밋 로그**를 분석한다.
- SKILL.md 프롬프트 내용 변경, 새 파일 추가 → `minor`
- 오타 수정, 주석 변경, 사소한 수정 → `patch`
- 디렉토리 구조 변경, 스킬 삭제/재작성, 기존 동작 호환 불가 → `major`
- 판단 근거를 사용자에게 간단히 설명한 뒤 진행한다.

### 4단계: 새 버전 계산

범프 타입에 따라 계산:
- `patch`: 0.0.X → 0.0.(X+1)
- `minor`: 0.X.0 → 0.(X+1).0
- `major`: X.0.0 → (X+1).0.0

계산된 새 버전을 사용자에게 확인받는다:
> `<플러그인명>: <현재버전> → <새버전> 으로 업데이트합니다. 진행할까요?`

### 5단계: 3곳 동시 업데이트

**Edit 도구를 사용하여** 다음 3개 파일을 수정한다:

1. **`plugins/<플러그인명>/.claude-plugin/plugin.json`**
   - `"version": "<현재버전>"` → `"version": "<새버전>"`

2. **`.claude-plugin/marketplace.json`**
   - 해당 플러그인 항목의 `"version": "<현재버전>"` → `"version": "<새버전>"`
   - 주의: marketplace.json에는 여러 플러그인이 있으므로, 반드시 해당 플러그인 name 항목 근처의 version만 변경한다.

3. **`plugins/README.md`**
   - 테이블에서 해당 플러그인 행의 버전 부분을 새 버전으로 교체한다.
   - 행 형식: `| [플러그인명](./플러그인명/) | 설명 | 작성자 | 버전 |`

### 6단계: 결과 확인

수정 완료 후 3개 파일을 다시 읽어서 버전이 모두 동일하게 반영되었는지 검증한다. 결과를 요약하여 출력:

```
✅ <플러그인명> 버전 업데이트 완료
   <현재버전> → <새버전>

   수정된 파일:
   - plugins/<플러그인명>/.claude-plugin/plugin.json
   - .claude-plugin/marketplace.json
   - plugins/README.md
```

### 7단계: PR 생성 제안

모든 작업을 끝내면 사용자에게 PR을 만들 것인지 물어본다. 사용자가 원하면 PR을 생성한다.
PR 내용은 슬랙 채널에 공지될 릴리즈 노트에 그대로 포함되므로, 이를 고려하여 내용을 작성해야 한다.

## 주의사항

- marketplace.json에서 버전을 변경할 때, 동일한 버전 문자열이 다른 플러그인에도 있을 수 있다. **반드시 해당 플러그인의 name 필드를 기준으로 정확한 위치를 찾아서** 변경해야 한다.
- 3곳의 버전이 이미 불일치하는 경우, 사용자에게 현재 상태를 알리고 어떻게 처리할지 확인한다.
- JSON 파일은 2 spaces 인덴트를 유지한다.
