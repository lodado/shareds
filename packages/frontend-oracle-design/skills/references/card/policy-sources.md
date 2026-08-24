# Oracle Card — 외부 기준과 정책 출처

## 외부 기준 게이트

Risk·Grill 전에 사용자가 제공했거나 레포가 승인된 기준으로 지정한 자료를 찾아 전부
읽는다. 우선순위와 관할 규칙은 [`common.md`](../common.md)의 권위 우선순위를 따른다 —
production 코드·기존 테스트·브라우저 관찰은 조사 증거일 뿐 정책 출처가 아니다.

카드 상단에 이번 변경의 제품 결과와 범위를 기록한다. KPI가 없으면 수치를 발명하지
않고 사용자가 관찰할 수 있는 성공 결과를 쓴다.

```markdown
## Outcome Brief

- Actor and context: 누가 어떤 상황에서 사용하는가
- Observable success: 관찰 가능한 성공 결과
- Non-goals: 이번 변경에서 하지 않을 일
- Worst regression: false GREEN의 가장 큰 피해
- Reversibility: 되돌리는 방법 또는 N/A 사유
- Sources: S1, S2
```

### Requested mechanism check — 수단과 결과 분리

사용자가 구체적 수단(화면·필드·버튼·자동화·조건)을 요청했지만 의도한 결과나
사용자가 불명확하면 Outcome Brief에 다음을 함께 기록한다. 수단과 결과가 이미
일치하면 이 소절 없이 그대로 진행한다.

- Requested mechanism: 사용자가 요청한 구체적 수단
- Intended outcome: 실제로 해결하려는 사용자·비즈니스 문제
- Smallest reversible scope: 그 결과를 확인할 수 있는 최소 가역 범위
- Deferred scope: 검증 전에는 만들지 않을 범위 — Non-goals에 사유와 함께 기록

규칙:

- 더 작은 대안은 Draft Oracle에 제시만 한다. scope 축소는 사용자의 명시적
  승인으로만 확정하며 에이전트가 임의로 줄이지 않는다.
- 이 검토를 `mandatory-constraint`(보안·개인정보·법·접근성·데이터 정합성) 생략
  근거로 쓰지 않는다.

## Source Registry

```markdown
## Source Registry

| ID  | Kind                 | 관할                     | 기준          | 위치·version                      | 승인 상태 |
| --- | -------------------- | ------------------------ | ------------- | --------------------------------- | --------- |
| S1  | product-policy       | 비즈니스 결과            | PRD           | repo:docs/profile.md#save-flow-v3 | approved  |
| S2  | product-policy       | UI·문구·interaction      | Figma         | file/page/frame/version           | approved  |
| S3  | project-constraint   | payload·오류·idempotency | API 계약      | endpoint/version                  | approved  |
| S4  | mandatory-constraint | 접근성·토큰              | 디자인 시스템 | 문서 위치/version                 | approved  |
```

허용 `Kind` 4종:

- `product-policy`: 사용자 답변과 승인된 PRD·Figma처럼 제품 결과를 정하는 자료
- `mandatory-constraint`: 보안·개인정보·법·접근성·데이터 정합성처럼 제품 선호로 낮출
  수 없는 제약
- `project-constraint`: 저장소의 공개 API·architecture·테스트·호환성 계약
- `implementation-reference`: 실제 설치 버전의 공식 문서·구현 휴리스틱. 제품 결과를
  정하지 못한다.

규칙:

- Source ID는 카드 안에서 unique해야 한다. 정책·Outcome Brief·`O*`/`D*` 행이 인용하는
  `S*`는 반드시 이 표에 존재해야 한다.
- repo 안의 승인 문서·architecture·API 계약은 `위치·version`을 `repo:<상대경로>#<anchor-or-version>`으로
  기록한다. `repo:` source는 `oracle-lock.mjs create --source <상대경로>`에도 포함되어야
  하며, lock manifest에 없으면 lock 금지.
- Figma는 원본 파일의 정확한 page·frame·variant를 직접 확인. 열 수 없으면 기억·유사
  스크린샷으로 대체하지 않는다.
- 외부 기준이 없으면 `N/A — 제공되거나 승인된 외부 기준 없음` 기록.
- 외부 기준끼리 또는 사용자 답변과 충돌, 필수 기준 접근 불가 → 충돌 위치·영향 정책
  제시 후 `NEEDS_DECISION`.
- 카드는 외부 기준의 실행 가능한 번역이다. 작성 후 외부 기준의 상태·문구·interaction·
  부작용 요구가 누락·왜곡되지 않았는지 대조한다.
- 기준은 자신의 관할 안에서만 우선한다([`common.md`](../common.md) 관할 규칙).
  `mandatory-constraint` 충돌 처리도 같은 문서를 따른다.
- 기준의 revision/version이 바뀌면 기존 `ORACLE_READY`를 무효화하고 다시 대조.

## 정책 출처

인정·불인정 목록은 [`common.md`](../common.md)의 정책 출처 절이 canonical이다.
결정된 정책마다 출처를 붙인다 — 출처 없는 정책이 하나라도 있으면 `ORACLE_READY`가
아니다. 출처는 등록된 `S*` 또는 `User Confirmation`이어야 하고, 승인되지 않은 source나
`implementation-reference` 단독 source는 정책 권위가 아니다.

```markdown
### 결정된 정책

- P1: 저장 중 추가 제출은 무시한다. (출처: 유저 Q1=A) (행: O1, O2)
- P2: 5xx 실패 시 입력을 유지한다. (출처: S1) (행: O3)
```
