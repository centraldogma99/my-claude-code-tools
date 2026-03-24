# notify-bot

> **iTerm2 전용** — 다른 터미널에서는 테스트되지 않았습니다.

Claude Code 알림 및, 상태에 따른 터미널 탭 색상 변경

## 요구사항

- macOS + iTerm2

## 기능

### notify.sh — 알림 + SCV 사운드

Claude Code가 사용자 입력을 기다릴 때 macOS 알림과 스타크래프트 SCV 음성을 재생합니다.

| 이벤트 | 알림 메시지 | 사운드 |
|--------|------------|--------|
| `permission_prompt` | 권한 필요 | SomethingsInTheWay / CantBuildThere |
| `Stop` | 완료 | JobsFinished / GoodToGoSir |

- 현재 탭이 활성 상태이면 알림을 보내지 않음 (iTerm2 지원)

### iterm-tab-color.sh — 터미널 탭 색상

작업 상태에 따라 터미널 탭 색상을 변경합니다.

| 상태 | 색상 | 이벤트 |
|------|------|--------|
| 작업 중 | 노란색 | `UserPromptSubmit` |
| 컴팩트 | 파란색 | `PreCompact` |
| 완료 | 초록색 | `Stop`, `Notification` |
| 세션 종료 | 리셋 | `SessionEnd` |
