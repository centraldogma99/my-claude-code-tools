# you-should-know

Claude Code 내장 mod `cc-plugin-you-should-know`를 복제해, 사이드 에이전트가 **한국어로** 알려 주도록 패치한 mod입니다.

원본 mod는 긴 작업 중 6 step마다 메인 세션 맥락을 fork해서 "사용자가 꼭 알아야 할 것"을 찾아 프롬프트 위에 카드로 띄웁니다. 원본 프롬프트가 "plain English"로 설명하라고 지시해서, 대화가 한국어여도 영어로 나오는 경우가 많습니다.

## 원본과 다른 점

- 제안·설명 프롬프트 끝에 `## Language` 섹션을 붙여 한국어로 답하게 합니다. 파서가 읽는 `learn:` / `tag:` / `explain:` 라벨과 태그 값은 영어로 유지합니다.
- telemetry 전송을 막았습니다.
- 내장 등록 코드와 사용 가능 여부 검사(1st-party, telemetry 켜짐 등)를 뺐습니다.
- `$.store`가 원본과 분리되어 있어 원본에 쌓인 `seen` / `known` 기록은 넘어오지 않습니다.

## 빌드

mod 코드는 Anthropic 저작물이라 이 레포에 포함하지 않습니다. 설치된 Claude Code 바이너리에서 직접 꺼내 패치합니다 (`python3`, `npx` 필요).

```bash
python3 plugins/you-should-know/build.py   # → hooks/register.ts 생성
claude plugin validate plugins/you-should-know
claude plugin test plugins/you-should-know
```

원본의 minify된 식별자에 기대는 패치라, Claude Code 버전이 바뀌면 assert가 실패할 수 있습니다. 확인된 버전은 2.1.288입니다.

## 사용

1. 내장 mod 끄기: `/plugin disable cc-plugin-you-should-know@builtin` (둘 다 켜면 카드가 두 번 뜹니다)
2. `~/.claude/settings.json`의 `env`에 빌드한 폴더를 지정하고 Claude Code를 다시 시작합니다.

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/absolute/path/to/plugins/you-should-know" } }
```

빌드 산출물이 필요해서 마켓플레이스(`/plugin install`)로는 배포하지 않습니다.
