#!/bin/bash
# worktree-sync: WorktreeCreate hook
#
# Replaces default git worktree behavior.
# Creates worktree, syncs configured files/dirs, prints path to stdout.
#
# stdin: { "name": "bold-oak-a3f2", "session_id": "...", "cwd": "...", ... }
# stdout: absolute worktree path (ONLY this — everything else goes to /dev/tty)
#
# Config: .worktree-sync.json in project root
#   {
#     "copyFiles": [".env", ".env.local"],
#     "symlinkDirs": ["node_modules", ".next/cache"]
#   }

set -euo pipefail

# ── Read JSON from stdin ──
INPUT=$(cat)
NAME=$(echo "$INPUT" | jq -r '.name')
REPO_PATH="$CLAUDE_PROJECT_DIR"
WORKTREE_PATH="${REPO_PATH}/.claude/worktrees/${NAME}"
BRANCH="worktree-${NAME}"

# Progress goes to /dev/tty — stdout is reserved for the worktree path
TTY=/dev/tty
log() { echo "$*" > "$TTY" 2>/dev/null || true; }

log "Creating worktree (branch: $BRANCH)..."

# ── Create the git worktree ──
mkdir -p "${REPO_PATH}/.claude/worktrees"
if git -C "$REPO_PATH" rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" "$BRANCH" >/dev/null 2>&1
else
  git -C "$REPO_PATH" worktree add -b "$BRANCH" "$WORKTREE_PATH" HEAD >/dev/null 2>&1
fi

# ── Safety: reject paths with directory traversal ──
is_safe_path() {
  case "$1" in
    /*|*../*|*/..*|..) return 1 ;;
    *) return 0 ;;
  esac
}

# ── Load config and sync ──
CONFIG_FILE="$REPO_PATH/.worktree-sync.json"
if [ -f "$CONFIG_FILE" ]; then
  # Copy files
  jq -r '.copyFiles[]? // empty' "$CONFIG_FILE" 2>/dev/null | while IFS= read -r file; do
    [ -z "$file" ] && continue
    is_safe_path "$file" || continue
    SRC="$REPO_PATH/$file"
    DEST="$WORKTREE_PATH/$file"
    if [ -f "$SRC" ] && [ ! -e "$DEST" ]; then
      mkdir -p "$(dirname "$DEST")"
      cp "$SRC" "$DEST"
      log "  Copied: $file"
    fi
  done

  # Symlink directories
  jq -r '.symlinkDirs[]? // empty' "$CONFIG_FILE" 2>/dev/null | while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    is_safe_path "$dir" || continue
    SRC="$REPO_PATH/$dir"
    DEST="$WORKTREE_PATH/$dir"
    if [ -d "$SRC" ] && [ ! -e "$DEST" ]; then
      mkdir -p "$(dirname "$DEST")"
      ln -s "$SRC" "$DEST"
      log "  Symlinked: $dir"
    fi
  done
fi

log "Worktree ready."

# ── THE ONLY THING ON STDOUT ──
echo "$WORKTREE_PATH"
