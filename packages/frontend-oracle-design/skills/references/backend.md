# Backend and Data-access Contract

Full-stack 작업에서 DB와 persistence 경계를 정할 때만 읽는다. 특정 framework, ORM,
database 또는 frontend architecture를 강제하지 않는다.

## Intake

구현과 Oracle lock 전에 실제 repo에서 다음을 확인하고 승인된 architecture source에
경로와 책임을 기록한다.

- backend source root와 공개 server entry point
- DB driver·ORM을 import할 수 있는 data-access 경계
- repository, service, route/controller의 기존 책임
- schema·migration·seed와 integration test의 소유 위치
- local·test·production의 persistence 및 reset 정책

경계가 미결이면 새 layer를 먼저 만들지 않는다. `NEEDS_DECISION`으로 돌아가 승인된
architecture가 안정된 뒤 잠근다.

FSD 레포면 server 도메인 코드 배치는 [`fsd.md`](fsd.md)의 「Server 코드 배치」를
따른다 — layer 밖 `src/server/` 루트를 만들지 않고 소유 slice의 `api` segment에
`server-only` 경계로 둔다.

## 최소 data-access 경계

- DB driver·ORM import와 query 실행은 승인된 repository/data-access module 안에만 둔다.
- repository는 SQL/query, row mapping, stable ordering, pagination predicate와 다음 페이지
  판정을 소유한다. route/controller와 UI는 이를 재구현하지 않는다.
- 단순 read-only 조회는 route/controller가 repository를 직접 호출한다. 여러 repository,
  transaction 또는 business workflow를 조정하지 않으면 service layer를 추가하지 않는다.
- service가 필요하면 조정하는 workflow와 transaction boundary를 architecture source에
  명시한다. repository를 그대로 전달하는 service는 만들지 않는다.
- DB를 authoritative source로 정했으면 client cache, fixture, draft가 같은 record의 별도
  source of truth가 되지 않게 한다.

## Persistence와 reset

- container volume, local file 또는 managed DB의 보존 범위를 architecture contract에
  기록한다.
- non-destructive shutdown과 destructive reset 명령을 구분하고, 데이터 삭제 명령은
  이름과 결과를 명시한다.
- seed·migration의 반복 실행 가능 여부와 test isolation 방식을 실제 도구 기준으로
  검증한다. production 데이터를 지우는 fallback은 두지 않는다.

## 검증

repo에 import-boundary lint나 architecture test가 있으면 실행한다. 없으면 검색과 독립
review로 DB import·query가 승인 경계 밖에 없는지 확인한다. pagination, transaction,
mapping처럼 query 결과를 바꾸는 로직은 가장 가까운 data-access test로 검증하고,
가능하면 실제 test database를 사용한다.
