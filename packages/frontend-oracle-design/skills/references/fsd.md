# FSD (Feature-Sliced Design) 계약

대상 레포가 이미 FSD이거나 greenfield에서 FSD 도입이 승인된 때만 적용한다.
이 문서는 FSD를 강제하지 않는다 — `architecture-contract.md`의 승인 게이트를
통과한 architecture 문서가 FSD를 채택했을 때 그 구조 결정의 기준이 된다.
레포의 명시적 관례가 이 문서와 다르면 레포 관례를 따르고 사유를 기록한다.

## Layer와 import 방향

- 표준 layer: `app → pages → widgets → features → entities → shared`.
  상위 layer는 하위 layer만 import한다. 역방향 import는 금지다.
- 같은 layer의 다른 slice를 import하지 않는다. entities 간 결합이 정말 필요하면
  `@x` cross-import notation으로 공개하고 architecture 문서에 기록한다.
- `shared`는 slice 없이 segment로 직접 구성한다(`shared/api`, `shared/ui`,
  `shared/lib`, `shared/config`). 앱 전역 fetch wrapper·api client는 layer 밖에
  두지 않고 `shared/api`가 소유한다.
- 실제로 쓰는 layer만 만든다. 빈 layer·slice·segment 생성은 금지다.
- Next.js App Router에서 `app/` 디렉터리는 framework 라우팅이 소유한다. FSD
  `pages` layer가 필요하면 `views` 등 충돌하지 않는 이름을 architecture 문서에
  기록하고 일관되게 쓴다. route 파일은 조립만 하고 로직은 slice로 내린다.

## Slice와 segment

- slice는 비즈니스 도메인 단위이며 layer 바로 아래 폴더다.
- 표준 segment는 `ui`, `model`, `api`, `lib`, `config`뿐이다.
  **`components`, `hooks`, `utils`는 FSD segment가 아니다.**
  - component와 뷰 로직 hook은 `ui`에 둔다.
  - 상태·비즈니스 로직 hook, store, query key/options는 `model`에 둔다.
  - transport, DTO 변환, request 함수는 `api`에 둔다.
  - 순수 계산·헬퍼는 `lib`에 둔다.
- interaction workflow를 소유한 hook(예: mutation hook)은 `model` 소속이다.
  `hooks/` 폴더를 만들어 model과 ui 책임을 섞지 않는다.

## Public API

- 각 slice는 `index.ts` 하나로 public API를 공개한다. 외부 소비자(상위 layer의
  route·widget 포함)는 slice 내부 경로를 deep import하지 않는다.
  `@/features/x/ui/Foo` 금지, `@/features/x`만 허용.
- index는 외부가 실제로 쓰는 최소 표면만 export한다. 내부 lib 함수·테스트 전용
  helper를 관성으로 export하지 않는다.
- server-only 코드는 client public API에 섞지 않는다. client가 쓰는 계약 타입은
  `shared`(또는 승인된 entities) 소유 모듈로 옮기고, client 코드가 server 도메인
  모듈을 직접 import하지 않게 한다.

## 테스트·mock 배치

- 여러 segment를 관통하는 scenario·Playwright 테스트: `<slice>/__test__/`.
- 한 segment에 국한된 unit·component 테스트: 해당 `ui|model|api|lib/__test__/`.
- 소스 파일 옆 colocation, 루트 `e2e/`·`mocks/` 집중은 금지다. 레포가 다른
  위치를 명시적으로 강제할 때만 그 관례를 따르고 사유를 기록한다.
- MSW handler와 예시 데이터: 한 segment만 쓰면 `<slice>/api/__mocks__/`, 여러
  segment를 관통하면 `<slice>/__mocks__/`, 실제로 여러 slice가 공유할 때만 상위
  layer로 올린다.

## Greenfield bootstrap

- 승인된 layer만 생성하고 path alias(`@/*` 등) 매핑을 architecture 문서에
  기록한다.
- import-boundary 검증이 없으면 도입을 **제안**한다: steiger(공식 FSD linter)
  또는 `eslint-plugin-boundaries`·`import/no-internal-modules` 동등 규칙.
  사용자 승인 후 devDependency로 추가하고 GREEN 게이트의 구조 검증 명령에
  포함한다. 승인 없이는 추가하지 않는다.
- 사용자 전역 rules나 repo instruction이 다른 폴더 구조(예: `components/`,
  `hooks/`, `lib/` 조직)를 권장해 FSD와 충돌하면 임의로 절충하지 않는다.
  `NEEDS_DECISION`으로 우선순위를 물어 승인된 결정을 architecture 문서에
  기록한 뒤 진행한다.

## 자주 나오는 위반

| 위반                                                | 교정                                   |
| --------------------------------------------------- | -------------------------------------- |
| 상위 layer가 slice 내부 파일 deep import            | slice `index.ts` public API로만 import |
| `features/<slice>/components\|hooks\|utils` segment | `ui`·`model`·`lib`로 재배치            |
| client hook이 server 도메인 모듈 직접 import        | 계약 타입을 shared/entities로 이동     |
| index가 내부 구현 함수까지 export                   | 외부 사용 표면만 남기고 제거           |
| 테스트를 소스 옆에 colocation                       | slice·segment `__test__/`로 이동       |
| fetch wrapper가 layer 밖(`src/lib` 등)에 부유       | `shared/api`로 이동                    |
