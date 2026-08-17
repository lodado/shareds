# FSD (Feature-Sliced Design) 계약

대상 레포가 이미 FSD이거나 greenfield에서 FSD 도입이 승인된 때만 적용한다.
이 문서는 FSD를 강제하지 않는다 — `architecture-contract.md`의 승인 게이트를
통과한 architecture 문서가 FSD를 채택했을 때 그 구조 결정의 기준이 된다.
레포의 명시적 관례가 이 문서와 다르면 레포 관례를 따르고 사유를 기록한다.
기준 버전은 FSD v2.1([fsd.how](https://fsd.how),
[feature-sliced/skills](https://github.com/feature-sliced/skills))이다.

## Layer와 import 방향

- 표준 layer: `app → pages → widgets → features → entities → shared`.
  상위 layer는 하위 layer만 import한다. 역방향 import는 금지다.
- 같은 layer의 다른 slice를 import하지 않는다. 충돌 해결은
  「Cross-import 해결」을 따른다.
- **widgets layer는 신규 채택을 비권장한다**(v2.1). UI 블록은 대개 user-flow
  로직을 포함해 features와 책임이 겹친다. 화면 전용 조합은 pages에, 여러
  페이지가 재사용하는 액션과 그 UI는 features에, 비즈니스 맥락 없는 공용 UI는
  `shared/ui`에, 앱 전역 layout은 app에 둔다. 이미 widgets를 쓰는 레포는
  기존 관례를 유지한다.
- 최소 구성 `app + pages + shared`도 유효한 FSD다. features·entities는 실제
  사용처가 생겼을 때만 추가하고, 빈 layer·slice·segment는 만들지 않는다.
- `shared`는 slice 없이 segment로 직접 구성한다(`shared/api`, `shared/ui`,
  `shared/lib`, `shared/auth`, `shared/config`). shared 내부 segment끼리는
  서로 import할 수 있다. 앱 전역 fetch wrapper·api client는 layer 밖에 두지
  않고 `shared/api`가 소유한다.
- Next.js는 `app/`·`pages/` 폴더명을 라우팅에 쓰므로 FSD layer와 충돌한다.
  공식 관례대로 FSD layer를 `_app/`·`_pages/`로 개명해 architecture 문서에
  기록하고 일관되게 쓴다. route 파일(`app/**/page.tsx`)은 FSD `_pages/`
  slice를 re-export·조립만 하고 로직은 slice로 내린다.
- Steiger를 함께 쓰면 기본 `fsd/typo-in-layer-name` 규칙이 `_app`·`_pages`를
  오타로 볼 수 있다. 이 Next.js 관례를 승인했다면 아래 bootstrap 설정처럼
  그 규칙만 끄고 구조 사유를 architecture 문서에 남긴다.

## 추출 판단 — Pages-first

- **"Start simple, extract when needed."** 새 코드는 우선 그것을 쓰는
  `pages/` slice에 둔다. 페이지 간 중복은 허용이며 자동 추출 사유가 아니다.
- 추출 조건 세 가지를 모두 만족할 때만 하위 layer로 내린다: 같은 코드가
  **현재** 2곳 이상에서 실사용되고, 사용처들이 항상 같이 변하지 않으며,
  경계의 책임이 명확하다. 가설적 재사용으로 추출하지 않는다.
- 한 페이지만 쓰는 feature·entity는 그 페이지에 둔다
  (Steiger `insignificant-slice`).
- entities는 보수적으로 쓴다. entities 없는 FSD도 유효하다. CRUD는
  `shared/api`, auth 토큰·세션·login DTO는 `shared/auth`(또는 `shared/api`)에
  둔다 — auth 데이터 때문에 user entity를 만들지 않는다.
- 책임이 과도하게 넓은 god slice는 집중된 slice로 분리한다
  (예: `user-management` → `auth`·`profile-edit`).

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
- segment 안 파일명은 도메인 기반으로 짓는다(`model/user.ts`,
  `api/fetch-profile.ts`). `types.ts`·`utils.ts`·`helpers.ts` 같은
  technical-role 이름은 무관한 도메인을 한 파일에 섞으므로 금지다.

## Public API

- 각 slice는 `index.ts` 하나로 public API를 공개한다. 외부 소비자(상위 layer의
  route·widget 포함)는 slice 내부 경로를 deep import하지 않는다.
  `@/features/x/ui/Foo` 금지, `@/features/x`만 허용.
- index는 외부가 실제로 쓰는 최소 표면만 export한다. 내부 lib 함수·테스트 전용
  helper를 관성으로 export하지 않는다.
- shared는 최상위 `shared/index.ts`를 만들지 않고 segment별 public
  API(`shared/ui/index.ts`, `shared/api/index.ts` 등)를 둔다.
- server-only 코드는 client public API에 섞지 않는다. client가 쓰는 계약 타입은
  `shared`(또는 승인된 entities) 소유 모듈로 옮기고, client 코드가 server 도메인
  모듈을 직접 import하지 않게 한다. 단일 `index.ts`로 runtime 경계를 지킬 수
  없을 때만 `index.server.ts` 같은 환경별 entry를 추가한다.

## Cross-import 해결

같은 layer 간 cross-import는 code smell이다. 도입하면 반드시 architecture
문서에 사유를 기록한다.

- **entities**: 먼저 경계 병합을 검토한다. `@x` notation은 병합이 정말 불가할
  때의 최후 수단이지 권장 패턴이 아니다.
- **features**: 네 전략 중 상황에 맞는 것을 쓴다 — A) slice 병합(항상 같이
  변하면), B) 공유 도메인 로직을 entities로 강등, C) 상위 layer(pages·app)에서
  render props·slot·DI로 조합(IoC), D) 불가피하면 상대 slice의 `index.ts`
  public API로만 접근. `@x`는 entities 전용이다.

## Server 코드 배치

- full-stack Next.js에서 한 도메인의 server 로직(service, repository port·adapter,
  검증·재계산)은 layer 밖 `src/server/` 루트로 빼지 않는다. 그 도메인을 소유한
  slice의 `api` segment에 둔다.
- server 전용 모듈은 `server-only` import로 경계를 표시하고 client public
  API(`index.ts`)에 섞지 않는다. server 소비자용 진입점은 `index.server.ts` 또는
  `<slice>/api/server.ts` 같은 별도 entry로 공개한다.
- route handler(`app/api/**/route.ts`)와 RSC는 조립·전달만 하고 도메인 로직은
  slice `api`를 호출한다.
- 여러 slice가 실제로 공유하는 DB client·connection·container 같은 인프라만
  `shared/api`에 둔다.
- DB driver·ORM import와 query 실행은 `shared/api`의 db 인프라
  (client·migration·seed)와 각 slice `api`의 repository 안에만 둔다.
  repository는 mapping·keyset pagination·hasNext 판정을 소유하고, route
  handler·RSC·`ui`·`model`은 driver를 직접 import하지 않는다.

## 테스트·mock 배치

- 여러 segment를 관통하는 scenario·Playwright 테스트: `<slice>/__test__/`.
- 한 segment에 국한된 unit·component 테스트: 해당 `ui|model|api|lib/__test__/`.
- 소스 파일 옆 colocation, 루트 `e2e/`·`mocks/` 집중은 금지다. 레포가 다른
  위치를 명시적으로 강제할 때만 그 관례를 따르고 사유를 기록한다.
- MSW handler와 예시 데이터: 한 segment만 쓰면 `<slice>/api/__mocks__/`, 여러
  segment를 관통하면 `<slice>/__mocks__/`, 실제로 여러 slice가 공유할 때만 상위
  layer로 올린다.
- MSW 배선(`setupServer`·`setupWorker`)은 `shared/config/msw`에 두되 handler를
  포함하지 않는다. handler는 소유 slice가 export하고 배선이 조립만 한다.

## Greenfield bootstrap

- 승인된 layer만 생성하고 path alias(`@/*` 등) 매핑을 architecture 문서에
  기록한다.
- import-boundary 검증이 없으면 도입을 **제안**한다. 대상 workspace가
  `@lodado/eslint-config`를 이미 사용하고 `@lodado/eslint-config/fsd`를 실제로 resolve할
  수 있을 때만 그 preset을 재사용한다. 외부 레포에 이 내부 workspace 패키지
  설치를 권하지 않는다.
- 그 외에는 Steiger(공식 FSD linter) 또는
  `eslint-plugin-boundaries`·`import/no-internal-modules` 동등 규칙을 쓴다. Steiger는 runner와
  FSD plugin이 별도 패키지다.

  ```bash
  pnpm add -D steiger @feature-sliced/steiger-plugin
  ```

  Next.js에서 `_app`·`_pages` 관례를 쓰면 최소 설정은 다음과 같다.

  ```js
  // steiger.config.js
  import fsd from '@feature-sliced/steiger-plugin'
  import { defineConfig } from 'steiger'

  export default defineConfig([...fsd.configs.recommended, { rules: { 'fsd/typo-in-layer-name': 'off' } }])
  ```

  `pnpm exec steiger ./src`를 구조 검증 명령으로 기록한다.
  사용자 승인 후 devDependency로 추가하고 GREEN 게이트의 구조 검증 명령에
  포함한다. 승인 없이는 추가하지 않는다.

- 사용자 전역 rules나 repo instruction이 다른 폴더 구조(예: `components/`,
  `hooks/`, `lib/` 조직)를 권장해 FSD와 충돌하면 임의로 절충하지 않는다.
  `NEEDS_DECISION`으로 우선순위를 물어 승인된 결정을 architecture 문서에
  기록한 뒤 진행한다.

## 예시 — full-stack Next.js 목록 + 좋아요

```text
src/
├── app/                      # Next 라우팅 전용 — page.tsx·route.ts는 조립만
├── _pages/product-list/      # 페이지 전용 조합 (widgets 아님)
│   ├── model/useProductsInfinite.ts
│   ├── ui/                   # List·Skeleton·Empty·Error·LoadMoreSentinel
│   ├── api/                  # 목록 GET + cursor (단일 사용이면 여기)
│   └── __test__/
├── entities/product/         # 여러 소비자가 실공유하는 것만
│   ├── model/product.ts      # 도메인 파일명 — types.ts 금지
│   ├── api/product.repository.ts   # server-only
│   ├── api/__mocks__/
│   └── ui/ProductCard.tsx
├── features/product-like/
│   ├── api/like.repository.ts      # server-only
│   ├── api/likeApi.ts + __mocks__/
│   ├── model/useToggleLike.ts + likeCachePatch.ts
│   ├── ui/LikeButton.tsx
│   └── __test__/             # segment 관통 scenario
└── shared/
    ├── api/httpClient.ts + db/     # driver·client·migration·seed
    ├── auth/
    └── config/msw/           # setupServer 배선만, handler 없음
```

## 자주 나오는 위반

| 위반                                                | 교정                                   |
| --------------------------------------------------- | -------------------------------------- |
| 상위 layer가 slice 내부 파일 deep import            | slice `index.ts` public API로만 import |
| `features/<slice>/components\|hooks\|utils` segment | `ui`·`model`·`lib`로 재배치            |
| client hook이 server 도메인 모듈 직접 import        | 계약 타입을 shared/entities로 이동     |
| index가 내부 구현 함수까지 export                   | 외부 사용 표면만 남기고 제거           |
| 테스트를 소스 옆에 colocation                       | slice·segment `__test__/`로 이동       |
| fetch wrapper가 layer 밖(`src/lib` 등)에 부유       | `shared/api`로 이동                    |
| server 도메인 코드가 layer 밖 `src/server/`에 부유  | 소유 slice의 `api` segment로 이동      |
| 단일 사용 코드를 feature·entity로 조기 추출         | 사용하는 page slice로 되돌림           |
| `model/types.ts`·`utils.ts` technical-role 파일명   | 도메인 기반 파일명으로 변경            |
| widgets layer 신규 채택                             | pages·features·shared·app으로 라우팅   |
| CRUD·auth 토큰을 entities로 승격                    | `shared/api`·`shared/auth`에 유지      |
