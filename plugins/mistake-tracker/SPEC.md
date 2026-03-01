# mistake-tracker 플러그인 사양서 (v1)

## 개요

사용자가 Claude Code에 메시지를 보낼 때마다, 백그라운드에서 별도의 Claude 프로세스(Haiku)가 해당 메시지가 **"실수 지적"인지 여부를 자동 분류**하고 로그에 기록하는 hook 기반 플러그인.

## 목적

- **개인 회고**: 본인이 Claude를 어떻게 쓰고 있는지, 어떤 패턴에서 실수가 반복되는지 셀프 리뷰
- **팀 공유/분석**: 팀 차원에서 Claude 사용 패턴을 분석하고 프롬프트 가이드라인 개선에 활용
- **프롬프트 개선 자동화**: 축적된 실수 데이터를 기반으로 CLAUDE.md나 시스템 프롬프트를 자동으로 개선하는 파이프라인 구축

## "실수 지적"의 정의 범위

다음 모든 유형을 "실수 지적"으로 분류한다:

| 유형 | 예시 |
|------|------|
| 명시적 오류 지적 | "틀렸어", "아니야", "그게 아니라" |
| 암시적 불만족 | "다시 해줘", "이전 버전이 나았어" |
| 방향 수정 요청 | "그 방식 말고", "다른 접근으로" |
| 품질 불만 | "너무 복잡해", "이건 아닌 것 같아" |
| 요구사항 미반영 | "내가 말한 건 그게 아니라..." |

## 아키텍처

```
[사용자 메시지 입력]
        │
        ▼
[UserPromptSubmit hook 트리거]
        │
        ▼
[hook 스크립트: stdin에서 JSON 읽기]
        │  ┌─────────────────────────────────┐
        │  │ stdin JSON:                      │
        │  │  session_id, prompt, cwd,        │
        │  │  transcript_path, permission_mode│
        │  └─────────────────────────────────┘
        │
        ▼
[백그라운드로 claude -p --model haiku 실행]  ◄── 메인 세션에 영향 없음
        │
        ▼
[Haiku가 메시지 분류: is_mistake + confidence]
        │
        ▼
[flock으로 날짜별 JSONL 파일에 append]
        │
        ▼
[~/.claude/logs/mistake-tracker/2026-03-01.jsonl]
```

### 핵심 설계 결정

- **별도 프로세스**: 메인 Claude Code 세션의 토큰을 소모하지 않음
- **백그라운드 실행**: `&`로 비동기 실행하여 메인 응답 흐름을 차단하지 않음
- **사용자에게 보이지 않음**: 모든 동작이 백그라운드에서 진행
- **외부 API 불필요**: 기존 Claude Code 인증을 그대로 사용 (`claude -p`)

## 분류 엔진

### 모델

- **Haiku** (`claude -p --model haiku`)
- 경량 모델로 비용 효율적, 이진 분류에 충분한 성능

### 분류 방식

- **이진 분류**: is_mistake = true / false
- **Confidence score**: 0.0 ~ 1.0
- **임계값**: 0.7 (설정 파일에서 변경 가능)
  - `confidence >= 0.7` → `is_mistake: true`
  - `confidence < 0.7` → `is_mistake: false` (불확실로 기록)

### 입력 컨텍스트

- **사용자 메시지만** 전달 (직전 Claude 응답은 포함하지 않음)
- 모든 메시지를 동일하게 처리 (첫 메시지 스킵 없음)

### 분류 프롬프트 (Haiku에게 전달)

```
당신은 사용자 메시지 분류기입니다.
아래 메시지가 AI 어시스턴트의 "실수를 지적"하는 메시지인지 판별하세요.

"실수 지적"의 범위:
- 명시적 오류 지적 ("틀렸어", "아니야", "그게 아니라")
- 암시적 불만족 ("다시 해줘", "이전 버전이 나았어")
- 방향 수정 요청 ("그 방식 말고", "다른 접근으로")
- 품질 불만 ("너무 복잡해", "이건 아닌 것 같아")
- 요구사항 미반영 ("내가 말한 건 그게 아니라...")

반드시 아래 JSON 형식으로만 응답하세요:
{"is_mistake": true/false, "confidence": 0.0~1.0}

사용자 메시지:
"""
{USER_MESSAGE}
"""
```

## 데이터 스키마

### 로그 레코드 (JSONL)

```json
{
  "timestamp": "2026-03-01T14:30:00+09:00",
  "session_id": "abc-123",
  "project": "/Users/user/my-project",
  "message": "아니 그게 아니라...",
  "is_mistake": true,
  "confidence": 0.85
}
```

| 필드 | 타입 | 출처 | 설명 |
|------|------|------|------|
| `timestamp` | string (ISO 8601) | hook 스크립트 | 메시지 제출 시각 |
| `session_id` | string | stdin JSON | Claude Code 세션 식별자 |
| `project` | string | stdin JSON (`cwd`) | 현재 작업 디렉토리 |
| `message` | string | stdin JSON (`prompt`) | 사용자 원문 메시지 |
| `is_mistake` | boolean | Haiku 분류 결과 | 실수 지적 여부 |
| `confidence` | number (0.0~1.0) | Haiku 분류 결과 | 분류 확신도 |

## 저장소

### 저장 위치

```
~/.claude/logs/mistake-tracker/
├── config.json          # 설정 파일
├── 2026-03-01.jsonl     # 날짜별 로그 파일
├── 2026-03-02.jsonl
└── ...
```

### 파일 전략

- **날짜별 단일 파일**: `YYYY-MM-DD.jsonl`
- **동시성 제어**: `flock`으로 파일 쓰기 직렬화
- **로테이션**: 날짜별 자동 분리 (별도 삭제/아카이브 정책 없음, v1)

## 설정

### 설정 파일 (`~/.claude/logs/mistake-tracker/config.json`)

```json
{
  "enabled": true,
  "confidence_threshold": 0.7,
  "log_dir": "~/.claude/logs/mistake-tracker"
}
```

| 필드 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `enabled` | boolean | `true` | hook 활성화 여부 |
| `confidence_threshold` | number | `0.7` | 이 값 이상이면 is_mistake=true |
| `log_dir` | string | `~/.claude/logs/mistake-tracker` | 로그 저장 디렉토리 |

- 설정 파일이 없으면 기본값으로 동작
- 사용자가 직접 JSON 파일을 수정하여 커스터마이징

## 에러 처리

- **조용한 실패**: 모든 에러 상황에서 메인 세션에 영향 없음
- `claude` CLI가 없거나, 네트워크 오류, API 할당량 초과 등 모든 실패 시 아무것도 하지 않음
- stderr를 `/dev/null`로 리다이렉트하여 완전히 무음 처리

## 플러그인 구조

```
plugins/mistake-tracker/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── classify-mistake.sh
├── SPEC.md              # 이 문서
└── README.md
```

### hooks.json

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/classify-mistake.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- `matcher: ""` → 모든 메시지에 대해 실행
- `timeout: 5` → hook 스크립트 자체는 5초 내에 종료 (백그라운드 프로세스를 spawn하고 즉시 리턴)

### classify-mistake.sh 동작 흐름

```bash
1. stdin에서 JSON 읽기 (session_id, prompt, cwd)
2. config.json 읽기 (없으면 기본값)
3. enabled가 false면 즉시 종료
4. 백그라운드 서브셸 실행 (&):
   a. claude -p --model haiku 로 분류 프롬프트 실행
   b. Haiku 응답에서 is_mistake, confidence 파싱
   c. confidence >= threshold이면 로그 레코드 생성
   d. flock으로 날짜별 JSONL 파일에 append
5. 즉시 exit 0 (메인 세션 차단 없음)
```

## 조회 방법 (v1)

v1에서는 별도의 조회 인터페이스를 제공하지 않는다. 다음 명령으로 직접 조회:

```bash
# 오늘의 실수 목록
cat ~/.claude/logs/mistake-tracker/$(date +%Y-%m-%d).jsonl | jq 'select(.is_mistake == true)'

# 최근 7일간 실수 횟수
cat ~/.claude/logs/mistake-tracker/*.jsonl | jq 'select(.is_mistake == true)' | wc -l

# confidence 높은 순으로 정렬
cat ~/.claude/logs/mistake-tracker/*.jsonl | jq -s 'sort_by(-.confidence) | .[:10]'

# 특정 프로젝트의 실수만
cat ~/.claude/logs/mistake-tracker/*.jsonl | jq 'select(.project | contains("my-project"))'
```

## 제약사항 및 알려진 한계

1. **맥락 부재**: 사용자 메시지만으로 판단하므로, "아니 그게 아니라"처럼 맥락이 필요한 메시지는 오분류 가능
2. **Haiku 비용**: 매 메시지마다 Haiku API 호출 발생 (소량이지만 누적됨)
3. **flock 호환성**: macOS에서는 `flock`이 기본 제공되지 않아 별도 설치 또는 대체 구현 필요
4. **비동기 특성**: 분류 결과가 로그에 기록되는 시점이 실제 메시지 전송 시점보다 늦을 수 있음

## 향후 확장 (v2+)

- `/mistake-report` 스킬: 최근 N일간 실수 요약 리포트 생성
- CLAUDE.md 자동 개선 파이프라인
- 팀 대시보드 연동
- 실수 패턴 분석 및 분류 세분화
