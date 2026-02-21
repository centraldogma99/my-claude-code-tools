#!/usr/bin/env bash
set -euo pipefail

# create-worktree.sh
# Creates a git worktree with dev environment setup and opens Claude in iTerm2 new tab.

# --- Defaults ---
SOURCE_DIR="$PWD"
CONTEXT_FILE=""
BASE_BRANCH=""
SKIP_INSTALL=false
NAME=""

# --- Parse Arguments ---
while [[ $# -gt 0 ]]; do
  case $1 in
    --name)
      NAME="$2"
      shift 2
      ;;
    --source-dir)
      SOURCE_DIR="$2"
      shift 2
      ;;
    --context-file)
      CONTEXT_FILE="$2"
      shift 2
      ;;
    --base-branch)
      BASE_BRANCH="$2"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
    *)
      echo "Error: Unknown option: $1" >&2
      echo "Usage: create-worktree.sh --name <name> [--source-dir <dir>] [--context-file <file>] [--base-branch <branch>] [--skip-install]" >&2
      exit 1
      ;;
  esac
done

# --- Validate ---
if [[ -z "$NAME" ]]; then
  echo "Error: --name is required" >&2
  exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: source directory does not exist: $SOURCE_DIR" >&2
  exit 1
fi

if ! git -C "$SOURCE_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: $SOURCE_DIR is not a git repository" >&2
  exit 1
fi

ABS_SOURCE_DIR=$(cd "$SOURCE_DIR" && pwd)

# --- Compute Worktree Path ---
# Slug: feat/claim-form → feat-claim-form
ORIGINAL_SLUG=$(echo "$NAME" | sed 's|[/]|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g')
SLUG="$ORIGINAL_SLUG"
BRANCH_NAME="$NAME"
WORKTREE_BASE="${ABS_SOURCE_DIR}.worktrees"

# Handle name collision: add suffix if directory exists
if [[ -d "${WORKTREE_BASE}/${SLUG}" ]]; then
  COUNTER=2
  while [[ -d "${WORKTREE_BASE}/${ORIGINAL_SLUG}-${COUNTER}" ]]; do
    COUNTER=$((COUNTER + 1))
  done
  SLUG="${ORIGINAL_SLUG}-${COUNTER}"
  BRANCH_NAME="${NAME}-${COUNTER}"
fi

WORKTREE_PATH="${WORKTREE_BASE}/${SLUG}"
mkdir -p "$WORKTREE_BASE"

# --- Determine Base Branch ---
if [[ -z "$BASE_BRANCH" ]]; then
  BASE_BRANCH=$(git -C "$ABS_SOURCE_DIR" rev-parse --abbrev-ref HEAD)
fi

# --- Create Worktree ---
echo "Creating worktree..."
echo "  Path:   $WORKTREE_PATH"
echo "  Branch: $BRANCH_NAME (based on $BASE_BRANCH)"

if git -C "$ABS_SOURCE_DIR" show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
  # Branch already exists (e.g. from a previously removed worktree) — reuse it
  git -C "$ABS_SOURCE_DIR" worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
  git -C "$ABS_SOURCE_DIR" worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" "$BASE_BRANCH"
fi

# --- Symlink Environment Files ---
echo "Linking environment files..."

LINKED_COUNT=0
while IFS= read -r -d '' file; do
  rel_path="${file#$ABS_SOURCE_DIR/}"
  if git -C "$ABS_SOURCE_DIR" check-ignore -q "$rel_path" 2>/dev/null; then
    target_dir="$WORKTREE_PATH/$(dirname "$rel_path")"
    mkdir -p "$target_dir"
    ln -sf "$ABS_SOURCE_DIR/$rel_path" "$WORKTREE_PATH/$rel_path"
    echo "  Linked: $rel_path"
    LINKED_COUNT=$((LINKED_COUNT + 1))
  fi
done < <(find "$ABS_SOURCE_DIR" -maxdepth 4 \( -name ".env*" -o -name "settings.local.json" \) \
  -not -path "*/node_modules/*" \
  -not -path "*.worktrees*" \
  -print0 2>/dev/null)

if [[ $LINKED_COUNT -eq 0 ]]; then
  echo "  No environment files found to link."
fi

# --- Install Dependencies ---
if [[ "$SKIP_INSTALL" = false ]]; then
  echo "Installing dependencies..."
  if (cd "$WORKTREE_PATH" && pnpm install); then
    echo "Dependencies installed successfully."
  else
    echo "Warning: pnpm install failed. You may need to run it manually." >&2
  fi
else
  echo "Skipping dependency installation (--skip-install)"
fi

# --- Resolve Absolute Worktree Path ---
ABS_WORKTREE_PATH=$(cd "$WORKTREE_PATH" && pwd)

# --- Write Context to MEMORY.md ---
MEMORY_PATH=""
if [[ -n "$CONTEXT_FILE" && -f "$CONTEXT_FILE" ]]; then
  # Encode path: /Users/foo/project → -Users-foo-project
  # Leading / becomes -, so no extra prefix needed
  ENCODED_PATH=$(echo "$ABS_WORKTREE_PATH" | sed 's|[^a-zA-Z0-9]|-|g')
  MEMORY_DIR="$HOME/.claude/projects/${ENCODED_PATH}/memory"

  mkdir -p "$MEMORY_DIR"
  cp "$CONTEXT_FILE" "$MEMORY_DIR/MEMORY.md"
  MEMORY_PATH="$MEMORY_DIR/MEMORY.md"
  echo "Context written to: $MEMORY_PATH"
fi

# --- Open iTerm2 Tab ---
echo "Opening iTerm2 tab..."
osascript <<APPLESCRIPT
tell application "iTerm2"
  activate
  if (count of windows) = 0 then
    create window with default profile
    tell current session of current tab of current window
      write text "cd '${WORKTREE_PATH}' && claude"
    end tell
  else
    tell current window
      create tab with default profile
      tell current session of current tab
        write text "cd '${WORKTREE_PATH}' && claude"
      end tell
    end tell
  end if
end tell
APPLESCRIPT

# --- Output Summary ---
echo ""
echo "=== Worktree Created ==="
echo "  Path:   $WORKTREE_PATH"
echo "  Branch: $BRANCH_NAME"
if [[ -n "$MEMORY_PATH" ]]; then
  echo "  Memory: $MEMORY_PATH"
fi
echo ""
echo "iTerm2 tab opened with Claude."
