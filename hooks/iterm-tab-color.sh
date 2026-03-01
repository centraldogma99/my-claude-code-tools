#!/bin/bash
# Terminal tab/status color hook for Claude Code
# Usage: iterm-tab-color.sh [yellow|red|green|blue|reset]
# Called by Claude Code hooks to indicate work status:
#   yellow = working, red = needs attention, green = done, blue = compacting, reset = session end
#
# Supported terminals:
#   iTerm2  — tab color via OSC 1337
#   Ghostty — background color via OSC 11 (tab bar adapts on macOS)

trap 'exit 0' ERR

# Environment guards
[ -n "$TMUX" ] && exit 0
[ -n "$SSH_TTY" ] && exit 0

# Detect terminal
case "$TERM_PROGRAM" in
  iTerm.app) TERMINAL=iterm ;;
  ghostty)   TERMINAL=ghostty ;;
  *)         exit 0 ;;
esac

# Consume stdin from Claude Code hook pipe (prevents broken pipe)
cat > /dev/null

case "$TERMINAL" in
  iterm)
    # Set tab color via iTerm2 proprietary OSC 1337
    case "${1:-}" in
      yellow)  printf '\033]1337;SetColors=tab=ffc800\a' > /dev/tty 2>/dev/null ;;
      red)     printf '\033]1337;SetColors=tab=ff3232\a' > /dev/tty 2>/dev/null ;;
      green)   printf '\033]1337;SetColors=tab=32c832\a' > /dev/tty 2>/dev/null ;;
      blue)    printf '\033]1337;SetColors=tab=3296ff\a' > /dev/tty 2>/dev/null ;;
      reset)   printf '\033]1337;SetColors=tab=default\a' > /dev/tty 2>/dev/null ;;
    esac
    ;;
  ghostty)
    # Ghostty has no tab-specific escape sequence yet.
    # Change background via OSC 11 — on macOS the tab bar adapts to match.
    # Uses dark tints so terminal text stays readable.
    case "${1:-}" in
      yellow)  printf '\033]11;rgb:40/35/00\033\\' > /dev/tty 2>/dev/null ;;
      red)     printf '\033]11;rgb:40/00/00\033\\' > /dev/tty 2>/dev/null ;;
      green)   printf '\033]11;rgb:00/35/00\033\\' > /dev/tty 2>/dev/null ;;
      blue)    printf '\033]11;rgb:00/00/40\033\\' > /dev/tty 2>/dev/null ;;
      reset)   printf '\033]111\033\\' > /dev/tty 2>/dev/null ;;
    esac
    ;;
esac

exit 0
