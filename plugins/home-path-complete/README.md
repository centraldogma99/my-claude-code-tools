# home-path-complete

프롬프트 입력창에서 `~/`로 시작하는 경로를 자동완성하는 mod. `@` 멘션이 닿지 않는 레포지토리 밖의 파일·디렉토리를 참조할 때 쓴다.

```
[ ctrl+f ] ccusage/  claude-code-recall-prev-session/  crumble-deckmaker/
❯ see ~/open-source/c
```

- 커서 앞의 토큰이 `~/`로 시작하면 입력창 위에 그 디렉토리의 후보 목록이 뜬다 (최대 12개). 숨김 파일은 `.`을 입력해야 보인다.
- `ctrl+f`를 누르면 셸의 Tab처럼 완성된다. 후보가 하나면 끝까지, 여러 개면 공통 접두사까지 채운다.

## 설정: 키 바인딩

Tab은 엔진이 먼저 처리해 mod가 받을 수 없고, mod 버튼은 엔진 keybinding action을 통해서만 단일 키로 눌린다. 그래서 `~/.claude/keybindings.json`에 아래 바인딩을 추가해야 한다 (파일이 이미 있으면 `bindings` 배열에 합친다).

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "bindings": [
    { "context": "Global", "bindings": { "ctrl+f": "app:cycleDiffBase" } }
  ]
}
```

- `Chat` context에 두면 동작하지 않는다. `Global`이어야 한다.
- 입력창의 기존 `ctrl+f`(커서 한 칸 앞으로)는 그대로 동작한다.
- diff 패널이 열린 동안에는 `ctrl+f`가 diff 비교 기준 전환으로 처리될 수 있다.
- 다른 키를 원하면 `"ctrl+f"`만 바꾼다. 수식키 조합이나 chord여야 한다.
