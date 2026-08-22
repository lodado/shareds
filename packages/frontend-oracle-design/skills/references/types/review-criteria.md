# 타입 제약 — Reviewer 판정 기준

타입·상태 계약을 만든 변경을 리뷰할 때 [`state-ladder.md`](state-ladder.md)·
[`authoring.md`](authoring.md)·[`api-surface.md`](api-surface.md)와 같은 기준으로
판정한다.

- boolean 조합이 카드 `Never` 행을 타입상 허용하는데 union으로 만들지 않았으면
  `FINDING`이다. 카드에 없는 전이가 구현에 있으면 `FINDING`이다.
- boundary 값을 파싱 없이 단언했거나, `any`가 application 계층으로 새거나,
  `Partial<DomainEntity>` mutation을 도입했으면 `FINDING`이다.
- 파생 가능한 값을 별도 상태로 저장했거나, query·mutation 상태를 로컬 기계로
  복사했거나, raw setter를 hook 밖으로 노출했거나, 스키마·연산 union에서 파생
  가능한 타입을 수기로 복제 선언했으면 `FINDING`이다.
- 기존 query·router·form 상태를 이름만 바꾼 새 `status` union으로 재포장했거나,
  단일 capability만 필요한 공통 UI에 전체 lifecycle 타입을 만들었으면 `FINDING`이다.
- state union이나 state 값에 action을 저장했거나, 쓸 수 없는 상태에 no-op action을
  채웠거나, 기존 `refetch`가 있는데 같은 일을 하는 action을 새로 만들었으면
  `FINDING`이다.
- 카드의 State Model을 근거로 단순 조회에 Event union·전이 함수·transition command를
  도입했으면 `FINDING`이다. 사다리 단 선택 사유가 Implementation Decision에 있으면
  아니다.
- 무조건 실행되는 첫 조회의 loading·error를 경계로 올리지 않고 컴포넌트 안에서
  분기했으면 `FINDING`이다. 조건부 query·placeholder·취소 제약 같은 실제 실격
  사유를 Implementation Decision에 적었으면 아니다.
- 사다리 1·2단으로 끝나는 문제에 union·기계를 도입했거나, 상태 분기에
  exhaustiveness 강제(기본 계층 이상)가 없으면 Decision의 예외 사유 없이는
  `FINDING`이다.
- 앞 단 메커니즘으로 닫히는 문제에 뒷 단 타입을 썼거나, feature 코드에 자작
  mapped·conditional·recursive utility가 있거나, 내장 utility 재구현이나 type
  test 없는 고급 utility가 있으면 `FINDING`이다.
- 구현이 모든 key를 채우지 않는데 `Record<K, V>`로 total map을 약속했거나, 실행이
  지연·캐시되는 wrapper가 즉시 `ReturnType<F>`를 반환한다고 선언했으면
  `FINDING`이다. sparse lookup 결과의 `Partial<Record<K, V>>`는
  `Partial<DomainEntity>` mutation 금지의 대상이 아니다 — 둘을 같은 규칙으로
  금지하면 오적용이다.
- ID·브랜드 문자열처럼 열린 key 도메인에 `Partial<Record<K, V>>`를 썼거나, 자기
  필드를 가진 멤버가 하나 이하인데 `{ kind }` 태그 객체 union으로 만들었거나,
  앱 내부에서 생성되는 값에 스키마를 두고 정작 storage·URL·응답 읽기 지점을 파싱
  없이 신뢰하면 `FINDING`이다.
- 타입 선택 규칙과 그 근거를 코드 주석으로 옮겨 적었으면 `FINDING`이다. 선택
  사유는 Implementation Decision이 소유하고, 주석은 카드 행 ID를 인용한 도메인
  제약만 남긴다.
- 필수 invariant를 검사하지 않는 type predicate, runtime key 변환 없는
  key-remapping 반환형, `satisfies`·`as const`·annotation·excess property check를
  runtime 검증이나 sanitization으로 보고한 것, 단일 권위 없이 선언 줄 수만 줄이는
  variant record는 `FINDING`이다.
- 이번 변경에서 새로 설계한 exported shared/package API의 generic이 둘 이상의 public
  위치 사이 관계를 만들지 않거나 일반 제품 호출부가 type argument를 반복해야 하면
  `FINDING`이다. config·schema 정의 경계의 1회 고정과 기존 library generic 사용은
  대상이 아니다.
- 화면·복구 경로가 같은 `O*` 행들을 별도 상태로 쪼갰거나, 카드가 구분하지 않는
  값을 상태 필드로 발명했으면 `FINDING`이다. 구분이 필요하면 `POLICY_GAP`이다.
- 시간축 비결정성을 타입만으로 "해결됨" 처리했으면 `FINDING`이다.
- 생성 후 typecheck를 실행했을 뿐인데 생성 자체를 결정론화했다고 보고하면
  `FINDING`이다.
- 구현 diff가 `.test-d.*`의 `@ts-expect-error` 케이스를 삭제·약화했거나, 계약
  타입·스키마를 넓혀(필수 필드→optional, union→`string`) 타입 오류를 없앴는데
  카드 행 인용이 없으면 `FINDING`이다. 계약 파일은 검수의 신뢰 뿌리다 — 완화는
  구현 결정이 아니라 정책 변경이며 `POLICY_GAP`으로 `NEEDS_DECISION`이다.
- 상태 이름 취향, reducer 대 개별 handler 문법 선호, 패턴 매칭 라이브러리 선호만  
  다르면 `NON_ORACLE_OPINION`이다.
