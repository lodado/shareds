---
name: frontend-system-design
description: Use when building or changing a well-known frontend feature — infinite scroll and cursor feeds, search and typeahead, timelines with optimistic reactions, realtime chat, multi-file media upload, payment and money-transfer flows, notification badges, map and location lists, cart and checkout, or multi-step funnels. Supplies the proven structure, working code, the choices that actually differ per product, and the failure modes that break these features in production. Also use when reviewing such a feature for races, duplicate requests, optimistic-update bugs, or partial-failure handling.
---

# Frontend System Design

잘 알려진 프론트엔드 기능의 **검증된 구현 방법**을 모아 둔 참고서다. 각 문제마다 왜 그
구조가 맞는지, 실제 코드가 어떤 모양인지, 제품마다 갈리는 선택이 무엇인지, 그리고
현업에서 실제로 깨지는 지점이 어디인지를 담았다.

## 쓰는 법

1. 만들 기능에 해당하는 reference를 아래 표에서 고른다. 없으면 이 스킬을 쓰지 않는다.
2. 그 파일을 전부 읽는다.
3. `2. 권장 구조`와 `3. 구현`을 기본으로 삼아 구현한다.
4. `4. 판단이 갈리는 지점`에서 이 제품의 답이 기본값과 다른 항목만 확인한다.
5. 구현 후 `5. 함정` 표로 점검하고 `6. 남길 검증`을 테스트로 남긴다.

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

모든 reference가 같은 7단 구조를 따른다. 새 문제를 추가할 때도 이 형식을 지킨다.

| 섹션                    | 내용                                            |
| ----------------------- | ----------------------------------------------- |
| `1. 언제 읽는가`        | 적용 대상과 제외 대상                           |
| `2. 권장 구조`          | 검증된 기본 설계와 **그렇게 하는 이유**         |
| `3. 구현`               | 실제 동작하는 코드                              |
| `4. 판단이 갈리는 지점` | `선택 / 기본 추천 / 다른 선택이 맞는 때` 3열 표 |
| `5. 함정`               | `증상 / 원인 / 교정` 3열 표                     |
| `6. 남길 검증`          | 테스트로 고정할 관찰                            |
| `7. 배치`               | 코드 요소를 경계에 매핑 (FSD면 layer·segment)   |

## 코드를 쓰기 전에

- **레포가 우선이다.** 대상 레포의 규칙, 실제 설치된 라이브러리와 그 버전, 기존 경계
  관례가 이 문서의 기본값보다 앞선다. reference의 코드는 그대로 붙여 넣는 스니펫이
  아니라 구조를 보여주는 예시다.
- **버전 의존 동작은 확인한다.** 특정 라이브러리가 중복 호출을 어떻게 합치는지, 어떤
  옵션을 지원하는지는 버전마다 다르다. reference가 그렇게 적어 두었더라도 설치된
  버전의 문서로 확인한다.
- **`4. 판단이 갈리는 지점`의 답이 기본값과 다를 것 같으면 확인한다.** 이 표의 항목은
  결과를 바꾸는 제품 결정이다. 나머지는 기본값대로 진행해도 된다.
- **`6. 남길 검증`은 줄이지 않는다.** 여기 적힌 관찰은 이 기능이 실제로 깨지는 지점만
  골라 둔 것이다. network 경계는 MSW handler로 세우고, 임의 sleep으로 GREEN을 만들지
  않는다.

## 함께 쓰는 스킬

`frontend-oracle-design`을 함께 쓰면 `4. 판단이 갈리는 지점`의 답을 Oracle Card 행으로
잠그고 `6. 남길 검증`을 카드 증거로 매핑한다. 단독으로 써도 된다.
