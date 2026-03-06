#!/usr/bin/env python3
"""
Extract Claude Code session summaries for a given date range.

Usage:
  python3 extract_sessions.py --start 2026-03-05 --end 2026-03-05
  python3 extract_sessions.py --start 2026-03-01 --end 2026-03-05
  python3 extract_sessions.py --start 2026-03-05  # single day

Output: JSON array of sessions grouped by project, with user messages extracted.
"""

from __future__ import annotations

import argparse
import datetime
import glob
import json
import os
import sys
from typing import Optional

CLAUDE_PROJECTS_DIR = os.path.expanduser("~/.claude/projects")

# Patterns that indicate automated/hook messages, not real user input
NOISE_PATTERNS = [
    "사용자 메시지 분류기",
    "<command-name>",
    "<local-command-caveat>",
    "<local-command-stdout>",
    "<local-command-stderr>",
    "<bash-input>",
    "<bash-stdout>",
    "<bash-stderr>",
    "# 실수 추적 리포트 생성",
]


def is_noise(text: str) -> bool:
    return any(p in text for p in NOISE_PATTERNS)


def extract_content(content) -> Optional[str]:
    """Extract text from message content (string or list format)."""
    if isinstance(content, str):
        return content.strip() if not is_noise(content) else None
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                texts.append(item["text"])
        combined = " ".join(texts)
        return combined.strip() if combined.strip() and not is_noise(combined) else None
    return None


def extract_session(filepath: str) -> Optional[dict]:
    """Extract session metadata and user messages from a JSONL file."""
    user_messages = []
    session_id = None
    git_branch = None
    cwd = None

    with open(filepath, "r", errors="ignore") as f:
        for line in f:
            try:
                obj = json.loads(line.strip())
            except (json.JSONDecodeError, ValueError):
                continue

            if obj.get("type") == "user":
                if not session_id:
                    session_id = obj.get("sessionId")
                    git_branch = obj.get("gitBranch")
                    cwd = obj.get("cwd")

                msg = obj.get("message", {})
                if isinstance(msg, dict):
                    text = extract_content(msg.get("content", ""))
                    if text:
                        user_messages.append(text[:300])

    if not user_messages:
        return None

    return {
        "file": os.path.basename(filepath),
        "session_id": session_id,
        "git_branch": git_branch,
        "cwd": cwd,
        "mtime": os.path.getmtime(filepath),
        "user_messages": user_messages,
        "message_count": len(user_messages),
    }


def get_project_label(dirname: str) -> str:
    """Convert directory name to a readable project label."""
    # Strip the home directory prefix (e.g. -Users-username-)
    home = os.path.expanduser("~")
    home_prefix = home.replace("/", "-").lstrip("-")  # e.g. "Users-choejun-yeong"
    label = dirname
    if label.startswith("-" + home_prefix + "-"):
        label = label[len("-" + home_prefix + "-"):]
    elif label.startswith(home_prefix + "-"):
        label = label[len(home_prefix + "-"):]
    label = label.replace("-", "/", 2)
    # Simplify common patterns
    if "claude-worktrees" in label:
        parts = label.split("claude-worktrees/")
        if len(parts) == 2:
            base = parts[0].rstrip("/").rstrip("-")
            worktree = parts[1]
            return f"{base} (worktree: {worktree})"
    if "worktrees" in label:
        parts = label.split("worktrees/")
        if len(parts) == 2:
            base = parts[0].rstrip("/").rstrip("-")
            worktree = parts[1]
            return f"{base} (worktree: {worktree})"
    return label


def main():
    parser = argparse.ArgumentParser(description="Extract Claude Code session summaries")
    parser.add_argument("--start", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", help="End date (YYYY-MM-DD), defaults to start date")
    args = parser.parse_args()

    start_date = datetime.datetime.strptime(args.start, "%Y-%m-%d").date()
    end_date = datetime.datetime.strptime(args.end, "%Y-%m-%d").date() if args.end else start_date

    projects = {}

    for project_dir in sorted(glob.glob(os.path.join(CLAUDE_PROJECTS_DIR, "*/"))):
        dirname = os.path.basename(project_dir.rstrip("/"))
        jsonl_files = glob.glob(os.path.join(project_dir, "*.jsonl"))

        sessions = []
        for f in jsonl_files:
            mtime = datetime.datetime.fromtimestamp(os.path.getmtime(f)).date()
            if start_date <= mtime <= end_date:
                session = extract_session(f)
                if session:
                    sessions.append(session)

        if sessions:
            sessions.sort(key=lambda s: s["mtime"])
            label = get_project_label(dirname)
            projects[label] = {
                "directory": dirname,
                "session_count": len(sessions),
                "sessions": sessions,
            }

    output = {
        "date_range": {"start": str(start_date), "end": str(end_date)},
        "total_sessions": sum(p["session_count"] for p in projects.values()),
        "projects": projects,
    }

    json.dump(output, sys.stdout, ensure_ascii=False, indent=2, default=str)


if __name__ == "__main__":
    main()
