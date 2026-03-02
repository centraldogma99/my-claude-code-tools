#!/bin/bash
# mistake-tracker: classify user messages as mistake corrections
# Runs Haiku in background to classify, logs results to JSONL
#
# - Reads UserPromptSubmit hook JSON from stdin
# - Spawns background subshell so main session is never blocked
# - All errors are silently swallowed (exit 0)

trap 'exit 0' ERR

# ── Recursion guard ──
# claude -p triggers UserPromptSubmit again, causing infinite recursion.
# Use env var to detect and break the cycle.
[ "${_MISTAKE_TRACKER_ACTIVE:-}" = "1" ] && exit 0
export _MISTAKE_TRACKER_ACTIVE=1

# ── Read JSON from stdin ──
INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# Nothing to classify
[ -z "$PROMPT" ] && exit 0

# ── Config ──
CONFIG_DIR="$HOME/.claude/logs/mistake-tracker"
CONFIG_FILE="$CONFIG_DIR/config.json"

ENABLED=true
CONFIDENCE_THRESHOLD=0.7
LOG_DIR="$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
  ENABLED=$(jq -r '.enabled // true' "$CONFIG_FILE" 2>/dev/null || echo true)
  CONFIDENCE_THRESHOLD=$(jq -r '.confidence_threshold // 0.7' "$CONFIG_FILE" 2>/dev/null || echo 0.7)
  _LOG_DIR=$(jq -r '.log_dir // empty' "$CONFIG_FILE" 2>/dev/null || true)
  if [ -n "$_LOG_DIR" ]; then
    LOG_DIR="${_LOG_DIR/#\~/$HOME}"
  fi
fi

[ "$ENABLED" != "true" ] && exit 0

mkdir -p "$LOG_DIR"

# ── Background classification ──
(
  TIMESTAMP=$(date +"%Y-%m-%dT%H:%M:%S%z")
  TODAY=$(date +"%Y-%m-%d")
  LOG_FILE="$LOG_DIR/$TODAY.jsonl"

  # Build classification prompt
  CLASSIFY_PROMPT='당신은 사용자 메시지 분류기입니다.
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
'"$PROMPT"'
"""'

  # Call Haiku for classification
  RESULT=$(printf '%s' "$CLASSIFY_PROMPT" | claude -p --model haiku 2>/dev/null) || exit 0

  # Extract JSON (try direct parse first, fall back to regex for text-wrapped responses)
  JSON_RESULT=$(printf '%s' "$RESULT" | jq -c '.' 2>/dev/null) || \
    JSON_RESULT=$(printf '%s' "$RESULT" | grep -oE '\{[^{}]*\}' | head -1) || exit 0
  [ -z "$JSON_RESULT" ] && exit 0

  IS_MISTAKE=$(printf '%s' "$JSON_RESULT" | jq -r '.is_mistake // false' 2>/dev/null) || exit 0
  CONFIDENCE=$(printf '%s' "$JSON_RESULT" | jq -r '.confidence // 0' 2>/dev/null) || exit 0

  # Only log confirmed mistakes above confidence threshold
  [ "$IS_MISTAKE" != "true" ] && exit 0
  LOW_CONF=$(awk -v c="$CONFIDENCE" -v t="$CONFIDENCE_THRESHOLD" 'BEGIN { print (c+0 < t+0) ? "true" : "false" }')
  [ "$LOW_CONF" = "true" ] && exit 0

  # Build log record
  RECORD=$(jq -cn \
    --arg ts "$TIMESTAMP" \
    --arg sid "$SESSION_ID" \
    --arg proj "$CWD" \
    --arg msg "$PROMPT" \
    --argjson ism "$IS_MISTAKE" \
    --argjson conf "$CONFIDENCE" \
    '{timestamp: $ts, session_id: $sid, project: $proj, message: $msg, is_mistake: $ism, confidence: $conf}') || exit 0

  # Append (>> uses O_APPEND — atomic for writes under PIPE_BUF)
  echo "$RECORD" >> "$LOG_FILE"
) &>/dev/null &

exit 0
