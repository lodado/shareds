---
name: frontend-system-design
description: Use with frontend-oracle-design when building or reviewing a well-known frontend feature — infinite scroll, search, feeds, chat, uploads, payments, notifications, maps, carts, or multi-step funnels. frontend-oracle-design must run first and remains the sole orchestrator; this companion supplies policy candidates, implementation options, production failure modes, and verification duties after Oracle intake.
---

# Frontend System Design

잘 알려진 프론트엔드 기능의 **검증된 구현 방법**을 모아 둔 Oracle 보조 참고서다. 각
reference는 정책 후보, 구현 선택지, 실제 failure mode, 검증 의무를 제공하지만 제품
정책이나 Delivery 상태를 결정하지 않는다.

## Oracle 우선

1. 이 스킬이 직접 호출되면 `frontend-oracle-design`을 먼저 로드한다. 찾지 못하면
   `FAIL`이며 이 스킬을 단독으로 실행하지 않는다.
2. 이미 활성 Oracle Card 안에서 reference를 요청받았다면 Oracle을 다시 호출하지
   않는다. 현재 Oracle이 source, Risk, Grill, lock, TDD, browser, review와 상태 전이의
   제어권을 계속 가진다.
3. `4. 판단이 갈리는 지점`은 모두 정책 후보다. 승인된 source나 사용자 답변에 없는
   선택은 `POLICY_GAP`으로 Oracle에 돌려보내고 `NEEDS_DECISION`에서 멈춘다.
4. `2. 권장 구조`와 `3. 구현`은 구현 선택지다. 대상 레포와 실제 설치 버전, 활성
   Oracle Card, Oracle이 로드한 implementation reference를 앞설 수 없다.
5. `ORACLE_READY` 전에는 테스트나 production을 수정하지 않는다. Delivery가 승인된
   뒤에도 Oracle의 테스트 계약으로 `VALID_RED`를 확인하기 전에는 production을
   수정하지 않는다.

## 쓰는 법

1. Oracle intake를 먼저 마친다.
2. 만들 기능에 해당하는 reference를 아래 표에서 고른다. 없으면 이 스킬을 쓰지 않는다.
3. 그 파일을 전부 읽고 모든 제품 선택을 승인된 source 또는 Oracle Card 행에 매핑한다.
4. `2. 권장 구조`·`3. 구현`을 Oracle의 구현 결정과 대조해 충돌하지 않는 최소 선택만 쓴다.
5. `5. 함정`과 `6. 남길 검증`의 적용 항목을 Oracle 증거 행에 매핑한다.

## 로드 결과

reference 전문을 읽은 뒤에는 전문을 다시 요약하지 말고 아래만 반환한다. 빈 항목은
`N/A`와 사유를 쓴다. `필수 정책 질문`이 남으면 `POLICY_GAP`으로 Oracle에 돌려보낸다.

```text
로드한 reference: <파일>
필수 정책 질문: <Oracle Card 행 또는 POLICY_GAP>
구현 불변식: <깨지면 안 되는 상태·순서·부작용 횟수>
버전 확인: <실제 설치 버전으로 확인할 API·동작>
Oracle 증거 매핑: <함정·검증 항목 → 카드 행>
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
| `6. 남길 검증`          | Oracle 증거 행에 매핑할 관찰                         |
| `7. 배치`               | 승인된 코드 경계에 요소를 매핑(FSD면 layer·segment)  |
| `8. 근거`               | 본문의 `[S#]` 주장과 연결한 표준·공식·upstream 자료  |

## 코드를 쓰기 전에

- **Oracle이 정책을 소유한다.** reference의 추천안과 production 코드는 정책 출처가
  아니다. 결과를 바꾸는 선택에 승인된 답이 없으면 추측하지 않는다.
- **레포가 우선이다.** 대상 레포의 규칙, 실제 설치 라이브러리와 버전, 기존
  경계 관례가 reference 예시보다 앞선다. reference 코드는 그대로 붙여 넣는 스니펫이
  아니라 구조를 보여주는 예시다.
- **버전 의존 동작은 확인한다.** 라이브러리 옵션과 동작은 실제 설치된
  버전의 문서로 확인한다.
- **근거는 구현 선택의 근거다.** `[S#]`는 정책 출처가 아니며, 표준·공식·upstream
  자료를 우선한다. `latest` 링크는 현재 설치 버전과 다를 수 있으므로 실행 직전에 다시
  확인한다.
- **Oracle 구현 결정이 우선이다.** state ownership, Server/Client, Suspense와 Error
  Boundary, query/hook, architecture, TDD 선택은 Oracle이 로드한 reference를 따른다.
- **검증을 줄이지 않는다.** `6. 남길 검증`의 적용 항목은 카드 증거로 매핑한다. network
  경계는 MSW handler로 세우고 임의 sleep으로 GREEN을 만들지 않는다.
- 관찰이 정책 공백이면 `POLICY_GAP`, 증거 누락이면 `EVIDENCE_GAP`, 제품 결함이면
  Oracle 테스트에서 `VALID_RED`를 만든 뒤 `PRODUCT_DEFECT`로만 처리한다.
