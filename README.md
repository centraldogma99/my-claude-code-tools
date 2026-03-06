# my-claude-code-tools

개인 Claude Code 플러그인 마켓플레이스

## 플러그인

### notify-bot

Claude Code 알림 및 터미널 탭 색상 hook 모음 (macOS 알림 + SCV 사운드 + iTerm2 탭 색상)

```
/plugin install notify-bot@my-claude-code-tools
```

### worktree-sync

Git worktree 진입 시 `.env.local`, `node_modules` 등을 원본에서 자동 symlink/복사

```
/plugin install worktree-sync@my-claude-code-tools
```

### session-summary

특정 기간의 Claude Code 세션 내용을 모든 프로젝트에서 수집하여 정리/요약

```
/plugin install session-summary@my-claude-code-tools
```

## 설치

```bash
/plugin marketplace add choejun-yeong/my-claude-code-tools
```

## 구조

```
.claude-plugin/
  marketplace.json
plugins/
  notify-bot/
    .claude-plugin/
      plugin.json
    hooks/
      hooks.json
      iterm-tab-color.sh
      notify.sh
    assets/
      sounds/sc_scv/
    README.md
opencode-plugins/             # Legacy OpenCode 플러그인
```

## License

MIT
