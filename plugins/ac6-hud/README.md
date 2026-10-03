# ac6-hud

Claude Code를 Armored Core VI 느낌으로 꾸미는 색 테마와 HUD mod입니다.

## 구성

- **테마 `AC6 Rubicon`**: 72개 색 항목 전체를 건메탈 바탕과 경고 주황 강조색으로 바꿉니다.
- **HUD mod**
  - 스피너: `◢ FIRING ── Locking On ▮` (작업 상태별로 SCAN / UPLINK / COMMS / LOCK-ON / FIRING)
  - 턴 종료: `◆ MISSION COMPLETE ── 12s`
  - 내 프롬프트: `RAVEN ▸ …` (ctrl+o 전체 보기에서는 원래 모습)
  - 툴 호출: `▶ FIRED  Bash ── npm test` (실행 중 FIRING, 실패 JAMMED, 중단 ABORT)
  - 하단 HUD: `COMBAT MODE ┃ AP 7000 ██████░░ ┃ ARMS 3 ┃ LAST SORTIE 12s`
    - AP: 남은 컨텍스트를 10000점 만점으로 환산. 50% 이하 노랑, 20% 이하 빨강 + CRITICAL
    - ARMS: 직전 턴의 툴 호출 수
  - `/cockpit`: AP 기록과 많이 쓴 툴 4개(R-ARM / L-ARM / R-BACK / L-BACK)를 보여 주는 패널 토글

## 설치

```
/plugin install ac6-hud@junyeong-claude-code-plugins
```

Claude Code를 다시 시작한 뒤 `/theme`에서 **AC6 Rubicon**을 고릅니다.

mod(함수 훅) 기능이 있는 Claude Code 2.1.288 이상이 필요합니다. mod API는 early access라 릴리스마다 바뀔 수 있습니다.

### 선택: 스피너 문구

`~/.claude/settings.json`에 추가합니다.

```json
"spinnerVerbs": {
  "mode": "replace",
  "verbs": ["Quick Boosting", "Assault Boosting", "Scanning", "Locking On", "Charging", "Reloading",
            "Recalibrating FCS", "Restoring EN", "Deploying Pulse Armor", "Stabilizing ACS",
            "Routing Coral", "Contacting Handler"]
}
```

## 개발

```
claude --plugin-dir ./plugins/ac6-hud   # 디스크에서 로드, 저장하면 다시 로드
claude plugin validate ./plugins/ac6-hud
claude plugin test ./plugins/ac6-hud
```

FromSoftware, Bandai Namco와 관계없는 팬 프로젝트입니다.
