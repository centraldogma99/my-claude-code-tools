# pin

위쪽에 있던 AI 답변을 옆 pane에 고정해 두고, 스크롤하지 않고 보면서 대화하게 해 주는 mod입니다.

## 사용법

- 답변에 마우스를 올리면 오른쪽 위에 `📌 pin` 버튼이 나타납니다. 누르면 그 답변이 pane에 고정됩니다. (터미널 fullscreen 레이아웃에서만)
- `/pin`: 가장 최근 답변을 고정합니다. `/pin 2`는 그 이전 답변입니다.
- `/unpin 2`: 2번 항목을 뺍니다. 번호 없이 `/unpin`이면 마지막 항목입니다. pane 각 항목의 **Unpin** 버튼도 같습니다.
- `/pin clear`: 모두 비우고 pane을 닫습니다.

고정한 내용은 세션을 다시 열어도 남고, 남은 항목이 있으면 시작할 때 pane이 다시 열립니다.

## 설치

```
/plugin install pin@junyeong-claude-code-plugins
```
