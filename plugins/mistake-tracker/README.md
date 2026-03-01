# mistake-tracker

Claude Code 사용 중 **실수 지적 메시지를 자동 감지**하여 로그로 기록하는 hook 플러그인.

사용자가 메시지를 보낼 때마다 백그라운드에서 Haiku가 해당 메시지가 "실수 지적"인지 분류하고, 결과를 날짜별 JSONL 파일에 저장한다.

## 감지 대상

| 유형 | 예시 |
|------|------|
| 명시적 오류 지적 | "틀렸어", "아니야", "그게 아니라" |
| 암시적 불만족 | "다시 해줘", "이전 버전이 나았어" |
| 방향 수정 요청 | "그 방식 말고", "다른 접근으로" |
| 품질 불만 | "너무 복잡해", "이건 아닌 것 같아" |
| 요구사항 미반영 | "내가 말한 건 그게 아니라..." |

## 동작 방식

1. `UserPromptSubmit` hook이 매 메시지마다 트리거
2. 백그라운드에서 `claude -p --model haiku`로 분류 실행 (메인 세션 차단 없음)
3. confidence ≥ 0.7이면 `is_mistake: true`로 기록

## 출력 포맷

로그 경로: `~/.claude/logs/mistake-tracker/YYYY-MM-DD.jsonl`

각 줄은 다음 JSON 형식:

```json
{
  "timestamp": "2026-03-01T14:30:00+0900",
  "session_id": "abc-123",
  "project": "/Users/user/my-project",
  "message": "아니 그게 아니라...",
  "is_mistake": true,
  "confidence": 0.85
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `timestamp` | string (ISO 8601) | 메시지 제출 시각 |
| `session_id` | string | Claude Code 세션 식별자 |
| `project` | string | 작업 디렉토리 경로 |
| `message` | string | 사용자 원문 메시지 |
| `is_mistake` | boolean | 실수 지적 여부 (confidence 기반) |
| `confidence` | number | 0.0~1.0 분류 확신도 |

## 조회 예시

```bash
# 오늘의 실수 목록
cat ~/.claude/logs/mistake-tracker/$(date +%Y-%m-%d).jsonl | jq 'select(.is_mistake == true)'

# 최근 7일간 실수 횟수
cat ~/.claude/logs/mistake-tracker/*.jsonl | jq 'select(.is_mistake == true)' | wc -l

# confidence 높은 순 Top 10
cat ~/.claude/logs/mistake-tracker/*.jsonl | jq -s 'sort_by(-.confidence) | .[:10]'

# 특정 프로젝트만
cat ~/.claude/logs/mistake-tracker/*.jsonl | jq 'select(.project | contains("my-project"))'
```

## 설정

`~/.claude/logs/mistake-tracker/config.json`을 생성하여 커스터마이징 가능 (없으면 기본값 사용):

```json
{
  "enabled": true,
  "confidence_threshold": 0.7,
  "log_dir": "~/.claude/logs/mistake-tracker"
}
```
