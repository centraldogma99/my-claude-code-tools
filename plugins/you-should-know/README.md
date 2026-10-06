# you-should-know

Claude Code 내장 mod `cc-plugin-you-should-know`를 복제해, 사이드 에이전트가 **한국어로** 알려 주도록 패치한 mod입니다.

원본 mod는 긴 작업 중 6 step마다 메인 세션 맥락을 fork해서 "사용자가 꼭 알아야 할 것"을 찾아 프롬프트 위에 카드로 띄웁니다. 원본 프롬프트가 "plain English"로 설명하라고 지시해서, 대화가 한국어여도 영어로 나오는 경우가 많습니다.

## 원본과 다른 점

- 제안·설명 프롬프트 끝에 `## Language` 섹션을 붙여 한국어로 답하게 합니다. 파서가 읽는 `learn:` / `tag:` / `explain:` 라벨과 태그 값은 영어로 유지합니다.
- 카드 머리의 태그(`Heads up` → `주의`, `You should know` → `알아 두세요`)와 선택지·안내·오류 문구를 한글로 바꿨습니다. 태그 저장값과 파서는 영어 그대로입니다.
- telemetry 전송을 막았습니다.
- 카드를 닫은 뒤 묻는 선택지에서 '관련 없어요'를 뺐습니다. '이해하지 못했어요'를 누르면 원본처럼 응답을 기록만 하지 않고 설명을 다시 띄웁니다. 설명을 읽은 뒤였다면 같은 내용을 더 쉬운 말로 고쳐 쓰고, 한 줄 제안만 봤다면 처음 설명을 보여 줍니다.
- 내장 등록 코드와 사용 가능 여부 검사(1st-party, telemetry 켜짐 등)를 뺐습니다.
- `$.store`가 원본과 분리되어 있어 원본에 쌓인 `seen` / `known` 기록은 넘어오지 않습니다.

## 설치

```
/plugin install you-should-know@junyeong-claude-code-plugins
```

내장 mod는 꺼 주세요. 둘 다 켜져 있으면 카드가 두 번 뜹니다.

```
/plugin disable cc-plugin-you-should-know@builtin
```

## 다시 빌드하기

`hooks/register.ts`는 Claude Code 2.1.288 바이너리에서 꺼낸 내장 mod 소스(© Anthropic PBC)에 위 패치를 적용한 결과물입니다. Claude Code를 업데이트한 뒤 원본 변경을 반영하려면 다시 빌드합니다 (`python3`, `npx` 필요).

```bash
python3 plugins/you-should-know/build.py
claude plugin validate plugins/you-should-know
claude plugin test plugins/you-should-know
```

패치가 원본의 minify된 식별자에 기대기 때문에, 버전에 따라 assert가 실패할 수 있습니다.
