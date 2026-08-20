# 타입 계약 전제 환경 — 레포당 1회 검증

## 언제 읽나

대상 레포에서 이 스킬로 타입 계약([`type-constraints.md`](type-constraints.md))을
처음 만들기 전 **레포당 1회**, 또는 diff가 tsconfig·TypeScript 버전을 바꿀 때만
읽는다. 매 카드마다 다시 읽지 않는다.

"컴파일되지 않는다"는 컴파일러 설정의 함수다. 환경이 고정되지 않은 타입 계약은
결정적이지 않다 — 같은 코드가 레포 설정에 따라 통과하기도 실패하기도 한다.

## 검증 항목

tsconfig는 `extends` 체인을 끝까지 따라가 실효 값으로 판정한다
(`tsc --showConfig`). 파일에 보이는 값이 아니라 실효 값이 기준이다.

| 항목                         | 기준  | 미충족 시 약화되는 계약                                               |
| ---------------------------- | ----- | --------------------------------------------------------------------- |
| TypeScript 버전              | ≥ 5.4 | `NoInfer`(5.4)·`const` type parameter(5.0)·`satisfies`(4.9) 사용 불가 |
| `strict`                     | 필수  | discriminated union 좁히기·null 안전 — 타입 계약 전제 자체가 없음     |
| `noUncheckedIndexedAccess`   | 권장  | lookup map·배열 인덱스 접근이 `undefined` 검사 없이 통과              |
| `exactOptionalPropertyTypes` | 권장  | 연산 union의 "유지 vs 삭제" `undefined` 구분이 컴파일로 보증 안 됨    |

## 판정

- **전부 충족** — tsconfig 위치·TypeScript 버전을 Source Registry에
  `project-constraint`로 기록하고 진행한다. 이후 카드에서 재검증하지 않는다.
- **`strict` 또는 버전 미충족** — 타입 계약의 전제가 없다. tsconfig를 조용히
  바꾸지 않는다 — 레포 전체에 파급되는 프로젝트 정책 변경이다. 사용자에게
  미충족 항목과 영향을 보여주고 `NEEDS_DECISION`.
- **권장 flag 미충족** — 켜는 변경을 제안하되, 거절·보류되면 약화되는 계약
  목록을 Implementation Decision에 기록하고 진행한다. 그 계약 위반은 컴파일이
  아니라 리뷰·테스트가 잡아야 한다는 뜻이다.

기록된 환경과 다른 tsconfig·버전 변경이 이후 diff에 나타나면 이 문서를 다시
읽고 Source Registry 기록을 갱신한다.
