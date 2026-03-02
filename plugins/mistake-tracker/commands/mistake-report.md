---
description: 실수 추적 리포트 생성
allowed-tools: Read, Glob, Grep, Bash, Write
---

# 실수 추적 리포트 생성

아래 단계를 순서대로 수행하여 실수 추적 리포트를 생성하라.
모든 단계를 현재 세션에서 직접 처리한다 (별도 프로세스 스폰 금지).

---

## 단계 1: 리포트 대상 기간 결정

1. `~/.claude/logs/mistake-tracker/reports/` 디렉토리에서 기존 리포트를 검색한다.
   - Glob 패턴: `~/.claude/logs/mistake-tracker/reports/report_*.json`
2. **리포트가 있으면**: 가장 최근 파일명에서 종료일을 추출한다.
   - 파일명 형식: `report_YYYY-MM-DD_YYYY-MM-DD.json` → 두 번째 날짜가 이전 리포트의 종료일
   - 이전 종료일의 **다음 날**을 `period_start`로 설정
3. **리포트가 없으면**: 가장 오래된 로그 파일의 날짜를 `period_start`로 사용한다.
4. `period_end`는 오늘 날짜.

---

## 단계 2: 실수 로그 수집

1. `~/.claude/logs/mistake-tracker/` 에서 대상 기간의 JSONL 파일을 읽는다.
   - Glob 패턴: `~/.claude/logs/mistake-tracker/*.jsonl`
   - 파일명이 `YYYY-MM-DD.jsonl` 형식이므로 period_start ~ period_end 범위의 파일만 선택
2. 각 파일에서 **`is_mistake == true`인 레코드만** 수집한다.
3. 수집된 실수 목록에서 고유 `session_id` 목록을 추출한다.

**로그 레코드 형식:**
```json
{"timestamp":"2026-03-01T19:23:54+0900","session_id":"uuid","project":"/path","message":"사용자 메시지","is_mistake":true,"confidence":0.85}
```

> **실수가 0건인 경우**: 단계 3~4를 건너뛰고 단계 5에서 빈 리포트를 생성한다.

---

## 단계 3: 세션 대화 조회

각 고유 `session_id`에 대해:

1. 세션 대화 파일을 찾는다:
   - Glob 패턴: `~/.claude/projects/*/{session_id}.jsonl`
2. **파일을 찾을 수 없으면** → 만료된 세션으로 간주하고 제외 카운트에 추가한다.
3. **파일을 찾으면** → 세션 대화 내용을 읽는다.

**세션 JSONL 레코드 형식:**
```json
{"type":"user","sessionId":"...","message":{"role":"user","content":"사용자 메시지"}}
{"type":"assistant","sessionId":"...","message":{"role":"assistant","content":"Claude 응답"}}
```
- `type`이 `"user"` 또는 `"assistant"`인 레코드만 대화 메시지로 취급한다.
- 다른 type(`system`, `progress`, `tool-call`, `file-history-snapshot` 등)은 무시한다.

**세션 시작 시각 조회**: `~/.claude/.session-stats.json`에서 해당 session_id의 `started_at`(Unix timestamp)을 찾는다. 없으면 세션 파일 첫 레코드의 timestamp를 사용한다.

---

## 단계 4: 컨텍스트 추출

각 실수에 대해 세션 대화에서 관련 컨텍스트를 추출한다:

1. 실수 로그의 `message`와 일치하는 user 메시지를 세션 대화에서 찾는다.
2. 해당 메시지 전후의 대화 컨텍스트를 추출한다:
   - **이전 컨텍스트** (relative_position < 0): Claude가 잘못된 응답을 한 부분 등, 실수의 원인이 된 대화
   - **실수 메시지** (relative_position = 0): 사용자의 수정/지적 메시지
   - **이후 컨텍스트** (relative_position > 0): 수정 후 Claude의 응답
3. 포함할 범위는 AI가 대화 흐름을 보고 **동적으로 판단**한다. 보통 이전 1~3개, 이후 1~2개 메시지가 적절하다.
4. 너무 긴 메시지(500자 초과)는 핵심만 요약한다. 단, 사용자 메시지는 가능한 원문을 유지한다.

---

## 단계 5: JSON 리포트 생성

아래 스키마에 맞는 JSON 리포트를 생성한다.

```typescript
interface MistakeReport {
  version: "1.0.0";
  metadata: {
    generated_at: string;                // ISO 8601
    period_start: string;                // YYYY-MM-DD
    period_end: string;                  // YYYY-MM-DD
    excluded_expired_sessions: number;
  };
  statistics: {
    total_mistakes: number;
    sessions_with_mistakes: number;
    average_confidence: number;
    mistakes_by_project: Record<string, number>;
    mistakes_by_category: Record<string, number>;
  };
  sessions: {
    session_id: string;
    project: string;
    session_started_at: string;          // ISO 8601
    session_summary: string;             // 세션 작업 내용 1줄 요약
    mistakes: {
      timestamp: string;
      user_message: string;
      confidence: number;
      category: string;
      context: {
        role: "user" | "assistant";
        content: string;
        relative_position: number;       // 음수: 이전, 0: 실수 메시지, 양수: 이후
      }[];
    }[];
  }[];
  analysis: {
    recurring_patterns: {
      name: string;
      description: string;
      occurrence_count: number;
      related_mistakes: string[];        // timestamp 목록
    }[];
    improvement_suggestions: {
      title: string;
      description: string;
      claude_code_reference?: string;    // Claude Code 가이드/best practice 참조
      related_pattern?: string;
    }[];
  };
}
```

**카테고리 분류 기준** (실수 메시지 내용과 컨텍스트를 보고 판단):
- `"오류 수정"`: Claude의 코드/정보 오류를 지적
- `"방향 전환"`: 다른 접근 방식을 요청
- `"품질 불만"`: 결과물의 품질에 불만족
- `"요구사항 미반영"`: 요청한 내용이 반영되지 않음
- `"기타"`: 위에 해당하지 않는 경우

**분석 시 참고**:
- `recurring_patterns`: 같은 유형의 실수가 2회 이상 반복될 때 패턴으로 식별
- `improvement_suggestions`: Claude Code의 CLAUDE.md 작성법, 프롬프트 구체화, 도구 활용법 등 공식 가이드를 참조하여 구체적인 개선 방안 제시

---

## 단계 6: Markdown 리포트 생성

JSON 데이터를 기반으로 한국어 Markdown 리포트를 생성한다:

```
# 실수 추적 리포트

## 기본 정보
- 기간: {period_start} ~ {period_end}
- 생성일: {generated_at의 날짜}

## 요약 통계
- 총 실수: {total_mistakes}건
- 관련 세션: {sessions_with_mistakes}개
- 평균 확신도: {average_confidence}
- 만료로 제외된 세션: {excluded_expired_sessions}개
- 프로젝트별: ...
- 카테고리별: ...

## 세션별 상세

### 세션: {session_summary}
- 프로젝트: {project}
- 시작: {session_started_at}

#### 실수 1: {category}
- 시각: {timestamp}
- 확신도: {confidence}
- 사용자 메시지: "{user_message}"

**대화 컨텍스트:**
> [이전 대화 내용]
> ...
> **[실수 메시지]**
> ...
> [이후 대화 내용]

(세션별, 실수별 반복)

## 패턴 분석
### {pattern.name}
- 설명: {description}
- 발생 횟수: {occurrence_count}회

(반복)

## 개선 제안
### {suggestion.title}
- {description}
- Claude Code 참조: {claude_code_reference}

(반복)
```

---

## 단계 7: 파일 저장 및 출력

1. 디렉토리 생성: `mkdir -p ~/.claude/logs/mistake-tracker/reports/`
2. JSON 저장: `~/.claude/logs/mistake-tracker/reports/report_{period_start}_{period_end}.json`
3. Markdown 저장: `~/.claude/logs/mistake-tracker/reports/report_{period_start}_{period_end}.md`
4. **터미널에 Markdown 리포트 전체 내용을 출력**한다.
5. 저장된 파일 경로를 안내한다.

---

## 엣지 케이스

- **실수 0건**: `total_mistakes: 0`, 빈 `sessions` 배열, `analysis` 섹션 없음. Markdown에는 "해당 기간에 실수가 기록되지 않았습니다" 메시지 포함. 파일은 정상 저장하여 period_end가 기록됨.
- **만료 세션**: 대화 파일을 찾을 수 없는 세션은 리포트에서 제외하고 `excluded_expired_sessions`에 카운트.
- **세션 파일이 너무 클 때**: Grep으로 실수 메시지를 먼저 검색하여 위치를 파악한 뒤, Read의 offset/limit으로 해당 부분만 읽는다.
