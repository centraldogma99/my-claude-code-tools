#!/bin/bash
# iTerm2 tab color hook for Claude Code
# Usage: iterm-tab-color.sh [yellow|red|green|blue|reset]
# Called by Claude Code hooks to indicate work status:
#   yellow = working, red = needs attention, green = done, blue = compacting, reset = session end

trap 'exit 0' ERR

# Environment guards
[ -n "$TMUX" ] && exit 0
[ -n "$SSH_TTY" ] && exit 0
[ "$TERM_PROGRAM" != "iTerm.app" ] && exit 0

# Consume stdin from Claude Code hook pipe (prevents broken pipe)
cat > /dev/null

# Set tab color via iTerm2 proprietary OSC 1337
case "${1:-}" in
  yellow)  printf '\033]1337;SetColors=tab=ffc800\a' > /dev/tty 2>/dev/null ;;
  red)     printf '\033]1337;SetColors=tab=ff3232\a' > /dev/tty 2>/dev/null ;;
  green)   printf '\033]1337;SetColors=tab=32c832\a' > /dev/tty 2>/dev/null ;;
  blue)    printf '\033]1337;SetColors=tab=3296ff\a' > /dev/tty 2>/dev/null ;;
  reset)   printf '\033]1337;SetColors=tab=default\a' > /dev/tty 2>/dev/null ;;
esac

exit 0
