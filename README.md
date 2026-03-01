# my-claude-code-tools

개인 Claude Code 플러그인 마켓플레이스

## 플러그인

### notify-bot

Claude Code 알림 및 터미널 탭 색상 hook 모음 (macOS 알림 + SCV 사운드 + iTerm2 탭 색상)

```
/plugin install notify-bot@my-claude-code-tools
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
