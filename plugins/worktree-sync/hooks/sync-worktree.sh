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
#     "symlinkDirs": [".next/cache"],
#     "installCommand": "pnpm install --frozen-lockfile"
#   }

set -euo pipefail

# ── Debug log ──
DEBUG_LOG="/tmp/worktree-sync-debug.log"
dbg() { echo "[$(date '+%H:%M:%S')] $*" >> "$DEBUG_LOG"; }
dbg "========== WorktreeCreate hook started =========="
dbg "PID=$$"
dbg "CLAUDE_PROJECT_DIR=${CLAUDE_PROJECT_DIR:-<unset>}"

# ── Read JSON from stdin ──
dbg "STEP: reading stdin..."
INPUT=$(cat)
dbg "STEP: stdin read OK (${#INPUT} bytes)"
dbg "INPUT=$INPUT"

NAME=$(echo "$INPUT" | jq -r '.name')
dbg "STEP: parsed name=$NAME"

REPO_PATH="$CLAUDE_PROJECT_DIR"
WORKTREE_PATH="${REPO_PATH}/.claude/worktrees/${NAME}"
BRANCH="worktree-${NAME}"
dbg "REPO_PATH=$REPO_PATH"
dbg "WORKTREE_PATH=$WORKTREE_PATH"
dbg "BRANCH=$BRANCH"

# Progress goes to /dev/tty — stdout is reserved for the worktree path
TTY=/dev/tty
log() { echo "$*" > "$TTY" 2>/dev/null || true; }

log "Creating worktree (branch: $BRANCH)..."

# ── Create the git worktree ──
dbg "STEP: mkdir for worktrees dir..."
mkdir -p "${REPO_PATH}/.claude/worktrees"
dbg "STEP: mkdir done"

dbg "STEP: checking if branch '$BRANCH' exists..."
if git -C "$REPO_PATH" rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  dbg "STEP: branch exists, adding worktree for existing branch..."
  if ! git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" "$BRANCH" >/dev/null 2>&1; then
    dbg "ERROR: git worktree add (existing branch) failed"
  fi
  dbg "STEP: git worktree add (existing) done"
else
  dbg "STEP: branch does not exist, creating new branch from HEAD..."
  if ! git -C "$REPO_PATH" worktree add -b "$BRANCH" "$WORKTREE_PATH" HEAD >/dev/null 2>&1; then
    dbg "ERROR: git worktree add -b (new branch) failed"
  fi
  dbg "STEP: git worktree add -b done"
fi

# ── Safety: reject paths with directory traversal ──
is_safe_path() {
  case "$1" in
    /*|*../*|*/..*|..) return 1 ;;
    *) return 0 ;;
  esac
}

# ── Load config (create default if missing) ──
CONFIG_FILE="$REPO_PATH/.worktree-sync.json"
dbg "STEP: loading config from $CONFIG_FILE"
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'DEFAULTCFG'
{
  "copyFiles": [".env", ".env.local"],
  "symlinkDirs": [".next/cache"],
  "installCommand": "pnpm install --frozen-lockfile"
}
DEFAULTCFG
  dbg "STEP: created default config"
  log "  Created default config: .worktree-sync.json"
fi

if [ -f "$CONFIG_FILE" ]; then
  dbg "STEP: processing copyFiles..."
  # Copy files
  jq -r '.copyFiles[]? // empty' "$CONFIG_FILE" 2>/dev/null | while IFS= read -r file; do
    [ -z "$file" ] && continue
    is_safe_path "$file" || continue
    SRC="$REPO_PATH/$file"
    DEST="$WORKTREE_PATH/$file"
    if [ -f "$SRC" ] && [ ! -e "$DEST" ]; then
      mkdir -p "$(dirname "$DEST")"
      cp "$SRC" "$DEST"
      dbg "  copied: $file"
      log "  Copied: $file"
    fi
  done
  dbg "STEP: copyFiles done"

  dbg "STEP: processing symlinkDirs..."
  # Symlink directories
  jq -r '.symlinkDirs[]? // empty' "$CONFIG_FILE" 2>/dev/null | while IFS= read -r dir; do
    [ -z "$dir" ] && continue
    is_safe_path "$dir" || continue
    SRC="$REPO_PATH/$dir"
    DEST="$WORKTREE_PATH/$dir"
    if [ -d "$SRC" ] && [ ! -e "$DEST" ]; then
      mkdir -p "$(dirname "$DEST")"
      ln -s "$SRC" "$DEST"
      dbg "  symlinked: $dir"
      log "  Symlinked: $dir"
    fi
  done
  dbg "STEP: symlinkDirs done"

  # Run install command
  INSTALL_CMD=$(jq -r '.installCommand // empty' "$CONFIG_FILE" 2>/dev/null)
  if [ -n "$INSTALL_CMD" ]; then
    dbg "STEP: running install command: $INSTALL_CMD"
    log "  Running: $INSTALL_CMD ..."
    if (cd "$WORKTREE_PATH" && eval "$INSTALL_CMD" >/dev/null 2>&1); then
      dbg "STEP: install command succeeded"
      log "  Install complete."
    else
      dbg "ERROR: install command failed (exit $?)"
      log "  Install failed (continuing anyway)."
    fi
  fi
  dbg "STEP: installCommand done"
fi

log "Worktree ready."
dbg "STEP: about to echo worktree path to stdout"
dbg "STDOUT_WILL_BE=$WORKTREE_PATH"

# ── THE ONLY THING ON STDOUT ──
echo "$WORKTREE_PATH"

dbg "STEP: echo done, exiting with 0"
dbg "========== WorktreeCreate hook finished =========="
