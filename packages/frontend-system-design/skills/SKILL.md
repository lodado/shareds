---
name: frontend-system-design
description: Use for frontend architecture and system design — Feature-Sliced Design (FSD) layers and slices, code structure and module boundaries, changeability, state ownership, type and state design, backend layering, visual design contracts, and well-known features such as infinite scroll, search, feeds, chat, uploads, payments, notifications, maps, carts, and multi-step funnels. Supplies architecture rules, implementation options, production failure modes, and verification duties. Behavior with state, order, count, permission, or money risk that must be fixed or built belongs to frontend-oracle-design, whose SPEC.md rules win over this skill.
allowed-tools:
  - Bash
---

# Frontend System Design

프론트엔드 **아키텍처·코드 구조**와 잘 알려진 기능의 **검증된 구현 방법**을 모아 둔 참고서다. 직접
호출해 구조와 기능 설계에 바로 쓴다. 제품 정책은 정하지 않는다.

## 명세 우선

- 상태·순서·횟수·권한·금액 위험이 있는 동작을 고치거나 만들어야 하면 동작 규칙은
  `frontend-oracle-design`이 소유한다(`SPEC.md` 규칙과 증명). 그 작업의 `SPEC.md`가 있으면
  그 규칙이 이 스킬의 권장안보다 앞선다.
- reference에서 제품 정책을 만들어 내지 않는다. `4. 판단이 갈리는 지점`은 정책 후보이고,
  명세나 사용자 답에 없으면 묻는다.
- 구현은 대상 레포의 관례가 먼저다. reference와 아키텍처 문서는 그 안에서 고르는 선택지다.

## 아키텍처

구조를 정하거나 바꿀 때 해당 파일을 **전부 읽는다**. 다른 구조를 강요하지 않는다.

| 하려는 일                                                           | 읽을 파일                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| React 구조를 새로 만들거나 바꿀 때 구조 결정을 문서로 승인받기      | [`architecture-contract.md`](references/architecture/architecture-contract.md)       |
| FSD 레이어·슬라이스·public API·서버 코드 배치                       | [`fsd.md`](references/architecture/fsd.md)                                           |
| 변경 비용(가독성·예측 가능성·응집·결합·단순성)으로 구현 고르기·리뷰 | [`changeability.md`](references/architecture/changeability.md)                       |
| 상태 소유·실행 위치(서버/클라이언트)·loading/error 경계             | [`decisions.md`](references/architecture/decisions.md)                               |
| 컴포넌트 분리·micro-hook·effect 작성 경계                           | [`authoring.md`](references/architecture/authoring.md)                               |
| 디자인·성능·접근성 품질 확인                                        | [`quality.md`](references/architecture/quality.md)                                   |
| 성능 문제를 분류하고 측정해 고치기                                  | [`performance.md`](references/architecture/performance.md)                           |
| 새 UI나 레이아웃·팔레트·타이포·모션을 바꾸는 시각 설계              | [`visual-design.md`](references/architecture/visual-design.md)                       |
| DB·repository·service 등 서버 데이터 접근 경계                      | [`backend.md`](references/architecture/backend.md)                                   |
| 구현 결정 기록 작성·책임 배치 설명                                  | [`decision-note.md`](references/architecture/decision-note.md)                       |
| 구현 리뷰 체크리스트                                                | [`review-checklist.md`](references/architecture/review-checklist.md)                 |
| 상태 모델·async·다단계 상태의 타입 설계 사다리                      | [`types/state-ladder.md`](references/architecture/types/state-ladder.md)             |
| 타입 제약 선택 순서와 작성 규칙                                     | [`types/authoring.md`](references/architecture/types/authoring.md)                   |
| Props·공유 API의 타입 표면                                          | [`types/api-surface.md`](references/architecture/types/api-surface.md)               |
| 제네릭·조건부·재귀 타입과 컴파일러 witness                          | [`types/advanced-contracts.md`](references/architecture/types/advanced-contracts.md) |
| 타입·상태 변경 리뷰 기준                                            | [`types/review-criteria.md`](references/architecture/types/review-criteria.md)       |
| 타입 계약이 기대는 TypeScript 설정 확인(레포당 한 번)               | [`type-environment.md`](references/architecture/type-environment.md)                 |

## 기능 설계 쓰는 법

1. 만들 기능에 해당하는 reference를 아래 표에서 고른다. 없으면 이 절은 쓰지 않는다.
2. 그 파일을 전부 읽고 모든 제품 선택을 승인된 명세나 사용자 답에 매핑한다.
3. `2. 권장 구조`·`3. 구현`은 대상 레포의 구현 관례와 대조해 충돌하지 않는 최소 선택만 쓴다.
4. `5. 함정`과 `6. 남길 검증`의 적용 항목을 검증 매핑에 올린다.

## 로드 결과

reference 전문을 읽은 뒤에는 전문을 다시 요약하지 말고 아래만 반환한다. 빈 항목은
`N/A`와 사유를 쓴다. `필수 정책 질문`이 남으면 사용자에게 묻고 추측하지 않는다.

```text
로드한 reference: <파일>
필수 정책 질문: <명세에 없는 정책 선택>
구현 불변식: <깨지면 안 되는 상태·순서·부작용 횟수>
버전 확인: <실제 설치 버전으로 확인할 API·동작>
검증 매핑: <검증 ID·함정 ID → SPEC 규칙 R* 또는 테스트>
근거: <적용한 [S#]와 URL>
```

## Reference

파일은 존재만으로 로드되지 않는다. 아래 조건이 맞을 때만 해당 파일을 **전부 읽는다**.

| 만들려는 것                                                 | 읽을 파일                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 페이지를 이어 붙이는 목록·무한 스크롤·커서 피드             | [`references/infinite-scroll.md`](references/infinite-scroll.md)                                             |
| 입력에 따라 원격 결과를 갱신하는 검색·자동완성·combobox     | [`references/search-typeahead.md`](references/search-typeahead.md)                                           |
| 반응·미디어·실시간 유입이 있는 피드·타임라인                | [`references/feed.md`](references/feed.md), [`references/infinite-scroll.md`](references/infinite-scroll.md) |
| 전송 상태와 연결 끊김을 다루는 실시간 채팅·메시징           | [`references/chat.md`](references/chat.md)                                                                   |
| 이미지·동영상·파일 업로드                                   | [`references/media-upload.md`](references/media-upload.md)                                                   |
| 금액이 실제로 움직이는 결제·송금·정기결제                   | [`references/payment-flow.md`](references/payment-flow.md)                                                   |
| 읽지 않은 개수 배지·알림 목록·서버 푸시 상태                | [`references/notification-realtime.md`](references/notification-realtime.md)                                 |
| 지도를 움직여 조회하거나 사용자 위치로 주변을 보여주는 화면 | [`references/map-location.md`](references/map-location.md)                                                   |
| 옵션 선택·수량·장바구니처럼 재고와 가격이 변하는 선택 상태  | [`references/commerce-cart.md`](references/commerce-cart.md)                                                 |
| 여러 화면에 걸쳐 입력을 모아 한 번에 제출하는 퍼널          | [`references/multi-step-form.md`](references/multi-step-form.md)                                             |

## Reference 구조

모든 reference가 같은 8단 구조를 따른다. 새 문제를 추가할 때도 이 형식을 지킨다.

| 섹션                    | 내용                                                 |
| ----------------------- | ---------------------------------------------------- |
| `1. 언제 읽는가`        | 적용 대상과 제외 대상                                |
| `2. 권장 구조`          | 검증된 구현 선택지와 **그렇게 하는 이유**            |
| `3. 구현`               | 구조를 보여주는 동작 코드                            |
| `4. 판단이 갈리는 지점` | `선택 / 추천안 (정책 아님) / 다른 선택이 맞는 때` 표 |
| `5. 함정`               | `증상 / 원인 / 교정` 표                              |
| `6. 남길 검증`          | 검증 매핑에 올릴 관찰                                |
| `7. 배치`               | 승인된 코드 경계에 요소를 매핑(FSD면 layer·segment)  |
| `8. 근거`               | 본문의 `[S#]` 주장과 연결한 표준·공식·upstream 자료  |

참조용 ID는 따로 붙이지 않고 이미 있는 이름을 쓴다. `6. 남길 검증` 항목은
`- **이름**:`으로 시작하고 그 이름이 검증 ID다(`infinite-scroll/중복 요청 차단`). `5. 함정`
행은 증상 칸이 함정 ID다(`infinite-scroll/함정: 같은 항목이 두 번 보임`). 둘 다 파일 안에서
유일하고, 한 번 쓴 이름은 바꾸지 않는다.

## 다루지 않는 문제

자주 만나지만 아직 reference가 없는 문제다. 요청이 여기에 해당하면 `로드한 reference: 없음`과
해당 항목을 알리고 이 절은 쓰지 않는다.

- 컬럼 정렬·필터·행 선택이 있는 data grid (필터가 바뀌는 목록 조회는 infinite-scroll·search-typeahead가 다룬다)
- 드래그로 순서 바꾸기
- 여러 사용자가 같은 문서를 동시에 고치는 협업 편집
- 오프라인에서 저장하고 나중에 동기화
- 인증 토큰을 갱신하는 동안 실패한 요청 재시도
- 오래 걸리는 내보내기와 대용량 다운로드
- 여러 항목을 한 번에 삭제·이동하는 일괄 작업

새 reference는 8단 구조와 `[S#]` 근거를 갖추고 사용자가 승인했을 때만 추가하고, 추가하면 이
목록에서 지운다. 실행 한 번이나 리뷰 코멘트 하나만으로 함정이나 검증 항목을 늘리지 않는다.

## 코드를 쓰기 전에

- **명세가 정책을 소유한다.** reference의 추천안과 production 코드는 정책 출처가 아니다.
  결과를 바꾸는 선택에 승인된 답이 없으면 추측하지 않는다.
- **레포가 우선이다.** 대상 레포의 규칙, 실제 설치 라이브러리와 버전, 기존
  경계 관례가 reference 예시보다 앞선다. reference 코드는 그대로 붙여 넣는 스니펫이
  아니라 구조를 보여주는 예시다.
- **버전 의존 동작은 확인한다.** 라이브러리 옵션과 동작은 실제 설치된
  버전의 문서로 확인한다.
- **근거는 구현 선택의 근거다.** `[S#]`는 정책 출처가 아니며, 표준·공식·upstream
  자료를 우선한다. `latest` 링크는 현재 설치 버전과 다를 수 있으므로 실행 직전에 다시
  확인한다.
- **구조 결정은 아키텍처 문서를 따른다.** state ownership, Server/Client, Suspense와 Error
  Boundary, query/hook, architecture 선택은 위 아키텍처 절의 파일이 기준이다.
- **검증을 줄이지 않는다.** `6. 남길 검증`의 적용 항목은 테스트나 명세 규칙에 매핑한다.
  network 경계는 MSW handler로 세우고 임의 sleep으로 통과시키지 않는다.
