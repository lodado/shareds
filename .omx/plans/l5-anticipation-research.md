# L5 예지 시스템 조사 — escape를 사전에 추론하는 방법

작성: 2026-08-30. 선행: `.omx/plans/case-space-enumeration.md` §3-4 (5층 보정, L5 = escape 루프).
질문: **사후적(L5)으로만 잡히던 결함을 카드 시점·운영 중에 예지·추론하는 시스템을 어떻게 만드나.**

## 0. 조사 결론 요약

"escape 예지"는 단일 기술이 아니라 확립된 4개 계보의 합성이다:

1. **안전공학의 편차 생성기** (STPA·HAZOP) — 행동마다 실패 방식을 기계적으로 열거
2. **결함 예측** (JIT defect prediction, Google TWR) — 어디서 샐지 확률 점수화
3. **남의 L5 채굴** (upstream issue/API mining) — 남이 이미 지불한 escape를 수입
4. **가정 감시** (leading indicators) — escape의 선행 신호를 상시 관측

여기에 프롬프트 레벨의 **premortem 확정 프레이밍**(비용 0, 효과 실증)이 얹힌다.
전부 기존 카드 기계(frames·disposition·lint·Source Registry·risk lane)에 꽂힌다.

## 1. 예지-0 · Premortem 확정 프레이밍 — cold-read 강화 (비용 0)

- 근거: [Mitchell·Russo·Pennington 1989 "prospective hindsight"](https://corporate.jasoncollins.blog/premortem)
  — 미래 실패를 **확정 사실로** 상정하면 이유 생성이 ~30% 증가.
  [Veinott et al. 2010](https://idl.iscram.org/files/veinott/2010/1049_Veinott_etal2010.pdf)이
  메커니즘을 분리: 시점(미래/과거)이 아니라 **확실성 프레이밍**이 효과의 원천.
  [InvThink (2025)](https://arxiv.org/html/2510.01569)는 같은 구조(위해 열거 → 제약 생성)를
  LLM 추론 안에 내장해 효과 확인.
- 적용: cold-read gate 지시문을 "무엇이 잘못될 수 있나"에서 **"이 카드는 lock되어
  출시됐고 결함이 실제로 새어나갔다. 그 결함은 무엇이었나 — 셀·행·차원으로 지목하라"**로
  전환. 산출은 기존 五질문·root·first nail 구조에 그대로 합류.
- 한계 정직: 1989 연구는 이유의 **수**만 측정, 질은 미측정. 그래서 산출을 disposition
  루트로 강제(지목 없는 불안은 기각)해 질을 기계가 거른다.

## 2. 예지-1 · 편차 생성기 — STPA UCA × HAZOP guide word (카드 시점, 기계적)

- 근거: [STPA의 UCA 4유형](https://sassofia.com/wp-content/uploads/2024/10/Systems-Theoretic-Process-Analysis-STPA.pdf)
  — 모든 control action에 대해 ① 필요한데 미제공 ② 제공 자체가 위해 ③ 너무 이르게·늦게·
  순서 뒤바뀜 ④ 너무 일찍 중단·너무 오래 지속. [소프트웨어 STPA](https://arxiv.org/pdf/1612.03109)는
  UCA를 **t-way 조합 테스트와 결합**하는 절차까지 발표됨 — case-space 플랜과 직결.
  [HAZOP guide words](https://www.primatech.com/technical/hazop) (no/more/less/as well as/
  part of/reverse/other than, IEC 61882) — 파라미터마다 편차를 체계 생성. 소프트웨어
  변형 SHARD 존재.
- 적용: `oracle-frames.mjs`에 **deviation frame family** 추가 — 카드의 모든 `When`
  (= control action)에 UCA 4유형을, 모든 `Given`의 데이터 파라미터에 guide word를 기계
  적용해 프레임 생성. LLM은 발명하지 않고 disposition만.

  ```text
  O17.UCA3  append 트리거가 순서 뒤바뀜(스크롤 중 리마운트와 교차)이면?
  O17.UCA4  append 타이머가 너무 일찍 중단되면(cleanup)?   ← r11b 결함 1 = 정확히 이 셀
  O18.UCA2  스크롤 복원이 제공되는 것 자체가 위해인 상황은?  ← r11b 결함 2와 동류
  ```

- r11b 검증: 결함 1(타이머 잔류) = UCA4 "stopped too soon"의 쌍대, 결함 2(scrollTo(0)) =
  UCA2 "providing causes hazard"(라이브러리가 제공하는 초기화가 위해). 4건 중 3건이
  UCA 어휘로 표현됨 — 도메인 지식 없이 유형만으로 생성 가능.
- HAZOP의 알려진 한계("guide word의 도메인 적응은 전문성 의존")는 escaped-bug 루프가
  도메인 guide word를 성장시키는 것으로 대응 — L5와 예지-1이 서로 먹이를 줌.

## 3. 예지-2 · 남의 L5 채굴 — dependency landmine sweep (카드 시점, 최고 가성비)

- 통찰: **라이브러리의 이슈 트래커·caveat 문서·API 옵션은 업스트림이 이미 지불한
  escape의 화석이다.** r11b 결함 2가 결정적 증거 — virtualizer의 `initialOffset` 옵션이
  **존재한다는 것 자체가** "마운트 시 스크롤 리셋" escape를 업스트림이 이미 겪고 고쳤다는
  기록이다. 카드 시점에 이 옵션 목록을 읽었으면 결함 2는 질문으로 선불됐다.
- 근거: [LLMAPIDet (ICSE 2024)](https://www.eecs.yorku.ca/~wangsong/papers/icse24-b.pdf) —
  retrieval 기반 misuse rule로 미지의 API 오용 119건 발견.
  [DSChecker (2025)](https://arxiv.org/html/2509.25378) — 핵심 directive가 API 레퍼런스가
  아니라 **튜토리얼·예제 페이지에 숨어 있다**는 발견(수집 범위 설계에 반영).
  [GPTAid (NDSS 2025)](https://arxiv.org/html/2409.09288v2) — LLM 생성 규칙으로 미지 버그
  210건. 단 [암호 API 연구](https://arxiv.org/html/2407.16576v1): 비제약 LLM 판정은
  false positive 절반 이상 → **범위 제약 + 인용 강제 + self-correction으로 ~90%**.
  "이슈 채굴 → 함정 목록 → RAG 검증"의 전체 조합은 아직 공백 지대(우리가 조립).
- 적용 (에이전트 네이티브 — 인프라 불필요): Source Registry에
  `implementation-reference` dep이 오르면, lock 전에 그 라이브러리의
  ① 공식 문서 caveat·gotcha 절 ② 옵션 중 "문제 회피용" API(존재 = escape 화석)
  ③ 이슈 트래커 상위 결함을 수집해 **landmine 표**로 카드에 첨부. 각 항목은
  출처 인용 필수 + disposition 강제(covered/needs-decision/N-A). 인용 없는 항목은
  lint가 기각 — false positive 제어.
- 이것이 L1(축 수입)의 결함 판: L1은 남이 지불한 **차원**을, 예지-2는 남이 지불한
  **결함**을 수입한다.

## 4. 예지-3 · 변경 위험 점수 — JIT defect prediction (예산 배분)

- 근거: [Kamei et al. 2012 JIT 결함 예측](https://dl.acm.org/doi/10.1145/3558489.3559068)
  (churn·복잡도·소유권·과거 결함), Mockus & Weiss 2000,
  [Google TWR](https://research.google.com/pubs/archive/41145.pdf) — bug-fix 커밋만
  시간 가중해 파일 위험 순위화(오픈소스 구현 bugspots).
- 적용: 카드 scope의 파일들에 TWR 점수(git log 파싱, ~50줄, 의존 0) →
  **위험 비례 검증**: 고위험 파일을 만지는 카드는 t=3 승격·mutation·2-sample review·
  탐색 예산 증액. 현재 Low/Medium/High가 범주 휴리스틱인 것을 **증거 기반**으로 보강
  (대체가 아니라 입력 추가 — risk 최종 판정은 여전히 "false GREEN의 최악 피해" 기준).
- 예지의 의미: escape **위치**의 사전 확률을 써서 한정 예산을 집중 — 전 구역 균등
  방어보다 검출률이 오르는 게 이 계보의 존재 이유.

## 5. 예지-4 · 가정 감시 — leading indicators (lock 이후, 상시)

- 통찰: escape의 큰 부류는 "카드가 옳았는데 **가정이 조용히 무효화**"됨 — dep 버전
  bump로 라이브러리 동작 변경, browserslist 변경, API 스키마 드리프트. 이건 카드
  시점엔 예지 불가능하지만 **무효화 시점에 결정적으로 감지 가능**하다.
- 기존 기계 재사용: revision lock이 이미 source 바이트를 SHA-256으로 고정한다. 확장:
  lock manifest에 카드가 인용한 dep의 **lockfile 버전**·browserslist·API 스키마 digest를
  추가 → `oracle-verify.mjs sources` 신설 명령이 현재 레포와 대조 →
  드리프트 감지 시 해당 카드에 `ASSUMPTION_DRIFT` 플래그 + 관련 프레임 re-sweep 지시.
  CI/pre-commit 어디에 거는지는 대상 레포 관례 따름.
- 사용자 보고보다 앞서 잡는 유일한 "운영 중" 예지 층. (항공의 leading-indicator
  프로그램과 동형 — 사고가 아니라 전조를 계기화.)

## 6. 정직한 한계

- 예지는 전부 **확률을 낮추는 것**이지 L5를 소멸시키지 않는다. 예지로 다 잡히면
  그건 이미 L1~L4다. 목표는 세 가지 축소: escape **빈도**(예지-1·2), **지연**(예지-4,
  사용자 보고 전 감지), **비용**(예지-3, 예산 집중).
- 각 층의 오류 특성: 예지-2 LLM 판정은 인용 강제 없이는 FP 과반(암호 API 연구) →
  disposition·인용 lint 필수. 예지-3 예측 정밀도는 중간 수준 — 게이트가 아니라 예산
  신호로만 쓴다(차단 근거 금지). 예지-0은 양 증가만 실증, 질은 disposition이 거른다.

## 7. 제안 우선순위 — 2026-08-30 전체 구현 완료 (0.35.0)

| 순위 | 항목                                                            | 비용                          | r11b 소급 효과                          |
| ---- | --------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| A    | 예지-2 landmine sweep — card 절차 + 인용·disposition lint       | 문서 + lint 소량              | 결함 2 직접 예지 (`initialOffset` 화석) |
| B    | 예지-0 premortem 확정 프레이밍 — cold-read 문구                 | 문구 1곳                      | 전반 이유 생성량 ↑                      |
| C    | 예지-1 UCA·guide word deviation family — case-space 플랜에 편입 | frames 생성기에 유형 4+7 추가 | 결함 1·2·3이 유형 셀로 생성             |
| D    | 예지-4 가정 감시 — lock manifest 확장 + `sources` 명령          | 스크립트 중간                 | 결함 4류(정책 드리프트)의 운영 중 감지  |
| E    | 예지-3 TWR 점수 — 위험 비례 예산                                | 스크립트 소량                 | 예산 배분 개선 (직접 예지 아님)         |

A·B는 case-space 구현과 독립적으로 지금 카드 절차에 바로 넣을 수 있다.
C는 case-space P1(oracle-frames.mjs)의 프레임 계열로 흡수한다.

## 8. 구현 기록 (2026-08-30)

- A~E 전부 구현. A=policy-sources.md landmine 절 + `landmine-citation-missing`·`landmine-undispositioned` lint.
  B=card-format cold-read 확정 premortem 프레이밍. C=interaction-sweep.md Deviation sweep(P\*×4 STPA 유형,
  `deviation-type-missing` 완전성 lint — 판정 공간이 카드 바이트만으로 파생돼 생성기 불필요, 플랜의
  oracle-frames 없이 lint만으로 구현). D=`oracle-lock.mjs --dep`(설치 버전 고정, DEP_UNRESOLVED) +
  `oracle-verify.mjs sources`(ASSUMPTION_DRIFT, verify 바이트 검증과 분리 — 드리프트는 재스윕 지시지 lock 실패 아님).
  E=`scripts/oracle-twr.mjs`(Google TWR, parseLog·scoreCommits 단위 테스트, common.md에 "게이트 아님" 명기).
- 검증: 패키지 테스트 255/255 (신규 10: lock 2·verify 4·twr 3·contract 1). 실레포 스모크:
  TWR 11 bug-fix/98 커밋, 상위 파일 타당.
- C의 guide-word(HAZOP) 파라미터 편차는 case-space P1(choices)로 이월 — Value 축과 중복이라 보류.
