# Test Fixtures

`problem-definition-validator` 에이전트의 판정 로직을 검증하기 위한 샘플 문제 정의서 모음. 각 파일은 기대 판정이 있는 **테스트 데이터**이며, 파일명 prefix가 기대 판정을 나타낸다 (`pass-*` / `fail-*`).

## 기대 판정 표

| Fixture | 기대 판정 | FAIL 이유 (해당 시) | 검증하는 규칙 |
|---|---|---|---|
| `pass-valid-minimal.md` | PASS | — | 최소 구성(규칙과 제약 섹션 생략)으로도 통과 |
| `pass-backoffice-column-case.md` | PASS | — | **Block-aware 핵심 검증** — "컬럼 A, B는 제거한다"가 "범위 밖" 블록에서 Q3/Q5 skip으로 PASS 처리 |
| `fail-vague-criteria.md` | FAIL | 해결 기준 T/F 판정 가능성 | "UX를 개선한다" 같은 방향성 서술을 판정 불가로 감지 |
| `fail-feature-spec-in-background.md` | FAIL | 제외 항목 위반 (Q5 + UI 흐름) | "배경" 블록의 "필터 드롭다운을 추가한다"를 Q5와 "기능/솔루션 명세" 규칙으로 감지 |
| `fail-priority-tag.md` | FAIL | 제외 항목 위반 (항상 금지) | "해결 기준" 블록의 "P0/P1" 우선순위 태그를 "항상 금지" 카테고리로 감지 |
| `fail-missing-changelog-reason.md` | FAIL | 변경 이력 엔트리 완결성 | 변경 이력 엔트리의 3요소(날짜/내용/사유) 중 사유 누락을 감지 |

## 사용법

validator 에이전트를 각 fixture에 돌려, 기대 판정과 실제 판정이 일치하는지 확인한다.

```
Agent(
  prompt="Validate the problem definition document at the following path...\n\nProblem definition file: <absolute path to fixture>\nReference rules directory: <absolute path to references/>",
  subagent_type="problem-definition-writer:problem-definition-validator"
)
```

기대와 실제가 어긋나면 validator 에이전트의 instruction 또는 references 규칙에 버그가 있다는 뜻이다.

## 설계 원칙

- 각 `fail-*` 파일은 **오직 하나의 규칙만 위반**하도록 작성되었다. 다른 블록은 모두 정상이어야 한다. 이렇게 해야 validator가 "이 규칙을 감지했다"는 증거가 명확해진다.
- 각 `pass-*` 파일은 실제로 통과해야 할 정상 문서이며, 특히 `pass-backoffice-column-case.md`는 소스 문서(`문제 정의서를 도입합시다.md:86-98`)의 백오피스 컬럼 예시를 실제 문제 정의서 형태로 구현한 것이다.

## 커버리지 확장

새로운 엣지 케이스가 발견되면 fixture를 추가하고 이 표에 한 줄을 더한다. 규칙 하나당 fixture 하나가 바람직하다.
