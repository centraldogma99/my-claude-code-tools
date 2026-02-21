#!/bin/bash
# Claude Code notification hook
# Only notifies when the Claude Code tab is NOT actively visible

trap 'exit 0' ERR

INPUT=$(cat)

# Prevent infinite loop for Stop hooks
IS_ACTIVE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stop_hook_active', False))" 2>/dev/null)
if [ "$IS_ACTIVE" = "True" ]; then
  exit 0
fi

# Check frontmost app
FRONTMOST=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null)

# Only skip if iTerm2 is frontmost AND our tab is the active tab
if [ "$FRONTMOST" = "iTerm2" ]; then
  OUR_SESSION_ID="${ITERM_SESSION_ID#*:}"
  ACTIVE_SESSION_ID=$(osascript -e 'tell application "iTerm2" to get unique ID of current session of current tab of current window' 2>/dev/null)
  if [ -n "$OUR_SESSION_ID" ] && [ "$OUR_SESSION_ID" = "$ACTIVE_SESSION_ID" ]; then
    exit 0
  fi
fi

eval "$(echo "$INPUT" | python3 -c "
import sys, json, os

data = json.load(sys.stdin)

project = os.path.basename(data.get('cwd', '')) or 'unknown'
event = data.get('hook_event_name', '')

if event == 'Notification':
    msg = data.get('message', '') or '알림'
    msg = ' '.join(msg.split())[:80]
elif event == 'PermissionRequest':
    tool_name = data.get('tool_name', '')
    if tool_name == 'AskUserQuestion':
        msg = '질문 있음'
    else:
        msg = '권한 필요'
else:
    msg = data.get('last_assistant_message', '')
    msg = ' '.join(msg.split())[:80]
    if len(data.get('last_assistant_message', '')) > 80:
        msg += '...'

print(f'TITLE={chr(34)}Claude Code - {project}{chr(34)}')
print(f'MESSAGE={chr(34)}{msg}{chr(34)}')
" 2>/dev/null)"

/opt/homebrew/opt/terminal-notifier/bin/terminal-notifier \
  -title "$TITLE" \
  -message "${MESSAGE:-완료}" \
  -timeout 5 \
  >/dev/null 2>&1 &

afplay "/System/Library/PrivateFrameworks/ToneLibrary.framework/Versions/A/Resources/AlertTones/Classic/Calypso.m4r" &

exit 0
