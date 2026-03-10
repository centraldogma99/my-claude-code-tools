#!/bin/bash
# Claude Code notification hook
# Sends macOS notification + plays SCV sound when Claude needs attention
#
# Events handled:
#   Notification (permission_prompt) → 권한 필요 + permission sound
#   Stop                             → 완료 + completion sound

trap 'exit 0' ERR

# Always notify over SSH
if [ -n "${SSH_TTY:-}" ]; then
	IS_SSH=1
fi

# ── Read JSON from stdin ──
INPUT=$(cat)

HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
PROJECT_NAME=$(echo "$INPUT" | jq -r '.cwd // empty' | xargs basename 2>/dev/null || echo "unknown")

# ── Determine notification category ──
CATEGORY=""
MESSAGE=""

case "$HOOK_EVENT" in
Notification)
	NOTIFICATION_TYPE=$(echo "$INPUT" | jq -r '.notification_type // empty')
	case "$NOTIFICATION_TYPE" in
	permission_prompt)
		CATEGORY="permission"
		MESSAGE="권한 필요"
		;;
	*)
		exit 0
		;;
	esac
	;;
Stop)
	CATEGORY="completion"
	MESSAGE="완료"
	;;
*)
	exit 0
	;;
esac

# ── Check if terminal tab is currently active ──
# If active, skip notification. Fails open (notify on error).
# Supports: iTerm2 (tab-level)
is_tab_active() {
	[ "${IS_SSH:-}" = "1" ] && return 1
	[ -n "${TMUX:-}" ] && return 1

	local frontmost
	frontmost=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null) || return 1

	case "$TERM_PROGRAM" in
	iTerm.app)
		[ "$frontmost" != "iTerm2" ] && return 1

		local our_session_id
		our_session_id=$(echo "${ITERM_SESSION_ID:-}" | cut -d: -f2)
		[ -z "$our_session_id" ] && return 1

		local active_session_id
		active_session_id=$(osascript -e 'tell application "iTerm2" to get unique ID of current session of current tab of current window' 2>/dev/null) || return 1

		[ "$our_session_id" = "$active_session_id" ]
		;;
	*)
		return 1
		;;
	esac
}

if is_tab_active; then
	exit 0
fi

# ── Send macOS notification via osascript ──
osascript -e "display notification \"$MESSAGE\" with title \"Claude Code\" subtitle \"$PROJECT_NAME\"" 2>/dev/null &

# ── Play SCV sound effect ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOUND_DIR="$SCRIPT_DIR/../assets/sounds/sc_scv"

if [ -d "$SOUND_DIR" ]; then
	if [ "$CATEGORY" = "permission" ]; then
		SOUNDS=("SomethingsInTheWay.mp3" "CantBuildThere.mp3")
	else
		SOUNDS=("JobsFinished.mp3" "GoodToGoSir.mp3")
	fi

	SELECTED="${SOUNDS[$((RANDOM % ${#SOUNDS[@]}))]}"

	if [ -f "$SOUND_DIR/$SELECTED" ]; then
		afplay "$SOUND_DIR/$SELECTED" &>/dev/null &
	fi
fi

exit 0
