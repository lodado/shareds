### Implementation Decision

- Target: Node.js >=18.19, pnpm 9, frontend-oracle-design 0.5.0의 Markdown contract와 `oracle-verify.mjs` CLI
- State ownership: N/A — 동기 card lint이며 새 runtime state가 없다.
- Server/Client boundary: N/A — React production 변경이 아니다.
- Async boundary: N/A — file read 뒤 동기 구조 검증만 수행한다.
- Hook boundary: N/A — React hook이 없다.
- Type contract: Outcome 필드 6개와 Source Kind 4개를 좁은 상수 집합으로 두고 누락·TBD·미등록 값을 `CARD_LINT_FAILED`로 반환한다.
- Architecture: 기존 `lintCard`와 reference owner를 그대로 확장했다. 새 parser class, schema layer, 상태 또는 dependency를 만들지 않았다.
- Changeability: Readability를 위해 필드와 Kind에 도메인 이름을 붙였고, Predictability를 위해 기존 card lint 오류 정책을 재사용했다. shared BVA는 두 플러그인에 같은 bytes로 유지했다.
- Side effects: verifier는 기존처럼 stdout/stderr와 exit code만 소유한다. 새 파일 write나 network 호출은 없다.
- Simplicity: 기존 `sectionLines`, `splitRow`, `isEmptyCell`, required label과 reviewer 흐름을 재사용했다.
- Design: N/A — behavior-only plugin 문서·CLI 변경이다.
- Accessibility: interactive UI의 semantic name·keyboard·focus·상태 전달 기본선을 frontend와 `$test`의 shared BVA에 동일하게 기록했다.
- Performance: N/A — 성능 claim이 없고 benchmark나 dependency를 추가하지 않았다.
- Public API: 카드 형식은 사용자의 명시적 결정대로 현재 형식을 직접 변경했다. v1/v2 분기와 migration은 만들지 않았다.
- Sources: 승인 Oracle `sha256:984ebad537bc721ab73b0f8e40e882314bf95780201c5dee02fbf6a299c30d1c`, repository README/package scripts, 인접 verifier·contract tests
- Rejected: card schema versioning과 migration, 새 Delivery 상태, 별도 quality row/evidence kind, 자동 benchmark·release 도구, MSW 강제 설치
