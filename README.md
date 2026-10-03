# junyeong-claude-code-plugins

개인 Claude Code 플러그인 마켓플레이스

## 플러그인

### notify-bot

Claude Code 알림 및 터미널 탭 색상 hook 모음 (macOS 알림 + SCV 사운드 + iTerm2 탭 색상)

```
/plugin install notify-bot@junyeong-claude-code-plugins
```

### worktree-sync

Git worktree 진입 시 `.env.local`, `node_modules` 등을 원본에서 자동 symlink/복사

```
/plugin install worktree-sync@junyeong-claude-code-plugins
```

### session-history

특정 기간의 Claude Code 세션 내용을 모든 프로젝트에서 수집하여 정리/요약

```
/plugin install session-history@junyeong-claude-code-plugins
```

### problem-definition-writer

문제 정의서(Why/What) 작성, 검토, 정합성 검증

```
/plugin install problem-definition-writer@junyeong-claude-code-plugins
```

### ac6-hud

Armored Core VI 스타일 테마 + HUD mod (AP 게이지, 전투 스피너, `/cockpit` 패널)

```
/plugin install ac6-hud@junyeong-claude-code-plugins
```

### home-path-complete

프롬프트에 입력한 `~/` 경로를 ctrl+f 한 번으로 자동완성 (키 바인딩 설정 필요, [README](plugins/home-path-complete/README.md))

```
/plugin install home-path-complete@junyeong-claude-code-plugins
```

### you-should-know

내장 "You should know" mod를 한국어로 답하게 패치한 복제본 ([README](plugins/you-should-know/README.md))

```
/plugin install you-should-know@junyeong-claude-code-plugins
```

## 설치

```bash
/plugin marketplace add choejun-yeong/junyeong-claude-code-plugins
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
